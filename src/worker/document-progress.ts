import { IsNull } from "typeorm";

import { AppDataSource } from "@/db/data-source";
import {
  DocumentProcessingStatus,
  Documents,
} from "@/db/entities/documents.entity";

export function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export async function setDocumentProgress(
  documentId: string,
  progress: number,
): Promise<void> {
  const clamped = clampProgress(progress);
  await AppDataSource.getRepository(Documents).update(
    { id: documentId, deletedAt: IsNull() },
    { processingProgress: clamped },
  );
}

export function logDocumentProgress(
  documentId: string,
  status: DocumentProcessingStatus,
  processingProgress: number,
  message: string,
): void {
  console.info(
    { documentId, status, processingProgress, message },
    "document processing progress",
  );
}

/** Throttle DB writes and logs during noisy OCR updates (≥2 points or ≥1s). */
export function createThrottledProgressUpdater(
  documentId: string,
  getStatus: () => DocumentProcessingStatus,
) {
  let lastWritten = -1;
  let lastWrittenAt = 0;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: number | null = null;
  let pendingMessage = "";

  const write = async (value: number, message: string): Promise<void> => {
    const clamped = clampProgress(value);
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    await setDocumentProgress(documentId, clamped);
    logDocumentProgress(documentId, getStatus(), clamped, message);
    lastWritten = clamped;
    lastWrittenAt = Date.now();
    pendingValue = null;
  };

  const updater = async (
    nextPercent: number,
    message: string,
    options?: { force?: boolean },
  ): Promise<void> => {
    const target = clampProgress(nextPercent);
    const now = Date.now();

    const shouldWriteNow =
      options?.force === true ||
      lastWritten < 0 ||
      Math.abs(target - lastWritten) >= 2 ||
      now - lastWrittenAt >= 1000;

    if (shouldWriteNow) {
      await write(target, message);
      return;
    }

    pendingValue = target;
    pendingMessage = message;
    if (!scheduled) {
      const delay = Math.max(0, 1000 - (now - lastWrittenAt));
      scheduled = setTimeout(() => {
        scheduled = null;
        void (async () => {
          if (pendingValue !== null) {
            await write(pendingValue, pendingMessage);
          }
        })();
      }, delay);
    }
  };

  const dispose = (): void => {
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    pendingValue = null;
  };

  return Object.assign(updater, { dispose });
}
