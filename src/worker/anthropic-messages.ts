import Anthropic from "@anthropic-ai/sdk";

import { DEFAULT_ANTHROPIC_MODEL } from "@/worker/default-anthropic-model";
import { PermanentProcessingError } from "@/worker/errors";

export function isAnthropicModelNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404 &&
    "type" in error &&
    (error as { type: unknown }).type === "not_found_error"
  );
}

export async function createAnthropicMessage(
  client: Anthropic,
  model: string,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">,
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create({
      model,
      ...params,
    });
  } catch (error) {
    if (isAnthropicModelNotFound(error)) {
      throw new PermanentProcessingError(
        `Anthropic model "${model}" was not found. Update ANTHROPIC_MODEL or unset it to use ${DEFAULT_ANTHROPIC_MODEL}.`,
      );
    }
    throw error;
  }
}
