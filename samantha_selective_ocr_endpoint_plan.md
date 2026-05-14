# Samantha Medical Document Processing Endpoint Implementation Plan

## 1. Goal

Build a backend endpoint for **Samantha**, a Medical Document Processing AI Agent, that can:

1. Accept an uploaded medical document.
2. Decide whether OCR is needed.
3. Extract text and bounding boxes from the document.
4. Extract the 7 required filing fields.
5. Map extracted fields back to document text boxes.
6. Return a receptionist-review-ready payload.
7. Allow the receptionist to override fields before approval.

The key principle:

> Use OCR selectively. Do not OCR every document by default.

---

## 2. Core Problem Being Solved

Medical practices receive many incoming documents such as:

- Imaging reports
- Pathology results
- Referral letters
- Discharge summaries
- Certificates
- Allied health letters
- Forms

Receptionists need to file these documents under the correct patient and doctor inbox with the correct metadata.

Samantha should assist by extracting:

| Field | Description |
|---|---|
| Patient name | Must be selected/search-only from patient list |
| Date of report | Date shown on document |
| Subject | Example: `Ultrasound of left foot` |
| Contact of source | Example: `Lakes Radiology` |
| Store in | `Correspondence` or `Investigations` |
| User / GP Doctor | The GP doctor who should review the document |
| Category | One of the allowed filing categories |

The receptionist must be able to review and override before import.

---

## 3. High-Level Architecture

```text
POST /documents
    ↓
Save uploaded file
    ↓
Inspect document
    ↓
Choose extraction strategy
    ↓
If PDF has usable text layer:
    Extract PDF text + coordinates
Else:
    Convert to image
    Run Tesseract OCR
    Extract text + bounding boxes
    ↓
Normalize output into TextBlock[]
    ↓
Send text blocks to AI extraction layer
    ↓
AI returns 7 fields + evidence block IDs
    ↓
Map evidence block IDs to coordinates
    ↓
Return document status and extraction result
    ↓
Receptionist reviews and approves
```

---

## 4. Endpoint Overview

### Required endpoints

```http
POST /documents
GET /documents/:documentId
PATCH /documents/:documentId/review
POST /documents/:documentId/approve
```

### Optional endpoints

```http
GET /documents/:documentId/pages/:pageNumber
GET /patients/search?q=
GET /doctors/search?q=
```

---

## 5. Recommended Processing Flow

The main endpoint should be asynchronous.

### Upload flow

```text
Client uploads document
↓
Backend saves original file
↓
Backend creates document record
↓
Backend starts processing in background
↓
Backend returns 202 Accepted with documentId
↓
Client polls GET /documents/:id
↓
When status becomes needs_review, show review UI
```

---

## 6. POST /documents

### Purpose

Upload a PDF/image and start Samantha's extraction workflow.

### Request

```http
POST /documents
Content-Type: multipart/form-data
```

Form data:

```text
file: PDF / PNG / JPG
```

### Response

```json
{
  "documentId": "doc_123",
  "status": "processing",
  "message": "Document uploaded and processing has started."
}
```

### Responsibilities

The endpoint should:

1. Accept multipart upload.
2. Validate file type.
3. Save file to local storage or S3.
4. Create a document record.
5. Start document processing.
6. Return a `documentId`.

---

## 7. GET /documents/:documentId

### Purpose

Return document processing status and extraction results.

### Response while processing

```json
{
  "documentId": "doc_123",
  "status": "processing",
  "currentStep": "ocr",
  "progress": 45
}
```

### Response when ready for review

```json
{
  "documentId": "doc_123",
  "status": "needs_review",
  "processing": {
    "strategy": "ocr_fallback",
    "ocrUsed": true,
    "reason": "Embedded PDF text was incomplete; OCR fallback was used.",
    "textQualityScore": 0.42
  },
  "file": {
    "originalName": "ultrasound-report.pdf",
    "pageImages": [
      {
        "page": 1,
        "url": "/documents/doc_123/pages/1.png",
        "width": 2480,
        "height": 3508
      }
    ]
  },
  "extraction": {
    "patientName": {
      "value": "Jane Smith",
      "confidence": 0.96,
      "evidenceBlockIds": ["p1_line_4"],
      "boxes": [
        {
          "page": 1,
          "x": 220,
          "y": 310,
          "width": 380,
          "height": 42
        }
      ]
    },
    "dateOfReport": {
      "value": "03 May 2026",
      "confidence": 0.93,
      "evidenceBlockIds": ["p1_line_8"],
      "boxes": [
        {
          "page": 1,
          "x": 1850,
          "y": 260,
          "width": 280,
          "height": 36
        }
      ]
    },
    "subject": {
      "value": "Ultrasound of left foot",
      "confidence": 0.91,
      "evidenceBlockIds": ["p1_line_12"],
      "boxes": [
        {
          "page": 1,
          "x": 210,
          "y": 650,
          "width": 600,
          "height": 44
        }
      ]
    },
    "contactOfSource": {
      "value": "Lakes Radiology",
      "confidence": 0.94,
      "evidenceBlockIds": ["p1_line_1"],
      "boxes": [
        {
          "page": 1,
          "x": 180,
          "y": 120,
          "width": 420,
          "height": 50
        }
      ]
    },
    "storeIn": {
      "value": "Investigations",
      "confidence": 0.96,
      "evidenceBlockIds": ["p1_line_12"],
      "boxes": []
    },
    "userDoctor": {
      "value": "Dr Emily Smith",
      "confidence": 0.84,
      "evidenceBlockIds": ["p1_line_10"],
      "boxes": [
        {
          "page": 1,
          "x": 220,
          "y": 520,
          "width": 360,
          "height": 38
        }
      ]
    },
    "category": {
      "value": "Medical imaging report",
      "confidence": 0.97,
      "evidenceBlockIds": ["p1_line_1", "p1_line_12"],
      "boxes": []
    }
  },
  "warnings": [
    "Please verify the assigned GP doctor before approving."
  ]
}
```

---

## 8. PATCH /documents/:documentId/review

### Purpose

Allow receptionist to override Samantha's extracted fields.

### Request

```json
{
  "patientId": "pat_001",
  "patientName": "Jane Smith",
  "dateOfReport": "2026-05-03",
  "subject": "Ultrasound of left foot",
  "contactOfSource": "Lakes Radiology",
  "storeIn": "Investigations",
  "userDoctorId": "doc_001",
  "userDoctor": "Dr Emily Smith",
  "category": "Medical imaging report"
}
```

### Response

```json
{
  "documentId": "doc_123",
  "status": "needs_review",
  "reviewedFields": {
    "patientName": "Jane Smith",
    "dateOfReport": "2026-05-03",
    "subject": "Ultrasound of left foot",
    "contactOfSource": "Lakes Radiology",
    "storeIn": "Investigations",
    "userDoctor": "Dr Emily Smith",
    "category": "Medical imaging report"
  }
}
```

---

## 9. POST /documents/:documentId/approve

### Purpose

Approve the reviewed document and generate a PMS-ready import payload.

### Response

```json
{
  "documentId": "doc_123",
  "status": "approved",
  "importPayload": {
    "patientId": "pat_001",
    "dateOfReport": "2026-05-03",
    "subject": "Ultrasound of left foot",
    "contactOfSource": "Lakes Radiology",
    "storeIn": "Investigations",
    "userDoctorId": "doc_001",
    "category": "Medical imaging report",
    "documentFileId": "doc_123"
  }
}
```

---

## 10. Selective OCR Strategy

### Key idea

Do not OCR every document.

Use this strategy:

```text
If file is image:
    OCR required

If file is PDF:
    Try embedded PDF text extraction first

If PDF text layer is good:
    Skip OCR

If PDF text layer is missing or poor:
    Run OCR fallback

If both fail:
    Mark for manual review
```

---

## 11. Extraction Strategy Types

```ts
type ExtractionStrategy =
  | "embedded_pdf_text"
  | "ocr_required"
  | "ocr_fallback"
  | "manual_review";
```

---

## 12. Document Inspection Model

```ts
type DocumentInspection = {
  mimeType: string;
  pageCount?: number;
  hasEmbeddedText: boolean;
  textQuality: "good" | "poor" | "none";
  extractedCharCount: number;
  extractedWordCount: number;
  hasCoordinates: boolean;
  reason: string;
};
```

---

## 13. Strategy Decision Function

```ts
function chooseExtractionStrategy(
  inspection: DocumentInspection
): ExtractionStrategy {
  if (inspection.mimeType.startsWith("image/")) {
    return "ocr_required";
  }

  if (inspection.mimeType !== "application/pdf") {
    return "manual_review";
  }

  if (!inspection.hasEmbeddedText) {
    return "ocr_required";
  }

  if (inspection.textQuality === "poor") {
    return "ocr_fallback";
  }

  if (!inspection.hasCoordinates) {
    return "ocr_fallback";
  }

  return "embedded_pdf_text";
}
```

---

## 14. Text Layer Quality Assessment

A PDF may technically contain text, but that text may be unusable.

Examples of poor text layers:

- Only page numbers
- Random symbols
- Broken spacing
- Hidden OCR garbage
- Cover page text only
- Missing coordinates

Use a quality score instead of checking only `text.length`.

```ts
type TextLayerAssessment = {
  hasTextLayer: boolean;
  quality: "good" | "poor" | "none";
  score: number;
  reason: string;
};
```

Example heuristic:

```ts
function assessTextLayer(text: string): TextLayerAssessment {
  const cleaned = text.trim();

  if (cleaned.length < 80) {
    return {
      hasTextLayer: false,
      quality: "none",
      score: 0,
      reason: "No meaningful embedded text detected.",
    };
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const alphaNumericChars = cleaned.match(/[a-zA-Z0-9]/g)?.length ?? 0;
  const weirdChars = cleaned.match(/[^\w\s.,:;()/'"-]/g)?.length ?? 0;

  const alphaNumericRatio = alphaNumericChars / cleaned.length;
  const weirdCharRatio = weirdChars / cleaned.length;

  let score = 0;

  if (cleaned.length > 300) score += 0.3;
  if (words.length > 50) score += 0.3;
  if (alphaNumericRatio > 0.6) score += 0.2;
  if (weirdCharRatio < 0.15) score += 0.2;

  if (score >= 0.75) {
    return {
      hasTextLayer: true,
      quality: "good",
      score,
      reason: "PDF has a usable embedded text layer.",
    };
  }

  return {
    hasTextLayer: true,
    quality: "poor",
    score,
    reason: "PDF has embedded text, but quality appears poor.",
  };
}
```

---

## 15. Normalized TextBlock Format

Regardless of whether text came from PDF text layer or OCR, normalize it into the same format.

```ts
type TextBlock = {
  id: string;
  page: number;
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  source: "pdf_text_layer" | "tesseract_ocr";
};
```

This makes the AI extraction layer and frontend highlighting logic independent from the extraction method.

---

## 16. Tesseract OCR Output

Tesseract should extract:

- Raw text
- Words
- Confidence scores
- Bounding boxes

Example OCR word:

```ts
type OcrWord = {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};
```

---

## 17. Group OCR Words Into Line Blocks

The AI should receive line blocks, not individual words.

Example:

```text
[p1_line_1] Lakes Radiology
[p1_line_2] Patient: Jane Smith DOB 12/04/1981
[p1_line_3] Report Date: 03 May 2026
```

Grouping function:

```ts
function wordsToLineBlocks(words: OcrWord[], page: number): TextBlock[] {
  const sorted = [...words]
    .filter((word) => word.text.trim())
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  const lines: OcrWord[][] = [];

  for (const word of sorted) {
    const currentLine = lines[lines.length - 1];

    if (!currentLine) {
      lines.push([word]);
      continue;
    }

    const currentLineY =
      currentLine.reduce((sum, w) => sum + w.bbox.y0, 0) / currentLine.length;

    const isSameLine = Math.abs(word.bbox.y0 - currentLineY) < 14;

    if (isSameLine) {
      currentLine.push(word);
    } else {
      lines.push([word]);
    }
  }

  return lines.map((line, index) => {
    const x0 = Math.min(...line.map((word) => word.bbox.x0));
    const y0 = Math.min(...line.map((word) => word.bbox.y0));
    const x1 = Math.max(...line.map((word) => word.bbox.x1));
    const y1 = Math.max(...line.map((word) => word.bbox.y1));

    const avgConfidence =
      line.reduce((sum, word) => sum + word.confidence, 0) / line.length;

    return {
      id: `p${page}_line_${index + 1}`,
      page,
      text: line.map((word) => word.text).join(" "),
      bbox: {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      },
      confidence: avgConfidence,
      source: "tesseract_ocr",
    };
  });
}
```

---

## 18. PDF to Image Conversion

For OCR fallback, convert PDF pages to images.

Recommended tool:

```bash
pdftoppm
```

Install on macOS:

```bash
brew install poppler
```

Install on Ubuntu/Debian:

```bash
sudo apt-get install poppler-utils
```

Convert PDF to PNG pages:

```bash
pdftoppm -png -r 300 original.pdf page
```

Use 300 DPI for better OCR accuracy.

Node wrapper:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function convertPdfToImages(
  pdfPath: string,
  outputDir: string
): Promise<string[]> {
  await fs.mkdir(outputDir, { recursive: true });

  const outputPrefix = path.join(outputDir, "page");

  await execFileAsync("pdftoppm", [
    "-png",
    "-r",
    "300",
    pdfPath,
    outputPrefix,
  ]);

  const files = await fs.readdir(outputDir);

  return files
    .filter((file) => file.endsWith(".png"))
    .sort()
    .map((file) => path.join(outputDir, file));
}
```

---

## 19. Tesseract.js OCR Service

Install:

```bash
pnpm add tesseract.js
```

Example service:

```ts
import { createWorker, PSM } from "tesseract.js";

export async function runOcrOnImage(imagePath: string, page: number) {
  const worker = await createWorker("eng");

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
  });

  const result = await worker.recognize(imagePath);

  await worker.terminate();

  return {
    page,
    text: result.data.text,
    words:
      result.data.words?.map((word: any) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        },
      })) ?? [],
  };
}
```

---

## 20. AI Input Format

Build the AI input from text blocks.

```ts
function buildBlockText(blocks: TextBlock[]) {
  return blocks
    .map((block) => `[${block.id}] ${block.text}`)
    .join("\n");
}
```

Example:

```text
[p1_line_1] Lakes Radiology
[p1_line_2] Patient: Jane Smith DOB 12/04/1981
[p1_line_3] Report Date: 03 May 2026
[p1_line_4] Examination: Ultrasound left foot
[p1_line_5] Requested by: Dr Emily Smith
```

---

## 21. AI Extraction Prompt

```text
You are Samantha, a medical document processing assistant.

Extract the 7 filing fields for receptionist review.

Return only valid JSON.

For each field return:
- value
- confidence from 0 to 1
- evidenceBlockIds

Rules:
- Use only the supplied OCR/PDF text blocks.
- Do not invent values.
- If unsure, return null.
- evidenceBlockIds must reference the supporting block IDs.
- category must be exactly one of the allowed categories.
- storeIn must be either "Correspondence" or "Investigations".
- userDoctor means the GP doctor who should review the document, not the reporting specialist.

Fields:
- patientName
- dateOfReport
- subject
- contactOfSource
- storeIn
- userDoctor
- category

Allowed categories:
- Admissions summary
- Advance care planning
- Allied health letter
- Certificate
- Clinical notes
- Clinical photograph
- Consent form
- DAS21
- Discharge summary
- ECG
- Email
- Form
- Immunisation
- Indigenous PIP
- Letter
- Medical imaging report
- MyHealth registration
- New PT registration form
- Pathology results
- Patient consent
- Record request
- Referral letter
- Workcover
- Workcover consent

Text blocks:
{{BLOCK_TEXT}}
```

---

## 22. Expected AI Output

```json
{
  "patientName": {
    "value": "Jane Smith",
    "confidence": 0.96,
    "evidenceBlockIds": ["p1_line_2"]
  },
  "dateOfReport": {
    "value": "03 May 2026",
    "confidence": 0.93,
    "evidenceBlockIds": ["p1_line_3"]
  },
  "subject": {
    "value": "Ultrasound left foot",
    "confidence": 0.91,
    "evidenceBlockIds": ["p1_line_4"]
  },
  "contactOfSource": {
    "value": "Lakes Radiology",
    "confidence": 0.94,
    "evidenceBlockIds": ["p1_line_1"]
  },
  "storeIn": {
    "value": "Investigations",
    "confidence": 0.96,
    "evidenceBlockIds": ["p1_line_4"]
  },
  "userDoctor": {
    "value": "Dr Emily Smith",
    "confidence": 0.84,
    "evidenceBlockIds": ["p1_line_5"]
  },
  "category": {
    "value": "Medical imaging report",
    "confidence": 0.97,
    "evidenceBlockIds": ["p1_line_1", "p1_line_4"]
  }
}
```

---

## 23. Attach Boxes to Extracted Fields

The AI returns `evidenceBlockIds`.

Backend maps those IDs back to `TextBlock.bbox`.

```ts
function attachBoxesToExtraction(
  extraction: SamanthaExtraction,
  blocks: TextBlock[]
) {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return Object.fromEntries(
    Object.entries(extraction).map(([fieldName, field]) => {
      const boxes = field.evidenceBlockIds
        .map((id) => blockMap.get(id))
        .filter(Boolean)
        .map((block) => ({
          page: block!.page,
          x: block!.bbox.x,
          y: block!.bbox.y,
          width: block!.bbox.width,
          height: block!.bbox.height,
        }));

      return [
        fieldName,
        {
          ...field,
          boxes,
        },
      ];
    })
  );
}
```

---

## 24. Extraction Quality Assessment

After extracting fields, assess whether the result is good enough.

```ts
function assessExtractionQuality(extraction: SamanthaExtraction) {
  const warnings: string[] = [];

  const requiredFields: Array<keyof SamanthaExtraction> = [
    "patientName",
    "dateOfReport",
    "subject",
    "contactOfSource",
    "storeIn",
    "userDoctor",
    "category",
  ];

  for (const field of requiredFields) {
    const value = extraction[field]?.value;
    const confidence = extraction[field]?.confidence ?? 0;

    if (!value) {
      warnings.push(`${field} is missing.`);
    }

    if (confidence < 0.75) {
      warnings.push(`${field} has low confidence.`);
    }
  }

  const criticalMissing =
    !extraction.patientName.value ||
    !extraction.dateOfReport.value ||
    !extraction.category.value;

  return {
    readyForReview: !criticalMissing,
    warnings,
  };
}
```

---

## 25. Staged OCR Fallback

Use embedded PDF text first if possible.

If extraction is poor, then run OCR fallback.

```ts
async function extractWithSelectiveOcr(filePath: string, mimeType: string) {
  const inspection = await inspectDocument(filePath, mimeType);

  if (mimeType === "application/pdf" && inspection.textQuality === "good") {
    const pdfBlocks = await extractPdfTextBlocks(filePath);
    const pdfExtraction = await extractFieldsWithAi(pdfBlocks);

    const quality = assessExtractionQuality(pdfExtraction);

    if (quality.readyForReview) {
      return {
        strategy: "embedded_pdf_text",
        ocrUsed: false,
        blocks: pdfBlocks,
        extraction: pdfExtraction,
        warnings: quality.warnings,
      };
    }

    const ocrBlocks = await extractOcrTextBlocks(filePath, mimeType);
    const ocrExtraction = await extractFieldsWithAi(ocrBlocks);

    return {
      strategy: "ocr_fallback",
      ocrUsed: true,
      blocks: ocrBlocks,
      extraction: ocrExtraction,
      warnings: [
        ...quality.warnings,
        "OCR fallback was used because embedded text extraction was incomplete.",
      ],
    };
  }

  const ocrBlocks = await extractOcrTextBlocks(filePath, mimeType);
  const ocrExtraction = await extractFieldsWithAi(ocrBlocks);

  return {
    strategy: "ocr_required",
    ocrUsed: true,
    blocks: ocrBlocks,
    extraction: ocrExtraction,
    warnings: [],
  };
}
```

---

## 26. Full Document Processing Function

```ts
async function processDocument(
  documentId: string,
  filePath: string,
  mimeType: string
) {
  try {
    await updateDocument(documentId, {
      status: "processing",
      currentStep: "inspection",
    });

    const result = await extractWithSelectiveOcr(filePath, mimeType);

    const extractionWithBoxes = attachBoxesToExtraction(
      result.extraction,
      result.blocks
    );

    await saveTextBlocks(documentId, result.blocks);

    await saveExtraction(documentId, {
      strategy: result.strategy,
      ocrUsed: result.ocrUsed,
      extraction: extractionWithBoxes,
      warnings: result.warnings,
    });

    await updateDocument(documentId, {
      status: "needs_review",
      currentStep: "review_ready",
    });
  } catch (error) {
    await updateDocument(documentId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
```

---

## 27. Fastify Upload Route

```ts
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const app = Fastify({ logger: true });

await app.register(multipart);

const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
];

app.post("/documents", async (request, reply) => {
  const file = await request.file();

  if (!file) {
    return reply.code(400).send({ error: "No file uploaded" });
  }

  if (!SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    return reply.code(400).send({
      error: "Unsupported file type",
      supportedTypes: SUPPORTED_MIME_TYPES,
    });
  }

  const documentId = crypto.randomUUID();

  const documentDir = path.join(process.cwd(), "uploads", documentId);
  await fs.mkdir(documentDir, { recursive: true });

  const originalPath = path.join(documentDir, file.filename);

  await pipeline(file.file, createWriteStream(originalPath));

  await createDocumentRecord({
    id: documentId,
    originalFileName: file.filename,
    mimeType: file.mimetype,
    originalPath,
    status: "uploaded",
  });

  processDocument(documentId, originalPath, file.mimetype).catch((error) => {
    request.log.error(error);
  });

  return reply.code(202).send({
    documentId,
    status: "processing",
  });
});
```

---

## 28. Validation Rules

### Store In

Allowed values:

```ts
const ALLOWED_STORE_IN = ["Correspondence", "Investigations"] as const;
```

### Categories

```ts
const ALLOWED_CATEGORIES = [
  "Admissions summary",
  "Advance care planning",
  "Allied health letter",
  "Certificate",
  "Clinical notes",
  "Clinical photograph",
  "Consent form",
  "DAS21",
  "Discharge summary",
  "ECG",
  "Email",
  "Form",
  "Immunisation",
  "Indigenous PIP",
  "Letter",
  "Medical imaging report",
  "MyHealth registration",
  "New PT registration form",
  "Pathology results",
  "Patient consent",
  "Record request",
  "Referral letter",
  "Workcover",
  "Workcover consent",
] as const;
```

### Store In mapping

```ts
function inferStoreIn(category: string): "Correspondence" | "Investigations" {
  const investigationCategories = [
    "Medical imaging report",
    "Pathology results",
    "ECG",
  ];

  return investigationCategories.includes(category)
    ? "Investigations"
    : "Correspondence";
}
```

---

## 29. Review Warnings

```ts
function getReviewWarnings(extraction: any) {
  const warnings: string[] = [];

  if (!extraction.patientName?.value) {
    warnings.push("Patient name was not confidently extracted.");
  }

  if (!extraction.dateOfReport?.value) {
    warnings.push("Date of report is missing.");
  }

  if (!ALLOWED_STORE_IN.includes(extraction.storeIn?.value)) {
    warnings.push("Store In must be Correspondence or Investigations.");
  }

  if (!ALLOWED_CATEGORIES.includes(extraction.category?.value)) {
    warnings.push("Category is invalid or missing.");
  }

  if ((extraction.userDoctor?.confidence ?? 0) < 0.75) {
    warnings.push("Assigned GP doctor should be manually verified.");
  }

  return warnings;
}
```

---

## 30. Suggested Data Models

### Document

```ts
type DocumentRecord = {
  id: string;
  originalFileName: string;
  mimeType: string;
  originalPath: string;
  status:
    | "uploaded"
    | "processing"
    | "ocr_completed"
    | "needs_review"
    | "approved"
    | "failed";
  currentStep?:
    | "inspection"
    | "pdf_text_extraction"
    | "pdf_conversion"
    | "ocr"
    | "ai_extraction"
    | "review_ready";
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

### Extracted field

```ts
type ExtractedField = {
  value: string | null;
  confidence: number;
  evidenceBlockIds: string[];
  boxes: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};
```

### Samantha extraction

```ts
type SamanthaExtraction = {
  patientName: ExtractedField;
  dateOfReport: ExtractedField;
  subject: ExtractedField;
  contactOfSource: ExtractedField;
  storeIn: ExtractedField;
  userDoctor: ExtractedField;
  category: ExtractedField;
};
```

### Audit log

```ts
type AuditLog = {
  id: string;
  documentId: string;
  action:
    | "uploaded"
    | "inspected"
    | "pdf_text_extracted"
    | "ocr_started"
    | "ocr_completed"
    | "ai_extracted"
    | "field_overridden"
    | "approved_for_import"
    | "failed";
  actor: "samantha" | "receptionist" | "system";
  details: Record<string, unknown>;
  createdAt: string;
};
```

---

## 31. Suggested Project Structure

```text
src/
  server.ts

  modules/
    documents/
      document.routes.ts
      document.service.ts
      document.types.ts

    inspection/
      inspect-document.ts
      assess-text-layer.ts
      choose-extraction-strategy.ts

    pdf/
      extract-pdf-text-blocks.ts
      pdf-to-images.ts

    ocr/
      tesseract.service.ts
      words-to-line-blocks.ts
      extract-ocr-text-blocks.ts

    ai/
      build-block-text.ts
      extract-fields-with-ai.ts
      prompts.ts

    review/
      attach-boxes-to-extraction.ts
      assess-extraction-quality.ts
      get-review-warnings.ts

    patients/
      patients.mock.ts
      patient-search.service.ts

    doctors/
      doctors.mock.ts
      doctor-search.service.ts

uploads/
tmp/
```

---

## 32. Frontend Requirements

The frontend should be able to:

1. Upload document.
2. Poll document status.
3. Display document page image.
4. Overlay boxes on top of the image.
5. Show extracted fields beside the document.
6. Let receptionist click a field and highlight its evidence box.
7. Let receptionist override each field.
8. Approve final payload.

### Box rendering concept

```tsx
function DocumentPage({
  imageUrl,
  boxes,
  naturalWidth,
  naturalHeight,
}: {
  imageUrl: string;
  boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  naturalWidth: number;
  naturalHeight: number;
}) {
  return (
    <div className="relative w-full">
      <img src={imageUrl} className="w-full" />

      {boxes.map((box, index) => (
        <div
          key={index}
          className="absolute border-2 border-yellow-400 bg-yellow-200/30"
          style={{
            left: `${(box.x / naturalWidth) * 100}%`,
            top: `${(box.y / naturalHeight) * 100}%`,
            width: `${(box.width / naturalWidth) * 100}%`,
            height: `${(box.height / naturalHeight) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
```

---

## 33. 48-Hour Build Order

### Phase 1: Endpoint skeleton

Build:

- `POST /documents`
- File upload
- File validation
- Save file
- Return `documentId`

### Phase 2: Document conversion

Build:

- PDF to PNG conversion
- Page image storage
- Page image metadata

### Phase 3: Tesseract OCR

Build:

- Run OCR on uploaded image/PDF page
- Return raw text
- Return word-level boxes
- Group words into line blocks

### Phase 4: Box rendering

Build:

- Return line blocks to frontend
- Render boxes over document image
- Validate coordinate alignment

### Phase 5: AI extraction

Build:

- Convert line blocks to block-labelled text
- Prompt AI to extract 7 fields
- Return field values + evidence block IDs

### Phase 6: Field boxes

Build:

- Map evidence block IDs to boxes
- Return final extraction payload
- Highlight field evidence on click

### Phase 7: Selective OCR

Build:

- PDF text layer inspection
- Text quality scoring
- Strategy decision
- OCR fallback only when required

### Phase 8: Review and approve

Build:

- Receptionist override endpoint
- Approve endpoint
- Mock PMS import payload
- Audit log

---

## 34. MVP Scope

### Must-have

- Upload document
- Selective OCR decision
- Tesseract OCR fallback
- Text blocks with bounding boxes
- AI extraction of 7 fields
- Evidence block mapping
- Receptionist review
- Manual override
- Approval payload

### Should-have

- Confidence scores
- Review warnings
- Patient/doctor dropdown mock search
- Audit trail
- Processing status polling

### Nice-to-have

- Multi-page document support
- Duplicate detection
- Urgent finding warning
- Document category routing explanation
- Batch inbox processing

---

## 35. Demo Script

Use 2 documents:

1. Digital PDF with embedded text.
2. Scanned/image-only document.

### Demo 1: Digital PDF

Show that Samantha:

- Detects embedded text layer.
- Skips OCR.
- Extracts fields.
- Highlights text boxes.
- Sends document to receptionist review.

### Demo 2: Scanned PDF/Image

Show that Samantha:

- Detects no usable text layer.
- Runs Tesseract OCR.
- Extracts text and boxes.
- Extracts the 7 fields.
- Allows receptionist override.
- Approves final import payload.

---

## 36. Demo Positioning

Use this explanation:

> Samantha uses selective OCR. She first checks whether the document already contains a usable text layer with coordinates. If it does, she avoids OCR entirely and extracts fields directly. If the document is scanned, image-only, or the text layer is incomplete, Samantha falls back to Tesseract OCR to recover text and bounding boxes. The AI extraction layer then uses evidence block IDs so every extracted field can be verified visually before import.

---

## 37. Key Technical Principle

Normalize every extraction source into this:

```ts
TextBlock[]
```

Then the rest of the system does not care whether the text came from:

```text
- PDF embedded text layer
- Tesseract OCR
- Future document AI provider
```

This keeps the endpoint flexible and easy to extend.

---

## 38. Final Recommended Endpoint Flow

```text
POST /documents
    ↓
Save original file
    ↓
Inspect document
    ↓
If PDF text layer is good:
    Extract PDF text blocks
    Skip OCR
Else:
    Convert to image
    Run Tesseract OCR
    Extract OCR text blocks
    ↓
Build block-labelled text
    ↓
AI extracts 7 fields + evidenceBlockIds
    ↓
Attach boxes using evidenceBlockIds
    ↓
Validate extraction
    ↓
Return needs_review status
```

---

## 39. What Success Looks Like

A successful MVP response should make the review UI possible:

```json
{
  "documentId": "doc_123",
  "status": "needs_review",
  "processing": {
    "strategy": "ocr_fallback",
    "ocrUsed": true
  },
  "file": {
    "pageImages": [
      {
        "page": 1,
        "url": "/documents/doc_123/pages/1.png",
        "width": 2480,
        "height": 3508
      }
    ]
  },
  "extraction": {
    "patientName": {
      "value": "Jane Smith",
      "confidence": 0.96,
      "evidenceBlockIds": ["p1_line_2"],
      "boxes": [
        {
          "page": 1,
          "x": 120,
          "y": 260,
          "width": 340,
          "height": 42
        }
      ]
    }
  }
}
```

This allows the frontend to say:

> Samantha found “Jane Smith” here.

And that is the core value of the MVP.
