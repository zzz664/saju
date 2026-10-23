import { describe, expect, it } from "vitest";
import { executeFeature, buildFeatureNarrationInput } from "@/application/saju/features";
import { featureDependencies as deps, featureRequest } from "./helpers/feature-input";
import { observeCareer } from "@/domain/features/career";
import { topicContext, topicPillars, uniformChart } from "./helpers/topic-context";

describe("F04 career executor", () => {
  it("registers career and keeps observations separate from tentative aptitude interpretations", () => {
    const result = executeFeature(featureRequest("F04"), deps);
    expect(result.components[0].implementation).toBe("registered");
    expect(result.limitations).not.toContain("EXECUTOR_NOT_IMPLEMENTED");
    expect(result.status).toBe("partial");
    const data = buildFeatureNarrationInput(result);
    expect(data.verifiedFindings.length).toBeGreaterThan(0);
    expect(data.verifiedFindings.every((j) => j.ruleId.startsWith("f04.observation."))).toBe(true);
  });
  it("uses manually specified anchors and two different observed families per adopted work pattern", () => {
    const facts = topicContext().facts,
      result = observeCareer(facts);
    expect(result.map((j) => j.ruleId)).toEqual([
      "f04.observation.natal-context",
      "f04.observation.authority-resource",
      "f04.observation.output-wealth",
    ]);
    expect(result[0].evidence).toEqual([
      { inputPath: "facts.dayMaster", value: "갑" },
      { inputPath: "facts.positions.month.branch.branch", value: "인" },
      { inputPath: "facts.positions.month.branch.mainStem", value: "갑" },
      { inputPath: "facts.positions.month.branch.tenGod", value: "비견" },
    ]);
    expect(result[1].evidence.slice(0, 2)).toEqual([
      { inputPath: "facts.positions.hour.stem.tenGod", value: "편관" },
      { inputPath: "facts.positions.year.stem.tenGod", value: "편인" },
    ]);
    expect(result[2].evidence.slice(0, 2)).toEqual([
      { inputPath: "facts.positions.month.stem.tenGod", value: "식신" },
      { inputPath: "facts.positions.month.branch.hiddenStems.2.tenGod", value: "편재" },
    ]);
    for (const judgment of result)
      for (const evidence of judgment.evidence) {
        const actual = evidence.inputPath
          .split(".")
          .slice(1)
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], facts);
        expect(String(actual)).toBe(evidence.value);
      }
  });
  it.each([
    ["임", "자"],
    ["정", "묘"],
  ] as const)(
    "does not turn a single family or repeated %s/%s into an aptitude",
    (stem, branch) => {
      const result = observeCareer(topicContext(uniformChart(stem, branch)).facts);
      expect(result.map((j) => j.ruleId)).toEqual(["f04.observation.natal-context"]);
    },
  );
  it("excludes only the pattern whose authority evidence requires the unknown hour", () => {
    const result = observeCareer(topicContext({ ...topicPillars, hour: null }).facts);
    expect(result.map((j) => j.ruleId)).toEqual([
      "f04.observation.natal-context",
      "f04.observation.output-wealth",
    ]);
    expect(result.every((j) => j.exceptionsApplied.includes("MISSING_PILLARS"))).toBe(true);
    expect(result.flatMap((j) => j.evidence).some((e) => e.inputPath.includes("hour"))).toBe(false);
  });
  it.each(["day", "month"] as const)("does not infer a missing %s anchor", (position) => {
    expect(observeCareer(topicContext({ ...topicPillars, [position]: null }).facts)).toEqual([]);
  });
  it("provides bounded work-review directions without occupations, scores or outcome promises", () => {
    const result = observeCareer(topicContext().facts);
    expect(result[1].assertion).toContain("절차·책임");
    expect(result[2].assertion).toContain("일정·비용·자원 관리");
    for (const finding of result) {
      expect(finding.assertion).not.toMatch(
        /의사(?!표현)|변호사|교사|개발자|공무원|합격한다|승진한다|성공한다|연봉\s*\d|적성\s*\d|100\s*%/,
      );
      expect(finding.caveats.join(" ")).toContain("특정 직업의 적합도");
      expect(finding.sourceRefs.length).toBeGreaterThan(0);
      expect(finding.ruleVersion).toBe("1.0.0");
    }
    expect(result[1].sourceRefs).toContain("policy:f04-work-review-v1");
  });
  it("rejects altered facts and freezes findings while preserving JSON determinism and subject IDs", () => {
    const facts = topicContext().facts;
    expect(() => observeCareer({ ...facts, dayMaster: "을" })).toThrow();
    expect(() => observeCareer({ ...facts, requestedOccupation: "doctor" })).toThrow();
    const result = observeCareer(facts);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.set(result[0].evidence[0], "value", "invented")).toBe(false);
    expect(observeCareer(JSON.parse(JSON.stringify(facts)))).toEqual(result);
    expect(
      observeCareer(facts, "other").every(
        (j) => j.subject === "other" && j.judgmentId.startsWith("other:M03:f04:"),
      ),
    ).toBe(true);
  });
});
