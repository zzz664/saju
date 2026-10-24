import { describe, expect, it } from "vitest";
import { buildFeatureNarrationInput, executeFeature } from "@/application/saju/features";
import { matchInterpretations } from "@/domain/interpretation";
import {
  buildNarrationPlan,
  F02_PLAN_SPEC,
  F03_PLAN_SPEC,
  F04_PLAN_SPEC,
  NarrationPlanSchema,
  type NarrationPlanInput,
} from "@/domain/narration/plan";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { featureDependencies, featureRequest } from "./helpers/feature-input";
import { CAREER_PREDICTION_PATTERN } from "./helpers/career-predictions";

import {
  summarizedCatalog as summarized,
  unsummarizedCatalog as scaffold,
  emptyCatalog,
} from "./helpers/narration-catalog";

const specs = { F02: F02_PLAN_SPEC, F03: F03_PLAN_SPEC, F04: F04_PLAN_SPEC };
const topics = { F02: "temperament", F03: "strengths", F04: "career" } as const;
function planFor(request: unknown, catalog = scaffold, featureId: keyof typeof specs = "F03") {
  const result = executeFeature(request, featureDependencies);
  const input = buildFeatureNarrationInput(result);
  const facts = result.core.document.facts;
  const source: NarrationPlanInput = {
    input,
    facts,
    interpretations: facts
      ? matchInterpretations(facts, catalog, {
          topics: [topics[featureId]],
        })
      : [],
    analysisKey: result.core.fingerprint.hash,
    featureCacheKey: result.cacheKey,
    interpretationCatalogVersion: catalog.catalogVersion,
  };
  return {
    result,
    plan: buildNarrationPlan(source, specs[featureId], nodeSha256Adapter),
  };
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

describe("F02 temperament narration plan", () => {
  it.each([
    ["summarized", summarized],
    ["empty", emptyCatalog],
  ] as const)(
    "builds deterministic known/unknown/unavailable plans with %s catalog",
    (_, catalog) => {
      const request = featureRequest("F02");
      const requests = [
        request,
        {
          ...request,
          birthInput: { ...request.birthInput, birthTime: { status: "unknown" } },
        },
        {
          ...request,
          calculationPolicy: { ...request.calculationPolicy, solarTime: "true-solar" },
          birthInput: { ...request.birthInput, longitudeDeg: null },
        },
      ];
      for (const [index, input] of requests.entries()) {
        const { result, plan } = planFor(input, catalog, "F02");
        expect(plan.featureId).toBe("F02");
        expect(plan.specId).toBe("f02-temperament-plan");
        expect(plan.status).toBe(index === 2 ? "unavailable" : "partial");
        expect(planFor(input, catalog, "F02").plan.planKey).toBe(plan.planKey);
        expect(plan.beats.filter((beat) => beat.role === "limitations")).toHaveLength(1);
        const aliases = plan.beats.flatMap((beat) => beat.evidence.map((entry) => entry.alias));
        expect(aliases).toEqual(aliases.map((_, i) => `E${i + 1}`));
        if (index === 2) {
          expect(plan.chart).toBeNull();
          expect(plan.beats.map((beat) => beat.role)).toEqual(["limitations"]);
          continue;
        }
        expect(plan.chart?.unknownPositions).toEqual(index === 1 ? ["시주"] : []);
        if (index === 1)
          expect(plan.limitations.some((line) => line.includes("시주 정보가 없어"))).toBe(true);
        expect(plan.beats.map((beat) => beat.role)).toEqual(
          catalog === summarized
            ? ["chart", "observation", "interpretation", "limitations"]
            : ["chart", "observation", "limitations"],
        );
        expect(
          plan.beats.find((beat) => beat.role === "observation")?.evidence.map((e) => e.refId),
        ).toEqual(
          result.judgments
            .filter((j) => j.precision === "confirmed" && j.disposition === "accepted")
            .map((j) => j.judgmentId),
        );
        expect(plan.provenance.usableInterpretations).toBe(catalog === summarized ? 1 : 0);
        if (catalog === emptyCatalog) {
          expect(plan.provenance.matchedInterpretations).toBe(0);
          expect(plan.limitations.some((line) => line.includes("카탈로그에 없다"))).toBe(true);
        }
      }
    },
  );
});

describe("F04 career narration plan", () => {
  it("defines ordered beats with one limitations beat and an explicit non-prediction boundary", () => {
    expect(F04_PLAN_SPEC.beats.map((beat) => beat.role)).toEqual([
      "chart",
      "observation",
      "interpretation",
      "limitations",
    ]);
    expect(F04_PLAN_SPEC.beats.filter((beat) => beat.role === "limitations")).toHaveLength(1);
    expect(F04_PLAN_SPEC.beats.map((beat) => beat.guidance).join(" ")).toContain(
      "직업·직장·수입을 예측하거나 특정 직업을 권하지 않는다, 관측된 성향만 서술한다",
    );
  });
  for (const [name, catalog] of [
    ["summarized", summarized],
    ["empty", emptyCatalog],
  ] as const) {
    it.each(["known", "unknown", "unavailable"])(
      `builds a deterministic %s plan with ${name} catalog`,
      (scenario) => {
        const request = featureRequest("F04");
        const input =
          scenario === "known"
            ? request
            : scenario === "unknown"
              ? {
                  ...request,
                  birthInput: { ...request.birthInput, birthTime: { status: "unknown" } },
                }
              : {
                  ...request,
                  calculationPolicy: { ...request.calculationPolicy, solarTime: "true-solar" },
                  birthInput: { ...request.birthInput, longitudeDeg: null },
                };
        const { result, plan } = planFor(input, catalog, "F04");
        expect(plan.specId).toBe("f04-career-plan");
        expect(plan.featureId).toBe("F04");
        expect(plan.status).toBe(scenario === "unavailable" ? "unavailable" : "partial");
        expect(planFor(input, catalog, "F04").plan.planKey).toBe(plan.planKey);
        const aliases = plan.beats.flatMap((beat) => beat.evidence.map((entry) => entry.alias));
        expect(aliases).toEqual(aliases.map((_, index) => `E${index + 1}`));
        expect(plan.beats.filter((beat) => beat.role === "limitations")).toHaveLength(1);
        expect(JSON.stringify(plan)).not.toMatch(CAREER_PREDICTION_PATTERN);
        if (scenario === "unavailable") {
          expect(plan.chart).toBeNull();
          expect(plan.beats.map((beat) => beat.role)).toEqual(["limitations"]);
          expect(plan.provenance.usableInterpretations).toBe(0);
          return;
        }
        expect(plan.chart?.unknownPositions).toEqual(scenario === "unknown" ? ["시주"] : []);
        if (scenario === "unknown")
          expect(plan.limitations.some((line) => line.includes("시주 정보가 없어"))).toBe(true);
        expect(plan.beats.map((beat) => beat.role)).toEqual(
          catalog === summarized
            ? ["chart", "observation", "interpretation", "limitations"]
            : ["chart", "observation", "limitations"],
        );
        expect(
          plan.beats
            .find((beat) => beat.role === "observation")
            ?.evidence.map((entry) => entry.refId),
        ).toEqual(
          result.judgments
            .filter(
              (judgment) =>
                judgment.precision === "confirmed" && judgment.disposition === "accepted",
            )
            .map((judgment) => judgment.judgmentId),
        );
        expect(plan.provenance.usableInterpretations).toBe(catalog === summarized ? 1 : 0);
        if (catalog === emptyCatalog)
          expect(plan.limitations.some((line) => line.includes("카탈로그에 없다"))).toBe(true);
        else
          expect(plan.limitations.some((line) => line.includes("감수를 받지 않았다"))).toBe(true);
      },
    );
  }
});
