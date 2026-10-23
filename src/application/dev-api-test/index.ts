import { z } from "zod";
import { ExperimentPolicySchema } from "../../domain/experiment/index";
import { OpenAiModelIdSchema } from "../../domain/narration/model";

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
export const ApiTestConfigSchema = z.strictObject({ defaultMode: z.literal("mock"), modelId: OpenAiModelIdSchema, keyStatus: z.enum(["ready", "missing"]),
  liveAvailable: z.boolean(), liveStatus: z.enum(["LIVE_BLOCKED", "LIVE_NOT_RUN"]), liveReason: z.string().min(1).max(64), csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
  liveUsed: Quota.optional(), liveRemaining: Quota.optional(),
  limits: ApiTestLimitsSchema, used: Quota, remaining: Quota, fixtures: z.array(Choice).max(10), personas: z.array(Choice).max(50) });
export type ApiTestConfig = z.infer<typeof ApiTestConfigSchema>;
export const ApiTestRunSchema = z.strictObject({ testRunId: z.uuid(), mode: z.enum(["mock", "live"]), scenario: z.literal("narration"), featureId: z.literal("core-base"),
  modelId: OpenAiModelIdSchema, personaId: z.string().min(1).max(64), status: z.enum(["blocked", "running", "passed", "failed", "interrupted"]),
  personaVersion: z.string().min(1).max(32), promptVersion: z.string().min(1).max(32), commonPromptVersion: z.string().min(1).max(32), schemaVersion: z.literal("1.0.0"),
  startedAt: z.iso.datetime(), finishedAt: z.iso.datetime().optional(), durationMs: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  providerStatus: z.enum(["completed", "failed", "incomplete", "cancelled", "queued", "in_progress"]).optional(),
  verdict: z.strictObject({ evidenceIdsValid: z.boolean(), styleHeuristicPassed: z.boolean() }).optional(),
  expectedRegister: z.enum(["haeyo", "hapsyo", "banmal"]).optional(),
  styleIssues: z.array(z.strictObject({ code: z.enum(["STOCK_PHRASE", "DUPLICATE_PARAGRAPH", "CERTAINTY", "EMOJI", "REGISTER", "CATCHPHRASE_LIMIT", "PARAGRAPH_COUNT", "SENTENCE_COUNT", "INTERNAL_ID"]), sectionId: z.string().min(1).max(64) })).max(100).optional(),
  evidence: z.enum(["MOCK_PASS", "MOCK_FAILED", "LIVE_BLOCKED", "LIVE_PASS", "LIVE_FAILED"]).optional(), errorCode: z.string().regex(/^[A-Z_]+$/).optional(),
  // The shared R01 service validates its full draft. This view adds transport bounds
  // without importing the server's prompt composer into the client bundle.
  result: z.object({ sections: z.array(z.object({ paragraphs: z.array(z.string().max(3000)).max(4) }).passthrough()).max(8),
    styleEvaluation: z.object({ passed: z.boolean() }).passthrough(), meta: z.object({ providerKind: z.enum(["mock", "openai"]), modelId: OpenAiModelIdSchema }).passthrough() }).passthrough().optional(),
});
export type ApiTestRun = z.infer<typeof ApiTestRunSchema>;

export function apiTestRunHeading(run: ApiTestRun): string {
  return run.mode === "live" && run.providerStatus === "completed" && run.result && run.verdict?.styleHeuristicPassed === false
    ? "API 호출 완료 · 문체 검사 미통과" : run.evidence ?? run.status;
}
export function apiTestStyleIssueMessage(code: NonNullable<ApiTestRun["styleIssues"]>[number]["code"], register?: ApiTestRun["expectedRegister"]): string {
  const registerName = register === "haeyo" ? "해요체(문단 끝: 요)" : register === "hapsyo" ? "합쇼체(문단 끝: 니다)" : register === "banmal" ? "반말" : "선택한 문체";
  const messages = { STOCK_PHRASE: "상투어 또는 금지 표현이 포함되어 있습니다.", DUPLICATE_PARAGRAPH: "동일한 문단이 반복됩니다.",
    CERTAINTY: "확정·보장 표현이 포함되어 있습니다.", EMOJI: "허용되지 않은 이모지가 있습니다.", REGISTER: `${registerName} 종결 규칙과 맞지 않습니다.`,
    CATCHPHRASE_LIMIT: "유행어 사용 횟수를 초과했습니다.", PARAGRAPH_COUNT: "섹션의 문단 수가 설정 범위를 벗어났습니다.",
    SENTENCE_COUNT: "문단의 문장 수가 설정 범위를 벗어났습니다.", INTERNAL_ID: "내부 식별자나 정책 용어가 노출되었습니다." };
  return messages[code];
}
