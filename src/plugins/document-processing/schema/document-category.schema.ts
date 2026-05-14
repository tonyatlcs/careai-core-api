import { Static, Type } from "@sinclair/typebox";

export const DocumentCategorySchema = Type.Union([
  Type.Literal("admissionsSummary"),
  Type.Literal("advanceCarePlanning"),
  Type.Literal("alliedHealthLetter"),
  Type.Literal("certificate"),
  Type.Literal("clinicalNotes"),
  Type.Literal("clinicalPhotograph"),
  Type.Literal("consentForm"),
  Type.Literal("das21"),
  Type.Literal("dischargeSummary"),
  Type.Literal("ecg"),
  Type.Literal("email"),
  Type.Literal("form"),
  Type.Literal("immunisation"),
  Type.Literal("indigenousPip"),
  Type.Literal("letter"),
  Type.Literal("medicalImagingReport"),
  Type.Literal("myHealthRegistration"),
  Type.Literal("newPtRegistrationForm"),
  Type.Literal("pathologyResults"),
  Type.Literal("patientConsent"),
  Type.Literal("recordRequest"),
  Type.Literal("referralLetter"),
  Type.Literal("workcover"),
  Type.Literal("workcoverConsent"),
]);

export type DocumentCategory = Static<typeof DocumentCategorySchema>;
