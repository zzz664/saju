import { escapeJsonForPrompt } from "@/domain/utilities";
import { defineCodedError } from "@/domain/utilities";
import { z } from "zod";
import { buildManualPromptData, type ManualPromptData } from "@/domain/core-export";
import { NARRATION_INSTRUCTIONS, NARRATION_PROMPT_VERSION } from "@/domain/narration/prompt";
import { DEFAULT_NARRATION_MODEL, ModelIdSchema } from "@/domain/narration/model";

export const MAX_NARRATION_BYTES = 128 * 1024;
export const NarrationDraftSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    sections: z
      .array(
        z
          .strictObject({
            findingId: z.string().min(1).max(200),
            paragraph: z.string().trim().min(1).max(1500),
          })
          .readonly(),
      )
      .max(20)
      .readonly(),
  })
  .readonly();
export type NarrationDraft = z.infer<typeof NarrationDraftSchema>;
/** Structural schema only. Source ID binding and prose review are separate checks. */
export function narrationJsonSchema() {
  return z.toJSONSchema(NarrationDraftSchema, { target: "draft-2020-12" });
}

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
export function createNarrationRequest(core: unknown, model = DEFAULT_NARRATION_MODEL) {
  const modelId = ModelIdSchema.parse(model);
  let data: ManualPromptData;
  try {
    data = buildManualPromptData(core);
  } catch {
    throw new NarrationError("INPUT_REJECTED");
  }
  const content = escapeJsonForPrompt(data);
  return Object.freeze({
    modelId,
    data,
    instructions: NARRATION_INSTRUCTIONS,
    messages: Object.freeze([Object.freeze({ role: "user" as const, content })]),
    output: { name: "developer_narration", jsonSchema: narrationJsonSchema() },
  });
}
/** Supplier-neutral prompt. Only infrastructure selects the HTTP representation. */
export interface NarrationRequest {
  readonly modelId: string;
  readonly instructions: string;
  readonly messages: readonly { readonly role: "developer" | "user"; readonly content: string }[];
  readonly output: { readonly name: string; readonly jsonSchema: z.core.JSONSchema.JSONSchema };
  readonly maxOutputTokens?: number;
  readonly data: ManualPromptData;
  readonly style?: {
    readonly persona: import("../persona/index").PersonaProfile;
    readonly spec: import("../persona/index").FeatureNarrationSpec;
  };
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

export function validateNarrationOutput(
  outputText: string,
  data: ManualPromptData,
): NarrationDraft {
  if (new TextEncoder().encode(outputText).byteLength > MAX_NARRATION_BYTES)
    throw new NarrationError("OUTPUT_REJECTED");
  let raw: unknown;
  try {
    raw = JSON.parse(outputText);
  } catch {
    throw new NarrationError("OUTPUT_REJECTED");
  }
  const parsed = NarrationDraftSchema.safeParse(raw);
  if (!parsed.success) throw new NarrationError("OUTPUT_REJECTED");
  const byId = new Map(parsed.data.sections.map((section) => [section.findingId, section]));
  if (
    byId.size !== parsed.data.sections.length ||
    byId.size !== data.verifiedFindings.length ||
    data.verifiedFindings.some((finding) => !byId.has(finding.findingId))
  )
    throw new NarrationError("OUTPUT_REJECTED");
  return NarrationDraftSchema.parse({
    ...parsed.data,
    sections: data.verifiedFindings.map((finding) => byId.get(finding.findingId)),
  });
}
export const NARRATION_META = Object.freeze({
  promptVersion: NARRATION_PROMPT_VERSION,
  schemaVersion: "1.0.0",
} as const);
