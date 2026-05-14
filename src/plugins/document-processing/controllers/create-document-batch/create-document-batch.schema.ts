import { Static, Type } from "@sinclair/typebox";

export const CreateDocumentBatchResponseSchema = Type.Object({
  status: Type.Literal("accepted"),
  batch: Type.Object({
    id: Type.String(),
    documentCount: Type.Number({ minimum: 1, maximum: 20 }),
    documents: Type.Array(
      Type.Object({
        filename: Type.String(),
        mimetype: Type.String(),
      }),
      { minItems: 1, maxItems: 20 },
    ),
  }),
});

export type CreateDocumentBatchResponse = Static<
  typeof CreateDocumentBatchResponseSchema
>;
