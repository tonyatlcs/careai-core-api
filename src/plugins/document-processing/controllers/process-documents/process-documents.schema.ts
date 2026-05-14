import { Static, Type } from "@sinclair/typebox";
import { DocumentCategorySchema } from "@/plugins/document-processing/schema/document-category.schema";

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
});

export type ProcessDocumentsResultItem = Static<
  typeof ProcessDocumentsResultItemSchema
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
