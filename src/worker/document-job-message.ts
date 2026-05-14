export type DocumentJobMessage = {
  documentId: string;
  batchId: string;
  requestedAt: string;
};

export function parseDocumentJobMessage(raw: string): DocumentJobMessage {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("documentId" in parsed) ||
    typeof (parsed as DocumentJobMessage).documentId !== "string" ||
    !("batchId" in parsed) ||
    typeof (parsed as DocumentJobMessage).batchId !== "string" ||
    !("requestedAt" in parsed) ||
    typeof (parsed as DocumentJobMessage).requestedAt !== "string"
  ) {
    throw new Error("Invalid document job message body.");
  }
  return parsed as DocumentJobMessage;
}
