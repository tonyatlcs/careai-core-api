import { GetObjectCommand } from "@aws-sdk/client-s3";

import { AppDataSource } from "@/db/data-source";
import { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import {
  DocumentProcessingStatus,
  Documents,
} from "@/db/entities/documents.entity";
import { createS3Client } from "@/services/s3";
import type { DocumentJobMessage } from "@/worker/document-job-message";
import {
  createThrottledProgressUpdater,
  logDocumentProgress,
} from "@/worker/document-progress";
import { extractWithClaude } from "@/worker/claude-extract";
import { DEFAULT_ANTHROPIC_MODEL } from "@/worker/default-anthropic-model";
import { PermanentProcessingError } from "@/worker/errors";
import { extractPatientSubjectWithClaude } from "@/worker/extract-patient-subject-with-claude";
import { extractTextFromDocument } from "@/worker/extract-text";

const s3Client = createS3Client();

function auditLimit(): number {
  const raw = process.env.OCR_TEXT_AUDIT_LIMIT;
  if (raw === undefined || raw === "") {
    return 12000;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12000;
}

function isNoSuchKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "NoSuchKey"
  );
}

export async function processDocumentJob(job: DocumentJobMessage): Promise<void> {
  const documentsRepo = AppDataSource.getRepository(Documents);
  const document = await documentsRepo.findOne({ where: { id: job.documentId } });
  if (!document) {
    throw new PermanentProcessingError(
      `Document ${job.documentId} no longer exists.`,
    );
  }

  await documentsRepo.update(
    { id: document.id },
    {
      status: DocumentProcessingStatus.PROCESSING,
      processingError: null,
    },
  );
  document.status = DocumentProcessingStatus.PROCESSING;
  document.processingError = null;

  const report = createThrottledProgressUpdater(document.id, () => document.status);

  try {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new PermanentProcessingError("S3_BUCKET is not configured.");
    }

    let fileBuffer: Buffer;
    try {
      const object = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: document.id,
        }),
      );
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes?.length) {
        throw new PermanentProcessingError("S3 object was empty.");
      }
      fileBuffer = Buffer.from(bytes);
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        throw new PermanentProcessingError(
          "Uploaded file was not found in object storage.",
        );
      }
      throw error;
    }

    await report(10, "s3 file fetched", { force: true });

    const extracted = await extractTextFromDocument(document, fileBuffer, {
      onProgress: async (local01) => {
        const docPct = 20 + Math.round(local01 * 40);
        const edge = local01 < 1e-9 || local01 > 1 - 1e-9;
        await report(docPct, "text extraction", { force: edge });
      },
    });
    const auditText = extracted.text.slice(0, auditLimit());

    if (!extracted.text.trim()) {
      throw new PermanentProcessingError(
        "No text could be extracted from the document for processing.",
      );
    }

    await report(80, "Claude extraction started", { force: true });
    const [structured, patientSubjectFocused] = await Promise.all([
      extractWithClaude(extracted.text),
      extractPatientSubjectWithClaude(extracted.text),
    ]);
    await report(95, "Claude extraction completed; saving extraction", {
      force: true,
    });

    const subject =
      patientSubjectFocused.length > 0
        ? patientSubjectFocused
        : structured.subject;

    const extractionRepo = AppDataSource.getRepository(DocumentExtractions);
    const existing = await extractionRepo.findOne({
      where: { document: { id: document.id } },
    });

    const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;

    const row =
      existing ??
      extractionRepo.create({
        document,
      });

    extractionRepo.merge(row, {
      name: structured.name,
      reportDate: structured.reportDate,
      subject,
      contactSource: structured.contactSource,
      issueUser: structured.issueUser,
      category: structured.category,
      auditText,
      model,
      ocrEngine: extracted.ocrEngine,
      rawConfidence: extracted.rawConfidence,
    });

    await extractionRepo.save(row);

    report.dispose();

    document.status = DocumentProcessingStatus.COMPLETED;
    document.processingError = null;
    document.processingProgress = 100;
    await documentsRepo.save(document);
    logDocumentProgress(
      document.id,
      DocumentProcessingStatus.COMPLETED,
      100,
      "document completed",
    );
  } finally {
    report.dispose();
  }
}

export async function markDocumentFailed(
  documentId: string,
  message: string,
): Promise<void> {
  const documentsRepo = AppDataSource.getRepository(Documents);
  const document = await documentsRepo.findOne({ where: { id: documentId } });
  if (!document) {
    return;
  }
  document.status = DocumentProcessingStatus.FAILED;
  document.processingError = message;
  await documentsRepo.save(document);
}
