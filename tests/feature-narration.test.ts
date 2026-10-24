import { describe, expect, it, vi } from "vitest";
import { narrateFeature, prepareFeatureNarration } from "@/application/narration/feature";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { ApiTestFeatureIdSchema } from "@/application/dev-api-test";
import { matchInterpretations } from "@/domain/interpretation";
import { summarizedCatalog, emptyCatalog } from "./helpers/narration-catalog";
import { CAREER_PREDICTION_PATTERN } from "./helpers/career-predictions";

const catalog = createApiTestCatalog();
const options = (persona = "synthetic-style") => ({
  ...catalog,
  selection: catalog.selection(persona),
});

describe("F02 temperament through the shared developer narration path", () => {
  const oneSummary = summarizedCatalog;
  const empty = emptyCatalog;

  it("registers F02 in the client-safe choices and selects only temperament catalog topics", () => {
    expect(ApiTestFeatureIdSchema.parse("F02")).toBe("F02");
    expect(catalog.features).toContainEqual({ id: "F02", label: "성격·기질 (F02)" });
    const source = catalog.source("synthetic-known", "F02");
    const prepared = prepareFeatureNarration(source, { ...options(), interpretation: oneSummary });
    const expected = matchInterpretations(source.core.document.facts!, oneSummary, {
      topics: ["temperament"],
    });
    expect(expected.some((entry) => entry.usable)).toBe(true);
    expect(prepared.plan.provenance.matchedInterpretations).toBe(expected.length);
    expect(
      prepared.plan.beats
        .find((beat) => beat.role === "interpretation")
        ?.evidence.map((e) => e.refId),
    ).toEqual(
      expected
        .filter((entry) => entry.usable)
        .slice(0, 12)
        .map((entry) => entry.unitId),
    );
    const differentTopicCatalog = {
      ...oneSummary,
      units: oneSummary.units.map((unit) => ({ ...unit, topics: ["strengths"] })),
    };
    const excluded = prepareFeatureNarration(source, {
      ...options(),
      interpretation: differentTopicCatalog,
    });
    expect(excluded.plan.provenance.matchedInterpretations).toBe(0);
    expect(excluded.plan.beats.some((beat) => beat.role === "interpretation")).toBe(false);
  });

  it.each(["synthetic-known", "synthetic-unknown", "synthetic-unavailable"])(
    "wires %s in both voices with a usable summary and with an empty catalog",
    async (fixture) => {
      const source = catalog.source(fixture, "F02");
      const before = JSON.stringify(source);
      for (const interpretation of [oneSummary, empty]) {
        let planKey: string | undefined;
        for (const persona of catalog.personas) {
          const settings = { ...options(persona.id), interpretation };
          const prepared = prepareFeatureNarration(source, settings);
          expect(prepareFeatureNarration(source, settings).plan.planKey).toBe(
            prepared.plan.planKey,
          );
          if (planKey) expect(prepared.plan.planKey).toBe(planKey);
          planKey = prepared.plan.planKey;
          const provider = createPlanMockProvider();
          const generate = vi.spyOn(provider, "generate");
          const result = await narrateFeature(source, provider, settings);
          expect(result.featureId).toBe("F02");
          expect(result.grounding.passed).toBe(true);
          expect(result.sourceStatus).toBe(
            fixture === "synthetic-unavailable" ? "unavailable" : "partial",
          );
          expect(result.plan.beats.filter((beat) => beat.role === "limitations")).toHaveLength(1);
          expect(result.plan.beats.some((beat) => beat.role === "interpretation")).toBe(
            interpretation === oneSummary && fixture !== "synthetic-unavailable",
          );
          const aliases = result.plan.beats.flatMap((beat) =>
            beat.evidence.map((entry) => entry.alias),
          );
          expect(aliases).toEqual(aliases.map((_, index) => `E${index + 1}`));
          if (fixture === "synthetic-unavailable")
            expect(result.beats.map((beat) => beat.role)).toEqual(["limitations"]);
          if (fixture === "synthetic-unknown")
            expect(result.plan.chart?.unknownPositions).toEqual(["시주"]);
          const messages = JSON.stringify(generate.mock.calls[0][0].messages);
          expect(messages).not.toMatch(
            /refId|planKey|provenance|judgmentId|unitId|birthDate|birthTime/,
          );
          const paragraphs = result.beats.flatMap((beat) => beat.paragraphs).join(" ");
          expect(paragraphs).not.toMatch(/\bE\d+\b|iu\.|src\.|primary:|m03:/);
          for (const beat of result.plan.beats)
            for (const entry of beat.evidence) expect(messages).not.toContain(entry.refId);
          expect(result.meta.providerKind).toBe("mock");
        }
      }
      expect(JSON.stringify(source)).toBe(before);
    },
  );
});

describe("F04 career through the shared developer narration path", () => {
  it("distinguishes career prediction examples from observed communication wording", () => {
    for (const example of [
      "의사로 일한다.",
      "변호사가 적합하다.",
      "공무원을 추천한다.",
      "2027년에 승진한다.",
      "연봉 5,000만원이다.",
    ])
      expect(example).toMatch(CAREER_PREDICTION_PATTERN);
    expect("산출물·의사표현을 일정·비용·자원 관리와 연결한다.").not.toMatch(
      CAREER_PREDICTION_PATTERN,
    );
  });
  it("registers F04 and restricts catalog lookup to career topics", () => {
    expect(ApiTestFeatureIdSchema.parse("F04")).toBe("F04");
    expect(catalog.features).toContainEqual({ id: "F04", label: "직업 적성·업무 성향 (F04)" });
    const source = catalog.source("synthetic-known", "F04");
    const context = prepareFeatureNarration(source, {
      ...options(),
      interpretation: summarizedCatalog,
    });
    const expected = matchInterpretations(source.core.document.facts!, summarizedCatalog, {
      topics: ["career"],
    });
    expect(context.plan.provenance.matchedInterpretations).toBe(expected.length);
    expect(
      context.plan.beats
        .find((beat) => beat.role === "interpretation")
        ?.evidence.map((entry) => entry.refId),
    ).toEqual(
      expected
        .filter((entry) => entry.usable)
        .slice(0, 12)
        .map((entry) => entry.unitId),
    );
    const otherTopic = {
      ...summarizedCatalog,
      units: summarizedCatalog.units.map((unit) => ({ ...unit, topics: ["strengths"] })),
    };
    const excluded = prepareFeatureNarration(source, { ...options(), interpretation: otherTopic });
    expect(excluded.plan.provenance.matchedInterpretations).toBe(0);
    expect(excluded.plan.beats.some((beat) => beat.role === "interpretation")).toBe(false);
  });
  for (const [name, interpretation] of [
    ["summarized", summarizedCatalog],
    ["empty", emptyCatalog],
  ] as const) {
    it.each(["synthetic-known", "synthetic-unknown", "synthetic-unavailable"])(
      `narrates %s with ${name} catalog in both voices without career predictions`,
      async (fixture) => {
        const source = catalog.source(fixture, "F04");
        const before = JSON.stringify(source);
        let planKey: string | undefined;
        for (const persona of catalog.personas) {
          const settings = { ...options(persona.id), interpretation };
          const prepared = prepareFeatureNarration(source, settings);
          expect(prepareFeatureNarration(source, settings).plan.planKey).toBe(
            prepared.plan.planKey,
          );
          expect(
            prepareFeatureNarration(source, { ...settings, model: "gpt-4.1-mini" }).plan.planKey,
          ).toBe(prepared.plan.planKey);
          if (planKey) expect(prepared.plan.planKey).toBe(planKey);
          planKey = prepared.plan.planKey;
          const provider = createPlanMockProvider();
          const generate = vi.spyOn(provider, "generate");
          const result = await narrateFeature(source, provider, settings);
          expect(result.featureId).toBe("F04");
          expect(result.sourceStatus).toBe(
            fixture === "synthetic-unavailable" ? "unavailable" : "partial",
          );
          expect(result.grounding.passed).toBe(true);
          expect(result.beats.map((beat) => beat.role)).toEqual(
            fixture === "synthetic-unavailable"
              ? ["limitations"]
              : interpretation === summarizedCatalog
                ? ["chart", "observation", "interpretation", "limitations"]
                : ["chart", "observation", "limitations"],
          );
          expect(result.plan.beats.filter((beat) => beat.role === "limitations")).toHaveLength(1);
          const aliases = result.plan.beats.flatMap((beat) =>
            beat.evidence.map((entry) => entry.alias),
          );
          expect(aliases).toEqual(aliases.map((_, index) => `E${index + 1}`));
          if (fixture === "synthetic-unknown") {
            expect(result.plan.chart?.unknownPositions).toEqual(["시주"]);
            expect(result.limitations.some((line) => line.includes("시주 정보가 없어"))).toBe(true);
          }
          const messages = JSON.stringify(generate.mock.calls[0][0].messages);
          expect(messages).not.toMatch(
            /refId|planKey|provenance|judgmentId|unitId|birthDate|birthTime|2024-02-10|05:30/,
          );
          for (const beat of result.plan.beats)
            for (const entry of beat.evidence) expect(messages).not.toContain(entry.refId);
          const prose = result.beats.flatMap((beat) => [beat.title, ...beat.paragraphs]).join(" ");
          expect(prose).not.toMatch(/\bE\d+\b|iu\.|src\.|primary:|m03:/);
          expect(JSON.stringify(result.plan)).not.toMatch(CAREER_PREDICTION_PATTERN);
          expect(prose).not.toMatch(CAREER_PREDICTION_PATTERN);
          expect(result.meta.providerKind).toBe("mock");
          expect(result.cache.analysisKey).toBe(source.core.fingerprint.hash);
          expect(result.cache.featureKey).toBe(source.cacheKey);
        }
        expect(JSON.stringify(source)).toBe(before);
      },
    );
  }
  it("rejects copied feature JSON before calling the provider", async () => {
    const provider = createPlanMockProvider();
    const generate = vi.spyOn(provider, "generate");
    await expect(
      narrateFeature(
        JSON.parse(JSON.stringify(catalog.source("synthetic-known", "F04"))),
        provider,
        { ...options(), interpretation: summarizedCatalog },
      ),
    ).rejects.toMatchObject({ code: "INPUT_REJECTED" });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("feature narration through the plan path", () => {
  it.each(["synthetic-known", "synthetic-unknown", "synthetic-unavailable"])(
    "narrates %s in both approved voices without network and with grounded beats",
    async (fixture) => {
      const source = catalog.source(fixture, "F03");
      for (const persona of catalog.personas) {
        const provider = createPlanMockProvider(),
          generate = vi.spyOn(provider, "generate");
        const result = await narrateFeature(source, provider, options(persona.id));
        expect(result.featureId).toBe("F03");
        expect(result.sourceStatus).toBe(
          fixture === "synthetic-unavailable" ? "unavailable" : "partial",
        );
        expect(result.grounding.passed).toBe(true);
        expect(result.beats.map((beat) => beat.beatId)).toEqual(
          result.plan.beats.map((beat) => beat.beatId),
        );
        if (fixture === "synthetic-unavailable")
          expect(result.beats.map((beat) => beat.role)).toEqual(["limitations"]);
        expect(result.styleEvaluation.issues.map((issue) => issue.code)).not.toContain(
          "REGISTER_MIX",
        );
        expect(result.meta).toMatchObject({
          personaId: persona.id,
          providerKind: "mock",
          contractVersion: "2.0.0",
          outputSchemaVersion: "2.0.0",
        });
        const request = generate.mock.calls[0][0];
        expect(JSON.stringify(request.messages)).not.toMatch(
          /birthDate|birthTime|2024-02-10|05:30|m03:strengths:context-review|primary:M03/,
        );
        expect(request.plan).toEqual(result.plan);
      }
    },
  );
  it("rejects external or altered feature JSON before any provider call", async () => {
    const provider = createPlanMockProvider(),
      generate = vi.spyOn(provider, "generate");
    const source = catalog.source("synthetic-known", "F03");
    await expect(
      narrateFeature(JSON.parse(JSON.stringify(source)), provider, options()),
    ).rejects.toMatchObject({ code: "INPUT_REJECTED" });
    await expect(narrateFeature({ ...source }, provider, options())).rejects.toMatchObject({
      code: "INPUT_REJECTED",
    });
    expect(() =>
      prepareFeatureNarration(source, { ...options(), selection: { personaId: "x" } }),
    ).toThrow();
    expect(() =>
      prepareFeatureNarration(source, { ...options(), interpretation: { bad: true } }),
    ).toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
  it("surfaces provider refusal, incompleteness and failure as sanitized codes", async () => {
    const source = catalog.source("synthetic-known", "F03");
    for (const [outcome, code] of [
      ["refused", "REFUSED"],
      ["incomplete", "INCOMPLETE"],
      ["failed", "PROVIDER_FAILED"],
    ] as const)
      await expect(
        narrateFeature(source, createPlanMockProvider({ outcome }), options()),
      ).rejects.toMatchObject({ code });
    const broken = {
      kind: "mock" as const,
      generate: async () => {
        throw new Error("private upstream detail");
      },
    };
    await expect(narrateFeature(source, broken, options())).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
      message: "Narration provider failed.",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      narrateFeature(source, createPlanMockProvider(), options(), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("keeps the calculated feature result and its hash untouched", async () => {
    const source = catalog.source("synthetic-known", "F03");
    const before = JSON.stringify(source);
    await narrateFeature(source, createPlanMockProvider(), options("synthetic-formal"));
    expect(JSON.stringify(source)).toBe(before);
    expect(catalog.source("synthetic-known", "F03")).toBe(source);
    const prepared = prepareFeatureNarration(source, options());
    expect(prepared.cache.analysisKey).toBe(source.core.fingerprint.hash);
    expect(prepared.cache.featureKey).toBe(source.cacheKey);
    expect(Object.isFrozen(prepared.plan)).toBe(true);
  });
});
