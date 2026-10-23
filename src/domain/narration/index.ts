import { defineCodedError } from "@/domain/utilities";
import { z } from "zod";
import type { PersonaProfile } from "@/domain/persona";
import type { NarrationPlan } from "@/domain/narration/plan";

export const MAX_NARRATION_BYTES = 128 * 1024;

const messages = {
  INPUT_REJECTED: "Narration input was rejected.",
  OUTPUT_REJECTED: "Narration output was rejected.",
  REFUSED: "Narration provider refused.",
  INCOMPLETE: "Narration provider output was incomplete.",
  PROVIDER_FAILED: "Narration provider failed.",
  CANCELLED: "Narration was cancelled.",
  LIVE_DISABLED: "Live narration is disabled.",
  RATE_LIMITED: "Narration provider rate limited.",
  TIMEOUT: "Narration provider timed out.",
  MODEL_MISMATCH: "Narration model was rejected.",
  USAGE_MISSING: "Narration usage is missing.",
} as const;
export class NarrationError extends defineCodedError("NarrationError", messages) {}

/**
 * Supplier-neutral prompt. Only infrastructure selects the HTTP representation.
 * `plan` and `persona` are the structured inputs the prose was rendered from; mocks read them
 * instead of re-parsing prompt text, and the live adapter never sends them as separate fields.
 */
export interface NarrationRequest {
  readonly modelId: string;
  readonly instructions: string;
  readonly messages: readonly { readonly role: "developer" | "user"; readonly content: string }[];
  readonly output: { readonly name: string; readonly jsonSchema: z.core.JSONSchema.JSONSchema };
  readonly maxOutputTokens?: number;
  readonly plan: NarrationPlan;
  readonly persona: PersonaProfile;
}
export interface NarrationProvider {
  readonly kind: "mock" | "openai";
  generate(
    request: NarrationRequest,
    options?: { readonly signal?: AbortSignal },
  ): Promise<unknown>;
}
export const NarrationProviderResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("completed"),
    outputText: z.string().min(1).max(MAX_NARRATION_BYTES),
  }),
  z.strictObject({ status: z.literal("refused") }),
  z.strictObject({ status: z.literal("incomplete") }),
  z.strictObject({ status: z.literal("failed") }),
]);
