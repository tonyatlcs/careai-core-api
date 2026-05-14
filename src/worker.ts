import "reflect-metadata";
import "dotenv/config";
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

import { AppDataSource, initDatabase } from "@/db/data-source";
import { createSqsClient } from "@/services/sqs";
import type { DocumentJobMessage } from "@/worker/document-job-message";
import { parseDocumentJobMessage } from "@/worker/document-job-message";
import { terminateTesseractWorker } from "@/worker/extract-text";
import { PermanentProcessingError } from "@/worker/errors";
import {
  markDocumentFailed,
  processDocumentJob,
} from "@/worker/process-document-job";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is required for the document processing worker " +
      "(Claude extraction). Add it to careai-core-api/.env — see .env.example.",
  );
  process.exit(1);
}

const queueUrl = process.env.DOCUMENT_PROCESSING_QUEUE_URL;
if (!queueUrl) {
  console.error("DOCUMENT_PROCESSING_QUEUE_URL is required.");
  process.exit(1);
}

await initDatabase();

const sqs = createSqsClient();

let shuttingDown = false;

const shutdown = async (signal: string) => {
  console.info({ signal }, "worker shutting down");
  shuttingDown = true;
  try {
    await terminateTesseractWorker();
  } catch (error) {
    console.error(error);
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.info("document processing worker started");

while (!shuttingDown) {
  const response = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 900,
    }),
  );

  const messages = response.Messages ?? [];
  if (messages.length === 0) {
    continue;
  }

  for (const message of messages) {
    if (!message.ReceiptHandle) {
      continue;
    }

    let job: DocumentJobMessage | undefined;
    try {
      job = parseDocumentJobMessage(message.Body ?? "");
    } catch (error) {
      console.warn({ error }, "dropping malformed SQS message");
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
      continue;
    }

    try {
      await processDocumentJob(job);
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
    } catch (error) {
      if (error instanceof PermanentProcessingError) {
        await markDocumentFailed(job.documentId, error.message);
        console.warn(
          { documentId: job.documentId, message: error.message },
          "permanent document processing failure",
        );
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      } else {
        console.error(
          { documentId: job.documentId, error },
          "transient document processing failure; message will retry",
        );
      }
    }
  }
}
