# Add Persisted Processing Progress For Tesseract

## Status (this repo)

Implemented in `careai-core-api`. Use **pnpm** for installs and scripts (`package.json` sets `packageManager` for Corepack).

## Summary

Replace the current synthetic list progress (`processing = 50`) with real persisted progress on the `documents` row. The worker updates a numeric progress percentage during each major processing step, including Tesseract OCR progress where available, and `GET /documents` returns that stored value.

## pnpm setup

From the `careai-core-api` directory:

```sh
pnpm install
```

Apply DB migrations (required once for `processing_progress`):

```sh
pnpm migration:up
```

## Key Changes

- Add a `processing_progress` integer column to `documents`, defaulting to `0`.
  - Clamp values to `0..100`.
  - Set to `0` when queued/pending.
  - Set to `100` only after extraction is saved and status becomes `completed`.
  - Leave failed documents at their last progress value for debugging.
- Update the `Documents` entity with `processingProgress: number`.
- Update `documentEntityToListResponse` to use stored progress for `processing` / `failed` instead of synthetic `50` / `0`.
- Update process enqueue behavior:
  - when `POST /documents/process` accepts a document, set `status = processing`, `processingError = null`, and `processingProgress = 5`.
- Local development: `pnpm run dev:all` starts API + worker via `scripts/dev-all.mjs` (no extra npm dependencies).
  - Keep the worker as a separate runtime process in production.
  - Do not make the API process silently consume SQS jobs in production.

## Worker Progress Policy

- In `processDocumentJob`, update progress at stable milestones:
  - `10`: S3 file fetched
  - `20`: text extraction started (via `onProgress(0)` → mapped to document %)
  - `60`: text extraction completed (via `onProgress(1)` → mapped to document %)
  - `80`: Claude extraction started
  - `95`: Claude extraction completed and DB save starting
  - `100`: document marked completed
- Log worker progress at the same stable milestones.
  - Include `documentId`, `status`, and `processingProgress` in each log entry (`logDocumentProgress`).
  - Throttle noisy OCR updates: DB + log only when integer % moves by ≥2 or ≥1s (forced writes at extraction edges and milestones).
- For Tesseract image OCR:
  - Worker `createWorker` logger forwards `recognizing text` progress into `ocrImageBuffer` (serialized through a progress chain).
  - Mapped to document range `20..60` via `documentProgress = 20 + Math.round(extractionProgress * 40)`.
- For scanned PDF OCR:
  - Progress split across up to 15 OCR pages; each page gets an equal slice of extraction `0..1`, combined with per-page Tesseract progress.
  - Same throttle rules as above apply at the job reporter.

## Implementation Shape (as built)

- `extractTextFromDocument(document, fileBuffer, options?)` with  
  `onProgress?: (progress: number) => Promise<void>` — local progress for text extraction only (`0..1`).
- `processDocumentJob` maps extraction progress:  
  `documentProgress = 20 + Math.round(extractionProgress * 40)`.
- Helpers in `src/worker/document-progress.ts`:
  - `setDocumentProgress(documentId, progress)`
  - `clampProgress(progress)`
  - `logDocumentProgress(documentId, status, processingProgress, message)`
  - `createThrottledProgressUpdater(documentId, getStatus)` — returns an async reporter with optional `{ force: true }` and `.dispose()` to clear pending timers.
- Native PDF text and DOCX: `onProgress(0)` then `onProgress(1)` only (no fine-grained OCR).
- Scripts:
  - `pnpm run dev` / `pnpm run dev:worker` — unchanged.
  - `pnpm run dev:all` — API + worker for local document processing.
  - `pnpm run start:all` — optional: runs `pnpm start` and `pnpm run start:worker` together after `pnpm run build` (see `scripts/start-all.mjs`). Production should still prefer separate supervised processes.

## Test Plan

- Run `pnpm run typecheck` and `pnpm run build`.
- Manual verification:
  - run `pnpm run dev:all` and confirm both the API and worker start.
  - enqueue a document and confirm the worker logs milestone progress with the document ID.
  - enqueue an image document and confirm `GET /documents` progress moves from `5` toward `100`.
  - enqueue a scanned PDF and confirm progress advances across pages rather than staying flat at mid-range.
  - enqueue a PDF with embedded text and confirm it skips slow OCR and jumps through extraction quickly.
  - force a failure and confirm status becomes `failed` while progress remains at the last known value.
- Confirm list response still matches `ListDocumentsResponseSchema`.

## Assumptions

- Progress will be consumed by polling `GET /documents`.
- Worker logs are for local/debug visibility only; persisted database progress remains the source of truth for the API/UI.
- Percent-only progress is enough for now; no stage or per-page detail will be exposed.
- Persisted DB progress is preferred over in-memory worker progress so progress survives API restarts and can be read by any API instance.
- Local development should auto-start the worker through `pnpm run dev:all`; production should continue to run API and worker as separately managed processes.
