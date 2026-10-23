import { z } from "zod";
import { ExperimentPolicySchema } from "../../domain/experiment/index";

export const ApiTestRequestSchema = z.strictObject({
  mode: z.enum(["mock", "live"]), scenario: z.enum(["narration", "report_stream", "follow_up"]),
  fixtureId: z.string().min(1).max(64), featureId: z.enum(["core-base", "F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10", "F11"]),
  personaId: z.string().min(1).max(64), acknowledgedCost: z.boolean(), requestId: z.uuid(),
});
export const ApiTestLimitsSchema = z.strictObject({ calls: z.number().int().min(1).max(100), tokens: z.number().int().min(1).max(2_000_000),
  outputTokens: z.number().int().min(1).max(16384), concurrent: z.number().int().min(1).max(32) });
export type ApiTestLimits = z.infer<typeof ApiTestLimitsSchema>;
export function apiTestLimits(env: Record<string, string | undefined>): ApiTestLimits {
  const integer = (key: string, fallback: number) => env[key] === undefined ? fallback : /^\d+$/.test(env[key]!) ? Number(env[key]) : NaN;
  return ApiTestLimitsSchema.parse({ calls: integer("LIVE_API_TEST_MAX_REQUESTS_PER_DAY", 15), tokens: integer("LIVE_API_TEST_MAX_TOKENS_PER_DAY", 30000),
    outputTokens: integer("LIVE_API_TEST_MAX_OUTPUT_TOKENS", 1200), concurrent: integer("LIVE_API_TEST_MAX_CONCURRENT", 1) });
}
export function apiTestPolicy(limits: ApiTestLimits, now: number) {
  const budget = { calls: limits.calls, tokens: limits.tokens, microUsd: 1_000_000 };
  return ExperimentPolicySchema.parse({ enabled: true, expiresAt: now + 60_000, allowedPrincipalIds: ["local-developer"],
    maxConcurrent: limits.concurrent, maxRequestBytes: 131072, maxOutputTokens: limits.outputTokens,
    rates: { inputMicroUsdPerMillionTokens: 1, outputMicroUsdPerMillionTokens: 1 }, daily: budget, perPrincipalDaily: budget, perSession: budget });
}
const Quota = z.strictObject({ calls: z.number().int().nonnegative(), tokens: z.number().int().nonnegative() });
const Choice = z.strictObject({ id: z.string().min(1).max(64), label: z.string().min(1).max(100) });
export const ApiTestConfigSchema = z.strictObject({ defaultMode: z.literal("mock"), modelId: z.literal("gpt-4o-mini"), keyStatus: z.enum(["ready", "missing"]),
  liveAvailable: z.literal(false), liveStatus: z.literal("LIVE_BLOCKED"), liveReason: z.string().min(1).max(64), csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
  limits: ApiTestLimitsSchema, used: Quota, remaining: Quota, fixtures: z.array(Choice).max(10), personas: z.array(Choice).max(10) });
export type ApiTestConfig = z.infer<typeof ApiTestConfigSchema>;
export const ApiTestRunSchema = z.strictObject({ testRunId: z.uuid(), mode: z.literal("mock"), scenario: z.literal("narration"), featureId: z.literal("core-base"),
  modelId: z.literal("gpt-4o-mini"), personaId: z.string().min(1).max(64), status: z.enum(["running", "passed", "failed", "interrupted"]),
  personaVersion: z.string().min(1).max(32), promptVersion: z.string().min(1).max(32), commonPromptVersion: z.string().min(1).max(32), schemaVersion: z.literal("1.0.0"),
  startedAt: z.iso.datetime(), finishedAt: z.iso.datetime().optional(), durationMs: z.number().nonnegative().optional(),
  inputTokens: z.null(), outputTokens: z.null(), evidence: z.enum(["MOCK_PASS", "MOCK_FAILED"]).optional(), errorCode: z.string().regex(/^[A-Z_]+$/).optional(),
  // The shared R01 service validates its full draft. This view adds transport bounds
  // without importing the server's prompt composer into the client bundle.
  result: z.object({ sections: z.array(z.object({ paragraphs: z.array(z.string().max(3000)).max(4) }).passthrough()).max(8),
    styleEvaluation: z.object({ passed: z.boolean() }).passthrough(), meta: z.object({ providerKind: z.literal("mock"), modelId: z.literal("gpt-4o-mini") }).passthrough() }).passthrough().optional(),
});
export type ApiTestRun = z.infer<typeof ApiTestRunSchema>;
