import type { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import {
  DocumentProcessingStatus,
  type Documents,
} from "@/db/entities/documents.entity";
import type { ListDocumentsResponseItem } from "@/plugins/document-processing/controllers/list-documents/list-documents.schema";
import type { DocumentCategory } from "@/plugins/document-processing/schema/document-category.schema";

function listProgressForDocument(document: Documents): number {
  switch (document.status) {
    case DocumentProcessingStatus.PENDING:
      return 0;
    case DocumentProcessingStatus.PROCESSING:
      return clampProgress(document.processingProgress ?? 0);
    case DocumentProcessingStatus.COMPLETED:
      return 100;
    case DocumentProcessingStatus.FAILED:
      return clampProgress(document.processingProgress ?? 0);
    default: {
      const _exhaustive: never = document.status;
      return _exhaustive;
    }
  }
}

function clampProgress(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function documentEntityToListResponse(
  document: Documents,
  extraction?: DocumentExtractions | null,
): ListDocumentsResponseItem {
  const item: ListDocumentsResponseItem = {
    name: document.name,
    createdAt: document.createdAt.toISOString(),
    progress: listProgressForDocument(document),
    status: document.status,
  };
  if (extraction) {
    item.patient = extraction.subject;
    item.category = extraction.category as DocumentCategory;
  }
  return item;
}
