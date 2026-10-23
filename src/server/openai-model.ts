import { DEFAULT_NARRATION_MODEL, ModelIdSchema } from "@/domain/narration/model";

/** Never use a request body or a NEXT_PUBLIC variable to choose the provider model. */
export function readOpenAiModel(env: Readonly<Record<string, string | undefined>>): string {
  return ModelIdSchema.parse(env.OPENAI_MODEL?.trim() || DEFAULT_NARRATION_MODEL);
}
