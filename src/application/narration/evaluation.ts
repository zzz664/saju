import { z } from "zod";
import {
  createFeatureNarrationExperiment,
  prepareFeatureNarration,
  type FeatureNarrationOptions,
} from "@/application/narration/feature";
import type { ExperimentRunnerOptions } from "@/application/narration/experiment";
import { canonicalizeJson, type Sha256Adapter } from "@/domain/core-fingerprint";
import { HexDigestSchema } from "@/domain/contracts";
import { ExperimentError } from "@/domain/experiment";
import { FeatureResultSchema } from "@/domain/features/schemas";
import { NarrationError } from "@/domain/narration";
import { NarrationPlanError } from "@/domain/narration/plan";
import { COMMON_SYSTEM_PROMPT_VERSION, R01_PLAN_CONTRACT_VERSION } from "@/domain/narration/prompt";
import {
  NarrationRejection,
  NarrationRejectionCodeSchema,
  NARRATION_OUTPUT_SCHEMA_VERSION,
  STYLE_POLICY_VERSION,
  StyleIssueCodeSchema,
  ValidatedNarrationSchema,
} from "@/domain/narration/render";
import { DEFAULT_NARRATION_MODEL, ModelIdSchema } from "@/domain/narration/model";
import { PersonaProfileSchema, PersonaSelectionSchema } from "@/domain/persona";

const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9-]+$/);
const Label = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]*$/);
const Count = z.number().int().nonnegative();
const SuiteSchema = z.strictObject({
  suiteId: Id,
  suiteVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  cases: z
    .array(z.strictObject({ id: Id, title: Label, category: Id, result: FeatureResultSchema }))
    .min(1)
    .max(30)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
});
const SettingsSchema = z.strictObject({
  repetitions: z.union([z.literal(2), z.literal(3)]),
  selections: z
    .array(PersonaSelectionSchema)
    .min(2)
    .max(3)
    .refine((rows) => new Set(rows.map((row) => row.personaId)).size === rows.length),
});
const RowSchema = z.strictObject({
  caseId: Id,
  personaId: PersonaSelectionSchema.unwrap().shape.personaId,
  repetition: z.number().int().min(1).max(3),
  status: z.enum(["completed", "rejected", "failed"]),
  errorCode: z
    .string()
    .regex(/^[A-Z_]{1,40}$/)
    .nullable(),
  rejectionCode: NarrationRejectionCodeSchema.nullable(),
  analysisKey: HexDigestSchema,
  planKey: HexDigestSchema,
  narrationKey: HexDigestSchema,
  outputDigest: HexDigestSchema.nullable(),
  beats: ValidatedNarrationSchema.unwrap().shape.beats.nullable(),
  styleScore: z.number().min(0).max(1).nullable(),
  styleIssues: z.array(
    z.strictObject({ code: StyleIssueCodeSchema, beatId: z.string().min(1).max(64) }),
  ),
});
const PersonaMetricsSchema = z.strictObject({
  personaId: PersonaSelectionSchema.unwrap().shape.personaId,
  total: Count,
  completed: Count,
  rejected: Count,
  failed: Count,
  styleFlagged: Count,
  meanStyleScore: z.number().min(0).max(1).nullable(),
  distinctOutputs: Count,
  distinctOpenings: Count,
  repeatedOpenings: Count,
});
export const NarrationEvaluationReportSchema = z.strictObject({
  schemaVersion: z.literal("2.0.0"),
  evaluationPolicyVersion: z.literal("2.0.0"),
  suiteId: Id,
  suiteVersion: z.string(),
  repetitions: z.union([z.literal(2), z.literal(3)]),
  providerKind: z.literal("mock"),
  modelId: ModelIdSchema,
  versions: z.strictObject({
    commonPromptVersion: z.string(),
    contractVersion: z.string(),
    outputSchemaVersion: z.literal(NARRATION_OUTPUT_SCHEMA_VERSION),
    stylePolicyVersion: z.literal(STYLE_POLICY_VERSION),
    interpretationCatalogVersion: z.string(),
  }),
  profiles: z.array(PersonaProfileSchema),
  cases: z.array(
    z.strictObject({
      id: Id,
      title: Label,
      category: Id,
      analysisKey: HexDigestSchema,
      planKey: HexDigestSchema,
      status: z.enum(["complete", "partial", "unavailable"]),
      beatIds: z.array(z.string()),
      usableInterpretations: Count,
      matchedInterpretations: Count,
      limitations: z.array(z.string()),
    }),
  ),
  rows: z.array(RowSchema),
  rejectionCounts: z.record(z.string(), Count),
  summary: z.strictObject({
    total: Count,
    completed: Count,
    rejected: Count,
    failed: Count,
    styleFlagged: Count,
    groundingPassed: z.boolean(),
    byPersona: z.array(PersonaMetricsSchema),
  }),
  humanEvaluation: z.strictObject({
    status: z.literal("not-performed"),
    naturalnessMean: z.null(),
    readabilityMean: z.null(),
    targetMean: z.literal(4),
    recommendedReviewers: z.literal(2),
  }),
});
export type NarrationEvaluationReport = z.infer<typeof NarrationEvaluationReportSchema>;

class EvaluationFailure extends Error {
  constructor(readonly code: "SOURCE_CHANGED" | "HASH_FAILED") {
    super(code);
  }
}
function digest(value: unknown, adapter: Sha256Adapter) {
  let raw: unknown;
  try {
    raw = adapter.digest(canonicalizeJson(value));
  } catch {
    throw new EvaluationFailure("HASH_FAILED");
  }
  const parsed = HexDigestSchema.safeParse(raw);
  if (!parsed.success) throw new EvaluationFailure("HASH_FAILED");
  return parsed.data;
}

/**
 * Bounded developer evaluation of synthetic cases through the shared plan path.
 * Grounding rejections are counted by code; style is reported as a score, not pass/fail.
 */
export async function evaluateNarrationMatrix(
  value: unknown,
  options: ExperimentRunnerOptions &
    Omit<FeatureNarrationOptions, "selection"> & {
      readonly selections: unknown;
      readonly repetitions: unknown;
    },
): Promise<NarrationEvaluationReport> {
  if (options.provider.kind !== "mock") throw new NarrationError("LIVE_DISABLED");
  const suite = SuiteSchema.parse(value),
    settings = SettingsSchema.parse({
      selections: options.selections,
      repetitions: options.repetitions,
    });
  const profiles = settings.selections.map((selection) => options.registry.load(selection));
  // Zod returns copies; the narration path requires the engine's own verified result objects.
  const originals = (value as { cases: readonly { result: unknown }[] }).cases;
  // Validate the whole matrix before the first supplier call.
  const prepared = suite.cases.map((source, index) => ({
    source,
    result: originals[index].result,
    before: canonicalizeJson(source.result),
    contexts: settings.selections.map((selection) =>
      prepareFeatureNarration(originals[index].result, { ...options, selection }),
    ),
  }));
  const rows: z.infer<typeof RowSchema>[] = [];
  const rejectionCounts: Record<string, number> = {};
  for (const item of prepared) {
    for (const [index, selection] of settings.selections.entries()) {
      const context = item.contexts[index];
      const runner = createFeatureNarrationExperiment({ ...options, selection });
      for (let repetition = 1; repetition <= settings.repetitions; repetition++) {
        const base = {
          caseId: item.source.id,
          personaId: selection.personaId,
          repetition,
          analysisKey: context.cache.analysisKey,
          planKey: context.cache.planKey,
          narrationKey: context.cache.narrationKey,
        };
        try {
          const result = await runner.run(item.result);
          if (
            canonicalizeJson(item.result) !== item.before ||
            result.cache.analysisKey !== base.analysisKey ||
            result.plan.planKey !== base.planKey
          )
            throw new EvaluationFailure("SOURCE_CHANGED");
          rows.push(
            RowSchema.parse({
              ...base,
              status: "completed",
              errorCode: null,
              rejectionCode: null,
              beats: result.beats,
              outputDigest: digest(result.beats, options.hash),
              styleScore: result.styleEvaluation.score,
              styleIssues: result.styleEvaluation.issues.map(({ code, beatId }) => ({
                code,
                beatId,
              })),
            }),
          );
        } catch (cause) {
          const rejection = cause instanceof NarrationRejection ? cause.code : null;
          if (rejection) rejectionCounts[rejection] = (rejectionCounts[rejection] ?? 0) + 1;
          const errorCode =
            cause instanceof NarrationError ||
            cause instanceof NarrationPlanError ||
            cause instanceof ExperimentError ||
            cause instanceof EvaluationFailure
              ? cause.code
              : rejection
                ? "OUTPUT_REJECTED"
                : "EVALUATION_FAILED";
          rows.push(
            RowSchema.parse({
              ...base,
              status: rejection ? "rejected" : "failed",
              errorCode,
              rejectionCode: rejection,
              beats: null,
              outputDigest: null,
              styleScore: null,
              styleIssues: [],
            }),
          );
        }
      }
    }
  }
  const byPersona = profiles.map((profile) => {
    const group = rows.filter((row) => row.personaId === profile.personaId),
      completed = group.filter((row) => row.status === "completed");
    const opening = (row: z.infer<typeof RowSchema>) =>
      row.beats?.[0].paragraphs[0].match(/^[^.!?。！？]*[.!?。！？]?/)?.[0].trim() ?? "";
    const openings = completed.map(opening);
    const distinctOpenings = new Set(openings).size;
    return {
      personaId: profile.personaId,
      total: group.length,
      completed: completed.length,
      rejected: group.filter((row) => row.status === "rejected").length,
      failed: group.filter((row) => row.status === "failed").length,
      styleFlagged: completed.filter((row) => row.styleIssues.length > 0).length,
      meanStyleScore: completed.length
        ? completed.reduce((sum, row) => sum + (row.styleScore ?? 0), 0) / completed.length
        : null,
      distinctOutputs: new Set(completed.map((row) => row.outputDigest)).size,
      distinctOpenings,
      repeatedOpenings: openings.length - distinctOpenings,
    };
  });
  const completed = rows.filter((row) => row.status === "completed").length;
  return NarrationEvaluationReportSchema.parse({
    schemaVersion: "2.0.0",
    evaluationPolicyVersion: "2.0.0",
    suiteId: suite.suiteId,
    suiteVersion: suite.suiteVersion,
    repetitions: settings.repetitions,
    providerKind: "mock",
    modelId: ModelIdSchema.parse(options.model ?? DEFAULT_NARRATION_MODEL),
    versions: {
      commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
      contractVersion: R01_PLAN_CONTRACT_VERSION,
      outputSchemaVersion: NARRATION_OUTPUT_SCHEMA_VERSION,
      stylePolicyVersion: STYLE_POLICY_VERSION,
      interpretationCatalogVersion:
        prepared[0]?.contexts[0].plan.provenance.interpretationCatalogVersion ?? "0.0.0",
    },
    profiles,
    cases: prepared.map((item) => ({
      id: item.source.id,
      title: item.source.title,
      category: item.source.category,
      analysisKey: item.contexts[0].cache.analysisKey,
      planKey: item.contexts[0].plan.planKey,
      status: item.contexts[0].plan.status,
      beatIds: item.contexts[0].plan.beats.map((beat) => beat.beatId),
      usableInterpretations: item.contexts[0].plan.provenance.usableInterpretations,
      matchedInterpretations: item.contexts[0].plan.provenance.matchedInterpretations,
      limitations: item.contexts[0].plan.limitations,
    })),
    rows,
    rejectionCounts,
    summary: {
      total: rows.length,
      completed,
      rejected: rows.filter((row) => row.status === "rejected").length,
      failed: rows.filter((row) => row.status === "failed").length,
      styleFlagged: rows.filter((row) => row.styleIssues.length > 0).length,
      groundingPassed: completed === rows.length,
      byPersona,
    },
    humanEvaluation: {
      status: "not-performed",
      naturalnessMean: null,
      readabilityMean: null,
      targetMean: 4,
      recommendedReviewers: 2,
    },
  });
}

const markdown = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;");
/** Review artifact only. It never supplies human ratings or publishes to P06. */
export function renderNarrationReview(report: NarrationEvaluationReport): string {
  const lines = [
    "# 서술 계획 경로 Mock 검토 샘플",
    "",
    `근거 검증 통과: ${report.summary.completed}/${report.summary.total}. 거절 사유: ${
      Object.entries(report.rejectionCounts)
        .map(([code, count]) => `${code} ${count}`)
        .join(", ") || "없음"
    }. 사람 자연스러움·가독성 평가: **미실시**.`,
    "",
    "동일한 반복은 한 샘플로 묶고, 서로 다른 반복 출력은 모두 표시한다. 계획의 근거와 한계를 함께 검토한다.",
    "",
  ];
  for (const source of report.cases) {
    lines.push(
      `## ${source.id} ${markdown(source.title)}`,
      "",
      `상태: ${source.status}. 말풍선: ${source.beatIds.join(", ")}. 고전 해석 일치 ${source.matchedInterpretations}건 / 사용 ${source.usableInterpretations}건.`,
      ...source.limitations.map((item) => `- 한계: ${markdown(item)}`),
      "",
    );
    for (const profile of report.profiles) {
      const group = report.rows.filter(
        (row) => row.caseId === source.id && row.personaId === profile.personaId,
      );
      const unique = new Map(
        group.filter((row) => row.status === "completed").map((row) => [row.outputDigest, row]),
      );
      lines.push(
        `### ${profile.personaId} (${profile.voice.register})`,
        "",
        `성공 ${group.filter((row) => row.status === "completed").length}/${group.length}, 서로 다른 출력 ${unique.size}개.`,
        "",
      );
      for (const row of unique.values()) {
        lines.push(
          `출력 ${row.outputDigest?.slice(0, 12)} / 문체 점수 ${row.styleScore?.toFixed(2)}${
            row.styleIssues.length
              ? " / " + row.styleIssues.map((issue) => issue.code).join(", ")
              : ""
          }`,
          "",
        );
        for (const beat of row.beats ?? [])
          for (const paragraph of beat.paragraphs) lines.push(markdown(paragraph), "");
      }
      for (const row of group.filter((row) => row.status !== "completed"))
        lines.push(
          `반복 ${row.repetition} ${row.status}: ${row.rejectionCode ?? row.errorCode}`,
          "",
        );
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}
