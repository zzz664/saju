import { describe, expect, it } from "vitest";
import { deriveNatalFacts } from "@/domain/natal-facts";
import { evaluateBaseJudgments } from "@/domain/judgment";
import {
  arbitrateJudgments,
  arbitrateBaseJudgments,
  ArbitrationResultSchema,
  parseArbitrationResult,
} from "@/domain/judgment/arbitration";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";

const symbols = manseryeokSymbolCatalogAdapter.load();
const positions = ["year", "month", "day", "hour"] as const;
function evaluation(chart: readonly (string | null)[]) {
  return evaluateBaseJudgments(
    deriveNatalFacts(
      Object.fromEntries(
        positions.map((position, index) => [
          position,
          chart[index] === null
            ? null
            : { heavenlyStem: chart[index]![0], earthlyBranch: chart[index]![1] },
        ]),
      ),
      symbols,
    ),
  );
}
const complete = evaluation(["갑자", "병인", "갑자", "경신"]);
const finding = complete.findings[0];
// Synthetic transport candidates test arbitration mechanics, not new classical rules.
function candidate(
  id: string,
  value: string,
  priority = 50,
  method = "fixture",
  partial = false,
  key = "fixture.exclusive",
) {
  return {
    finding: {
      ...finding,
      findingId: id,
      ruleId: `fixture.${id}`,
      priority,
      precision: partial ? "partial" : "confirmed",
      exceptionsDeclared: ["INCOMPLETE_SEARCH_SCOPE"],
      exceptionsApplied: partial ? ["INCOMPLETE_SEARCH_SCOPE"] : [],
    },
    claim: { key, value, method },
  };
}

describe("conflict and uncertainty arbitration", () => {
  it("selects the higher-priority value and keeps suppressed evidence and symmetric links", () => {
    const low = candidate("low", "B", 20),
      high = candidate("high", "A", 80),
      support = candidate("support", "A", 10);
    const result = arbitrateJudgments({ status: "complete", candidates: [low, high, support] });
    expect(result.status).toBe("complete");
    expect(result.findings.map((entry) => entry.findingId)).toEqual(["high", "support"]);
    expect(result.decisions.find((entry) => entry.findingId === "low")).toMatchObject({
      disposition: "suppressed",
      conflictingWith: ["high", "support"],
    });
    expect(result.decisions.find((entry) => entry.findingId === "high")?.conflictingWith).toEqual([
      "low",
    ]);
    expect(result.conflicts[0]).toMatchObject({
      resolution: "priority",
      status: "resolved",
      winnerIds: ["high", "support"],
    });
    expect(
      result.candidates.find((entry) => entry.finding.findingId === "low")?.finding.evidence,
    ).toEqual(low.finding.evidence);
  });

  it.each([
    {
      name: "equal priorities",
      candidates: [candidate("a", "A"), candidate("b", "B")],
      reason: "tie",
      status: "complete",
    },
    {
      name: "different methods",
      candidates: [candidate("a", "A", 90, "one"), candidate("b", "B", 10, "two")],
      reason: "method-disagreement",
      status: "complete",
    },
    {
      name: "partial higher priority",
      candidates: [candidate("a", "A", 90, "fixture", true), candidate("b", "B", 10)],
      reason: "incomplete-evidence",
      status: "partial",
    },
    {
      name: "partial lower priority",
      candidates: [candidate("a", "A", 90), candidate("b", "B", 10, "fixture", true)],
      reason: "incomplete-evidence",
      status: "partial",
    },
    {
      name: "three-way top tie",
      candidates: [candidate("a", "A", 90), candidate("b", "B", 90), candidate("c", "C", 10)],
      reason: "tie",
      status: "complete",
    },
  ])("defers $name without manufacturing a winner", ({ candidates, reason, status }) => {
    const result = arbitrateJudgments({ status, candidates });
    expect(result.status).toBe("partial");
    expect(result.findings).toEqual([]);
    expect(result.decisions.every((entry) => entry.disposition === "deferred")).toBe(true);
    expect(result.conflicts[0]).toMatchObject({
      resolution: reason,
      status: "unresolved",
      winnerIds: [],
    });
    expect(result.limitations).toContain("UNRESOLVED_CONFLICT");
  });

  it("keeps agreeing methods, unrelated observations, and partial assertions without promotion", () => {
    const candidates = [
      candidate("a", "A", 90, "one"),
      candidate("b", "A", 10, "two"),
      candidate("c", "B", 50, "fixture", true, "other"),
    ];
    const result = arbitrateJudgments({ status: "partial", candidates });
    expect(result.findings).toHaveLength(3);
    expect(result.findings.find((entry) => entry.findingId === "c")?.precision).toBe("partial");
    expect(result.conflicts).toEqual([]);
    expect(result.limitations).toEqual(["UPSTREAM_PARTIAL", "PARTIAL_EVIDENCE"]);
  });

  it("handles priority boundaries and a top tie supporting one value", () => {
    const result = arbitrateJudgments({
      status: "complete",
      candidates: [candidate("a", "A", 100), candidate("b", "A", 100), candidate("c", "B", 0)],
    });
    expect(result.conflicts[0].winnerIds).toEqual(["a", "b"]);
    expect(result.findings).toHaveLength(2);
  });

  it("isolates resolved and unresolved groups and preserves unrelated observations", () => {
    const result = arbitrateJudgments({
      status: "complete",
      candidates: [
        candidate("a", "A", 90),
        candidate("b", "B", 10),
        candidate("c", "A", 50, "fixture", false, "second"),
        candidate("d", "B", 50, "fixture", false, "second"),
        candidate("e", "C", 0, "fixture", false, "independent"),
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.findings.map((entry) => entry.findingId)).toEqual(["a", "e"]);
    expect(result.conflicts.map((entry) => entry.status)).toEqual(["resolved", "unresolved"]);
    expect(result.decisions.find((entry) => entry.findingId === "e")?.conflictingWith).toEqual([]);
    expect(result.decisions.find((entry) => entry.findingId === "c")?.conflictingWith).toEqual([
      "d",
    ]);
  });

  it("preserves upstream partial/unavailable even with no candidates", () => {
    expect(arbitrateJudgments({ status: "partial", candidates: [] })).toMatchObject({
      status: "partial",
      findings: [],
      limitations: ["UPSTREAM_PARTIAL"],
    });
    expect(arbitrateJudgments({ status: "unavailable", candidates: [] })).toMatchObject({
      status: "unavailable",
      findings: [],
      limitations: ["UPSTREAM_UNAVAILABLE"],
    });
    expect(arbitrateJudgments({ status: "complete", candidates: [] }).status).toBe("complete");
  });

  it("rejects duplicate IDs, missing evidence/source, invalid priorities, and inconsistent precision/status", () => {
    const a = candidate("a", "A");
    for (const input of [
      null,
      { status: "complete", candidates: [a, a] },
      { status: "complete", candidates: [{ ...a, finding: { ...a.finding, evidence: [] } }] },
      { status: "complete", candidates: [{ ...a, finding: { ...a.finding, sourceRefs: [] } }] },
      { status: "complete", candidates: [candidate("a", "A", 101)] },
      { status: "complete", candidates: [candidate("a", "A", -1)] },
      { status: "complete", candidates: [candidate("a", "A", 50.5)] },
      { status: "complete", candidates: [{ ...a, claim: { ...a.claim, key: "" } }] },
      {
        status: "complete",
        candidates: Array.from({ length: 101 }, (_, index) => candidate(`item${index}`, "A")),
      },
      { status: "complete", candidates: [candidate("a", "A", 50, "fixture", true)] },
      { status: "unavailable", candidates: [a] },
      {
        status: "partial",
        candidates: [
          {
            ...a,
            finding: {
              ...a.finding,
              precision: "confirmed",
              exceptionsApplied: ["INCOMPLETE_SEARCH_SCOPE"],
            },
          },
        ],
      },
    ])
      expect(() => arbitrateJudgments(input)).toThrow("Arbitration input was rejected.");
  });

  it("is order independent, immutable, and rejects altered output decisions or missing candidates", () => {
    const candidates = [candidate("b", "B", 10), candidate("a", "A", 90)];
    const before = structuredClone(candidates);
    const result = arbitrateJudgments({ status: "complete", candidates });
    expect(
      arbitrateJudgments({ status: "complete", candidates: [...candidates].reverse() }),
    ).toEqual(result);
    expect(candidates).toEqual(before);
    expect(Object.isFrozen(result.candidates[0].finding.evidence)).toBe(true);
    expect(ArbitrationResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(() => parseArbitrationResult({ ...result, status: "partial" })).toThrow();
    expect(() => parseArbitrationResult({ ...result, findings: [] })).toThrow();
    expect(() =>
      parseArbitrationResult({ ...result, candidates: result.candidates.slice(1) }),
    ).toThrow();
    expect(() => parseArbitrationResult({ ...result, conflicts: [] })).toThrow();
    expect(() =>
      parseArbitrationResult({
        ...result,
        decisions: result.decisions.map((entry) => ({ ...entry, conflictingWith: [] })),
      }),
    ).toThrow();
    expect(() =>
      parseArbitrationResult({
        ...result,
        provenance: { ...result.provenance, policyVersion: "2.0.0" },
      }),
    ).toThrow();
  });

  it("retains all real base observations without calling coexistence a conflict", () => {
    const value = evaluation(["경신", "신유", "갑자", "을묘"]);
    const result = arbitrateBaseJudgments(value);
    expect(result.arbitration.findings).toEqual(
      [...value.findings].sort((a, b) => (a.findingId < b.findingId ? -1 : 1)),
    );
    expect(result.arbitration.conflicts).toEqual([]);
    expect(result.uncertainties).toEqual([]);
    expect(
      result.arbitration.findings.some((entry) => entry.ruleId === "base.officer-killing-coexist"),
    ).toBe(true);
  });

  it.each([
    ["갑자", "병인", "갑자", null],
    ["갑자", "병인", null, null],
    [null, null, null, null],
  ])("preserves unknown input traces for %s %s %s %s", (...chart) => {
    const value = evaluation(chart);
    const result = arbitrateBaseJudgments(value);
    expect(result.arbitration.status).toBe(value.status);
    expect(result.uncertainties).toEqual(
      [...value.results.filter((entry) => entry.coverage !== "complete")].sort((a, b) =>
        a.ruleId < b.ruleId ? -1 : 1,
      ),
    );
    expect(
      result.arbitration.findings.every((entry) =>
        entry.evidence.every((atom) => !atom.inputPath.startsWith("positions.hour.")),
      ),
    ).toBe(true);
    expect(result.arbitration.findings.map((entry) => entry.findingId).sort()).toEqual(
      value.findings.map((entry) => entry.findingId).sort(),
    );
  });

  it("rejects malformed base evaluation instead of inventing observations", () => {
    expect(() => arbitrateBaseJudgments({ ...complete, results: [] })).toThrow(
      "Arbitration input was rejected.",
    );
  });
});
