import mammoth from "mammoth";
import { PDFParse, VerbosityLevel } from "pdf-parse";
import { createWorker, type Worker } from "tesseract.js";

import {
  DocumentMimeKind,
  type Documents,
} from "@/db/entities/documents.entity";

const MAX_PDF_OCR_PAGES = 15;

/** Upper bound on characters sent to Claude for structured extraction (tagged OCR or plain text). */
const DEFAULT_CLAUDE_EXTRACTION_INPUT_MAX_CHARS = 72_000;

const TRUNCATION_NOTICE =
  "\n\n[Document text truncated for processing; only the start of the document is shown above.]";

function claudeExtractionInputMaxChars(): number {
  const raw = process.env.CLAUDE_EXTRACTION_INPUT_MAX_CHARS;
  if (raw === undefined || raw === "") {
    return DEFAULT_CLAUDE_EXTRACTION_INPUT_MAX_CHARS;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DEFAULT_CLAUDE_EXTRACTION_INPUT_MAX_CHARS;
}

/**
 * Truncates from the start for LLM prompts; prefers cutting at a newline when near the limit.
 */
function truncateForClaudeExtraction(body: string, maxChars: number): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  let cut = trimmed.slice(0, maxChars);
  const lastNl = cut.lastIndexOf("\n");
  if (lastNl > maxChars * 0.85) {
    cut = cut.slice(0, lastNl);
  }
  return cut.trimEnd() + TRUNCATION_NOTICE;
}

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

export type OcrContentBlockSource = "tesseract_ocr";

export type OcrContentBlock = {
  id: string;
  page: number;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number | null;
  source: OcrContentBlockSource;
};

export type PatientSubjectImage = {
  mediaType: "image/jpeg" | "image/png";
  data: Buffer;
};

export type ExtractedTextMeta = {
  text: string;
  blocks: OcrContentBlock[];
  ocrEngine: string;
  rawConfidence: number | null;
  patientSubjectImage: PatientSubjectImage | null;
};

export type ExtractTextFromDocumentOptions = {
  /** Local progress for the text-extraction phase only (`0` = start, `1` = done). */
  onProgress?: (progress: number) => Promise<void>;
};

type TesseractLineBbox = { x0: number; y0: number; x1: number; y1: number };

type TesseractLine = {
  text: string;
  confidence: number;
  bbox: TesseractLineBbox;
};

type TesseractParagraph = { lines?: TesseractLine[] };

type TesseractBlock = { paragraphs?: TesseractParagraph[] };

function parseTesseractBlocksToLineBlocks(
  pageNumber: number,
  blocks: TesseractBlock[] | null | undefined,
): OcrContentBlock[] {
  const out: OcrContentBlock[] = [];
  if (!blocks?.length) {
    return out;
  }
  let lineNum = 0;
  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const trimmed = line.text.replace(/\s+/g, " ").trim();
        if (!trimmed) {
          continue;
        }
        lineNum += 1;
        const b = line.bbox;
        out.push({
          id: `p${pageNumber}_line_${lineNum}`,
          page: pageNumber,
          text: trimmed,
          bbox: {
            x: b.x0,
            y: b.y0,
            width: Math.max(0, b.x1 - b.x0),
            height: Math.max(0, b.y1 - b.y0),
          },
          confidence: Number.isFinite(line.confidence) ? line.confidence : null,
          source: "tesseract_ocr",
        });
      }
    }
  }
  return out;
}

async function ocrImageBuffer(
  buffer: Buffer,
  pageNumber: number,
  onImageProgress?: (fraction: number) => Promise<void>,
): Promise<{
  text: string;
  confidence: number;
  blocks: OcrContentBlock[];
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
      data: { text, confidence, blocks },
    } = await worker.recognize(buffer, {}, { blocks: true });
    emit(1);
    await chain;
    const lineBlocks = parseTesseractBlocksToLineBlocks(
      pageNumber,
      blocks as TesseractBlock[] | null | undefined,
    );
    return {
      text,
      confidence: Number(confidence) || 0,
      blocks: lineBlocks,
    };
  } finally {
    tesseractRecognizeProgressForward = null;
  }
}

/** One tagged line per OCR block for Claude evidence (empty when there are no blocks). */
export function blocksToTaggedDocumentText(blocks: OcrContentBlock[]): string {
  if (blocks.length === 0) {
    return "";
  }
  return blocks.map((b) => `[${b.id}] ${b.text}`).join("\n");
}

export function documentTextForClaude(
  plainText: string,
  blocks: OcrContentBlock[],
): string {
  const maxChars = claudeExtractionInputMaxChars();
  if (blocks.length > 0) {
    return truncateForClaudeExtraction(
      blocksToTaggedDocumentText(blocks),
      maxChars,
    );
  }
  return truncateForClaudeExtraction(plainText, maxChars);
}

export async function extractTextFromDocument(
  document: Documents,
  fileBuffer: Buffer,
  options?: ExtractTextFromDocumentOptions,
): Promise<ExtractedTextMeta> {
  const onProgress = options?.onProgress;

  switch (document.type) {
    case DocumentMimeKind.JPG:
    case DocumentMimeKind.PNG: {
      const { text, confidence, blocks } = await ocrImageBuffer(
        fileBuffer,
        1,
        onProgress,
      );
      return {
        text: text.trim(),
        blocks,
        ocrEngine: "tesseract",
        rawConfidence: confidence,
        patientSubjectImage: {
          mediaType:
            document.type === DocumentMimeKind.JPG ? "image/jpeg" : "image/png",
          data: fileBuffer,
        },
      };
    }
    case DocumentMimeKind.DOCX: {
      await onProgress?.(0);
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value.trim();
      await onProgress?.(1);
      return {
        text,
        blocks: [],
        ocrEngine: "mammoth",
        rawConfidence: null,
        patientSubjectImage: null,
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

        const screenshot = await parser.getScreenshot({
          first: MAX_PDF_OCR_PAGES,
          scale: 2,
          imageBuffer: true,
          imageDataUrl: false,
        });

        const pages = screenshot.pages.filter((p) => p.data?.length);
        const n = Math.max(pages.length, 1);

        if (pages.length === 0) {
          await onProgress?.(1);
          return {
            text: embedded,
            blocks: [],
            ocrEngine: "embedded_pdf_text",
            rawConfidence: null,
            patientSubjectImage: null,
          };
        }

        const parts: string[] = [];
        const confidences: number[] = [];
        const allBlocks: OcrContentBlock[] = [];

        for (let i = 0; i < pages.length; i += 1) {
          const page = pages[i];
          const pageNum = i + 1;
          const { text, confidence, blocks } = await ocrImageBuffer(
            Buffer.from(page.data!),
            pageNum,
            async (pageLocal) => {
              const combined = (i + pageLocal) / n;
              await onProgress?.(combined);
            },
          );
          parts.push(text.trim());
          confidences.push(confidence);
          allBlocks.push(...blocks);
        }

        await onProgress?.(1);

        const ocrText = parts.filter(Boolean).join("\n\n");
        return {
          text: ocrText || embedded,
          blocks: allBlocks,
          ocrEngine: "pdf_screenshot_ocr",
          rawConfidence:
            confidences.length > 0
              ? confidences.reduce((a, b) => a + b, 0) / confidences.length
              : null,
          patientSubjectImage: pages[0]?.data
            ? {
                mediaType: "image/png",
                data: Buffer.from(pages[0].data),
              }
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
