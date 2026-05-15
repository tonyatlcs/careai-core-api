import { Static, Type } from "@sinclair/typebox";

export const FieldBoxSchema = Type.Object({
  page: Type.Integer(),
  x: Type.Number(),
  y: Type.Number(),
  width: Type.Number(),
  height: Type.Number(),
  sourceBlockId: Type.String(),
  text: Type.String(),
  confidence: Type.Union([Type.Number(), Type.Null()]),
});

export const FieldBoxesSchema = Type.Object({
  name: Type.Array(FieldBoxSchema),
  reportDate: Type.Array(FieldBoxSchema),
  subject: Type.Array(FieldBoxSchema),
  contactSource: Type.Array(FieldBoxSchema),
  issueUser: Type.Array(FieldBoxSchema),
  category: Type.Array(FieldBoxSchema),
  storeIn: Type.Array(FieldBoxSchema),
});

export type FieldBoxes = Static<typeof FieldBoxesSchema>;

export const EMPTY_FIELD_BOXES: FieldBoxes = {
  name: [],
  reportDate: [],
  subject: [],
  contactSource: [],
  issueUser: [],
  category: [],
  storeIn: [],
};
