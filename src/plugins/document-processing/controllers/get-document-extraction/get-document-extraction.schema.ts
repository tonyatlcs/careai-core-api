import { Static, Type } from "@sinclair/typebox";

import { StoreInSchema } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import { DocumentCategorySchema } from "@/plugins/document-processing/schema/document-category.schema";
import { FieldBoxesSchema } from "@/plugins/document-processing/schema/field-boxes.schema";

export const GetDocumentExtractionResponseSchema = Type.Object({
  documentId: Type.String(),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("processing"),
    Type.Literal("completed"),
    Type.Literal("failed"),
  ]),
  name: Type.String(),
  reportDate: Type.String(),
  subject: Type.String(),
  contactSource: Type.String(),
  issueUser: Type.String(),
  category: DocumentCategorySchema,
  storeIn: StoreInSchema,
  boxesAvailable: Type.Boolean(),
  fieldBoxes: FieldBoxesSchema,
});

export type GetDocumentExtractionResponse = Static<
  typeof GetDocumentExtractionResponseSchema
>;
