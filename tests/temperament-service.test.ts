import { describe, expect, it, vi } from "vitest";
import {
  executeFeature,
  buildFeatureNarrationInput,
  getProfile,
} from "@/application/saju/features";
import { calculateCoreExport } from "@/application/core-export";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { diagnoseStructure } from "@/domain/judgment/structure";
import { FeatureResultSchema, FeatureNarrationInputSchema } from "@/schemas/features";
import { featureDependencies as deps, featureRequest } from "./helpers/feature-input";
import { fingerprintInput } from "./helpers/fingerprint-input";

describe("F02 service, uncertainty and Mock narration boundaries", () => {
  it("retains the core hash, uses temperament only and records deterministic actual versions", () => {
    const request = featureRequest("F02"),
      calculate = vi.fn(deps.pillars.calculate);
    const result = executeFeature(request, { ...deps, pillars: { calculate } });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(result.core).toEqual(
      fingerprintCoreExport(calculateCoreExport(fingerprintInput, deps), deps.hash),
    );
    expect(result.modules.map((m) => [m.moduleId, m.topic])).toEqual([
      ["M01", null],
      ["M02", null],
      ["M03", "temperament"],
    ]);
    expect(result.modules[2].version).toBe("1.1.0");
    expect(getProfile("F02").version).toBe("1.1.0");
    expect(result.components[0]).toMatchObject({
      implementation: "registered",
      executorVersion: "1.0.0",
      status: "partial",
    });
    expect(FeatureResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(executeFeature(request, deps).cacheKey).toBe(result.cacheKey);
    expect(executeFeature(featureRequest("F03"), deps).cacheKey).not.toBe(result.cacheKey);
    expect(JSON.stringify(result)).not.toContain(request.birthInput.birthDate);
  });
  it("preserves method conflicts and deferred M03 candidates rather than choosing a personality", () => {
    const result = executeFeature(
      {
        ...featureRequest("F02"),
        birthInput: {
          ...fingerprintInput.birthInput,
          birthDate: "2024-04-04",
          birthTime: { status: "known", time: "17:30" },
        },
      },
      deps,
    );
    const structure = diagnoseStructure(result.core.document.facts!);
    expect(structure.conflicts.some((c) => c.topic === "season")).toBe(true);
    const guarded = result.judgments.find((j) => j.ruleId === "m03.temperament.context-review")!;
    expect(guarded).toMatchObject({ precision: "partial", disposition: "review-required" });
    expect(guarded.evidence.some((e) => e.inputPath.startsWith("structure"))).toBe(true);
    const candidates = result.judgments.filter(
      (j) => j.ruleId.startsWith("m03.temperament.") && j !== guarded,
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((j) => j.disposition === "deferred" && j.precision === "partial")).toBe(
      true,
    );
    const methodObservations = result.modules
      .find((m) => m.moduleId === "M01")!
      .judgments.filter((j) => j.ruleId === "m01.season");
    expect(methodObservations).toHaveLength(2);
    expect(methodObservations.every((j) => j.disposition === "deferred")).toBe(true);
    expect(
      buildFeatureNarrationInput(result).verifiedFindings.every((j) =>
        j.ruleId.startsWith("f02.observation."),
      ),
    ).toBe(true);
    expect(result.status).toBe("partial");
  });
  it.each(["midnight", "zi-start"] as const)(
    "never fabricates unknown-time anchors under %s",
    (dayBoundary) => {
      const result = executeFeature(
        {
          ...featureRequest("F02"),
          calculationPolicy: { ...fingerprintInput.calculationPolicy, dayBoundary },
          birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
        },
        deps,
      );
      expect(result.status).not.toBe("complete");
      expect(result.core.document.facts?.positions.hour ?? null).toBeNull();
      const projection = buildFeatureNarrationInput(result);
      expect(
        projection.verifiedFindings
          .flatMap((j) => j.evidence)
          .some((e) => e.inputPath.includes("hour")),
      ).toBe(false);
      if (!result.core.document.facts?.dayMaster) expect(projection.verifiedFindings).toEqual([]);
      expect(FeatureResultSchema.safeParse({ ...result, status: "complete" }).success).toBe(false);
    },
  );
  it("keeps explicit calculation-unavailable results empty and sanitizes adapter exceptions", () => {
    const result = executeFeature(
      {
        ...featureRequest("F02"),
        calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
      deps,
    );
    expect(result.status).toBe("unavailable");
    expect(result.limitations).toContain("CORE_UNAVAILABLE");
    expect(result.judgments).toEqual([]);
    expect(buildFeatureNarrationInput(result).verifiedFindings).toEqual([]);
    expect(() =>
      executeFeature(featureRequest("F02"), {
        ...deps,
        symbols: {
          load: () => {
            throw new Error("synthetic-private");
          },
        },
      }),
    ).toThrow("Feature execution failed.");
  });
  it("does not vary temperament judgments by the direction-basis sex input", () => {
    const judgments = ["male", "female", "unspecified"].map(
      (directionBasis) =>
        executeFeature(
          {
            ...featureRequest("F02"),
            birthInput: { ...fingerprintInput.birthInput, directionBasis },
          },
          deps,
        ).judgments,
    );
    expect(judgments[0]).toEqual(judgments[1]);
    expect(judgments[1]).toEqual(judgments[2]);
  });
  it("shares F02 and F03 inside F01 while preserving partial aggregate state", () => {
    const calculate = vi.fn(deps.pillars.calculate),
      aggregate = executeFeature(featureRequest("F01"), { ...deps, pillars: { calculate } });
    expect(calculate).toHaveBeenCalledTimes(1);
    const standalone = executeFeature(featureRequest("F02"), deps);
    const child = aggregate.components.find((c) => c.featureId === "F02")!;
    expect(child.judgmentIds).toEqual(standalone.judgments.map((j) => j.judgmentId));
    expect(aggregate.judgments.filter((j) => child.judgmentIds.includes(j.judgmentId))).toEqual(
      standalone.judgments,
    );
    expect(aggregate.modules.filter((m) => m.moduleId === "M01")).toHaveLength(1);
    expect(aggregate.modules.filter((m) => m.moduleId === "M02")).toHaveLength(1);
    expect(new Set(aggregate.modules.map((m) => `${m.moduleId}:${m.topic}`)).size).toBe(
      aggregate.modules.length,
    );
    expect(aggregate.status).toBe("partial");
    expect(aggregate.limitations).toContain("SUBFEATURE_INCOMPLETE");
    expect(executeFeature(featureRequest("F05"), deps).limitations).toContain(
      "EXECUTOR_NOT_IMPLEMENTED",
    );
  });
  it("passes only immutable observed evidence to a Mock consumer and rejects a JSON clone", () => {
    const result = executeFeature(featureRequest("F02"), deps),
      before = JSON.stringify(result);
    const consume = vi.fn((value: unknown) => {
      const data = FeatureNarrationInputSchema.parse(value);
      expect(Reflect.set(data.verifiedFindings[0], "assertion", "invented")).toBe(false);
      return data.verifiedFindings.map((j) => ({
        evidenceId: j.judgmentId,
        paragraph: j.assertion,
      }));
    });
    const output = consume(buildFeatureNarrationInput(result));
    expect(output.length).toBeGreaterThan(0);
    expect(output.every((item) => item.evidenceId.includes(":f02:"))).toBe(true);
    expect(output.map((item) => item.paragraph).join(" ")).not.toContain("검토 후보다");
    expect(JSON.stringify(result)).toBe(before);
    expect(() => buildFeatureNarrationInput(JSON.parse(before))).toThrow();
  });
});
