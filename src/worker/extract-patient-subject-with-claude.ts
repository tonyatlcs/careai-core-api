import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

import { createAnthropicMessage } from "@/worker/anthropic-messages";
import { DEFAULT_ANTHROPIC_MODEL } from "@/worker/default-anthropic-model";
import { PermanentProcessingError } from "@/worker/errors";
import type { PatientSubjectImage } from "@/worker/extract-text";

/** Enough leading text for headers; keeps token use bounded on huge OCR dumps. */
const PATIENT_TEXT_HEAD_CHARS = 24_000;

const patientSubjectTool: Tool = {
  name: "submit_patient_subject",
  description:
    "Return the patient display name (the person the clinical record is about) as supported by the supplied document text. " +
    "Tolerate OCR garbling only when the intended name is strongly implied by surrounding words (e.g. Patient name, DOB nearby). " +
    "When the document has a form entry or line labeled Patient name (or Patient's name) with a value for the person the record is about, use that value as the patient name (trim only)—including when the full name appears on that single line. " +
    "When the form splits the name across fields (Given name, First name, Surname, Family name, Last name, etc.), merge every patient name part into one string—never return only the surname or only the given name if both are present. " +
    "For scanned forms or images, read the visible handwriting in the name fields directly when OCR text is noisy. " +
    "When the text is clearly an email (From, To, Subject, or similar headers), the patient is usually the primary addressee: use the human-readable name from the To line (strip angle-bracket email addresses, keep the display name). " +
    "Names with a medical-title prefix (Dr, Doctor, DR from OCR, etc.) usually refer to a clinician, not the patient—do not use them as patientSubject unless the document explicitly states that titled person is the patient (e.g. patient name field includes the title). " +
    "Do not invent a name from letterheads, facility names, clinician signatures, next-of-kin sections, or emergency contact sections.",
  input_schema: {
    type: "object",
    properties: {
      patientSubject: {
        type: "string",
        description:
          "Full patient name: use the value beside Patient name / Patient's name when that entry clearly identifies the patient (one line is enough). If the document uses separate Given name and Surname (or First/Family/Last name) fields instead or in addition, join those parts with a single space in natural order (given name(s) first, then surname). If the text is an email with To/From headers, prefer the To recipient's display name as the patient unless a labeled patient name or the body clearly points to someone else. Do not use a name whose identifying prefix is Dr, Doctor, or similar medical title (including OCR like DR) as the patient when that line is clearly a clinician—unless the document explicitly identifies that titled person as the patient. Trim outer whitespace only. Use an empty string when no patient name is clearly present.",
      },
    },
    required: ["patientSubject"],
    additionalProperties: false,
  },
  strict: true,
};

const SYSTEM_PROMPT = `You extract only the patient subject name from medical document OCR or plain text.
Rules:
- Output only the tool call.
- patientSubject must be empty when the text does not clearly identify the patient by name.
- Never use the referring doctor or typist as patientSubject unless the document states they are the patient.
- A person's name prefixed with Dr, Doctor, or similar clinical honorifics (including OCR like DR) almost always denotes a clinician, not the patient—do not use that string as patientSubject unless a patient-name field or explicit wording identifies that titled person as the patient.
- When the text is clearly an email (From, To, Subject, Date, or similar), the person the record is usually about is the primary recipient: use the To line display name as patientSubject (human-readable name only; drop email-address-in-angle-brackets tails). Do not use the From sender as patientSubject just because they appear first—unless the body or headers show the sender is the patient. If a Patient name line or the body clearly identifies a different individual as the patient, use that instead of To.
- Prefer the name from a labeled entry such as Patient name, Patient's name, Patient, Client name, Pt name, or equivalent when it clearly refers to the subject of care (overrides the email-To heuristic when both apply and the labeled entry is clearly the patient).
- Many PDFs use separate fields (Given name, First name, Surname, Family name, Last name, etc.). Combine all parts that belong to the patient into one patientSubject string with spaces; order is usually given name(s) then surname. Do not output a single field when two or more name parts are clearly filled for the patient.
- If an image is supplied, use the visible form fields as primary evidence when OCR text is garbled. In particular, read Surname and Given Names from the top patient details area and return "Given Names Surname".
- Do not use names from Next of Kin, Emergency Contact, carer, parent, guardian, doctor, provider, or signature sections when patient name fields are visible.`;

function toolInputFromMessage(
  message: Anthropic.Message,
  toolName: string,
): Record<string, unknown> | null {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === toolName) {
      return block.input as Record<string, unknown>;
    }
  }
  return null;
}

function validatePatientSubjectInput(
  input: unknown,
): { ok: true; value: string } | { ok: false; errors: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: "tool input is not an object" };
  }
  const raw = (input as { patientSubject?: unknown }).patientSubject;
  if (typeof raw !== "string") {
    return { ok: false, errors: "patientSubject must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length > 512) {
    return { ok: false, errors: "patientSubject exceeds 512 characters" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Uses Anthropic tool-use to infer the patient display name from OCR or embedded text.
 * Returns a trimmed string (possibly empty); callers should fall back to full-document extraction subject when empty.
 */
export async function extractPatientSubjectWithClaude(
  plainText: string,
  image?: PatientSubjectImage | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new PermanentProcessingError("ANTHROPIC_API_KEY is not set.");
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey });
  const snippet = plainText.slice(0, PATIENT_TEXT_HEAD_CHARS);

  const userContent: Anthropic.MessageParam["content"] = [
    {
      type: "text" as const,
      text:
        "Identify the patient name for storage as subject/patient display name. Use a Patient name (or Patient's name) entry when present. If the document splits given and family/surname across labels or boxes, merge into one full name. For scanned forms, inspect the image directly and prefer the visible top patient name fields over noisy OCR or later Next of Kin/Emergency Contact names. If the text looks like an email (To/From/Subject), the patient is usually the To recipient—use that display name unless a clearer patient label or body text says otherwise. Do not use Dr-/Doctor-prefixed names as the patient when they refer to a clinician. Document text:\n\n" +
        snippet,
    },
  ];

  if (image) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data.toString("base64"),
      },
    });
  }

  const first = await createAnthropicMessage(client, model, {
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [patientSubjectTool],
    tool_choice: { type: "tool", name: patientSubjectTool.name },
    messages: [{ role: "user", content: userContent }],
  });

  const firstInput = toolInputFromMessage(first, patientSubjectTool.name);
  if (!firstInput) {
    throw new PermanentProcessingError(
      "Claude did not return the expected patient-subject tool call.",
    );
  }

  const firstValidation = validatePatientSubjectInput(firstInput);
  if (firstValidation.ok) {
    return firstValidation.value;
  }

  const repair = await createAnthropicMessage(client, model, {
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [patientSubjectTool],
    tool_choice: { type: "tool", name: patientSubjectTool.name },
    messages: [
      { role: "user", content: userContent },
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "The previous tool input failed validation. Fix the JSON so it matches the schema. Errors: " +
              firstValidation.errors,
          },
        ],
      },
    ],
  });

  const secondInput = toolInputFromMessage(repair, patientSubjectTool.name);
  if (!secondInput) {
    throw new PermanentProcessingError(
      "Claude patient-subject repair pass did not return the expected tool call.",
    );
  }

  const secondValidation = validatePatientSubjectInput(secondInput);
  if (!secondValidation.ok) {
    throw new PermanentProcessingError(
      `Patient subject extraction failed after repair: ${secondValidation.errors}`,
    );
  }

  return secondValidation.value;
}
