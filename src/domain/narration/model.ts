import { z } from "zod";

/** Pure model contract. Runtime environment is resolved only at server entry points. */
export const DEFAULT_NARRATION_MODEL = "gpt-4o-mini";
export const ModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
  .refine((value) => !value.startsWith("sk-"));
