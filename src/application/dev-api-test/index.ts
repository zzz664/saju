import { z } from "zod";
import { ExperimentPolicySchema } from "@/domain/experiment";
import { ModelIdSchema } from "@/domain/narration/model";
import { NarrationRejectionCodeSchema, StyleIssueCodeSchema } from "@/domain/narration/codes";

export const ApiTestRequestSchema = z.strictObject({
  mode: z.enum(["mock", "live"]),
  scenario: z.enum(["narration", "report_stream", "follow_up"]),
  fixtureId: z.string().min(1).max(64),
  featureId: z.enum(["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10", "F11"]),
  personaId: z.string().min(1).max(64),
  acknowledgedCost: z.boolean(),
  requestId: z.uuid(),
});
export const ApiTestLimitsSchema = z.strictObject({
  calls: z.number().int().min(1).max(100),
  tokens: z.number().int().min(1).max(2_000_000),
  outputTokens: z.number().int().min(1).max(16384),
  concurrent: z.number().int().min(1).max(32),
});
export type ApiTestLimits = z.infer<typeof ApiTestLimitsSchema>;
export function apiTestLimits(env: Record<string, string | undefined>): ApiTestLimits {
  const integer = (key: string, fallback: number) =>
    env[key] === undefined ? fallback : /^\d+$/.test(env[key]!) ? Number(env[key]) : NaN;
  return ApiTestLimitsSchema.parse({
    calls: integer("LIVE_API_TEST_MAX_REQUESTS_PER_DAY", 15),
    tokens: integer("LIVE_API_TEST_MAX_TOKENS_PER_DAY", 30000),
    outputTokens: integer("LIVE_API_TEST_MAX_OUTPUT_TOKENS", 2000),
    concurrent: integer("LIVE_API_TEST_MAX_CONCURRENT", 1),
  });
}
export function apiTestPolicy(now: number) {
  return ExperimentPolicySchema.parse({
    enabled: true,
    expiresAt: now + 60_000,
    allowedPrincipalIds: ["local-developer"],
    maxConcurrent: 1,
    maxRequestBytes: 131072,
  });
}
const Quota = z.strictObject({
  calls: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
});
const Choice = z.strictObject({ id: z.string().min(1).max(64), label: z.string().min(1).max(100) });
export const ApiTestFeatureIdSchema = z.enum(["F02", "F03", "F04"]);
export const ApiTestConfigSchema = z.strictObject({
  defaultMode: z.literal("mock"),
  modelId: ModelIdSchema,
  keyStatus: z.enum(["ready", "missing"]),
  liveAvailable: z.boolean(),
  liveStatus: z.enum(["LIVE_BLOCKED", "LIVE_NOT_RUN"]),
  liveReason: z.string().min(1).max(64),
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
  liveUsed: Quota.optional(),
  liveRemaining: Quota.optional(),
  limits: ApiTestLimitsSchema.nullable(),
  fixtures: z.array(Choice).max(10),
  personas: z.array(Choice).max(50),
  features: z
    .array(z.strictObject({ id: ApiTestFeatureIdSchema, label: z.string().min(1).max(100) }))
    .min(1)
    .max(11),
});
export type ApiTestConfig = z.infer<typeof ApiTestConfigSchema>;
export const ApiTestRunSchema = z.strictObject({
  testRunId: z.uuid(),
  mode: z.enum(["mock", "live"]),
  scenario: z.literal("narration"),
  featureId: ApiTestFeatureIdSchema,
  modelId: ModelIdSchema,
  personaId: z.string().min(1).max(64),
  status: z.enum(["blocked", "running", "passed", "failed", "interrupted"]),
  personaVersion: z.string().min(1).max(32),
  promptVersion: z.string().min(1).max(32),
  commonPromptVersion: z.string().min(1).max(32),
  schemaVersion: z.literal("2.0.0"),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  durationMs: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  providerStatus: z
    .enum(["completed", "failed", "incomplete", "cancelled", "queued", "in_progress"])
    .optional(),
  verdict: z
    .strictObject({
      groundingPassed: z.boolean(),
      styleScore: z.number().min(0).max(1),
      styleIssueCount: z.number().int().nonnegative(),
    })
    .optional(),
  /** Set only when grounding validation rejected a completed provider output. */
  rejection: z
    .strictObject({ code: NarrationRejectionCodeSchema, beatId: z.string().nullable() })
    .optional(),
  expectedRegister: z.enum(["haeyo", "hapsyo", "banmal"]).optional(),
  styleIssues: z
    .array(
      z.strictObject({
        code: StyleIssueCodeSchema,
        beatId: z.string().min(1).max(64),
        detail: z.string().max(120),
      }),
    )
    .max(100)
    .optional(),
  evidence: z
    .enum(["MOCK_PASS", "MOCK_FAILED", "LIVE_BLOCKED", "LIVE_PASS", "LIVE_FAILED"])
    .optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
  // The shared narration service validates its full draft. This view adds transport bounds
  // without importing the server's prompt composer into the client bundle.
  result: z
    .object({
      beats: z
        .array(
          z
            .object({
              beatId: z.string().min(1).max(64),
              title: z.string().max(60),
              paragraphs: z.array(z.string().max(3000)).max(4),
            })
            .passthrough(),
        )
        .max(8),
      styleEvaluation: z.object({ score: z.number().min(0).max(1) }).passthrough(),
      meta: z
        .object({ providerKind: z.enum(["mock", "openai"]), modelId: ModelIdSchema })
        .passthrough(),
    })
    .passthrough()
    .optional(),
});
export type ApiTestRun = z.infer<typeof ApiTestRunSchema>;

export function apiTestRunHeading(run: ApiTestRun): string {
  if (run.rejection && run.providerStatus === "completed")
    return `API 호출 완료 · 근거 검증 거절 (${run.rejection.code})`;
  return run.evidence ?? run.status;
}
export function apiTestRejectionMessage(
  code: z.infer<typeof NarrationRejectionCodeSchema>,
): string {
  const messages = {
    BYTES: "응답이 허용 크기를 넘었습니다.",
    JSON_PARSE: "응답이 올바른 JSON이 아닙니다.",
    SCHEMA: "응답 구조가 출력 계약과 다릅니다.",
    BEAT_SET: "계획된 말풍선 집합과 응답의 말풍선이 다릅니다.",
    ALIAS_UNKNOWN: "계획에 없는 근거 별칭을 사용했습니다.",
    ALIAS_MISSING: "근거가 있는 말풍선에서 근거를 하나도 사용하지 않았습니다.",
    LENGTH: "말풍선 글자 수가 상한을 넘었습니다.",
    DATE_FORBIDDEN: "계획에 없는 날짜·기간을 적었습니다.",
    INTERNAL_ID_LEAK: "내부 식별자나 근거 별칭이 문장에 노출되었습니다.",
  } as const;
  return messages[code];
}
export function apiTestStyleIssueMessage(
  code: z.infer<typeof StyleIssueCodeSchema>,
  register?: ApiTestRun["expectedRegister"],
): string {
  const registerName =
    register === "haeyo"
      ? "해요체"
      : register === "hapsyo"
        ? "합쇼체"
        : register === "banmal"
          ? "반말"
          : "선택한 문체";
  const messages = {
    REGISTER_MIX: `${registerName} 비율이 70% 미만입니다.`,
    STOCK_PHRASE: "상투어 또는 회피 표현이 포함되어 있습니다.",
    CERTAINTY: "확정·보장 표현이 포함되어 있습니다.",
    EMOJI: "허용되지 않은 이모지가 있습니다.",
    CATCHPHRASE_LIMIT: "캐릭터 고유 표현 사용 횟수를 초과했습니다.",
    PARAGRAPH_COUNT: "말풍선의 문단 수가 설정 범위를 벗어났습니다.",
    SENTENCE_COUNT: "문단의 문장 수가 설정 범위를 벗어났습니다.",
    DUPLICATE_PARAGRAPH: "동일한 문단이 반복됩니다.",
  } as const;
  return messages[code];
}
