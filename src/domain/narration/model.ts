import { z } from "zod";

/** Pure model contract. Runtime environment is resolved only at server entry points. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const OpenAiModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
  .refine((value) => !value.startsWith("sk-"));
export function matchesOpenAiModel(requested: string, reported: string): boolean {
  if (
    !OpenAiModelIdSchema.safeParse(requested).success ||
    !OpenAiModelIdSchema.safeParse(reported).success
  )
    return false;
  if (requested === reported) return true;
  if (/\d{4}-\d{2}-\d{2}$/.test(requested)) return false;
  return (
    reported.startsWith(requested + "-") &&
    /^\d{4}-\d{2}-\d{2}$/.test(reported.slice(requested.length + 1))
  );
}
