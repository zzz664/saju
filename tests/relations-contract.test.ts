import { describe, expect, it } from "vitest";
import {
  analyzeRelations,
  DEFAULT_RELATION_RULE_SET,
  RELATION_RULES,
  RELATION_SOURCES,
  RelationInputSchema,
  type PillarReference,
} from "@/domain/judgment/relations";
import { relationRefs } from "./helpers/relation-input";

describe("M02 scope, identities, conflicts and contract", () => {
  it("retains simultaneous combination, punishment and break without canceling facts", () => {
    const result = analyzeRelations(relationRefs(["사", "신"]));
    expect(result.relations.map((r) => r.relationType)).toEqual(
      expect.arrayContaining(["branch-six-combination", "branch-punishment", "branch-break"]),
    );
    expect(result.conflicts).toHaveLength(2);
    expect(
      result.conflicts.every(
        (c) => c.reason === "COMBINATION_WITH_OPPOSITION" && c.resolution === "unresolved",
      ),
    ).toBe(true);
  });
  it("keeps multiple combination partners and distinct repeated-position occurrences", () => {
    const refs = relationRefs(["갑", "기", "기"], "stem"),
      result = analyzeRelations(refs);
    const relations = result.relations.filter((r) => r.relationType === "stem-combination");
    expect(relations.map((r) => r.participants)).toEqual([
      ["ref-00", "ref-01"],
      ["ref-00", "ref-02"],
    ]);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        referenceId: "ref-00",
        reason: "MULTIPLE_COMBINATION_PARTNERS",
        relationIds: relations.map((r) => r.relationId),
      }),
    );
    const repeated = analyzeRelations(relationRefs(["진", "진", "진"]));
    expect(
      repeated.relations.filter((r) => r.relationType === "branch-self-punishment"),
    ).toHaveLength(3);
    expect(new Set(repeated.relations.map((r) => r.relationId)).size).toBe(
      repeated.relations.length,
    );
  });
  it("keeps all seven source kinds and resolves evidence against canonical input", () => {
    const kinds = ["natal", "luck", "annual", "monthly", "daily", "personA", "personB"] as const;
    const refs = relationRefs(["자", "축", "인", "해", "묘", "술", "진"]).map((ref, i) => ({
      ...ref,
      source: kinds[i],
    }));
    const before = structuredClone(refs),
      result = analyzeRelations([...refs].reverse());
    expect(result.pillars.map((ref) => ref.source)).toEqual(kinds);
    for (const relation of result.relations) {
      expect(new Set(relation.participants).size).toBe(relation.participants.length);
      expect(relation.inputPaths).toEqual(relation.evidence.map((e) => e.inputPath));
      expect(
        relation.sourceRefs.every((id) => RELATION_SOURCES.some((source) => source.id === id)),
      ).toBe(true);
      for (const evidence of relation.evidence) {
        const [, rawIndex, , key] = evidence.inputPath.split(".");
        const ref = result.pillars[Number(rawIndex)];
        expect(ref.referenceId).toBe(evidence.referenceId);
        expect(ref.pillar![key as "heavenlyStem" | "earthlyBranch"]).toBe(evidence.symbol);
      }
    }
    expect(refs).toEqual(before);
    expect(Object.isFrozen(result.pillars[0].pillar)).toBe(true);
    const rules = RELATION_RULES;
    expect(new Set(rules.map((rule) => rule.ruleId)).size).toBe(rules.length);
    expect(
      rules.every((rule) =>
        rule.sourceRefs.every((id) => RELATION_SOURCES.some((source) => source.id === id)),
      ),
    ).toBe(true);
  });
  it("retains known relations but excludes missing references", () => {
    const refs = relationRefs(["자", "축", "인"]),
      result = analyzeRelations(refs.map((ref, i) => (i === 2 ? { ...ref, pillar: null } : ref)));
    expect(result.coverage).toEqual({
      status: "partial",
      knownPillars: 2,
      missingReferenceIds: ["ref-02"],
    });
    expect(result.relations.some((r) => r.relationType === "branch-six-combination")).toBe(true);
    expect(result.relations.every((r) => !r.participants.includes("ref-02"))).toBe(true);
  });
  it("supports one and 32 references with bounded, complete duplicate-free observation scope", () => {
    expect(analyzeRelations(relationRefs(["자"])).coverage.status).toBe("complete");
    const result = analyzeRelations(relationRefs(Array(32).fill("진")));
    expect(result.coverage.knownPillars).toBe(32);
    expect(
      result.relations.filter((r) => r.relationType === "branch-self-punishment"),
    ).toHaveLength(496);
    expect(new Set(result.relations.map((r) => r.relationId)).size).toBe(result.relations.length);
    expect(() => analyzeRelations(relationRefs(Array(33).fill("진")))).toThrow(
      "Relation input was rejected.",
    );
  });
  it("rejects duplicate identity/locator, malformed sexagenary pairs, surplus keys and private values safely", () => {
    const refs = relationRefs(["자", "축"]);
    const invalid: unknown[] = [
      [],
      null,
      {},
      [{ ...refs[0], extra: "private" }],
      [refs[0], refs[0]],
      [refs[0], { ...refs[0], referenceId: "different-id" }],
      [refs[0], { ...refs[1], referenceId: refs[0].referenceId }],
      [{ ...refs[0], pillar: { heavenlyStem: "갑", earthlyBranch: "축" } }],
      [{ ...refs[0], source: "private-source" }],
      [{ ...refs[0], referenceId: "private|ambiguous" }],
      [{ ...refs[0], pillar: { heavenlyStem: "private-stem", earthlyBranch: "자" } }],
    ];
    for (const value of invalid) {
      expect(RelationInputSchema.safeParse(value).success).toBe(false);
      expect(() => analyzeRelations(value)).toThrow("Relation input was rejected.");
    }
  });
  it("rejects unapproved policy IDs, versions, modes and extra options", () => {
    for (const selector of [
      null,
      { ...DEFAULT_RELATION_RULE_SET, ruleSetId: "private-rule" },
      { ...DEFAULT_RELATION_RULE_SET, ruleSetVersion: "2.0.0" },
      { ...DEFAULT_RELATION_RULE_SET, punishment: "invented" },
      { ...DEFAULT_RELATION_RULE_SET, extra: "private" },
    ])
      expect(() => analyzeRelations(relationRefs(["자"]), selector)).toThrow(
        "Relation rule set was rejected.",
      );
  });
  it("keeps identifiers collision-free and does not depend on supplied ordering", () => {
    const refs: PillarReference[] = relationRefs(["갑", "기", "기"], "stem").map((ref, i) => ({
      ...ref,
      referenceId: ["a:b", "c", "b:c"][i],
    }));
    const result = analyzeRelations(refs);
    expect(analyzeRelations([refs[2], refs[0], refs[1]])).toEqual(result);
    expect(new Set(result.relations.map((r) => r.relationId)).size).toBe(result.relations.length);
  });
});
