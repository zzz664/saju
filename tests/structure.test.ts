import { describe, expect, it } from "vitest";
import { diagnoseStructure, StructureDiagnosisSchema } from "@/domain/judgment/structure";
import { deriveNatalFacts } from "@/domain/natal-facts";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";

const catalog = manseryeokSymbolCatalogAdapter.load();
const base = {
  year: { heavenlyStem: "을", earthlyBranch: "묘" },
  month: { heavenlyStem: "을", earthlyBranch: "묘" },
  day: { heavenlyStem: "을", earthlyBranch: "묘" },
  hour: { heavenlyStem: "을", earthlyBranch: "묘" },
};
const facts = () => deriveNatalFacts(base, catalog);
describe("M01 structural diagnosis", () => {
  it("combines season, roots and visible ten gods into traceable candidates without changing facts", () => {
    const source = facts(),
      before = structuredClone(source),
      result = diagnoseStructure(source);
    expect(result.facts.roots.exact).toHaveLength(4);
    expect(
      result.judgments.filter((item) => item.topic === "strength").map((item) => item.value),
    ).toEqual(["strong-candidate", "strong-candidate"]);
    expect(
      result.judgments.every(
        (item) =>
          item.ruleId && item.ruleVersion && item.sourceRefs.length && item.inputPaths.length,
      ),
    ).toBe(true);
    expect(source).toEqual(before);
    expect(StructureDiagnosisSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(Object.isFrozen(result.judgments[0].evidence)).toBe(true);
  });
  it("retains opposing month methods rather than selecting one universal answer", () => {
    const source = deriveNatalFacts(
      {
        ...base,
        month: { heavenlyStem: "무", earthlyBranch: "진" },
        day: { heavenlyStem: "무", earthlyBranch: "진" },
      },
      catalog,
    );
    const result = diagnoseStructure(source);
    expect(
      result.judgments.filter((item) => item.topic === "season").map((item) => item.value),
    ).toEqual(["死", "旺"]);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: "season", resolution: "unresolved" }),
      ]),
    );
    expect(result.status).toBe("partial");
  });
  it("does not turn an unknown hour or day into a root absence or a strong conclusion", () => {
    const source = deriveNatalFacts({ ...base, day: null, hour: null }, catalog);
    const result = diagnoseStructure(source);
    expect(result.facts.dayMaster).toBeNull();
    expect(result.facts.roots.status).toBe("unavailable");
    expect(
      result.judgments
        .filter((item) => item.topic === "strength")
        .every((item) => item.value === "undetermined"),
    ).toBe(true);
    expect(result.limitations).toContain("DAY_MASTER_UNKNOWN");
  });
  it("rejects unapproved methods, versions and malformed input without reflecting raw values", () => {
    for (const ruleSet of [
      { ruleSetId: "unapproved", ruleSetVersion: "1.0.0" },
      { ruleSetId: "m01.conservative-structure", ruleSetVersion: "2.0.0" },
    ])
      expect(() => diagnoseStructure(facts(), ruleSet)).toThrow("Structure rule set was rejected.");
    expect(() => diagnoseStructure({ raw: "synthetic-private-input" })).toThrow(
      "Structure facts were rejected.",
    );
  });
});
