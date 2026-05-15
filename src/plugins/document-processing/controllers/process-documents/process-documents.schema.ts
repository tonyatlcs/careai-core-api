import { Static, Type } from "@sinclair/typebox";
import type { DocumentExtractionEvidence } from "@/domain/document-extraction-evidence";
import { DocumentCategorySchema } from "@/plugins/document-processing/schema/document-category.schema";

export const StoreInSchema = Type.Union([
  Type.Literal("Correspondence"),
  Type.Literal("Investigations"),
]);
export type StoreIn = Static<typeof StoreInSchema>;

export const ProcessDocumentsRequestSchema = Type.Object({
  documentIds: Type.Array(Type.String()),
});
export type ProcessDocumentsRequest = Static<
  typeof ProcessDocumentsRequestSchema
>;

export const ProcessDocumentsResultItemSchema = Type.Object({
  name: Type.String(),
  reportDate: Type.String(),
  subject: Type.String(),
  contactSource: Type.String(),
  issueUser: Type.String(),
  category: DocumentCategorySchema,
  storeIn: StoreInSchema,
});

export type ProcessDocumentsResultItem = Static<
  typeof ProcessDocumentsResultItemSchema
>;

export const DocumentExtractionEvidenceSchema = Type.Object({
  name: Type.Array(Type.String()),
  reportDate: Type.Array(Type.String()),
  subject: Type.Array(Type.String()),
  contactSource: Type.Array(Type.String()),
  issueUser: Type.Array(Type.String()),
  category: Type.Array(Type.String()),
  storeIn: Type.Array(Type.String()),
});

/** Runtime check: evidence JSON matches the expected keys (values are string[]). */
export function isDocumentExtractionEvidence(
  value: unknown,
): value is DocumentExtractionEvidence {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const keys: (keyof DocumentExtractionEvidence)[] = [
    "name",
    "reportDate",
    "subject",
    "contactSource",
    "issueUser",
    "category",
    "storeIn",
  ];
  return keys.every(
    (k) => Array.isArray(o[k]) && (o[k] as unknown[]).every((x) => typeof x === "string"),
  );
}

export const ClaudeDocumentExtractionToolResultSchema = Type.Intersect([
  ProcessDocumentsResultItemSchema,
  Type.Object({
    evidence: DocumentExtractionEvidenceSchema,
  }),
]);

export type ClaudeDocumentExtractionToolResult = Static<
  typeof ClaudeDocumentExtractionToolResultSchema
>;

export const ProcessDocumentsAcceptedItemSchema = Type.Object({
  id: Type.String(),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("processing"),
    Type.Literal("completed"),
    Type.Literal("failed"),
  ]),
});

export const ProcessDocumentsAcceptedResponseSchema = Type.Object({
  status: Type.Literal("accepted"),
  documents: Type.Array(ProcessDocumentsAcceptedItemSchema),
});

export type ProcessDocumentsAcceptedResponse = Static<
  typeof ProcessDocumentsAcceptedResponseSchema
>;
