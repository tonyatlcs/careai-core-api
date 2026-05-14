import { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";

import {
  createDocumentBatchController,
  CreateDocumentBatchRouteOptions,
} from "@/plugins/document-processing/controllers/create-document-batch/create-document-batch.controller";
import {
  listDocumentsController,
  ListDocumentsRouteOptions,
} from "@/plugins/document-processing/controllers/list-documents/list-documents.controller";
import {
  getDocumentExtractionController,
  GetDocumentExtractionRouteOptions,
} from "@/plugins/document-processing/controllers/get-document-extraction/get-document-extraction.controller";
import {
  processDocumentsController,
  ProcessDocumentsRouteOptions,
} from "@/plugins/document-processing/controllers/process-documents/process-documents.controller";

export const documentProcessingPlugin: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: {
      files: 20,
      fileSize: 5 * 1024 * 1024,
    },
  });

  app.get(
    "/documents",
    ListDocumentsRouteOptions,
    listDocumentsController,
  );

  app.post(
    "/document-batches",
    CreateDocumentBatchRouteOptions,
    createDocumentBatchController,
  );

  app.post(
    "/documents/process",
    ProcessDocumentsRouteOptions,
    processDocumentsController,
  );

  app.get(
    "/documents/:id/extraction",
    GetDocumentExtractionRouteOptions,
    getDocumentExtractionController,
  );
};
