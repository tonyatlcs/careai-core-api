import { DocumentMimeKind } from "@/db/entities/documents.entity";

export const badRequest = (message: string) => {
  return Object.assign(new Error(message), {
    statusCode: 400,
  });
};

export const mimeToDocumentKind = (mimetype: string): DocumentMimeKind => {
  switch (mimetype) {
    case "application/pdf":
      return DocumentMimeKind.PDF;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return DocumentMimeKind.DOCX;
    case "image/png":
      return DocumentMimeKind.PNG;
    case "image/jpeg":
      return DocumentMimeKind.JPG;
    default:
      throw badRequest(`Unsupported file type.`);
  }
};
