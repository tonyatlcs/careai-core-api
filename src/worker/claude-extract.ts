import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { Value } from "@sinclair/typebox/value";

import type { ProcessDocumentsResultItem } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import { ProcessDocumentsResultItemSchema } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
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
    "Only populate fields supported by the text; prefer best-supported guesses over inventing facts. " +
    "reportDate must be ISO YYYY-MM-DD when a clear date exists, otherwise use the closest reasonable ISO date string from context.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      reportDate: { type: "string" },
      subject: {
        type: "string",
        description:
          "Patient full name as written on the document (the person the record is about), not the clinician or addressee unless they are the patient.",
      },
      contactSource: { type: "string" },
      issueUser: { type: "string" },
      category: {
        type: "string",
        enum: [...DOCUMENT_CATEGORY_ENUM],
        description: "Document category; must be one of the allowed values.",
      },
    },
    required: [
      "name",
      "reportDate",
      "subject",
      "contactSource",
      "issueUser",
      "category",
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

function validateExtraction(
  input: unknown,
): { ok: true; value: ProcessDocumentsResultItem } | { ok: false; errors: string } {
  if (!Value.Check(ProcessDocumentsResultItemSchema, input)) {
    const errors = [...Value.Errors(ProcessDocumentsResultItemSchema, input)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    return { ok: false, errors };
  }
  return { ok: true, value: input as ProcessDocumentsResultItem };
}

const SYSTEM_PROMPT = `You extract structured metadata from medical document OCR or plain text.
Rules:
- Output only the tool call; every field in the tool schema is required.
- category must be exactly one of the allowed enum values.
- subject must be the patient's name (the subject of care) when identifiable from the text; otherwise use the closest grounded label such as initials or "Unknown" only if the document truly gives no usable name signal.
- reportDate should be ISO YYYY-MM-DD when the document clearly supports a date; otherwise infer the strongest defensible ISO-like date from context or use a conservative placeholder date only when necessary.
- If uncertain on a free-text field, prefer concise text grounded in the source rather than fabrication.`;

export async function extractWithClaude(
  plainText: string,
): Promise<ProcessDocumentsResultItem> {
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
        plainText,
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

  const firstValidation = validateExtraction(firstInput);
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
              "The previous tool input failed validation. Fix the JSON so it matches the schema. Errors: " +
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

  const secondValidation = validateExtraction(secondInput);
  if (!secondValidation.ok) {
    throw new PermanentProcessingError(
      `Extraction validation failed after repair: ${secondValidation.errors}`,
    );
  }

  return secondValidation.value;
}
