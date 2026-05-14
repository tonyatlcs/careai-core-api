import { S3Client } from "@aws-sdk/client-s3";

/**
 * Builds an S3 client for AWS or LocalStack.
 * - Production: omit `AWS_ENDPOINT_URL`; credentials come from the default chain (env, profile, IAM role, etc.).
 * - LocalStack: set `AWS_ENDPOINT_URL=http://localhost:4566`. Dummy credentials default to `test`/`test` when unset (LocalStack accepts any value).
 */
export const createS3Client = (): S3Client => {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const endpoint = process.env.AWS_ENDPOINT_URL;

  return new S3Client({
    region,
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
          },
        }
      : {}),
  });
};
