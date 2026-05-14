import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { FastifyReply, FastifyRequest } from "fastify";
import { AppDataSource } from "@/db/data-source";
import {
  DocumentProcessingStatus,
  Documents,
} from "@/db/entities/documents.entity";
import { CreateDocumentBatchResponseSchema } from "@/plugins/document-processing/controllers/create-document-batch/create-document-batch.schema";
import {
  mimeToDocumentKind,
  badRequest,
} from "@/plugins/document-processing/controllers/create-document-batch/utils/create-document-batch.utils";
import { createS3Client } from "@/services/s3";

const s3Client = createS3Client();

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
  byteSize: number;
  buffer: Buffer;
};

const collectUploadedDocuments = async (
  request: FastifyRequest,
): Promise<UploadedDocument[]> => {
  const documents: UploadedDocument[] = [];
  const files = request.files();

  for await (const file of files) {
    const buffer = await file.toBuffer();

    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw badRequest(`Unsupported file type for "${file.filename}".`);
    }

    documents.push({
      filename: file.filename,
      mimetype: file.mimetype,
      byteSize: buffer.byteLength,
      buffer,
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
};

export const createDocumentBatchController = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const uploads = await collectUploadedDocuments(request);
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw Object.assign(new Error("S3_BUCKET is required"), {
      statusCode: 500,
    });
  }

  const batchId = randomUUID();
  const documentsRepo = AppDataSource.getRepository(Documents);
  const rows = uploads.map((upload) =>
    documentsRepo.create({
      id: randomUUID(),
      batchId,
      name: upload.filename,
      mimeType: upload.mimetype,
      type: mimeToDocumentKind(upload.mimetype),
      byteSize: String(upload.byteSize),
      status: DocumentProcessingStatus.PENDING,
    }),
  );
  await documentsRepo.save(rows);

  await Promise.all(
    rows.map((document, index) =>
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: document.id,
          Body: uploads[index].buffer,
          ContentType: uploads[index].mimetype,
        }),
      ),
    ),
  );

  return reply.code(202).send({
    status: "accepted",
    batch: {
      id: batchId,
      documentCount: uploads.length,
      documents: rows.map((document, index) => ({
        id: document.id,
        filename: uploads[index].filename,
        mimetype: uploads[index].mimetype,
      })),
    },
  });
};
