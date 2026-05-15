import type { DocumentTextBlocks } from "@/db/entities/document-text-blocks.entity";
import {
  normalizeOcrEvidenceBlockId,
  type DocumentExtractionEvidence,
} from "@/domain/document-extraction-evidence";
import { isDocumentExtractionEvidence } from "@/plugins/document-processing/controllers/process-documents/process-documents.schema";
import {
  EMPTY_FIELD_BOXES,
  type FieldBoxes,
} from "@/plugins/document-processing/schema/field-boxes.schema";

const FIELD_KEYS = [
  "name",
  "reportDate",
  "subject",
  "contactSource",
  "issueUser",
  "category",
] as const satisfies readonly (keyof DocumentExtractionEvidence)[];

export function mapEvidenceToFieldBoxes(
  evidence: DocumentExtractionEvidence,
  blockById: Map<string, DocumentTextBlocks>,
): FieldBoxes {
  const out: FieldBoxes = { ...EMPTY_FIELD_BOXES };

  for (const key of FIELD_KEYS) {
    const boxes: FieldBoxes[typeof key] = [];
    for (const rawId of evidence[key]) {
      const row = blockById.get(normalizeOcrEvidenceBlockId(rawId));
      if (!row) {
        continue;
      }
      boxes.push({
        page: row.page,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        sourceBlockId: row.blockId,
        text: row.text,
        confidence: row.confidence ?? null,
      });
    }
    out[key] = boxes;
  }

  return out;
}

/**
 * Maps persisted evidence + OCR line rows to API field boxes.
 * `boxesAvailable` is true only when at least one cited block resolves to a stored row
 * (invalid or unknown block IDs are ignored).
 */
export function fieldBoxesFromEvidenceAndBlocks(
  evidence: unknown,
  blockRows: DocumentTextBlocks[],
): { boxesAvailable: boolean; fieldBoxes: FieldBoxes } {
  if (!isDocumentExtractionEvidence(evidence)) {
    return { boxesAvailable: false, fieldBoxes: { ...EMPTY_FIELD_BOXES } };
  }
  const blockById = new Map(blockRows.map((r) => [r.blockId, r]));
  const fieldBoxes = mapEvidenceToFieldBoxes(evidence, blockById);
  const boxesAvailable = Object.values(fieldBoxes).some((arr) => arr.length > 0);
  return { boxesAvailable, fieldBoxes };
}
