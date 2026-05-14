import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

import { createAnthropicMessage } from "@/worker/anthropic-messages";
import { DEFAULT_ANTHROPIC_MODEL } from "@/worker/default-anthropic-model";
import { PermanentProcessingError } from "@/worker/errors";

/** Enough leading text for headers; keeps token use bounded on huge OCR dumps. */
const PATIENT_TEXT_HEAD_CHARS = 24_000;

const patientSubjectTool: Tool = {
  name: "submit_patient_subject",
  description:
    "Return the patient display name (the person the clinical record is about) as supported by the supplied document text. " +
    "Tolerate OCR garbling only when the intended name is strongly implied by surrounding words (e.g. Patient name, DOB nearby). " +
    "Do not invent a name from letterheads, facility names, or clinician signatures.",
  input_schema: {
    type: "object",
    properties: {
      patientSubject: {
        type: "string",
        description:
          "Full patient name as on the document; trim outer whitespace only. Use an empty string when no patient name is clearly present.",
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
- Never use the referring doctor, typist, or recipient as patientSubject unless the document states they are the patient.
- Prefer the name beside labels such as Patient, Patient name, Client name, Pt name, or equivalent.`;

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
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new PermanentProcessingError("ANTHROPIC_API_KEY is not set.");
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey });
  const snippet = plainText.slice(0, PATIENT_TEXT_HEAD_CHARS);

  const userContent = [
    {
      type: "text" as const,
      text:
        "Identify the patient name for storage as subject/patient display name. Document text:\n\n" +
        snippet,
    },
  ];

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
