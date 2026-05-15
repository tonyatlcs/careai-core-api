import { FastifyReply, FastifyRequest } from "fastify";

import { AppDataSource } from "@/db/data-source";
import { Documents } from "@/db/entities/documents.entity";

export const DeleteDocumentRouteOptions = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
  },
};

type Params = { id: string };

export const deleteDocumentController = async (
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) => {
  const { id } = request.params;

  const documentsRepo = AppDataSource.getRepository(Documents);
  const document = await documentsRepo.findOne({ where: { id } });

  if (!document) {
    return reply.code(404).send({ error: "document_not_found" });
  }

  if (document.deletedAt != null) {
    return reply.code(204).send();
  }

  document.deletedAt = new Date();
  await documentsRepo.save(document);

  return reply.code(204).send();
};
