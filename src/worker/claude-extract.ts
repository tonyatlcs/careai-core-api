import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { Value } from "@sinclair/typebox/value";

import {
  ClaudeDocumentExtractionToolResultSchema,
  type ClaudeDocumentExtractionToolResult,
} from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import { createAnthropicMessage } from "@/worker/anthropic-messages";
import { DEFAULT_ANTHROPIC_MODEL } from "@/worker/default-anthropic-model";
import { PermanentProcessingError } from "@/worker/errors";

/** Category literals aligned with DocumentCategorySchema for Claude tool JSON schema. */
const DOCUMENT_CATEGORY_ENUM = [
  "admissionsSummary",
  "advanceCarePlanning",
  "alliedHealthLetter",
  "certificate",
  "clinicalNotes",
  "clinicalPhotograph",
  "consentForm",
  "das21",
  "dischargeSummary",
  "ecg",
  "email",
  "form",
  "immunisation",
  "indigenousPip",
  "letter",
  "medicalImagingReport",
  "myHealthRegistration",
  "newPtRegistrationForm",
  "pathologyResults",
  "patientConsent",
  "recordRequest",
  "referralLetter",
  "workcover",
  "workcoverConsent",
] as const;

const extractionTool: Tool = {
  name: "submit_document_extraction",
  description:
    "Return exactly one structured extraction from the supplied document text. " +
    "When lines begin with bracketed IDs like [p1_line_2], those IDs refer to OCR lines; " +
    "populate each evidence array with the IDs of lines that support that field (use empty arrays when none apply). " +
    "Only populate fields supported by the text; prefer best-supported guesses over inventing facts. " +
    "reportDate must be ISO YYYY-MM-DD when a clear date exists, otherwise use the closest reasonable ISO date string from context.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Patient full name (the person the record is about). Prefer the value entered for Patient name / Patient's name when that field clearly identifies the patient. If the form uses separate Given name and Surname (or First/Family/Last name) fields, join all patient parts with spaces in natural order (given name(s) first, then surname). If the document is clearly an email (From/To/Subject headers), the patient is usually the To recipient's display name—not the From sender unless the text shows otherwise. Names beginning with Dr, Doctor, or similar medical titles (including OCR DR) usually identify a clinician, not the patient—do not use them as name unless the document explicitly states that person is the patient.",
      },
      reportDate: { type: "string" },
      subject: {
        type: "string",
        description:
          "What the document is intended for: a concise document topic, purpose, or subject matter such as the email Subject header, referral reason, form purpose, requested action, or clinical report topic. Do not put the patient name here unless the only clear document subject is the patient's name.",
      },
      contactSource: { type: "string" },
      issueUser: { type: "string" },
      category: {
        type: "string",
        enum: [...DOCUMENT_CATEGORY_ENUM],
        description: "Document category; must be one of the allowed values.",
      },
      storeIn: {
        type: "string",
        enum: ["Correspondence", "Investigations"],
        description:
          'Where this document should be stored. Use "Investigations" for documents that require doctor review of investigation results or reports, such as medical imaging, pathology, ECG, diagnostic test results, and similar clinical investigations. Use "Correspondence" for letters, emails, referrals, forms, certificates, consent, registration, and other non-investigation correspondence.',
      },
      evidence: {
        type: "object",
        properties: {
          name: { type: "array", items: { type: "string" } },
          reportDate: { type: "array", items: { type: "string" } },
          subject: { type: "array", items: { type: "string" } },
          contactSource: { type: "array", items: { type: "string" } },
          issueUser: { type: "array", items: { type: "string" } },
          category: { type: "array", items: { type: "string" } },
          storeIn: { type: "array", items: { type: "string" } },
        },
        required: [
          "name",
          "reportDate",
          "subject",
          "contactSource",
          "issueUser",
          "category",
          "storeIn",
        ],
        additionalProperties: false,
      },
    },
    required: [
      "name",
      "reportDate",
      "subject",
      "contactSource",
      "issueUser",
      "category",
      "storeIn",
      "evidence",
    ],
    additionalProperties: false,
  },
  strict: true,
};

function toolInputFromMessage(
  message: Anthropic.Message,
): Record<string, unknown> | null {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === extractionTool.name) {
      return block.input as Record<string, unknown>;
    }
  }
  return null;
}

function validateExtractionWithEvidence(
  input: unknown,
):
  | { ok: true; value: ClaudeDocumentExtractionToolResult }
  | { ok: false; errors: string } {
  if (!Value.Check(ClaudeDocumentExtractionToolResultSchema, input)) {
    const errors = [...Value.Errors(ClaudeDocumentExtractionToolResultSchema, input)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    return { ok: false, errors };
  }
  return { ok: true, value: input as ClaudeDocumentExtractionToolResult };
}

const SYSTEM_PROMPT = `You extract structured metadata from medical document OCR or plain text.
Rules:
- Output only the tool call; every field in the tool schema is required.
- category must be exactly one of the allowed enum values.
- storeIn must be exactly "Correspondence" or "Investigations". Use "Investigations" for documents that require doctor review of investigation results or reports, including medical imaging, pathology, ECG, diagnostic test results, and similar clinical investigations. Use "Correspondence" for letters, emails, referrals, forms, certificates, consent, registration, and other non-investigation correspondence.
- name must be the patient's full human-readable name (the person the record is about) when identifiable from the text—never a block id, never bracketed tags like [p1_line_2]. Prefer a filled Patient name or Patient's name form entry when it clearly identifies the patient. When names appear split across fields (Given name, Surname, First name, Family name, etc.), combine every filled patient part into one string; do not return only one segment if both given and surname are present. When the document is clearly an email (From, To, Subject, etc.), the patient is usually the primary To addressee (human-readable display name; strip email-address-in-angle-brackets); do not default name to the From sender unless the content shows the sender is the patient. If a labeled patient name or the body clearly identifies someone else as the patient, use that. Names prefixed with Dr, Doctor, or similar medical honorifics (including OCR DR) usually refer to a clinician—do not use them as name unless the document explicitly identifies that titled person as the patient. Do not use a clinician as name unless they are the patient. Use the closest grounded label such as initials or "Unknown" only if the document truly gives no usable name signal.
- subject must be what the document is intended for: a concise purpose, topic, or subject matter. Prefer an email Subject header when present; otherwise use the clearest grounded document purpose, referral reason, form name, requested action, or report topic. Do not duplicate the patient name into subject unless the document gives no other meaningful purpose/topic.
- reportDate should be ISO YYYY-MM-DD when the document clearly supports a date; otherwise infer the strongest defensible ISO-like date from context or use a conservative placeholder date only when necessary.
- If uncertain on a free-text field, prefer concise text grounded in the source rather than fabrication.
- When the document text uses line tags like [p1_line_3], put the corresponding id string (for example p1_line_3) into the evidence arrays for fields that line supports. Use [] when no tagged line supports a field. For untagged plain text, return empty evidence arrays for all fields.`;

export async function extractWithClaude(
  documentText: string,
): Promise<ClaudeDocumentExtractionToolResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new PermanentProcessingError("ANTHROPIC_API_KEY is not set.");
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey });

  const userContent = [
    {
      type: "text" as const,
      text:
        "Extract the required fields from the following document text:\n\n" +
        documentText,
    },
  ];

  const first = await createAnthropicMessage(client, model, {
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [extractionTool],
    tool_choice: { type: "tool", name: extractionTool.name },
    messages: [{ role: "user", content: userContent }],
  });

  const firstInput = toolInputFromMessage(first);
  if (!firstInput) {
    throw new PermanentProcessingError(
      "Claude did not return the expected tool call.",
    );
  }

  const firstValidation = validateExtractionWithEvidence(firstInput);
  if (firstValidation.ok) {
    return firstValidation.value;
  }

  const repair = await createAnthropicMessage(client, model, {
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [extractionTool],
    tool_choice: { type: "tool", name: extractionTool.name },
    messages: [
      { role: "user", content: userContent },
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "The previous tool input failed validation. Fix the JSON so it matches the schema (including evidence string arrays). Errors: " +
              firstValidation.errors,
          },
        ],
      },
    ],
  });

  const secondInput = toolInputFromMessage(repair);
  if (!secondInput) {
    throw new PermanentProcessingError(
      "Claude repair pass did not return the expected tool call.",
    );
  }

  const secondValidation = validateExtractionWithEvidence(secondInput);
  if (!secondValidation.ok) {
    throw new PermanentProcessingError(
      `Extraction validation failed after repair: ${secondValidation.errors}`,
    );
  }

  return secondValidation.value;
}
