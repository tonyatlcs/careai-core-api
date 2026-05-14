import mammoth from "mammoth";
import { PDFParse, VerbosityLevel } from "pdf-parse";
import { createWorker, type Worker } from "tesseract.js";

import {
  DocumentMimeKind,
  type Documents,
} from "@/db/entities/documents.entity";

const MIN_USEFUL_TEXT_LEN = 60;
const MIN_USEFUL_LETTERS = 35;
const MAX_PDF_OCR_PAGES = 15;

let tesseractWorker: Worker | null = null;
let tesseractRecognizeProgressForward: ((n: number) => void) | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker("eng", undefined, {
      logger: (m) => {
        if (
          m.status === "recognizing text" &&
          typeof m.progress === "number"
        ) {
          tesseractRecognizeProgressForward?.(m.progress);
        }
      },
    });
  }
  return tesseractWorker;
}

export async function terminateTesseractWorker(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

function isTextUseful(text: string): boolean {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length < MIN_USEFUL_TEXT_LEN) {
    return false;
  }
  const letters = (collapsed.match(/[a-zA-Z]/g) ?? []).length;
  return letters >= MIN_USEFUL_LETTERS;
}

async function ocrImageBuffer(
  buffer: Buffer,
  onImageProgress?: (fraction: number) => Promise<void>,
): Promise<{
  text: string;
  confidence: number;
}> {
  let chain: Promise<void> = Promise.resolve();

  const emit = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    chain = chain.then(async () => {
      await onImageProgress?.(clamped);
    });
  };

  tesseractRecognizeProgressForward = (n) => {
    emit(Math.min(1, Math.max(0, n)));
  };

  try {
    emit(0);
    const worker = await getTesseractWorker();
    const {
      data: { text, confidence },
    } = await worker.recognize(buffer);
    emit(1);
    await chain;
    return { text, confidence: Number(confidence) || 0 };
  } finally {
    tesseractRecognizeProgressForward = null;
  }
}

export type ExtractedTextMeta = {
  text: string;
  ocrEngine: string;
  rawConfidence: number | null;
};

export type ExtractTextFromDocumentOptions = {
  /** Local progress for the text-extraction phase only (`0` = start, `1` = done). */
  onProgress?: (progress: number) => Promise<void>;
};

export async function extractTextFromDocument(
  document: Documents,
  fileBuffer: Buffer,
  options?: ExtractTextFromDocumentOptions,
): Promise<ExtractedTextMeta> {
  const onProgress = options?.onProgress;

  switch (document.type) {
    case DocumentMimeKind.JPG:
    case DocumentMimeKind.PNG: {
      const { text, confidence } = await ocrImageBuffer(
        fileBuffer,
        onProgress,
      );
      return {
        text,
        ocrEngine: "tesseract",
        rawConfidence: confidence,
      };
    }
    case DocumentMimeKind.DOCX: {
      await onProgress?.(0);
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value.trim();
      await onProgress?.(1);
      return {
        text,
        ocrEngine: "mammoth",
        rawConfidence: null,
      };
    }
    case DocumentMimeKind.PDF: {
      const parser = new PDFParse({
        data: new Uint8Array(fileBuffer),
        verbosity: VerbosityLevel.ERRORS,
      });
      try {
        await onProgress?.(0);
        const textResult = await parser.getText();
        const embedded = textResult.text.trim();
        if (isTextUseful(embedded)) {
          await onProgress?.(1);
          return {
            text: embedded,
            ocrEngine: "embedded_pdf_text",
            rawConfidence: null,
          };
        }

        const screenshot = await parser.getScreenshot({
          first: MAX_PDF_OCR_PAGES,
          scale: 2,
          imageBuffer: true,
          imageDataUrl: false,
        });

        const pages = screenshot.pages.filter((p) => p.data?.length);
        const n = Math.max(pages.length, 1);

        const parts: string[] = [];
        const confidences: number[] = [];
        for (let i = 0; i < pages.length; i += 1) {
          const page = pages[i];
          const { text, confidence } = await ocrImageBuffer(
            Buffer.from(page.data!),
            async (pageLocal) => {
              const combined = (i + pageLocal) / n;
              await onProgress?.(combined);
            },
          );
          parts.push(text.trim());
          confidences.push(confidence);
        }

        await onProgress?.(1);

        const ocrText = parts.filter(Boolean).join("\n\n");
        return {
          text: ocrText || embedded,
          ocrEngine:
            embedded.length > 0 ? "mixed_embedded_ocr" : "pdf_screenshot_ocr",
          rawConfidence:
            confidences.length > 0
              ? confidences.reduce((a, b) => a + b, 0) / confidences.length
              : null,
        };
      } finally {
        await parser.destroy();
      }
    }
    default: {
      const _never: never = document.type;
      return _never;
    }
  }
}
