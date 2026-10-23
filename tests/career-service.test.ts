import { describe, expect, it, vi } from "vitest";
import {
  executeFeature,
  buildFeatureNarrationInput,
  getProfile,
} from "@/application/saju/features";
import { calculateCoreExport } from "@/application/core-export";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { FeatureResultSchema, FeatureNarrationInputSchema } from "@/schemas/features";
import { featureDependencies as deps, featureRequest } from "./helpers/feature-input";
import { fingerprintInput } from "./helpers/fingerprint-input";

describe("F04 orchestration and JSON boundaries", () => {
  it("keeps the original core, computes once and routes career only with actual versions", () => {
    const calculate = vi.fn(deps.pillars.calculate),
      result = executeFeature(featureRequest("F04"), { ...deps, pillars: { calculate } });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(result.core).toEqual(
      fingerprintCoreExport(calculateCoreExport(fingerprintInput, deps), deps.hash),
    );
    expect(result.modules.map((m) => [m.moduleId, m.topic])).toEqual([
      ["M01", null],
      ["M02", null],
      ["M03", "career"],
    ]);
    expect(result.modules[2].version).toBe("1.1.0");
    expect(getProfile("F04").version).toBe("1.1.0");
    expect(result.components[0]).toMatchObject({
      implementation: "registered",
      executorVersion: "1.0.0",
      status: "partial",
    });
    expect(result.judgments.every((j) => j.topic === "career")).toBe(true);
    expect(FeatureResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(executeFeature(featureRequest("F04"), deps).cacheKey).toBe(result.cacheKey);
    expect(executeFeature(featureRequest("F03"), deps).cacheKey).not.toBe(result.cacheKey);
    expect(JSON.stringify(result)).not.toContain(fingerprintInput.birthInput.birthDate);
  });
  it("does not promote method-conflicted and deferred career candidates to confirmed aptitude", () => {
    const result = executeFeature(
      {
        ...featureRequest("F04"),
        birthInput: {
          ...fingerprintInput.birthInput,
          birthDate: "2024-04-04",
          birthTime: { status: "known", time: "17:30" },
        },
      },
      deps,
    );
    const guard = result.judgments.find((j) => j.ruleId === "m03.career.context-review")!;
    expect(guard).toMatchObject({ disposition: "review-required", precision: "partial" });
    expect(guard.evidence.some((e) => e.inputPath.startsWith("structure"))).toBe(true);
    const candidates = result.judgments.filter(
      (j) => j.ruleId.startsWith("m03.career.") && j !== guard,
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((j) => j.disposition === "deferred" && j.status === "partial")).toBe(
      true,
    );
    const conflicting = result.modules[0].judgments.filter((j) => j.ruleId === "m01.season");
    expect(conflicting).toHaveLength(2);
    expect(conflicting.every((j) => j.disposition === "deferred")).toBe(true);
    expect(result.status).toBe("partial");
    expect(
      buildFeatureNarrationInput(result).verifiedFindings.every((j) =>
        j.ruleId.startsWith("f04.observation."),
      ),
    ).toBe(true);
    expect(FeatureResultSchema.safeParse({ ...result, status: "complete" }).success).toBe(false);
  });
  it.each(["midnight", "zi-start"] as const)(
    "preserves unknown time under %s without inventing evidence",
    (dayBoundary) => {
      const result = executeFeature(
        {
          ...featureRequest("F04"),
          calculationPolicy: { ...fingerprintInput.calculationPolicy, dayBoundary },
          birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
        },
        deps,
      );
      expect(result.status).not.toBe("complete");
      expect(result.core.document.facts?.positions.hour ?? null).toBeNull();
      const data = buildFeatureNarrationInput(result);
      expect(
        data.verifiedFindings.flatMap((j) => j.evidence).some((e) => e.inputPath.includes("hour")),
      ).toBe(false);
      if (!result.core.document.facts?.dayMaster) expect(data.verifiedFindings).toEqual([]);
    },
  );
  it("keeps unavailable results empty and returns sanitized errors for failing adapters", () => {
    const result = executeFeature(
      {
        ...featureRequest("F04"),
        calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
      deps,
    );
    expect(result.status).toBe("unavailable");
    expect(result.limitations).toContain("CORE_UNAVAILABLE");
    expect(result.judgments).toEqual([]);
    expect(buildFeatureNarrationInput(result).verifiedFindings).toEqual([]);
    expect(() =>
      executeFeature(featureRequest("F04"), {
        ...deps,
        symbols: {
          load: () => {
            throw new Error("synthetic-private");
          },
        },
      }),
    ).toThrow("Feature execution failed.");
  });
  it("does not gender occupations and does not activate the future wealth feature", () => {
    const results = ["male", "female", "unspecified"].map((directionBasis) =>
      executeFeature(
        {
          ...featureRequest("F04"),
          birthInput: { ...fingerprintInput.birthInput, directionBasis },
        },
        deps,
      ),
    );
    expect(results[0].judgments).toEqual(results[1].judgments);
    expect(results[1].judgments).toEqual(results[2].judgments);
    expect(executeFeature(featureRequest("F05"), deps).limitations).toContain(
      "EXECUTOR_NOT_IMPLEMENTED",
    );
  });
  it("shares the career result in F01 with one core and retains missing children", () => {
    const calculate = vi.fn(deps.pillars.calculate),
      result = executeFeature(featureRequest("F01"), { ...deps, pillars: { calculate } });
    expect(calculate).toHaveBeenCalledTimes(1);
    const standalone = executeFeature(featureRequest("F04"), deps),
      child = result.components.find((c) => c.featureId === "F04")!;
    expect(child.judgmentIds).toEqual(standalone.judgments.map((j) => j.judgmentId));
    expect(result.judgments.filter((j) => child.judgmentIds.includes(j.judgmentId))).toEqual(
      standalone.judgments,
    );
    expect(result.modules.filter((m) => m.moduleId === "M01")).toHaveLength(1);
    expect(result.modules.filter((m) => m.moduleId === "M02")).toHaveLength(1);
    expect(result.status).toBe("partial");
    expect(result.limitations).toContain("SUBFEATURE_INCOMPLETE");
  });
  it("exports only immutable confirmed observations to a Mock consumer and rejects external JSON/score fields", () => {
    const result = executeFeature(featureRequest("F04"), deps),
      before = JSON.stringify(result);
    const consume = vi.fn((value: unknown) => {
      const data = FeatureNarrationInputSchema.parse(value);
      expect(Reflect.set(data.verifiedFindings[0], "assertion", "guaranteed job")).toBe(false);
      return data.verifiedFindings.map((j) => ({
        evidenceId: j.judgmentId,
        paragraph: j.assertion,
      }));
    });
    const output = consume(buildFeatureNarrationInput(result));
    expect(output.length).toBeGreaterThan(0);
    expect(output.every((j) => j.evidenceId.includes(":f04:"))).toBe(true);
    expect(JSON.stringify(result)).toBe(before);
    expect(() => buildFeatureNarrationInput(JSON.parse(before))).toThrow();
    expect(FeatureResultSchema.safeParse({ ...result, aptitudeScore: 100 }).success).toBe(false);
  });
});
