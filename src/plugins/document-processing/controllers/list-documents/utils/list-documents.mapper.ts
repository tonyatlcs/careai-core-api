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

/**
 * Maps stored `raw_confidence` to a 0–100 display value. Tesseract uses 0–100;
 * values in (0, 1] are treated as fractions; values in (100, 10_000] are treated
 * as a single mistaken ×100 scale (e.g. 7600 → 76).
 */
export function normalizedListConfidencePercent(
  raw: number | null | undefined,
): number | null {
  if (raw == null || !Number.isFinite(raw)) {
    return null;
  }
  let v = raw;
  if (v >= 0 && v <= 1) {
    v *= 100;
  } else if (v > 100 && v <= 10_000) {
    v /= 100;
  }
  return clampProgress(v);
}

export function documentEntityToListResponse(
  document: Documents,
  extraction?: DocumentExtractions | null,
): ListDocumentsResponseItem {
  const item: ListDocumentsResponseItem = {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt.toISOString(),
    progress: listProgressForDocument(document),
    confidence: normalizedListConfidencePercent(extraction?.rawConfidence),
    status: document.status,
  };
  if (extraction) {
    item.patient = extraction.name;
    item.category = extraction.category as DocumentCategory;
  }
  return item;
}
