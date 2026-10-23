import { defineCodedError } from "@/domain/utilities";
import { z } from "zod";
import type { NarrationRequest } from "@/domain/narration";

const Amount = z.number().int().min(0).max(1_000_000_000_000);
const Identity = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const ExperimentAccessSchema = z
  .strictObject({ principalId: Identity, sessionId: Identity })
  .readonly();
export type ExperimentAccess = z.infer<typeof ExperimentAccessSchema>;
export const ExperimentBudgetSchema = z
  .strictObject({ calls: Amount, tokens: Amount, microUsd: Amount })
  .readonly();
export type ExperimentBudget = z.infer<typeof ExperimentBudgetSchema>;
export const ExperimentPolicySchema = z
  .strictObject({
    enabled: z.boolean(),
    expiresAt: z.number().int().min(1).max(8640000000000000),
    allowedPrincipalIds: z
      .array(Identity)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length)
      .readonly(),
    maxRequestBytes: z.number().int().min(1).max(1048576),
    maxOutputTokens: z.number().int().min(1).max(16384),
    maxConcurrent: z.number().int().min(1).max(32),
    rates: z
      .strictObject({
        inputMicroUsdPerMillionTokens: Amount.min(1),
        outputMicroUsdPerMillionTokens: Amount.min(1),
      })
      .readonly(),
    daily: ExperimentBudgetSchema,
    perPrincipalDaily: ExperimentBudgetSchema,
    perSession: ExperimentBudgetSchema,
  })
  .readonly();
export type ExperimentPolicy = z.infer<typeof ExperimentPolicySchema>;
const messages = {
  POLICY_REJECTED: "Experiment policy was rejected.",
  ACCESS_DENIED: "Experiment access was denied.",
  REQUEST_TOO_LARGE: "Experiment request exceeds its limit.",
  BUDGET_EXCEEDED: "Experiment budget was exceeded.",
  CONCURRENCY_LIMIT: "Experiment concurrency limit was reached.",
  CLOCK_INVALID: "Experiment clock was rejected.",
  STORE_UNAVAILABLE: "Experiment budget store is unavailable.",
} as const;
export class ExperimentError extends defineCodedError("ExperimentError", messages) {}
export function experimentDay(now: number): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000)
    throw new ExperimentError("CLOCK_INVALID");
  return new Date(now).toISOString().split("T")[0];
}
/** Mock admission estimate, not tokenizer usage or a billing measurement. */
export function quoteExperimentRequest(
  request: NarrationRequest,
  policy: ExperimentPolicy,
): ExperimentBudget {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ...request, max_output_tokens: policy.maxOutputTokens }),
  ).byteLength;
  if (bytes > policy.maxRequestBytes) throw new ExperimentError("REQUEST_TOO_LARGE");
  const inputTokens = bytes + 256; // Explicit request-envelope allowance, versioned below.
  const outputTokens = policy.maxOutputTokens;
  const million = BigInt(1000000);
  const ceil = (tokens: number, rate: number) =>
    (BigInt(tokens) * BigInt(rate) + million - BigInt(1)) / million;
  const cost =
    ceil(inputTokens, policy.rates.inputMicroUsdPerMillionTokens) +
    ceil(outputTokens, policy.rates.outputMicroUsdPerMillionTokens);
  const parsed = ExperimentBudgetSchema.safeParse({
    calls: 1,
    tokens: inputTokens + outputTokens,
    microUsd: Number(cost),
  });
  if (!parsed.success) throw new ExperimentError("REQUEST_TOO_LARGE");
  return parsed.data;
}
export const EXPERIMENT_RESERVATION_POLICY = "utf8-envelope-plus-output-v1";
export interface ExperimentBudgetStore {
  /** Atomic all-or-nothing admission; release frees concurrency, never spent allocation. */
  reserve(input: {
    readonly now: number;
    readonly access: ExperimentAccess;
    readonly allocation: ExperimentBudget;
    readonly policy: ExperimentPolicy;
  }): { release(): void };
}
