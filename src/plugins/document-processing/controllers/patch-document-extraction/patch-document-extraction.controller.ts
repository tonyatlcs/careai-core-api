import { FastifyReply, FastifyRequest } from "fastify";
import { IsNull } from "typeorm";

import { AppDataSource } from "@/db/data-source";
import { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import { DocumentTextBlocks } from "@/db/entities/document-text-blocks.entity";
import { Documents } from "@/db/entities/documents.entity";
import { fieldBoxesFromEvidenceAndBlocks } from "@/domain/document-field-boxes";
import {
  PatchDocumentExtractionBodySchema,
  PatchDocumentExtractionResponseSchema,
  type PatchDocumentExtractionBody,
} from "@/plugins/document-processing/controllers/patch-document-extraction/patch-document-extraction.schema";
import type { StoreIn } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import type { DocumentCategory } from "@/plugins/document-processing/schema/document-category.schema";

export const PatchDocumentExtractionRouteOptions = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
    body: PatchDocumentExtractionBodySchema,
    response: {
      200: PatchDocumentExtractionResponseSchema,
    },
  },
};

type Params = { id: string };

export const patchDocumentExtractionController = async (
  request: FastifyRequest<{ Params: Params; Body: PatchDocumentExtractionBody }>,
  reply: FastifyReply,
) => {
  const { id } = request.params;
  const body = request.body;

  const documentsRepo = AppDataSource.getRepository(Documents);
  const document = await documentsRepo.findOne({
    where: { id, deletedAt: IsNull() },
  });

  if (!document) {
    return reply.code(404).send({ error: "document_not_found" });
  }

  const extractionRepo = AppDataSource.getRepository(DocumentExtractions);
  const blocksRepo = AppDataSource.getRepository(DocumentTextBlocks);

  const extraction = await extractionRepo.findOne({
    where: { document: { id } },
  });

  if (!extraction) {
    return reply.code(404).send({ error: "extraction_not_found" });
  }

  extraction.name = body.name;
  extraction.reportDate = body.reportDate;
  extraction.subject = body.subject;
  extraction.contactSource = body.contactSource;
  extraction.issueUser = body.issueUser;
  extraction.category = body.category;
  extraction.storeIn = body.storeIn;
  await extractionRepo.save(extraction);

  const blockRows = await blocksRepo.find({
    where: { document: { id } },
    order: { page: "ASC", blockId: "ASC" },
  });

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
    storeIn: extraction.storeIn as StoreIn,
    boxesAvailable,
    fieldBoxes,
  });
};
