import { In } from "typeorm";

import { AppDataSource } from "@/db/data-source";
import { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import { Documents } from "@/db/entities/documents.entity";

export type ListDocumentsQueryParams = {
  page: number;
  limit: number;
};

export type ListDocumentsQueryResult = {
  documents: Documents[];
  extractionsByDocumentId: Map<string, DocumentExtractions>;
  total: number;
};

export async function listDocumentsQuery(
  params: ListDocumentsQueryParams,
): Promise<ListDocumentsQueryResult> {
  const { page, limit } = params;
  const documentsRepo = AppDataSource.getRepository(Documents);
  const extractionRepo = AppDataSource.getRepository(DocumentExtractions);
  const skip = (page - 1) * limit;
  const [documents, total] = await documentsRepo.findAndCount({
    order: { createdAt: "DESC" },
    skip,
    take: limit,
  });

  const ids = documents.map((d) => d.id);
  let extractionsByDocumentId = new Map<string, DocumentExtractions>();
  if (ids.length > 0) {
    const extractions = await extractionRepo.find({
      where: { document: { id: In(ids) } },
      relations: ["document"],
    });
    extractionsByDocumentId = new Map(
      extractions.map((e) => [e.document.id, e]),
    );
  }

  return { documents, total, extractionsByDocumentId };
}
