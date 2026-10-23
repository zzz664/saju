import { describe, expect, it } from "vitest";
import { executeFeature, buildFeatureNarrationInput } from "@/application/saju/features";
import { featureDependencies, featureRequest } from "./helpers/feature-input";
import { observeStrengths } from "@/domain/features/strengths";
import { topicContext, topicPillars, uniformChart } from "./helpers/topic-context";
import { calculateCoreExport } from "@/application/core-export";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { fingerprintInput } from "./helpers/fingerprint-input";

describe("F03 production strengths executor", () => {
  it("registers F03 and emits traceable observations without promoting M03 candidates", () => {
    const result = executeFeature(featureRequest("F03"), featureDependencies);
    expect(result.components[0].implementation).toBe("registered");
    expect(result.limitations).not.toContain("EXECUTOR_NOT_IMPLEMENTED");
    const data = buildFeatureNarrationInput(result);
    expect(data.verifiedFindings.length).toBeGreaterThan(0);
    expect(data.verifiedFindings.every((j) => j.ruleId.startsWith("f03.observation."))).toBe(true);
  });
  it("keeps surface/hidden units distinct with independently enumerated counts and both composite patterns", () => {
    const facts = topicContext().facts;
    const result = observeStrengths(facts);
    expect(result.map((j) => j.ruleId)).toEqual([
      "f03.observation.elements-surface",
      "f03.observation.elements-hidden",
      "f03.observation.resource-output",
      "f03.observation.authority-resource",
    ]);
    expect(result[0].evidence.map((e) => e.value)).toEqual(["2", "1", "1", "2", "2"]);
    expect(result[1].evidence.map((e) => e.value)).toEqual(["2", "1", "3", "1", "3"]);
    expect(result[2].evidence).toEqual(
      expect.arrayContaining([
        { inputPath: "facts.positions.year.stem.tenGod", value: "편인" },
        { inputPath: "facts.positions.month.stem.tenGod", value: "식신" },
      ]),
    );
    for (const judgment of result) {
      for (const evidence of judgment.evidence) {
        const actual = evidence.inputPath
          .split(".")
          .slice(1)
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], facts);
        expect(String(actual)).toBe(evidence.value);
      }
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.set(result[0], "assertion", "invented")).toBe(false);
  });
  it("does not infer strengths or deficits from a single family, many symbols, or absent elements", () => {
    const result = observeStrengths(topicContext(uniformChart("갑", "인", "인")).facts);
    expect(result).toHaveLength(2);
    expect(result.every((j) => j.ruleId.includes("elements-"))).toBe(true);
    expect(result[0].evidence.some((e) => e.value === "0")).toBe(true);
    expect(result.map((j) => j.assertion).join(" ")).not.toMatch(
      /당신은|부족하다|능력이 없다|신강하다|신약하다/,
    );
  });
  it("never invents an unknown hour or a missing day/month, and rejects altered facts", () => {
    const context = topicContext({ ...topicPillars, hour: null });
    const result = observeStrengths(context.facts);
    expect(result.flatMap((j) => j.evidence).some((e) => e.inputPath.includes("hour"))).toBe(false);
    expect(result.every((j) => j.exceptionsApplied.includes("MISSING_PILLARS"))).toBe(true);
    expect(observeStrengths(topicContext({ ...topicPillars, day: null }).facts)).toEqual([]);
    expect(observeStrengths(topicContext({ ...topicPillars, month: null }).facts)).toEqual([]);
    expect(() =>
      observeStrengths({
        ...context.facts,
        distribution: {
          ...context.facts.distribution,
          surface: { ...context.facts.distribution.surface, 목: 12 },
        },
      }),
    ).toThrow();
  });
  it("keeps the original core hash and candidate dispositions while selecting F03 only", () => {
    const request = featureRequest("F03"),
      result = executeFeature(request, featureDependencies);
    expect(result.core).toEqual(
      fingerprintCoreExport(
        calculateCoreExport(fingerprintInput, featureDependencies),
        featureDependencies.hash,
      ),
    );
    expect(result.status).toBe("partial");
    expect(result.modules.find((m) => m.moduleId === "M03")?.topic).toBe("strengths");
    expect(
      result.judgments.some((j) => j.ruleId.startsWith("m03.") && j.precision === "partial"),
    ).toBe(true);
    expect(
      buildFeatureNarrationInput(result).verifiedFindings.every(
        (j) => j.precision === "confirmed" && !j.ruleId.startsWith("m03."),
      ),
    ).toBe(true);
    expect(executeFeature(request, featureDependencies).cacheKey).toBe(result.cacheKey);
    expect(JSON.stringify(result)).not.toContain(request.birthInput.birthDate);
    expect(executeFeature(featureRequest("F04"), featureDependencies).limitations).toContain(
      "EXECUTOR_NOT_IMPLEMENTED",
    );
  });
  it("preserves partial unknown-time and unavailable calculation states", () => {
    const request = featureRequest("F03");
    const unknown = executeFeature(
      { ...request, birthInput: { ...request.birthInput, birthTime: { status: "unknown" } } },
      featureDependencies,
    );
    expect(unknown.status).toBe("partial");
    expect(unknown.core.document.facts?.positions.hour).toBeNull();
    const unavailable = executeFeature(
      {
        ...request,
        calculationPolicy: { ...request.calculationPolicy, solarTime: "true-solar" },
        birthInput: { ...request.birthInput, longitudeDeg: null },
      },
      featureDependencies,
    );
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.judgments).toEqual([]);
    expect(buildFeatureNarrationInput(unavailable).verifiedFindings).toEqual([]);
  });
});
