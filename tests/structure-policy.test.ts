import { describe, expect, it } from "vitest";
import {
  diagnoseStructure,
  DEFAULT_STRUCTURE_RULE_SET,
  STRUCTURE_RULES,
  STRUCTURE_SOURCES,
  type Method,
} from "@/domain/judgment/structure";
import { deriveNatalFacts, type DerivedNatalFacts } from "@/domain/natal-facts";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";
import { BranchSchema, StemSchema } from "@/domain/natal-facts/schemas";

const catalog = manseryeokSymbolCatalogAdapter.load();
type Pillar = NonNullable<DerivedNatalFacts["sourcePillars"]["day"]>;
const p = (
  heavenlyStem: Pillar["heavenlyStem"],
  earthlyBranch: Pillar["earthlyBranch"],
): Pillar => ({ heavenlyStem, earthlyBranch });
const base = { year: p("을", "묘"), month: p("을", "묘"), day: p("을", "묘"), hour: p("을", "묘") };
const derive = (overrides: Partial<DerivedNatalFacts["sourcePillars"]> = {}) =>
  deriveNatalFacts({ ...base, ...overrides }, catalog);
const values = (facts: DerivedNatalFacts, topic: string) =>
  diagnoseStructure(facts)
    .judgments.filter((j) => j.topic === topic)
    .map((j) => j.value);

// Hand-transcribed five-element seasonal expectations, 三命通會 卷二 旺相休囚死.
// Rows: spring/summer/autumn/winter; columns: 木火土金水. 土月 main-qi is a separate adopted policy.
const expected = {
  spring: ["旺", "相", "死", "囚", "休"],
  summer: ["休", "旺", "相", "死", "囚"],
  autumn: ["死", "囚", "休", "旺", "相"],
  winter: ["相", "死", "囚", "休", "旺"],
  earth: ["囚", "休", "旺", "相", "死"],
} as const;
const months = [
  ["인", "spring", "spring"],
  ["묘", "spring", "spring"],
  ["진", "spring", "earth"],
  ["사", "summer", "summer"],
  ["오", "summer", "summer"],
  ["미", "summer", "earth"],
  ["신", "autumn", "autumn"],
  ["유", "autumn", "autumn"],
  ["술", "autumn", "earth"],
  ["해", "winter", "winter"],
  ["자", "winter", "winter"],
  ["축", "winter", "earth"],
] as const;

describe("M01 adopted rule policy and negative cases", () => {
  for (const [month, seasonal, main] of months) {
    it.each(["갑", "병", "무", "경", "임"] as const)(
      `${month} month / %s seasonal expectations from independent table`,
      (stem) => {
        const index = ["갑", "병", "무", "경", "임"].indexOf(stem);
        const monthStem = BranchSchema.options.indexOf(month) % 2 === 0 ? "갑" : "을";
        expect(
          values(derive({ month: p(monthStem, month), day: p(stem, "자") }), "season"),
        ).toEqual([expected[seasonal][index], expected[main][index]]);
      },
    );
  }
  it("distinguishes exact-stem from element roots, including non-main hidden stems", () => {
    const result = diagnoseStructure(
      derive({
        day: p("갑", "자"),
        year: p("병", "진"),
        month: p("병", "진"),
        hour: p("병", "진"),
      }),
    );
    expect(result.facts.roots.exact).toEqual([]);
    expect(result.facts.roots.sameElement).toEqual(
      ["year", "month", "hour"].map((position) => ({
        position,
        hiddenIndex: 1,
        stem: "을",
        element: "목",
        isMain: false,
      })),
    );
    expect(result.conflicts.some((conflict) => conflict.topic === "root")).toBe(true);
  });
  it("does not count 印 as a root or the day stem as exposure", () => {
    const source = derive({
      year: p("계", "유"),
      month: p("계", "유"),
      day: p("갑", "자"),
      hour: p("계", "유"),
    });
    const result = diagnoseStructure(source);
    expect(result.facts.roots.sameElement).toEqual([]);
    expect(values(source, "root")).toEqual(["not-observed", "not-observed"]);
    // 子藏癸 is exposed into year/month/hour, but the visible 甲 day cannot create exposure.
    expect(result.facts.exposures).toEqual(
      ["year", "month", "hour"].map((visiblePosition) => ({
        branchPosition: "day",
        hiddenIndex: 0,
        stem: "계",
        visiblePosition,
      })),
    );
    expect(
      values(
        derive({
          year: p("정", "유"),
          month: p("정", "유"),
          day: p("갑", "인"),
          hour: p("정", "유"),
        }),
        "exposure",
      ),
    ).toEqual(["not-observed", "not-observed"]);
  });
  it("keeps only observed roots and refuses absence/strong certainty for unknown hour", () => {
    const result = diagnoseStructure(derive({ hour: null }));
    expect(result.facts.roots.exact).toHaveLength(3);
    expect(result.facts.roots.status).toBe("partial");
    expect(result.judgments.filter((j) => j.topic === "strength").map((j) => j.value)).toEqual([
      "undetermined",
      "undetermined",
    ]);
    const absent = diagnoseStructure(
      derive({ year: p("경", "신"), month: p("경", "신"), day: p("갑", "자"), hour: null }),
    );
    expect(absent.judgments.filter((j) => j.topic === "root").map((j) => j.value)).toEqual([
      "unknown",
      "unknown",
    ]);
  });
  it("uses opposing visible pressure and root absence for weak candidates; mixed evidence stays mixed", () => {
    const weak = derive({
      year: p("신", "유"),
      month: p("신", "유"),
      day: p("갑", "오"),
      hour: p("신", "유"),
    });
    expect(values(weak, "strength")).toEqual(["weak-candidate", "weak-candidate"]);
    expect(
      values(
        derive({
          year: p("신", "유"),
          month: p("신", "유"),
          day: p("갑", "자"),
          hour: p("신", "유"),
        }),
        "strength",
      ),
    ).toEqual(["mixed", "mixed"]);
    expect(values(derive({ year: p("경", "신") }), "strength")).toEqual(["mixed", "mixed"]);
  });
  it("does not infer strength from identical surface element counts", () => {
    const spring = derive({ year: p("경", "신"), month: p("을", "묘") });
    const autumn = derive({ year: p("을", "묘"), month: p("경", "신") });
    expect(spring.distribution).toEqual(autumn.distribution);
    expect(values(spring, "season")).toEqual(["旺", "旺"]);
    expect(values(autumn, "season")).toEqual(["死", "死"]);
    expect(values(spring, "strength")).toEqual(["mixed", "mixed"]);
  });
  it("preserves month-main and exposed other-hidden pattern candidates separately with a conflict", () => {
    const result = diagnoseStructure(derive({ month: p("병", "인"), day: p("갑", "자") }));
    expect(
      result.patternCandidates.map((c) => [c.methodId, c.targetStem, c.tenGod, c.basis]),
    ).toEqual([
      ["four-season-exact-root", "갑", "비견", "month-main"],
      ["month-qi-element-root", "병", "식신", "exposed-month-hidden"],
    ]);
    expect(result.conflicts.some((c) => c.topic === "pattern")).toBe(true);
    expect(
      result.usefulGodCandidates
        .filter((c) => c.purpose === "climate")
        .map((c) => [c.targetStem, c.tenGod]),
    ).toEqual([
      ["병", "식신"],
      ["계", "정인"],
      ["병", "식신"],
      ["계", "정인"],
    ]);
    expect(
      result.usefulGodCandidates
        .filter((c) => c.purpose === "month-order")
        .map((c) => c.targetStem),
    ).toEqual(["갑", "병"]);
  });
  it("falls back to month-main only when no month hidden stem is exposed", () => {
    const result = diagnoseStructure(
      derive({
        year: p("을", "묘"),
        month: p("경", "인"),
        day: p("갑", "자"),
        hour: p("을", "묘"),
      }),
    );
    expect(result.patternCandidates.map((c) => c.basis)).toEqual(["month-main", "month-main"]);
  });
  it("does not extend the climate adoption to the other 119 day-master/month combinations", () => {
    let adopted = 0;
    for (const stem of StemSchema.options)
      for (const branch of BranchSchema.options) {
        const monthStem = BranchSchema.options.indexOf(branch) % 2 === 0 ? "갑" : "을";
        const dayBranch = StemSchema.options.indexOf(stem) % 2 === 0 ? "자" : "축";
        const result = diagnoseStructure(
          derive({ month: p(monthStem, branch), day: p(stem, dayBranch) }),
        );
        const climate = result.usefulGodCandidates.filter((c) => c.purpose === "climate");
        if (stem === "갑" && branch === "인") {
          expect(climate).toHaveLength(4);
          adopted++;
        } else {
          expect(climate).toEqual([]);
          expect(result.limitations).toContain("CLIMATE_RULE_NOT_ADOPTED");
        }
      }
    expect(adopted).toBe(1);
  });
  it("marks an entirely unknown chart unavailable without inventing candidates", () => {
    const result = diagnoseStructure(derive({ year: null, month: null, day: null, hour: null }));
    expect(result.status).toBe("unavailable");
    expect(result.patternCandidates).toEqual([]);
    expect(result.usefulGodCandidates).toEqual([]);
    expect(
      result.judgments.every((j) => ["unknown", "undetermined", "not-adopted"].includes(j.value)),
    ).toBe(true);
  });
  it("is deterministic, canonicalizes method order, and rejects duplicate or surplus selector fields", () => {
    const facts = derive();
    const reversed: Method[] = [...DEFAULT_STRUCTURE_RULE_SET.methods].reverse();
    expect(diagnoseStructure(facts, { ...DEFAULT_STRUCTURE_RULE_SET, methods: reversed })).toEqual(
      diagnoseStructure(facts),
    );
    expect(
      diagnoseStructure(facts, { ...DEFAULT_STRUCTURE_RULE_SET, methods: [reversed[0]] }).judgments,
    ).toHaveLength(6);
    for (const selector of [
      { ...DEFAULT_STRUCTURE_RULE_SET, extra: "private" },
      { ...DEFAULT_STRUCTURE_RULE_SET, methods: [] },
      { ...DEFAULT_STRUCTURE_RULE_SET, methods: [reversed[0], reversed[0]] },
    ])
      expect(() => diagnoseStructure(facts, selector)).toThrow("Structure rule set was rejected.");
    expect(() => diagnoseStructure({ ...facts, dayMaster: "갑" })).toThrow(
      "Structure facts were rejected.",
    );
  });
  it("resolves every source and concrete evidence path to the original input", () => {
    const source = derive({ month: p("병", "인"), day: p("갑", "자") });
    const result = diagnoseStructure(source);
    const refs = new Set(STRUCTURE_SOURCES.map((s) => s.id));
    for (const judgment of result.judgments) {
      expect(
        STRUCTURE_RULES.some(
          (rule) => rule.ruleId === judgment.ruleId && rule.ruleVersion === judgment.ruleVersion,
        ),
      ).toBe(true);
      expect(judgment.sourceRefs.every((ref) => refs.has(ref))).toBe(true);
    }
    for (const evidence of [
      ...result.judgments.flatMap((j) => j.evidence),
      ...result.patternCandidates.flatMap((c) => c.evidence),
      ...result.usefulGodCandidates.flatMap((c) => c.evidence),
    ]) {
      let actual: unknown = source;
      for (const part of evidence.inputPath.split("."))
        actual = (actual as Record<string, unknown>)[part];
      expect(actual ?? "unknown").toBe(evidence.value);
    }
  });
});
