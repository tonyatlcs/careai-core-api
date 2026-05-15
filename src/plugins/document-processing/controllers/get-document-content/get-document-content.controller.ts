import type { Static } from "@sinclair/typebox";
import { FastifyReply, FastifyRequest } from "fastify";
import { IsNull } from "typeorm";

import { AppDataSource } from "@/db/data-source";
import { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import { DocumentTextBlocks } from "@/db/entities/document-text-blocks.entity";
import { Documents } from "@/db/entities/documents.entity";
import { fieldBoxesFromEvidenceAndBlocks } from "@/domain/document-field-boxes";
import {
  ContentBlockSchema,
  GetDocumentContentResponseSchema,
  type GetDocumentContentResponse,
} from "@/plugins/document-processing/controllers/get-document-content/get-document-content.schema";
import type { StoreIn } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import type { DocumentCategory } from "@/plugins/document-processing/schema/document-category.schema";

type ContentBlock = Static<typeof ContentBlockSchema>;

export const GetDocumentContentRouteOptions = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
    response: {
      200: GetDocumentContentResponseSchema,
    },
  },
};

type Params = { id: string };

function blockRowToApiBlock(row: DocumentTextBlocks): ContentBlock {
  return {
    id: row.blockId,
    page: row.page,
    text: row.text,
    bbox: {
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
    },
    confidence: row.confidence ?? null,
    source: "tesseract_ocr",
  };
}

export const getDocumentContentController = async (
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

  const extractionRepo = AppDataSource.getRepository(DocumentExtractions);
  const blocksRepo = AppDataSource.getRepository(DocumentTextBlocks);

  const [extraction, blockRows] = await Promise.all([
    extractionRepo.findOne({ where: { document: { id } } }),
    blocksRepo.find({
      where: { document: { id } },
      order: { page: "ASC", blockId: "ASC" },
    }),
  ]);

  const blocks = blockRows.map(blockRowToApiBlock);

  const contentText =
    blocks.length > 0
      ? blocks.map((b) => b.text).join("\n")
      : (extraction?.auditText ?? "");

  const { boxesAvailable, fieldBoxes } = fieldBoxesFromEvidenceAndBlocks(
    extraction?.evidence ?? null,
    blockRows,
  );

  const extractionPayload: GetDocumentContentResponse["extraction"] = extraction
    ? {
        name: extraction.name,
        reportDate: extraction.reportDate,
        subject: extraction.subject,
        contactSource: extraction.contactSource,
        issueUser: extraction.issueUser,
        category: extraction.category as DocumentCategory,
        storeIn: extraction.storeIn as StoreIn,
      }
    : null;

  return reply.send({
    documentId: document.id,
    documentName: document.name,
    mimeType: document.mimeType,
    documentKind: document.type,
    status: document.status,
    boxesAvailable,
    content: {
      text: contentText,
      blocks,
    },
    extraction: extractionPayload,
    fieldBoxes,
  });
};
