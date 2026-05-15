import { GetObjectCommand } from "@aws-sdk/client-s3";

import { AppDataSource } from "@/db/data-source";
import { DocumentExtractions } from "@/db/entities/document-extractions.entity";
import { DocumentTextBlocks } from "@/db/entities/document-text-blocks.entity";
import {
  DocumentProcessingStatus,
  Documents,
} from "@/db/entities/documents.entity";
import {
  EMPTY_DOCUMENT_EVIDENCE,
  normalizeOcrEvidenceBlockId,
  type DocumentExtractionEvidence,
} from "@/domain/document-extraction-evidence";
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
import {
  documentTextForClaude,
  extractTextFromDocument,
} from "@/worker/extract-text";

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

function sanitizeEvidence(
  evidence: DocumentExtractionEvidence,
  validIds: Set<string>,
): DocumentExtractionEvidence {
  const filter = (ids: string[]) =>
    ids
      .map(normalizeOcrEvidenceBlockId)
      .filter((id) => validIds.has(id));

  return {
    name: filter(evidence.name),
    reportDate: filter(evidence.reportDate),
    subject: filter(evidence.subject),
    contactSource: filter(evidence.contactSource),
    issueUser: filter(evidence.issueUser),
    category: filter(evidence.category),
  };
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

    const extractionInput = documentTextForClaude(
      extracted.text,
      extracted.blocks,
    );

    await report(80, "Claude extraction started", { force: true });
    const [structured, patientNameFocused] = await Promise.all([
      extractWithClaude(extractionInput),
      extractPatientSubjectWithClaude(
        extracted.text,
        extracted.patientSubjectImage,
      ),
    ]);
    await report(95, "Claude extraction completed; saving extraction", {
      force: true,
    });

    const name =
      patientNameFocused.length > 0 ? patientNameFocused : structured.name;

    const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;

    const validBlockIds = new Set(extracted.blocks.map((b) => b.id));
    const evidence = sanitizeEvidence(
      structured.evidence ?? EMPTY_DOCUMENT_EVIDENCE,
      validBlockIds,
    );

    const blockEntities = extracted.blocks.map((b) => ({
      document,
      blockId: b.id,
      page: b.page,
      text: b.text,
      x: b.bbox.x,
      y: b.bbox.y,
      width: b.bbox.width,
      height: b.bbox.height,
      confidence: b.confidence,
      source: b.source,
    }));

    await AppDataSource.manager.transaction(async (manager) => {
      const blocksRepo = manager.getRepository(DocumentTextBlocks);
      const extractionRepo = manager.getRepository(DocumentExtractions);

      await blocksRepo.delete({ document: { id: document.id } });

      const existing = await extractionRepo.findOne({
        where: { document: { id: document.id } },
      });

      const row =
        existing ??
        extractionRepo.create({
          document,
        });

      extractionRepo.merge(row, {
        name,
        reportDate: structured.reportDate,
        subject: structured.subject,
        contactSource: structured.contactSource,
        issueUser: structured.issueUser,
        category: structured.category,
        auditText,
        model,
        ocrEngine: extracted.ocrEngine,
        rawConfidence: extracted.rawConfidence,
        evidence,
      });

      await extractionRepo.save(row);

      if (blockEntities.length > 0) {
        await blocksRepo.save(blockEntities.map((data) => blocksRepo.create(data)));
      }
    });

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
