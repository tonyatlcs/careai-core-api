import { Static, Type } from "@sinclair/typebox";

import { DocumentCategorySchema } from "@/plugins/document-processing/schema/document-category.schema";

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
});

export type GetDocumentExtractionResponse = Static<
  typeof GetDocumentExtractionResponseSchema
>;
