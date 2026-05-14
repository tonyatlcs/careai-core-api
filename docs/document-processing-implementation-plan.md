# Async OCR + Claude Document Processing Plan

## Summary

Build an asynchronous document-processing workflow where `POST /documents/process` accepts one or more existing document IDs, publishes processing jobs directly to SQS, and returns `202 Accepted`. A worker in `careai-core-api` polls SQS, fetches uploaded files from S3, extracts text with PDF/DOCX text-first logic plus Tesseract OCR fallback, asks Claude to normalize the result into `ProcessDocumentsResultItemSchema`, validates it, persists it, and updates document status.

Queue infrastructure will live in `careai-infra`; application API and worker code will live in `careai-core-api`.

## Key Changes

- Add LocalStack-compatible SQS infrastructure in `careai-infra/careai-infrastructure`:
  - SQS queue: `document-processing-queue`
  - SQS dead-letter queue: `document-processing-dlq`
  - redrive policy from the processing queue to the DLQ
  - Terraform outputs for queue URL/ARN and DLQ URL/ARN
- Add API env vars in `careai-core-api/.env.example`:
  - `DOCUMENT_PROCESSING_QUEUE_URL`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL=claude-sonnet-4-6` (optional; same default in code when unset)
  - optional `OCR_TEXT_AUDIT_LIMIT=12000`
- Add dependencies to `careai-core-api`:
  - `@aws-sdk/client-sqs`
  - `@anthropic-ai/sdk`
  - `mammoth` for DOCX text extraction
  - `pdf-parse` for embedded PDF text
  - `pdfjs-dist` and `@napi-rs/canvas` for rendering scanned PDF pages to images for OCR

## API And Data Model

- Replace the current process response shape with an async response schema:
  - request: array of document IDs, keeping the existing `ProcessDocumentsRequestSchema`
  - response: `{ status: "accepted", documents: [{ id, status }] }`
  - return `400` for empty arrays, duplicate IDs, or unknown IDs
  - return `202` after publishing one message per document
- Keep `ProcessDocumentsResultItemSchema` as the canonical extraction payload:
  - `name`
  - `reportDate`
  - `subject`
  - `contactSource`
  - `issueUser`
  - `category`
- Add a `document_extractions` table with:
  - `id`, `document_id` unique FK, the six schema fields, `audit_text` truncated to `OCR_TEXT_AUDIT_LIMIT`, `model`, `ocr_engine`, `raw_confidence`, `created_at`, `updated_at`
- Add a result endpoint:
  - `GET /documents/:id/extraction`
  - returns `404` if no completed extraction exists
  - returns the persisted `ProcessDocumentsResultItemSchema` fields plus document ID/status if needed by the UI
- Update list mapping so completed documents can expose persisted `category` and `patient`/subject-like display data from `document_extractions`.

## Processing Flow

- API controller:
  - load all requested `Documents`
  - reject IDs that do not exist
  - set matching documents to `pending` or leave as-is if already pending/processing
  - send one SQS message per document: `{ documentId, batchId, requestedAt }`
  - return `202` summary
- Worker:
  - add `dev:worker` and `start:worker` scripts in `careai-core-api`
  - poll `DOCUMENT_PROCESSING_QUEUE_URL`
  - for each SQS message, parse the message body, then process one document ID
  - set document status to `processing`
  - fetch S3 object using `Bucket=S3_BUCKET`, `Key=document.id`
  - extract text:
    - JPEG/PNG: OCR directly with `tesseract.js`
    - PDF: use embedded text first; if no useful text, render pages and OCR page images
    - DOCX: use `mammoth` for text; OCR embedded images only if needed in a later iteration
  - call Claude with tool-use / strict JSON schema matching `ProcessDocumentsResultItemSchema`
  - validate Claude output before persistence
  - upsert `document_extractions`
  - set document status to `completed`
  - on failure, set document status to `failed`, write `processingError`, and leave the message to retry until SQS redrives it to DLQ
- Claude prompt:
  - instruct the model to extract only the schema fields
  - force `category` to one of `DocumentCategorySchema`
  - require ISO-style `reportDate` where possible
  - if a field is uncertain, choose the best-supported value from the text rather than inventing unsupported facts

## Test Plan

- Add focused unit tests if a test runner is introduced; otherwise verify with `pnpm run typecheck` and `pnpm run build`.
- Manual LocalStack scenario:
  - apply Terraform to create S3, SQS, and DLQ
  - upload documents through existing `POST /document-batches`
  - call `POST /documents/process` with returned document IDs
  - run `dev:worker`
  - confirm rows move `pending -> processing -> completed`
  - confirm `document_extractions` has validated schema fields
  - confirm `GET /documents/:id/extraction` returns the stored result
- Failure scenarios:
  - missing `ANTHROPIC_API_KEY` fails fast with a clear worker error
  - missing S3 object marks the document failed
  - malformed Claude output triggers retry/repair once, then fails cleanly
  - unsupported MIME types remain rejected at upload time
  - duplicate process requests are idempotent through `document_extractions.document_id` uniqueness

## Assumptions

- `careai-infra` owns Terraform/LocalStack resources only; worker runtime code stays in `careai-core-api`.
- The first version stores truncated OCR/plain text for audit/debugging, not full raw document text.
- Claude API usage is acceptable for the medical document data after account/compliance setup is confirmed.
- Async processing is the source of truth; `POST /documents/process` does not block for OCR or model extraction.
