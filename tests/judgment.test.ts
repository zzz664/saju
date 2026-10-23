import { describe, expect, it } from "vitest";
import { deriveNatalFacts } from "@/domain/natal-facts";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";
import {
  evaluateBaseJudgments,
  BASE_RULE_CATALOG,
  JudgmentCatalogSchema,
  JudgmentEvaluationSchema,
  parseJudgmentEvaluation,
  evidenceMatchesFacts,
} from "@/domain/judgment";
import golden from "./fixtures/base-judgment-golden.json";

const symbols = manseryeokSymbolCatalogAdapter.load();
const positions = ["year", "month", "day", "hour"] as const;
function facts(chart: readonly (string | null)[]) {
  return deriveNatalFacts(
    Object.fromEntries(
      positions.map((position, index) => [
        position,
        chart[index] === null
          ? null
          : { heavenlyStem: chart[index]![0], earthlyBranch: chart[index]![1] },
      ]),
    ),
    symbols,
  );
}

describe("reviewed classical base judgment rules", () => {
  it("has exactly twenty reviewed rules and resolvable text-checked classical sources", () => {
    expect(BASE_RULE_CATALOG.rules).toHaveLength(20);
    expect(new Set(BASE_RULE_CATALOG.rules.map((rule) => rule.ruleId)).size).toBe(20);
    expect(new Set(BASE_RULE_CATALOG.sources.map((source) => source.work))).toEqual(
      new Set(["적천수", "궁통보감", "자평진전", "삼명통회"]),
    );
    for (const rule of BASE_RULE_CATALOG.rules) {
      expect(rule.review.status).toBe("source-and-tests-checked");
      for (const id of rule.sourceRefs)
        expect(BASE_RULE_CATALOG.sources.find((source) => source.id === id)?.verification).toBe(
          "text-checked",
        );
    }
  });

  it.each(golden.cases)(
    "matches independently specified positive $ruleId with evidence",
    (fixture) => {
      const result = evaluateBaseJudgments(facts(fixture.positive));
      const rule = result.results.find((entry) => entry.ruleId === fixture.ruleId)!;
      expect(rule.status).toBe("matched");
      expect(rule.evidence.length).toBeGreaterThan(0);
      expect(rule.sourceRefs.length).toBeGreaterThan(0);
      expect(result.findings.some((entry) => entry.ruleId === fixture.ruleId)).toBe(true);
    },
  );

  it.each(golden.cases)(
    "rejects independently specified negative $ruleId without a positive finding",
    (fixture) => {
      const result = evaluateBaseJudgments(facts(fixture.negative));
      expect(result.results.find((entry) => entry.ruleId === fixture.ruleId)?.status).toBe(
        "not-matched",
      );
      expect(result.findings.some((entry) => entry.ruleId === fixture.ruleId)).toBe(false);
    },
  );

  it.each(golden.cases)("keeps all-unknown $ruleId unavailable", ({ ruleId }) => {
    const result = evaluateBaseJudgments(facts([null, null, null, null]));
    expect(result.results.find((entry) => entry.ruleId === ruleId)?.status).toBe("unavailable");
    expect(result.findings).toHaveLength(0);
  });

  it("retains an observed match in partial coverage but does not infer absence from missing positions", () => {
    const result = evaluateBaseJudgments(facts(["병자", null, "갑자", null]));
    expect(result.results.find((entry) => entry.ruleId === "base.output-visible")).toMatchObject({
      status: "matched",
      coverage: "partial",
    });
    expect(
      result.results.find((entry) => entry.ruleId === "base.companions-visible"),
    ).toMatchObject({ status: "unavailable" });
    expect(result.results.find((entry) => entry.ruleId === "base.month-spring")).toMatchObject({
      status: "unavailable",
    });
  });

  it("does not call a same-element different stem an exact hidden-stem root", () => {
    const result = evaluateBaseJudgments(facts(["을묘", "병자", "갑자", "경자"]));
    expect(result.results.find((entry) => entry.ruleId === "base.exact-hidden-root")?.status).toBe(
      "not-matched",
    );
  });

  it("is immutable and deterministic, and canonicalizes catalog order", () => {
    const input = facts(golden.cases[0].positive);
    const before = structuredClone(input);
    const first = evaluateBaseJudgments(input);
    expect(
      evaluateBaseJudgments(input, {
        ...BASE_RULE_CATALOG,
        rules: [...BASE_RULE_CATALOG.rules].reverse(),
      }),
    ).toEqual(first);
    expect(Object.isFrozen(first.results[0].evidence)).toBe(true);
    expect(JudgmentEvaluationSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
    expect(input).toEqual(before);
  });

  it("rejects dangling, unverified, duplicate, unreviewed and unsupported catalogs", () => {
    const catalog = BASE_RULE_CATALOG;
    for (const raw of [
      { ...catalog, rules: catalog.rules.slice(1) },
      { ...catalog, rules: Array(20).fill(catalog.rules[0]) },
      {
        ...catalog,
        rules: [{ ...catalog.rules[0], sourceRefs: ["missing"] }, ...catalog.rules.slice(1)],
      },
      {
        ...catalog,
        sources: [
          { ...catalog.sources[0], verification: "unverified" },
          ...catalog.sources.slice(1),
        ],
      },
      {
        ...catalog,
        rules: [
          { ...catalog.rules[0], review: { ...catalog.rules[0].review, status: "draft" } },
          ...catalog.rules.slice(1),
        ],
      },
      { ...catalog, ruleSetVersion: "future" },
      {
        ...catalog,
        rules: [
          { ...catalog.rules[0], assertion: "unreviewed assertion" },
          ...catalog.rules.slice(1),
        ],
      },
    ]) {
      expect(JudgmentCatalogSchema.safeParse(raw).success).toBe(false);
      expect(() => evaluateBaseJudgments(facts(golden.cases[0].positive), raw)).toThrow(
        expect.objectContaining({ code: "CATALOG_INVALID" }),
      );
    }
    expect(() => evaluateBaseJudgments({})).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });

  it("verifies evidence paths against actual facts and rejects tampered findings or output status", () => {
    const input = facts(golden.cases[0].positive);
    const result = evaluateBaseJudgments(input);
    expect(evidenceMatchesFacts(input, result)).toBe(true);
    expect(evidenceMatchesFacts(facts(golden.cases[0].negative), result)).toBe(false);
    expect(
      evidenceMatchesFacts(input, {
        ...result,
        results: [
          { ...result.results[0], evidence: [{ ...result.results[0].evidence[0], value: "을" }] },
          ...result.results.slice(1),
        ],
      }),
    ).toBe(false);
    expect(() => parseJudgmentEvaluation({ ...result, status: "unavailable" })).toThrow();
    expect(() =>
      parseJudgmentEvaluation({
        ...result,
        findings: [
          { ...result.findings[0], assertion: "unsupported prediction" },
          ...result.findings.slice(1),
        ],
      }),
    ).toThrow();
  });

  it("knows a single-hidden-stem month has no other-stem exposure even with unrelated missing pillars", () => {
    const result = evaluateBaseJudgments(facts([null, "을묘", "갑자", null]));
    expect(
      result.results.find((entry) => entry.ruleId === "base.month-other-exposed"),
    ).toMatchObject({ status: "not-matched", coverage: "complete", exceptionsApplied: [] });
  });

  it("retains multiple observations regardless of priority without performing conflict arbitration", () => {
    const result = evaluateBaseJudgments(facts(["경신", "신유", "갑자", "을묘"]));
    const ids = result.findings.map((entry) => entry.ruleId);
    expect(ids).toContain("base.officers-visible");
    expect(ids).toContain("base.officer-killing-coexist");
    expect(result.results).toHaveLength(20);
  });
});
