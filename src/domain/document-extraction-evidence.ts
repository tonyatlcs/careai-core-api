/** Strip optional `[...]` wrapping so evidence ids match `document_text_blocks.block_id`. */
export function normalizeOcrEvidenceBlockId(id: string): string {
  const t = id.trim();
  if (t.length >= 2 && t.startsWith("[") && t.endsWith("]")) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** Block IDs from OCR line tagging; persisted on `document_extractions.evidence`. */
export type DocumentExtractionEvidence = {
  name: string[];
  reportDate: string[];
  subject: string[];
  contactSource: string[];
  issueUser: string[];
  category: string[];
  storeIn: string[];
};

export const EMPTY_DOCUMENT_EVIDENCE: DocumentExtractionEvidence = {
  name: [],
  reportDate: [],
  subject: [],
  contactSource: [],
  issueUser: [],
  category: [],
  storeIn: [],
};
