import { FastifyReply, FastifyRequest } from "fastify";

import {
  ListDocumentsQuerystringSchema,
  ListDocumentsResponseSchema,
  type ListDocumentsQuerystring,
} from "@/plugins/document-processing/controllers/list-documents/list-documents.schema";
import { listDocumentsQuery } from "@/plugins/document-processing/controllers/list-documents/query/list-documents.query";
import { documentEntityToListResponse } from "@/plugins/document-processing/controllers/list-documents/utils/list-documents.mapper";

export const ListDocumentsRouteOptions = {
  schema: {
    querystring: ListDocumentsQuerystringSchema,
    response: {
      200: ListDocumentsResponseSchema,
    },
  },
};

export const listDocumentsController = async (
  request: FastifyRequest<{ Querystring: ListDocumentsQuerystring }>,
  reply: FastifyReply,
) => {
  const page = request.query.page ?? 1;
  const limit = request.query.limit ?? 20;
  const { documents: rows, total, extractionsByDocumentId } =
    await listDocumentsQuery({ page, limit });
  const documents = rows.map((document) =>
    documentEntityToListResponse(
      document,
      extractionsByDocumentId.get(document.id),
    ),
  );
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return reply.send({
    documents,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  });
};
