import { Static, Type } from "@sinclair/typebox";

import { ProcessDocumentsResultItemSchema } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import { FieldBoxesSchema } from "@/plugins/document-processing/schema/field-boxes.schema";

export { FieldBoxSchema, FieldBoxesSchema, EMPTY_FIELD_BOXES } from "@/plugins/document-processing/schema/field-boxes.schema";
export type { FieldBoxes } from "@/plugins/document-processing/schema/field-boxes.schema";

export const ContentBlockSchema = Type.Object({
  id: Type.String(),
  page: Type.Integer(),
  text: Type.String(),
  bbox: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number(),
  }),
  confidence: Type.Union([Type.Number(), Type.Null()]),
  source: Type.Literal("tesseract_ocr"),
});

export const DocumentKindSchema = Type.Union([
  Type.Literal("pdf"),
  Type.Literal("docx"),
  Type.Literal("jpg"),
  Type.Literal("png"),
]);

export const GetDocumentContentResponseSchema = Type.Object({
  documentId: Type.String(),
  documentName: Type.String(),
  mimeType: Type.String(),
  documentKind: DocumentKindSchema,
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("processing"),
    Type.Literal("completed"),
    Type.Literal("failed"),
  ]),
  boxesAvailable: Type.Boolean(),
  content: Type.Object({
    text: Type.String(),
    blocks: Type.Array(ContentBlockSchema),
  }),
  extraction: Type.Union([Type.Null(), ProcessDocumentsResultItemSchema]),
  fieldBoxes: FieldBoxesSchema,
});

export type GetDocumentContentResponse = Static<
  typeof GetDocumentContentResponseSchema
>;
