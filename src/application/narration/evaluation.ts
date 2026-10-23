import { z } from "zod";
import { createPersonaExperiment } from "@/application/narration/persona";
import type { ExperimentRunnerOptions } from "@/application/narration/experiment";
import { CoreExportSchema, ManualPromptDataSchema } from "@/domain/core-export";
import {
  canonicalizeJson,
  fingerprintCoreExport,
  HashedCoreExportSchema,
  type Sha256Adapter,
} from "@/domain/core-fingerprint";
import { NarrationError } from "@/domain/narration";
import { ExperimentError } from "@/domain/experiment";
import {
  FeatureNarrationSpecSchema,
  PersonaProfileSchema,
  PersonaSelectionSchema,
  PersonaError,
  type ApprovedPersonaRegistry,
} from "@/domain/persona";
import { PersonaNarrationDraftSchema, preparePersonaNarration } from "@/domain/persona/narration";
import { COMMON_SYSTEM_PROMPT_VERSION, PERSONA_PROMPT_VERSION } from "@/domain/persona/prompt";
import { DEFAULT_NARRATION_MODEL, ModelIdSchema } from "@/domain/narration/model";

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
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Count = z.number().int().nonnegative();
const SuiteSchema = z.strictObject({
  suiteId: Id,
  suiteVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  cases: z
    .array(z.strictObject({ id: Id, title: Label, category: Id, core: CoreExportSchema }))
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
  status: z.enum(["completed", "failed"]),
  errorCode: z
    .string()
    .regex(/^[A-Z_]{1,40}$/)
    .nullable(),
  analysisKey: Hash,
  narrationKey: Hash,
  outputDigest: Hash.nullable(),
  sections: PersonaNarrationDraftSchema.unwrap().shape.sections.nullable(),
  stylePassed: z.boolean().nullable(),
  styleIssues: z.array(
    z.strictObject({ code: z.string().regex(/^[A-Z_]+$/), sectionId: z.string().min(1).max(64) }),
  ),
});
const PersonaMetricsSchema = z.strictObject({
  personaId: PersonaSelectionSchema.unwrap().shape.personaId,
  total: Count,
  completed: Count,
  failed: Count,
  styleFlagged: Count,
  distinctOutputs: Count,
  distinctOpenings: Count,
  repeatedOpenings: Count,
  caseSamples: Count,
  distinctCaseOpenings: Count,
  repeatedCaseOpenings: Count,
});
export const PersonaEvaluationReportSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  evaluationPolicyVersion: z.literal("1.0.0"),
  suiteId: Id,
  suiteVersion: z.string(),
  repetitions: z.union([z.literal(2), z.literal(3)]),
  providerKind: z.literal("mock"),
  modelId: ModelIdSchema,
  versions: z.strictObject({
    commonPromptVersion: z.string(),
    promptVersion: z.string(),
    outputSchemaVersion: z.literal("1.0.0"),
    stylePolicyVersion: z.literal("1.0.0"),
  }),
  profiles: z.array(PersonaProfileSchema),
  spec: FeatureNarrationSpecSchema,
  cases: z.array(
    z.strictObject({
      id: Id,
      title: Label,
      category: Id,
      analysisKey: Hash,
      reference: ManualPromptDataSchema,
      versions: HashedCoreExportSchema.unwrap().shape.fingerprint.unwrap().shape.versions,
    }),
  ),
  rows: z.array(RowSchema),
  repeatGroups: z.array(
    z.strictObject({
      caseId: Id,
      personaId: PersonaSelectionSchema.unwrap().shape.personaId,
      completed: Count,
      identical: z.boolean(),
    }),
  ),
  summary: z.strictObject({
    total: Count,
    completed: Count,
    failed: Count,
    styleFlagged: Count,
    contractPassed: z.boolean(),
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
export type PersonaEvaluationReport = z.infer<typeof PersonaEvaluationReportSchema>;

class EvaluationFailure extends Error {
  constructor(readonly code: "ASSERTION_MISMATCH" | "SOURCE_CHANGED" | "HASH_FAILED") {
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
  const parsed = Hash.safeParse(raw);
  if (!parsed.success) throw new EvaluationFailure("HASH_FAILED");
  return parsed.data;
}

/** Bounded developer evaluation of synthetic cases. Existing experiment policy remains mandatory.
 * Quote checks cover the deterministic mock contract, not arbitrary prose semantics. */
export async function evaluatePersonaMatrix(
  value: unknown,
  options: ExperimentRunnerOptions & {
    readonly registry: ApprovedPersonaRegistry;
    readonly selections: unknown;
    readonly repetitions: unknown;
    readonly spec: unknown;
    readonly hash: Sha256Adapter;
  },
): Promise<PersonaEvaluationReport> {
  if (options.provider.kind !== "mock") throw new NarrationError("LIVE_DISABLED");
  const suite = SuiteSchema.parse(value),
    settings = SettingsSchema.parse({
      selections: options.selections,
      repetitions: options.repetitions,
    });
  const profiles = settings.selections.map((selection) => options.registry.load(selection));
  const spec = FeatureNarrationSpecSchema.parse(options.spec);
  // Validate the whole matrix before the first supplier call.
  const prepared = suite.cases.map((source) => ({
    source,
    before: canonicalizeJson(source.core),
    fingerprint: fingerprintCoreExport(source.core, options.hash).fingerprint,
    contexts: settings.selections.map((selection) =>
      preparePersonaNarration(source.core, { ...options, selection, spec }),
    ),
  }));
  const rows: z.infer<typeof RowSchema>[] = [];
  for (const item of prepared) {
    for (const [index, selection] of settings.selections.entries()) {
      const context = item.contexts[index];
      const runner = createPersonaExperiment({ ...options, selection, spec });
      for (let repetition = 1; repetition <= settings.repetitions; repetition++) {
        const base = {
          caseId: item.source.id,
          personaId: selection.personaId,
          repetition,
          analysisKey: context.cache.analysisKey,
          narrationKey: context.cache.narrationKey,
        };
        try {
          const result = await runner.run(item.source.core);
          if (
            canonicalizeJson(item.source.core) !== item.before ||
            result.cache.analysisKey !== base.analysisKey ||
            result.sourceStatus !== context.data.status ||
            canonicalizeJson(result.limitations) !== canonicalizeJson(context.data.limitations)
          )
            throw new EvaluationFailure("SOURCE_CHANGED");
          const assertions = new Map(
            context.data.verifiedFindings.map((finding) => [finding.findingId, finding.assertion]),
          );
          for (const section of result.sections) {
            const quotes = [...section.paragraphs.join("\n").matchAll(/“([^”]*)”/g)].map(
              (match) => match[1],
            );
            if (
              canonicalizeJson(quotes) !==
              canonicalizeJson(section.evidenceIds.map((id) => assertions.get(id)))
            )
              throw new EvaluationFailure("ASSERTION_MISMATCH");
          }
          rows.push(
            RowSchema.parse({
              ...base,
              status: "completed",
              errorCode: null,
              sections: result.sections,
              outputDigest: digest(result.sections, options.hash),
              stylePassed: result.styleEvaluation.passed,
              styleIssues: result.styleEvaluation.issues,
            }),
          );
        } catch (cause) {
          const errorCode =
            cause instanceof NarrationError ||
            cause instanceof PersonaError ||
            cause instanceof ExperimentError ||
            cause instanceof EvaluationFailure
              ? cause.code
              : "EVALUATION_FAILED";
          rows.push(
            RowSchema.parse({
              ...base,
              status: "failed",
              errorCode,
              sections: null,
              outputDigest: null,
              stylePassed: null,
              styleIssues: [],
            }),
          );
        }
      }
    }
  }
  const repeatGroups = prepared.flatMap((item) =>
    settings.selections.map((selection) => {
      const group = rows.filter(
        (row) => row.caseId === item.source.id && row.personaId === selection.personaId,
      );
      const completed = group.filter((row) => row.status === "completed");
      return {
        caseId: item.source.id,
        personaId: selection.personaId,
        completed: completed.length,
        identical:
          completed.length === settings.repetitions &&
          new Set(completed.map((row) => row.outputDigest)).size === 1,
      };
    }),
  );
  const byPersona = profiles.map((profile) => {
    const group = rows.filter((row) => row.personaId === profile.personaId),
      completed = group.filter((row) => row.status === "completed");
    const opening = (row: z.infer<typeof RowSchema>) =>
      row.sections?.[0].paragraphs[0].match(/^[^.!?。！？]*[.!?。！？]?/)?.[0].trim() ?? "";
    const openings = completed.map(opening);
    const distinctOpenings = new Set(openings).size;
    const firstByCase = new Map<string, z.infer<typeof RowSchema>>();
    for (const row of completed) if (!firstByCase.has(row.caseId)) firstByCase.set(row.caseId, row);
    const distinctCaseOpenings = new Set([...firstByCase.values()].map(opening)).size;
    return {
      personaId: profile.personaId,
      total: group.length,
      completed: completed.length,
      failed: group.length - completed.length,
      styleFlagged: completed.filter((row) => !row.stylePassed).length,
      distinctOutputs: new Set(completed.map((row) => row.outputDigest)).size,
      distinctOpenings,
      repeatedOpenings: openings.length - distinctOpenings,
      caseSamples: firstByCase.size,
      distinctCaseOpenings,
      repeatedCaseOpenings: firstByCase.size - distinctCaseOpenings,
    };
  });
  const completed = rows.filter((row) => row.status === "completed").length;
  return PersonaEvaluationReportSchema.parse({
    schemaVersion: "1.0.0",
    evaluationPolicyVersion: "1.0.0",
    suiteId: suite.suiteId,
    suiteVersion: suite.suiteVersion,
    repetitions: settings.repetitions,
    providerKind: "mock",
    modelId: ModelIdSchema.parse(options.model ?? DEFAULT_NARRATION_MODEL),
    versions: {
      commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
      promptVersion: PERSONA_PROMPT_VERSION,
      outputSchemaVersion: "1.0.0",
      stylePolicyVersion: "1.0.0",
    },
    profiles,
    spec,
    cases: prepared.map((item) => ({
      id: item.source.id,
      title: item.source.title,
      category: item.source.category,
      analysisKey: item.fingerprint.hash,
      reference: item.contexts[0].data,
      versions: item.fingerprint.versions,
    })),
    rows,
    repeatGroups,
    summary: {
      total: rows.length,
      completed,
      failed: rows.length - completed,
      styleFlagged: rows.filter((row) => row.stylePassed === false).length,
      contractPassed: completed === rows.length,
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
export function renderPersonaReview(report: PersonaEvaluationReport): string {
  const lines = [
    "# WBS-25 합성 Mock 문장 검토 샘플",
    "",
    `자동 계약 대조: ${report.summary.completed}/${report.summary.total}. 사람 자연스러움·가독성 평가: **미실시**.`,
    "",
    "동일한 반복은 한 샘플로 묶고, 서로 다른 반복 출력은 모두 표시한다. 원래 근거와 제한을 함께 검토한다.",
    "",
    "채점 기준과 기록은 WBS-25-persona-quality.md를 따른다. 이 파일은 재생성되므로 채점은 별도 기록에 남긴다.",
    "",
  ];
  for (const source of report.cases) {
    lines.push(
      `## ${source.id} ${markdown(source.title)}`,
      "",
      `상태: ${source.reference.status}. 계산 제한: ${source.reference.limitations.calculationReasons.join(", ") || "없음"}.`,
      `입력 제한: ${source.reference.limitations.input.limitations.map((item) => item.code).join(", ") || "없음"}.`,
      `부분 근거 ${source.reference.limitations.uncertainties.length}개, 중재 제한: ${source.reference.limitations.arbitration.join(", ") || "없음"}.`,
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
        const evidenceIds = new Set(row.sections?.flatMap((section) => section.evidenceIds));
        lines.push(
          `출력 ${row.outputDigest?.slice(0, 12)} / 휴리스틱: ${row.stylePassed ? "통과" : row.styleIssues.map((issue) => issue.code).join(", ")}`,
          "",
        );
        for (const finding of source.reference.verifiedFindings.filter((finding) =>
          evidenceIds.has(finding.findingId),
        ))
          lines.push(`- 원래 관찰: ${markdown(finding.assertion)}`);
        lines.push("");
        for (const section of row.sections ?? [])
          for (const paragraph of section.paragraphs) lines.push(markdown(paragraph), "");
      }
      for (const row of group.filter((row) => row.status === "failed"))
        lines.push(`반복 ${row.repetition} 실패: ${row.errorCode}`, "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}
