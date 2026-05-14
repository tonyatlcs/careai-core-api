import { Static, Type } from "@sinclair/typebox";

import { DocumentCategorySchema } from "@/plugins/document-processing/schema/document-category.schema";

export const ListDocumentsQuerystringSchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 20 })),
});
export type ListDocumentsQuerystring = Static<
  typeof ListDocumentsQuerystringSchema
>;

/** Document row status from the API (mirrors `DocumentProcessingStatus` on `documents`). */
export const ListDocumentsItemStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("processing"),
  Type.Literal("completed"),
  Type.Literal("failed"),
]);
export type ListDocumentsItemStatus = Static<
  typeof ListDocumentsItemStatusSchema
>;

export const ListDocumentsResponseItemSchema = Type.Object({
  name: Type.String(),
  createdAt: Type.String(),
  patient: Type.Optional(Type.String()),
  category: Type.Optional(DocumentCategorySchema),
  progress: Type.Integer({ minimum: 0, maximum: 100 }),
  status: ListDocumentsItemStatusSchema,
});
export type ListDocumentsResponseItem = Static<
  typeof ListDocumentsResponseItemSchema
>;

export const ListDocumentsResponseSchema = Type.Object({
  documents: Type.Array(ListDocumentsResponseItemSchema),
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  limit: Type.Integer({ minimum: 1 }),
  totalPages: Type.Integer({ minimum: 0 }),
  hasNextPage: Type.Boolean(),
  hasPreviousPage: Type.Boolean(),
});

export type ListDocumentsResponse = Static<typeof ListDocumentsResponseSchema>;
