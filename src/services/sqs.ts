import { SQSClient } from "@aws-sdk/client-sqs";

/**
 * SQS client for AWS or LocalStack (same endpoint/credential pattern as S3).
 */
export const createSqsClient = (): SQSClient => {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const endpoint = process.env.AWS_ENDPOINT_URL;

  return new SQSClient({
    region,
    ...(endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
          },
        }
      : {}),
  });
};
