import { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";

import {
  createDocumentBatchController,
  CreateDocumentBatchRouteOptions,
} from "@/plugins/document-processing/controllers/create-document-batch/create-document-batch.controller";

export const documentProcessingPlugin: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: {
      files: 20,
      fileSize: 5 * 1024 * 1024,
    },
  });

  app.post(
    "/document-batches",
    CreateDocumentBatchRouteOptions,
    createDocumentBatchController,
  );
};
