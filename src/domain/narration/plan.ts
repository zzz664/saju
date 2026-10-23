import { z } from "zod";
import { CoverageStatusSchema, HexDigestSchema } from "@/domain/contracts";
import { canonicalizeJson, type Sha256Adapter } from "@/domain/core-fingerprint";
import type { DerivedNatalFacts } from "@/domain/natal-facts";
import { ElementSchema, StemSchema, BranchSchema } from "@/domain/natal-facts/schemas";
import { FeatureIdSchema, type FeatureNarrationInput } from "@/domain/features/schemas";
import type { MatchedInterpretation } from "@/domain/interpretation";
import { defineCodedError } from "@/domain/utilities";

export const NARRATION_PLAN_VERSION = "1.0.0";
export const BeatRoleSchema = z.enum(["chart", "observation", "interpretation", "limitations"]);
export const EvidenceAliasSchema = z.string().regex(/^E\d{1,2}$/);
export const PlanEvidenceSchema = z
  .strictObject({
    alias: EvidenceAliasSchema,
    kind: z.enum(["fact", "interpretation", "limitation"]),
    text: z.string().trim().min(1).max(1200),
    /** Human-readable source label for classical summaries; null for calculated facts. */
    source: z.string().min(1).max(160).nullable(),
    /** Server-side reference (judgmentId / unitId / limitation code). Never shown to the model. */
    refId: z.string().min(1).max(300),
  })
  .readonly();
export const NarrationBeatSchema = z
  .strictObject({
    beatId: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
    role: BeatRoleSchema,
    title: z.string().trim().min(1).max(60),
    guidance: z.string().trim().min(1).max(400),
    maxCharacters: z.number().int().min(100).max(3000),
    evidence: z.array(PlanEvidenceSchema).min(1).max(12).readonly(),
  })
  .readonly();
export const ChartSummarySchema = z
  .strictObject({
    dayMaster: z.strictObject({ stem: StemSchema, element: ElementSchema }).readonly().nullable(),
    pillars: z
      .array(
        z
          .strictObject({
            position: z.enum(["year", "month", "day", "hour"]),
            label: z.enum(["연주", "월주", "일주", "시주"]),
            stem: StemSchema.nullable(),
            branch: BranchSchema.nullable(),
          })
          .readonly(),
      )
      .length(4)
      .readonly(),
    unknownPositions: z
      .array(z.enum(["연주", "월주", "일주", "시주"]))
      .max(4)
      .readonly(),
  })
  .readonly();
export const NarrationPlanSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    planVersion: z.literal(NARRATION_PLAN_VERSION),
    specId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    specVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    featureId: FeatureIdSchema,
    status: CoverageStatusSchema,
    chart: ChartSummarySchema.nullable(),
    beats: z.array(NarrationBeatSchema).min(1).max(8).readonly(),
    limitations: z.array(z.string().min(1).max(300)).max(12).readonly(),
    provenance: z
      .strictObject({
        analysisKey: HexDigestSchema,
        featureCacheKey: HexDigestSchema,
        interpretationCatalogVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
        matchedInterpretations: z.number().int().min(0),
        usableInterpretations: z.number().int().min(0),
      })
      .readonly(),
    planKey: HexDigestSchema,
  })
  .refine((plan) => {
    const aliases = plan.beats.flatMap((beat) => beat.evidence.map((entry) => entry.alias));
    return (
      new Set(aliases).size === aliases.length &&
      new Set(plan.beats.map((beat) => beat.beatId)).size === plan.beats.length &&
      (plan.status !== "unavailable" || plan.beats.every((beat) => beat.role === "limitations"))
    );
  }, "Aliases and beat ids must be unique; unavailable plans carry only limitations.")
  .readonly();
export type NarrationPlan = z.infer<typeof NarrationPlanSchema>;
export type NarrationBeat = z.infer<typeof NarrationBeatSchema>;
export type PlanEvidence = z.infer<typeof PlanEvidenceSchema>;

/** Server configuration: which beats a feature narrates and in which order. */
export const NarrationPlanSpecSchema = z
  .strictObject({
    specId: NarrationPlanSchema.unwrap().shape.specId,
    specVersion: NarrationPlanSchema.unwrap().shape.specVersion,
    featureId: FeatureIdSchema,
    beats: z
      .array(
        z
          .strictObject({
            beatId: NarrationBeatSchema.unwrap().shape.beatId,
            role: BeatRoleSchema,
            title: NarrationBeatSchema.unwrap().shape.title,
            guidance: NarrationBeatSchema.unwrap().shape.guidance,
            maxCharacters: NarrationBeatSchema.unwrap().shape.maxCharacters,
          })
          .readonly(),
      )
      .min(1)
      .max(8)
      .refine(
        (beats) =>
          new Set(beats.map((beat) => beat.beatId)).size === beats.length &&
          beats.filter((beat) => beat.role === "limitations").length === 1,
        "Beat ids must be unique and exactly one limitations beat is required.",
      )
      .readonly(),
  })
  .readonly();
export type NarrationPlanSpec = z.infer<typeof NarrationPlanSpecSchema>;

export const F03_PLAN_SPEC: NarrationPlanSpec = NarrationPlanSpecSchema.parse({
  specId: "f03-strengths-plan",
  specVersion: "1.0.0",
  featureId: "F03",
  beats: [
    {
      beatId: "chart",
      role: "chart",
      title: "원국 한눈에",
      guidance: "일간과 네 기둥을 소개하고 미상인 기둥이 있으면 그 사실을 먼저 말한다.",
      maxCharacters: 500,
    },
    {
      beatId: "observation",
      role: "observation",
      title: "오행·십성에서 보이는 것",
      guidance:
        "계산으로 확정된 관측 사실만 풀어 쓴다. 개수가 많거나 적다는 이유로 강점·약점을 정하지 않는다.",
      maxCharacters: 900,
    },
    {
      beatId: "interpretation",
      role: "interpretation",
      title: "전통 해석에서 살펴볼 점",
      guidance:
        "고전 요약을 조건부로 전달한다. 어느 책의 어느 부분에서 온 설명인지 한 번 언급하고 확정하지 않는다.",
      maxCharacters: 1200,
    },
    {
      beatId: "limitations",
      role: "limitations",
      title: "해석 범위와 한계",
      guidance: "알 수 없는 것과 확정하지 않은 것을 담담하게 설명한다.",
      maxCharacters: 600,
    },
  ],
});

export class NarrationPlanError extends defineCodedError("NarrationPlanError", {
  INPUT_REJECTED: "Narration plan input was rejected.",
  SPEC_REJECTED: "Narration plan spec was rejected.",
  OUTPUT_INVALID: "Narration plan output was invalid.",
}) {}

const POSITION_LABEL = { year: "연주", month: "월주", day: "일주", hour: "시주" } as const;
const ELEMENT_OF_STEM: Record<string, z.infer<typeof ElementSchema>> = {
  갑: "목",
  을: "목",
  병: "화",
  정: "화",
  무: "토",
  기: "토",
  경: "금",
  신: "금",
  임: "수",
  계: "수",
};
const LIMITATION_TEXT: Record<string, string> = {
  CORE_UNAVAILABLE: "입력된 정보로는 원국을 계산할 수 없어 해석을 제공할 수 없다.",
  UPSTREAM_PARTIAL:
    "일부 판단은 아직 후보 단계라 확정 설명에서 제외했다. 보이는 설명이 전부가 아닐 수 있다.",
  MODULE_NOT_IMPLEMENTED: "이 기능이 참조하는 일부 분석 모듈은 아직 구현되지 않았다.",
  EXECUTOR_NOT_IMPLEMENTED: "이 기능의 해석 실행기는 아직 구현되지 않았다.",
  SUBFEATURE_INCOMPLETE: "하위 기능 일부가 완료되지 않아 종합 설명이 불완전하다.",
  EXECUTION_UNAVAILABLE: "필요한 선행 분석을 사용할 수 없어 이 기능을 실행하지 못했다.",
};

export type NarrationPlanInput = {
  readonly input: FeatureNarrationInput;
  readonly facts: DerivedNatalFacts | null;
  readonly interpretations: readonly MatchedInterpretation[];
  readonly analysisKey: string;
  readonly featureCacheKey: string;
  readonly interpretationCatalogVersion: string;
};

function chartOf(facts: DerivedNatalFacts | null) {
  if (!facts) return null;
  const pillars = (["year", "month", "day", "hour"] as const).map((position) => {
    const pillar = facts.sourcePillars[position];
    return {
      position,
      label: POSITION_LABEL[position],
      stem: pillar?.heavenlyStem ?? null,
      branch: pillar?.earthlyBranch ?? null,
    };
  });
  return {
    dayMaster: facts.dayMaster
      ? { stem: facts.dayMaster, element: ELEMENT_OF_STEM[facts.dayMaster] }
      : null,
    pillars,
    unknownPositions: pillars.filter((entry) => entry.stem === null).map((entry) => entry.label),
  };
}

function chartSentences(chart: NonNullable<ReturnType<typeof chartOf>>): string[] {
  const lines: string[] = [];
  if (chart.dayMaster)
    lines.push(`일간(태어난 날의 천간)은 ${chart.dayMaster.stem}(${chart.dayMaster.element})이다.`);
  const known = chart.pillars.filter((entry) => entry.stem !== null);
  if (known.length)
    lines.push(
      "확정된 기둥은 " +
        known.map((entry) => `${entry.label} ${entry.stem}${entry.branch}`).join(", ") +
        "이다.",
    );
  if (chart.unknownPositions.length)
    lines.push(
      `${chart.unknownPositions.join("·")}는 출생 정보가 미상이어서 이번 설명에서 제외한다.`,
    );
  return lines;
}

/** Pure composition: verified findings + usable classical summaries → persona-independent beats. */
export function buildNarrationPlan(
  source: NarrationPlanInput,
  rawSpec: unknown,
  hash: Sha256Adapter,
): NarrationPlan {
  const spec = NarrationPlanSpecSchema.safeParse(rawSpec);
  if (!spec.success) throw new NarrationPlanError("SPEC_REJECTED");
  if (spec.data.featureId !== source.input.featureId)
    throw new NarrationPlanError("INPUT_REJECTED");
  const chart = chartOf(source.facts);
  const usable = source.interpretations.filter((entry) => entry.usable);
  const limitations: string[] = [];
  for (const code of source.input.limitations)
    if (LIMITATION_TEXT[code]) limitations.push(LIMITATION_TEXT[code]);
  if (chart?.unknownPositions.length)
    limitations.push(
      `${chart.unknownPositions.join("·")} 정보가 없어 그 기둥과 관련된 판단은 하지 않았다.`,
    );
  if (source.input.status !== "unavailable") {
    if (source.interpretations.length === 0)
      limitations.push("이 원국의 조건에 해당하는 고전 해석 항목이 카탈로그에 없다.");
    else if (usable.length === 0)
      limitations.push(
        `고전 해석 항목 ${source.interpretations.length}건이 조건에 맞지만 승인된 한국어 요약이 아직 없어 해석 문단을 생략했다.`,
      );
    else if (usable.length < source.interpretations.length)
      limitations.push(
        `조건에 맞는 고전 해석 ${source.interpretations.length}건 중 요약이 준비된 ${usable.length}건만 설명에 사용했다.`,
      );
    if (usable.length)
      limitations.push(
        "고전 해석 요약은 AI가 원문에서 요약한 것으로 명리 전문가의 감수를 받지 않았다. 참고 설명으로만 읽어야 한다.",
      );
  }
  if (limitations.length === 0)
    limitations.push("이 설명은 계산으로 확정된 관측 사실과 승인된 고전 요약 안에서만 작성되었다.");

  let next = 1;
  const alias = () => `E${next++}`;
  const beats = [];
  for (const beatSpec of spec.data.beats) {
    let evidence: z.input<typeof PlanEvidenceSchema>[] = [];
    if (beatSpec.role === "chart") {
      if (!chart || source.input.status === "unavailable") continue;
      evidence = chartSentences(chart).map((text, index) => ({
        alias: alias(),
        kind: "fact",
        text,
        source: null,
        refId: `chart:${index}`,
      }));
    } else if (beatSpec.role === "observation") {
      evidence = source.input.verifiedFindings.map((finding) => ({
        alias: alias(),
        kind: "fact",
        text: finding.assertion,
        source: null,
        refId: finding.judgmentId,
      }));
    } else if (beatSpec.role === "interpretation") {
      evidence = usable.map((entry) => ({
        alias: alias(),
        kind: "interpretation",
        text: entry.summary!,
        source: `${entry.source.work} · ${entry.source.locator}`,
        refId: entry.unitId,
      }));
    } else {
      evidence = limitations.map((text, index) => ({
        alias: alias(),
        kind: "limitation",
        text,
        source: null,
        refId: `limitation:${index}`,
      }));
    }
    if (evidence.length === 0) continue;
    beats.push({ ...beatSpec, evidence: evidence.slice(0, 12) });
  }
  const body = {
    schemaVersion: "1.0.0",
    planVersion: NARRATION_PLAN_VERSION,
    specId: spec.data.specId,
    specVersion: spec.data.specVersion,
    featureId: source.input.featureId,
    status: source.input.status,
    chart: source.input.status === "unavailable" ? null : chart,
    beats,
    limitations: limitations.slice(0, 12),
    provenance: {
      analysisKey: source.analysisKey,
      featureCacheKey: source.featureCacheKey,
      interpretationCatalogVersion: source.interpretationCatalogVersion,
      matchedInterpretations: source.interpretations.length,
      usableInterpretations: usable.length,
    },
  };
  const parsed = NarrationPlanSchema.safeParse({
    ...body,
    planKey: hash.digest(canonicalizeJson(body)),
  });
  if (!parsed.success) throw new NarrationPlanError("OUTPUT_INVALID");
  return parsed.data;
}
