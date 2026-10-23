import { describe, expect, it } from "vitest";
import {
  analyzeRelations,
  DEFAULT_RELATION_RULE_SET,
  type GanjiRelation,
} from "@/domain/judgment/relations";
import { BranchSchema, StemSchema } from "@/domain/natal-facts/schemas";
import { relationRefs } from "./helpers/relation-input";

// Independently transcribed original-text tables, not generated from production catalog/output.
// 三命通會卷二: 合/沖/刑/害; 選擇紀要上編: 干沖; 六壬大全卷一: 破.
const stemPairs = {
  "stem-combination": [
    ["갑", "기"],
    ["을", "경"],
    ["병", "신"],
    ["정", "임"],
    ["무", "계"],
  ],
  "stem-clash": [
    ["갑", "경"],
    ["을", "신"],
    ["병", "임"],
    ["정", "계"],
  ],
} as const;
const branchPairs = {
  "branch-six-combination": [
    ["자", "축"],
    ["인", "해"],
    ["묘", "술"],
    ["진", "유"],
    ["사", "신"],
    ["오", "미"],
  ],
  "branch-clash": [
    ["자", "오"],
    ["축", "미"],
    ["인", "신"],
    ["묘", "유"],
    ["진", "술"],
    ["사", "해"],
  ],
  "branch-punishment": [
    ["자", "묘"],
    ["인", "사"],
    ["사", "신"],
    ["신", "인"],
    ["축", "술"],
    ["술", "미"],
    ["미", "축"],
  ],
  "branch-self-punishment": [
    ["진", "진"],
    ["오", "오"],
    ["유", "유"],
    ["해", "해"],
  ],
  "branch-break": [
    ["자", "유"],
    ["묘", "오"],
    ["진", "축"],
    ["미", "술"],
    ["인", "해"],
    ["사", "신"],
  ],
  "branch-harm": [
    ["자", "미"],
    ["축", "오"],
    ["인", "사"],
    ["묘", "진"],
    ["신", "해"],
    ["유", "술"],
  ],
} as const;
const triples = [
  ["branch-three-combination", ["신", "자", "진"], "수"],
  ["branch-three-combination", ["사", "유", "축"], "금"],
  ["branch-three-combination", ["인", "오", "술"], "화"],
  ["branch-three-combination", ["해", "묘", "미"], "목"],
  ["branch-directional-combination", ["인", "묘", "진"], "목"],
  ["branch-directional-combination", ["사", "오", "미"], "화"],
  ["branch-directional-combination", ["신", "유", "술"], "금"],
  ["branch-directional-combination", ["해", "자", "축"], "수"],
] as const;
const types = (relations: readonly GanjiRelation[], prefix: string) =>
  relations
    .filter((r) => r.relationType.startsWith(prefix))
    .map((r) => r.relationType)
    .sort();
const key = (symbols: readonly string[]) => [...symbols].sort().join("/");

describe("M02 independent correspondence goldens", () => {
  for (const [layer, symbols, table] of [
    ["stem", StemSchema.options, stemPairs],
    ["branch", BranchSchema.options, branchPairs],
  ] as const) {
    for (let a = 0; a < symbols.length; a++)
      for (let b = a; b < symbols.length; b++) {
        const pair = [symbols[a], symbols[b]];
        it(`${layer} ${pair.join("/")} exact positive/negative table and reversed input`, () => {
          const expected = Object.entries(table)
            .filter(([, pairs]) =>
              pairs.some((candidate: readonly string[]) => key(candidate) === key(pair)),
            )
            .map(([type]) => type)
            .sort();
          const refs = relationRefs(pair, layer),
            result = analyzeRelations(refs);
          expect(types(result.relations, layer)).toEqual(expected);
          expect(analyzeRelations([...refs].reverse())).toEqual(result);
        });
      }
  }
  for (const [type, symbols, element] of triples) {
    it(`${type} ${symbols.join("/")} requires all three distinct glyphs`, () => {
      const refs = relationRefs(symbols),
        result = analyzeRelations(refs);
      expect(result.relations.filter((r) => r.relationType === type)).toMatchObject([
        { participants: refs.map((ref) => ref.referenceId), elementAssociation: element },
      ]);
      for (let missing = 0; missing < 3; missing++) {
        expect(
          analyzeRelations(refs.filter((_, index) => index !== missing)).relations.filter(
            (r) => r.relationType === type,
          ),
        ).toEqual([]);
        expect(
          analyzeRelations(
            refs.map((ref, index) => (index === missing ? { ...ref, pillar: null } : ref)),
          ).relations.filter((r) => r.relationType === type),
        ).toEqual([]);
      }
      for (const permutation of [
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
      ])
        expect(analyzeRelations(permutation.map((index) => refs[index]))).toEqual(result);
    });
  }
  it("does not treat repetitions or 土四庫 as a completed three-combination", () => {
    for (const symbols of [
      ["신", "자", "자"],
      ["인", "묘", "묘"],
      ["진", "술", "축", "미"],
    ])
      expect(
        analyzeRelations(relationRefs(symbols)).relations.filter((r) =>
          ["branch-three-combination", "branch-directional-combination"].includes(r.relationType),
        ),
      ).toEqual([]);
  });
  it("preserves each supported punishment policy instead of silently mixing them", () => {
    for (const symbols of [
      ["인", "사", "신"],
      ["축", "술", "미"],
    ]) {
      const refs = relationRefs(symbols);
      expect(
        analyzeRelations(refs).relations.filter((r) => r.relationType === "branch-punishment"),
      ).toHaveLength(3);
      const strict = { ...DEFAULT_RELATION_RULE_SET, punishment: "full-group" };
      expect(
        analyzeRelations(refs, strict).relations.filter(
          (r) => r.relationType === "branch-punishment",
        ),
      ).toMatchObject([{ participants: refs.map((ref) => ref.referenceId) }]);
      for (let missing = 0; missing < 3; missing++)
        expect(
          analyzeRelations(
            refs.filter((_, i) => i !== missing),
            strict,
          ).relations.filter((r) => r.relationType === "branch-punishment"),
        ).toEqual([]);
    }
    const strict = { ...DEFAULT_RELATION_RULE_SET, punishment: "full-group" };
    expect(
      analyzeRelations(relationRefs(["자", "묘"]), strict).relations.some(
        (r) => r.relationType === "branch-punishment",
      ),
    ).toBe(true);
    expect(
      analyzeRelations(relationRefs(["진", "진"]), strict).relations.some(
        (r) => r.relationType === "branch-self-punishment",
      ),
    ).toBe(true);
  });
  it("makes non-adoption of stem clashes explicit, without dropping branch observations", () => {
    const refs = relationRefs(["갑", "경"], "stem"),
      policy = { ...DEFAULT_RELATION_RULE_SET, stemClash: "not-adopted" };
    const result = analyzeRelations(refs, policy);
    expect(result.relations.some((r) => r.relationType === "stem-clash")).toBe(false);
    expect(result.limitations).toContain("STEM_CLASH_NOT_ADOPTED");
    expect(result.relations.filter((r) => r.relationType.startsWith("branch"))).toEqual(
      analyzeRelations(refs)
        .relations.filter((r) => r.relationType.startsWith("branch"))
        .map((r) => ({ ...r, exceptionsApplied: result.limitations })),
    );
  });
});
