import { describe, expect, it } from "vitest";
import { buildFeatureNarrationInput, executeFeature } from "@/application/saju/features";
import { matchInterpretations } from "@/domain/interpretation";
import {
  buildNarrationPlan,
  F03_PLAN_SPEC,
  NarrationPlanSchema,
  type NarrationPlanInput,
} from "@/domain/narration/plan";
import { composeInterpretationCatalog } from "@/infrastructure/interpretation/catalog";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { featureDependencies, featureRequest } from "./helpers/feature-input";

const passage = "正月甲木。初春尚有餘寒。得丙癸透。富貴雙全。";
const digest = nodeSha256Adapter.digest(passage);
const stamp = "2026-10-24T00:00:00.000Z";
const summarized = composeInterpretationCatalog(
  {
    schemaVersion: "1.0.0",
    note: "test",
    passages: { "src.qtbj.gap-in": { passage, retrievedAt: stamp, passageDigest: digest } },
  },
  {
    schemaVersion: "1.0.0",
    note: "test",
    summaries: {
      "iu.qtbj.gap-in": {
        text: "정월의 갑목은 초봄의 추위가 남아 병화와 계수가 함께 드러나는 것을 귀하게 본다는 구절이다.",
        modelId: "gpt-4o-mini",
        promptVersion: "1.0.0",
        generatedAt: stamp,
        passageDigest: digest,
        entailment: { status: "passed", modelId: "gpt-4o-mini", checkedAt: stamp },
      },
    },
  },
);
const scaffold = composeInterpretationCatalog();

function planFor(request: unknown, catalog = scaffold) {
  const result = executeFeature(request, featureDependencies);
  const input = buildFeatureNarrationInput(result);
  const facts = result.core.document.facts;
  const source: NarrationPlanInput = {
    input,
    facts,
    interpretations: facts ? matchInterpretations(facts, catalog, { topics: ["strengths"] }) : [],
    analysisKey: result.core.fingerprint.hash,
    featureCacheKey: result.cacheKey,
    interpretationCatalogVersion: catalog.catalogVersion,
  };
  return { result, plan: buildNarrationPlan(source, F03_PLAN_SPEC, nodeSha256Adapter) };
}

describe("persona-independent narration plan", () => {
  it("composes chart, observation and limitations beats from verified findings only", () => {
    const { result, plan } = planFor(featureRequest("F03"));
    expect(NarrationPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.beats.map((beat) => beat.beatId)).toEqual(["chart", "observation", "limitations"]);
    expect(plan.chart?.dayMaster).toEqual({ stem: "갑", element: "목" });
    const observation = plan.beats.find((beat) => beat.role === "observation")!;
    expect(observation.evidence.map((entry) => entry.refId)).toEqual(
      result.judgments
        .filter((j) => j.precision === "confirmed" && j.disposition === "accepted")
        .map((j) => j.judgmentId),
    );
    expect(
      observation.evidence.every((entry) => entry.kind === "fact" && entry.source === null),
    ).toBe(true);
    const aliases = plan.beats.flatMap((beat) => beat.evidence.map((entry) => entry.alias));
    expect(aliases).toEqual(aliases.map((_, index) => `E${index + 1}`));
    expect(plan.limitations.some((line) => line.includes("승인된 한국어 요약이 아직 없어"))).toBe(
      true,
    );
    expect(plan.provenance).toMatchObject({
      analysisKey: result.core.fingerprint.hash,
      featureCacheKey: result.cacheKey,
      usableInterpretations: 0,
    });
    expect(plan.provenance.matchedInterpretations).toBeGreaterThan(0);
    expect(JSON.stringify(plan)).not.toMatch(/2024-02-10|05:30|birthDate/);
  });
  it("adds an interpretation beat only when a summarized, entailed passage exists", () => {
    const { plan } = planFor(featureRequest("F03"), summarized);
    const interpretation = plan.beats.find((beat) => beat.role === "interpretation");
    expect(interpretation?.evidence).toHaveLength(1);
    expect(interpretation?.evidence[0]).toMatchObject({
      kind: "interpretation",
      source: "궁통보감 · 正月甲木",
      refId: "iu.qtbj.gap-in",
    });
    expect(plan.provenance.usableInterpretations).toBe(1);
    expect(plan.limitations.some((line) => line.includes("감수를 받지 않았다"))).toBe(true);
    expect(plan.planKey).not.toBe(planFor(featureRequest("F03")).plan.planKey);
  });
  it("keeps unknown hour explicit and reduces unavailable charts to a limitations beat", () => {
    const request = featureRequest("F03");
    const unknown = planFor({
      ...request,
      birthInput: { ...request.birthInput, birthTime: { status: "unknown" } },
    }).plan;
    expect(unknown.chart?.unknownPositions).toEqual(["시주"]);
    expect(
      unknown.beats[0].evidence.some((entry) => entry.text.includes("시주는 출생 정보가 미상")),
    ).toBe(true);
    const unavailable = planFor({
      ...request,
      calculationPolicy: { ...request.calculationPolicy, solarTime: "true-solar" },
      birthInput: { ...request.birthInput, longitudeDeg: null },
    }).plan;
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.chart).toBeNull();
    expect(unavailable.beats.map((beat) => beat.role)).toEqual(["limitations"]);
    expect(unavailable.limitations[0]).toContain("원국을 계산할 수 없어");
  });
  it("is deterministic and rejects a spec for another feature or a tampered plan", () => {
    const first = planFor(featureRequest("F03")).plan;
    expect(planFor(featureRequest("F03")).plan).toEqual(first);
    const result = executeFeature(featureRequest("F03"), featureDependencies);
    const source: NarrationPlanInput = {
      input: buildFeatureNarrationInput(result),
      facts: result.core.document.facts,
      interpretations: [],
      analysisKey: result.core.fingerprint.hash,
      featureCacheKey: result.cacheKey,
      interpretationCatalogVersion: "1.0.0",
    };
    expect(() =>
      buildNarrationPlan(source, { ...F03_PLAN_SPEC, featureId: "F02" }, nodeSha256Adapter),
    ).toThrow();
    expect(() =>
      buildNarrationPlan(
        source,
        {
          ...F03_PLAN_SPEC,
          beats: F03_PLAN_SPEC.beats.filter((beat) => beat.role !== "limitations"),
        },
        nodeSha256Adapter,
      ),
    ).toThrow();
    expect(
      NarrationPlanSchema.safeParse({
        ...first,
        beats: [...first.beats, { ...first.beats[0], beatId: "dup-alias" }],
      }).success,
    ).toBe(false);
  });
});
