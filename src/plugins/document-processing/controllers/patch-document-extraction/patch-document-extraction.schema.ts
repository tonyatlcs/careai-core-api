import { Static, Type } from "@sinclair/typebox";

import { ProcessDocumentsResultItemSchema } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import { GetDocumentExtractionResponseSchema } from "@/plugins/document-processing/controllers/get-document-extraction/get-document-extraction.schema";

export const PatchDocumentExtractionBodySchema = ProcessDocumentsResultItemSchema;

export type PatchDocumentExtractionBody = Static<
  typeof PatchDocumentExtractionBodySchema
>;

export const PatchDocumentExtractionResponseSchema =
  GetDocumentExtractionResponseSchema;

export type PatchDocumentExtractionResponse = Static<
  typeof PatchDocumentExtractionResponseSchema
>;
