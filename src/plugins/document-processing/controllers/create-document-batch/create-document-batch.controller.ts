import { randomUUID } from "node:crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import { CreateDocumentBatchResponseSchema } from "@/plugins/document-processing/controllers/create-document-batch/create-document-batch.schema";

const MAX_DOCUMENTS_PER_BATCH = 20;
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

export const CreateDocumentBatchRouteOptions = {
  schema: {
    consumes: ["multipart/form-data"],
    response: {
      202: CreateDocumentBatchResponseSchema,
    },
  },
};

type UploadedDocument = {
  filename: string;
  mimetype: string;
};

function badRequest(message: string) {
  return Object.assign(new Error(message), {
    statusCode: 400,
  });
}

async function collectUploadedDocuments(
  request: FastifyRequest,
): Promise<UploadedDocument[]> {
  const documents: UploadedDocument[] = [];
  const files = request.files();

  for await (const file of files) {
    await file.toBuffer();

    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw badRequest(`Unsupported file type for "${file.filename}".`);
    }

    documents.push({
      filename: file.filename,
      mimetype: file.mimetype,
    });

    if (documents.length > MAX_DOCUMENTS_PER_BATCH) {
      throw badRequest(
        `A batch can contain up to ${MAX_DOCUMENTS_PER_BATCH} documents.`,
      );
    }
  }

  if (documents.length === 0) {
    throw badRequest("At least one file is required.");
  }

  return documents;
}

export async function createDocumentBatchController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const documents = await collectUploadedDocuments(request);

  return reply
    .code(202)
    .send({
      status: "accepted",
      batch: {
        id: randomUUID(),
        documentCount: documents.length,
        documents,
      },
    });
}
