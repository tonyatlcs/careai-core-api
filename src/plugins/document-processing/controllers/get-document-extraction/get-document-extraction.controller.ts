import { FastifyReply, FastifyRequest } from "fastify";

import { AppDataSource } from "@/db/data-source";
import { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import { DocumentTextBlocks } from "@/db/entities/document-text-blocks.entity";
import { Documents } from "@/db/entities/documents.entity";
import { fieldBoxesFromEvidenceAndBlocks } from "@/domain/document-field-boxes";
import { GetDocumentExtractionResponseSchema } from "@/plugins/document-processing/controllers/get-document-extraction/get-document-extraction.schema";
import type { DocumentCategory } from "@/plugins/document-processing/schema/document-category.schema";

export const GetDocumentExtractionRouteOptions = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
    response: {
      200: GetDocumentExtractionResponseSchema,
    },
  },
};

type Params = { id: string };

export const getDocumentExtractionController = async (
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) => {
  const { id } = request.params;

  const documentsRepo = AppDataSource.getRepository(Documents);
  const document = await documentsRepo.findOne({ where: { id } });

  if (!document) {
    return reply.code(404).send({ error: "document_not_found" });
  }

  const extractionRepo = AppDataSource.getRepository(DocumentExtractions);
  const blocksRepo = AppDataSource.getRepository(DocumentTextBlocks);

  const [extraction, blockRows] = await Promise.all([
    extractionRepo.findOne({
      where: { document: { id } },
    }),
    blocksRepo.find({
      where: { document: { id } },
      order: { page: "ASC", blockId: "ASC" },
    }),
  ]);

  if (!extraction) {
    return reply.code(404).send({
      error: "extraction_not_found",
      documentStatus: document.status,
      hint:
        "No extraction row yet. Call POST /documents/process with this id, run the worker, and wait until status is completed.",
    });
  }

  const { boxesAvailable, fieldBoxes } = fieldBoxesFromEvidenceAndBlocks(
    extraction.evidence ?? null,
    blockRows,
  );

  return reply.send({
    documentId: document.id,
    status: document.status,
    name: extraction.name,
    reportDate: extraction.reportDate,
    subject: extraction.subject,
    contactSource: extraction.contactSource,
    issueUser: extraction.issueUser,
    category: extraction.category as DocumentCategory,
    boxesAvailable,
    fieldBoxes,
  });
};
