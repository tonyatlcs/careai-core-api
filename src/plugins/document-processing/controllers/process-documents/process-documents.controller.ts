import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { FastifyReply, FastifyRequest } from "fastify";
import { In, IsNull } from "typeorm";

import { AppDataSource } from "@/db/data-source";
import {
  DocumentProcessingStatus,
  Documents,
} from "@/db/entities/documents.entity";
import { badRequest } from "@/plugins/document-processing/controllers/create-document-batch/utils/create-document-batch.utils";
import {
  ProcessDocumentsAcceptedResponseSchema,
  ProcessDocumentsRequestSchema,
  type ProcessDocumentsRequest,
} from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import { createSqsClient } from "@/services/sqs";

const sqsClient = createSqsClient();

export const ProcessDocumentsRouteOptions = {
  schema: {
    body: ProcessDocumentsRequestSchema,
    response: {
      202: ProcessDocumentsAcceptedResponseSchema,
    },
  },
};

export const processDocumentsController = async (
  request: FastifyRequest<{ Body: ProcessDocumentsRequest }>,
  reply: FastifyReply,
) => {
  const ids = request.body.documentIds;
  if (ids.length === 0) {
    throw badRequest("At least one document ID is required.");
  }
  if (new Set(ids).size !== ids.length) {
    throw badRequest("Duplicate document IDs are not allowed.");
  }

  const queueUrl = process.env.DOCUMENT_PROCESSING_QUEUE_URL;
  if (!queueUrl) {
    throw Object.assign(new Error("DOCUMENT_PROCESSING_QUEUE_URL is not configured"), {
      statusCode: 500,
    });
  }

  const documentsRepo = AppDataSource.getRepository(Documents);
  const found = await documentsRepo.find({
    where: { id: In(ids), deletedAt: IsNull() },
  });

  if (found.length !== ids.length) {
    const foundIds = new Set(found.map((d) => d.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    throw badRequest(
      `Unknown document ID(s): ${missing.map((id) => `"${id}"`).join(", ")}.`,
    );
  }

  const requestedAt = new Date().toISOString();

  for (const document of found) {
    document.status = DocumentProcessingStatus.PROCESSING;
    document.processingError = null;
    document.processingProgress = 5;
  }
  await documentsRepo.save(found);

  await Promise.all(
    found.map((document) =>
      sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            documentId: document.id,
            batchId: document.batchId,
            requestedAt,
          }),
        }),
      ),
    ),
  );

  return reply.code(202).send({
    status: "accepted",
    documents: found.map((document) => ({
      id: document.id,
      status: document.status,
    })),
  });
};
