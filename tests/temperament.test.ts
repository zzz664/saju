import { describe, expect, it } from "vitest";
import { executeFeature, buildFeatureNarrationInput } from "@/application/saju/features";
import { featureDependencies, featureRequest } from "./helpers/feature-input";
import { observeTemperament } from "@/domain/features/temperament";
import { topicContext, topicPillars, uniformChart } from "./helpers/topic-context";

describe("F02 temperament executor", () => {
  it("registers F02 and separates observed facts from tentative temperament findings", () => {
    const result = executeFeature(featureRequest("F02"), featureDependencies);
    expect(result.components[0].implementation).toBe("registered");
    expect(result.limitations).not.toContain("EXECUTOR_NOT_IMPLEMENTED");
    expect(result.status).toBe("partial");
    const data = buildFeatureNarrationInput(result);
    expect(data.verifiedFindings.length).toBeGreaterThan(0);
    expect(data.verifiedFindings.every((j) => j.ruleId.startsWith("f02.observation."))).toBe(true);
  });
  it("records independently specified day/month anchors and both adopted family pairs", () => {
    const facts = topicContext().facts,
      result = observeTemperament(facts);
    expect(result.map((j) => j.ruleId)).toEqual([
      "f02.observation.natal-context",
      "f02.observation.resource-output",
      "f02.observation.peer-authority",
    ]);
    expect(result[0].evidence).toEqual([
      { inputPath: "facts.dayMaster", value: "갑" },
      { inputPath: "facts.positions.day.stem.element", value: "목" },
      { inputPath: "facts.positions.month.branch.branch", value: "인" },
      { inputPath: "facts.positions.month.branch.mainStem", value: "갑" },
      { inputPath: "facts.positions.month.branch.tenGod", value: "비견" },
    ]);
    expect(result[1].evidence.slice(0, 2)).toEqual([
      { inputPath: "facts.positions.year.stem.tenGod", value: "편인" },
      { inputPath: "facts.positions.month.stem.tenGod", value: "식신" },
    ]);
    expect(result[2].evidence.slice(0, 2)).toEqual([
      { inputPath: "facts.positions.month.branch.hiddenStems.0.tenGod", value: "비견" },
      { inputPath: "facts.positions.hour.stem.tenGod", value: "편관" },
    ]);
    for (const finding of result)
      for (const evidence of finding.evidence) {
        const actual = evidence.inputPath
          .split(".")
          .slice(1)
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], facts);
        expect(String(actual)).toBe(evidence.value);
      }
  });
  it("does not fabricate the second family or treat many identical elements as a temperament", () => {
    const result = observeTemperament(topicContext(uniformChart("갑", "인", "인")).facts);
    expect(result.map((j) => j.ruleId)).toEqual(["f02.observation.natal-context"]);
    expect(result[0].assertion).not.toMatch(/외향적이다|내향적이다|고집이 세다|성격이 강하다/);
    const resourceOnly = observeTemperament(topicContext(uniformChart("임", "자")).facts);
    expect(resourceOnly).toHaveLength(1);
  });
  it("removes only hour-dependent pairs when the hour is unknown and records the missing scope", () => {
    const result = observeTemperament(topicContext({ ...topicPillars, hour: null }).facts);
    expect(result.map((j) => j.ruleId)).toEqual([
      "f02.observation.natal-context",
      "f02.observation.resource-output",
    ]);
    expect(result.every((j) => j.exceptionsApplied.includes("MISSING_PILLARS"))).toBe(true);
    expect(result.flatMap((j) => j.evidence).some((e) => e.inputPath.includes("hour"))).toBe(false);
  });
  it.each(["day", "month"] as const)("cannot infer a missing %s anchor", (position) => {
    expect(observeTemperament(topicContext({ ...topicPillars, [position]: null }).facts)).toEqual(
      [],
    );
  });
  it("validates facts and deeply freezes emitted evidence and policy text", () => {
    const facts = topicContext().facts;
    expect(() => observeTemperament({ ...facts, dayMaster: "을" })).toThrow();
    expect(() => observeTemperament({ ...facts, gender: "female" })).toThrow();
    const result = observeTemperament(facts);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.set(result[0].evidence[0], "value", "invented")).toBe(false);
    expect(Reflect.set(result[0], "assertion", "invented")).toBe(false);
    expect(observeTemperament(JSON.parse(JSON.stringify(facts)))).toEqual(result);
    expect(
      observeTemperament(facts, "other").every(
        (j) => j.subject === "other" && j.judgmentId.startsWith("other:M03:f02:"),
      ),
    ).toBe(true);
  });
});
