import { describe, expect, it } from "vitest";
import { analyzeRelations, RelationAnalysisSchema } from "@/domain/judgment/relations";

const refs = [
  {
    referenceId: "a",
    source: "natal",
    contextId: "native",
    position: "year",
    pillar: { heavenlyStem: "갑", earthlyBranch: "자" },
  },
  {
    referenceId: "b",
    source: "natal",
    contextId: "native",
    position: "month",
    pillar: { heavenlyStem: "기", earthlyBranch: "축" },
  },
];
describe("M02 relations acceptance", () => {
  it("records stem/branch combinations with traceable evidence, without claiming transformation", () => {
    const before = structuredClone(refs),
      result = analyzeRelations(refs);
    expect(result.relations.map((r) => r.relationType)).toEqual(
      expect.arrayContaining(["stem-combination", "branch-six-combination"]),
    );
    expect(
      result.relations.every(
        (r) =>
          r.status === "complete" &&
          r.effect.transformation === "not-assessed" &&
          r.ruleVersion === "1.0.0" &&
          r.sourceRefs.length > 0,
      ),
    ).toBe(true);
    expect(refs).toEqual(before);
    expect(Object.isFrozen(result.relations[0].evidence)).toBe(true);
    expect(RelationAnalysisSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it("canonicalizes reference order and never creates self punishment from one occurrence", () => {
    expect(analyzeRelations([...refs].reverse())).toEqual(analyzeRelations(refs));
    expect(
      analyzeRelations([{ ...refs[0], pillar: { heavenlyStem: "갑", earthlyBranch: "진" } }])
        .relations,
    ).toEqual([]);
  });
  it("retains missing scope and rejects malformed input without reflecting raw values", () => {
    const result = analyzeRelations([{ ...refs[0], pillar: null }]);
    expect(result.status).toBe("unavailable");
    expect(result.relations).toEqual([]);
    expect(result.limitations).toContain("MISSING_PILLARS");
    expect(() => analyzeRelations([{ ...refs[0], source: "synthetic-private-source" }])).toThrow(
      "Relation input was rejected.",
    );
  });
});
