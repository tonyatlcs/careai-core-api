import { GetObjectCommand } from "@aws-sdk/client-s3";
import { FastifyReply, FastifyRequest } from "fastify";

import { IsNull } from "typeorm";

import { AppDataSource } from "@/db/data-source";
import { Documents } from "@/db/entities/documents.entity";
import { createS3Client } from "@/services/s3";

export const GetDocumentFileRouteOptions = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
  },
};

type Params = { id: string };

const s3Client = createS3Client();

function isNoSuchKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "NoSuchKey"
  );
}

/** RFC 5987 `filename*` plus a conservative ASCII `filename` fallback. */
function contentDispositionInline(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_") || "document";
  return `inline; filename="${asciiFallback.replace(/"/g, "_")}"; filename*=UTF-8''${encoded}`;
}

export const getDocumentFileController = async (
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) => {
  const { id } = request.params;

  const documentsRepo = AppDataSource.getRepository(Documents);
  const document = await documentsRepo.findOne({
    where: { id, deletedAt: IsNull() },
  });

  if (!document) {
    return reply.code(404).send({ error: "document_not_found" });
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    return reply.code(500).send({ error: "s3_not_configured" });
  }

  try {
    const object = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: document.id,
      }),
    );

    if (!object.Body) {
      return reply.code(404).send({ error: "s3_object_empty" });
    }

    reply.header("Content-Type", document.mimeType);
    reply.header("Content-Disposition", contentDispositionInline(document.name));

    return reply.send(object.Body);
  } catch (error) {
    if (isNoSuchKeyError(error)) {
      return reply.code(404).send({ error: "s3_object_not_found" });
    }
    throw error;
  }
};
