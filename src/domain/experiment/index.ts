import { defineCodedError } from "@/domain/utilities";
import { z } from "zod";
import type { NarrationRequest } from "@/domain/narration";

const Identity = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const ExperimentAccessSchema = z
  .strictObject({ principalId: Identity, sessionId: Identity })
  .readonly();
export type ExperimentAccess = z.infer<typeof ExperimentAccessSchema>;
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
    maxConcurrent: z.number().int().min(1).max(32),
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
/** Conservative Live reservation estimate; never used to admit Mock calls. Not actual usage. */
export function estimateNarrationTokens(
  request: NarrationRequest,
  policy: { maxRequestBytes: number; maxOutputTokens: number },
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ...request, maxOutputTokens: policy.maxOutputTokens }),
  ).byteLength;
  if (bytes > policy.maxRequestBytes) throw new ExperimentError("REQUEST_TOO_LARGE");
  const inputTokens = bytes + 256; // Explicit request-envelope allowance for Live admission.
  const outputTokens = policy.maxOutputTokens;

  return { inputTokens, outputTokens, tokens: inputTokens + outputTokens };
}
/** Active Mock calls only: no usage accounting, token estimate or financial reservation. */
export interface ExperimentConcurrencyGate {
  acquire(principalId: string, maxConcurrent: number): { release(): void };
}
