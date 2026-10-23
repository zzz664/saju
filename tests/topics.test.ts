import { describe, expect, it } from "vitest";
import { evaluateTopic } from "@/domain/judgment/topics";
import { deriveNatalFacts } from "@/domain/natal-facts";
import { diagnoseStructure } from "@/domain/judgment/structure";
import { analyzeRelations } from "@/domain/judgment/relations";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";

const pillars = {
  year: { heavenlyStem: "임", earthlyBranch: "자" },
  month: { heavenlyStem: "병", earthlyBranch: "인" },
  day: { heavenlyStem: "갑", earthlyBranch: "진" },
  hour: { heavenlyStem: "무", earthlyBranch: "오" },
} as const;
function context() {
  const facts = deriveNatalFacts(pillars, manseryeokSymbolCatalogAdapter.load());
  return {
    facts,
    structure: diagnoseStructure(facts),
    relations: analyzeRelations(
      Object.entries(pillars).map(([position, pillar]) => ({
        referenceId: `natal:${position}`,
        source: "natal",
        contextId: "native",
        position,
        pillar,
      })),
    ),
  };
}
describe("M03 topic acceptance", () => {
  it("selects only the requested topic pack and preserves confirmed data", () => {
    const input = context(),
      before = structuredClone(input),
      result = evaluateTopic(input, "career");
    expect(result.topic).toBe("career");
    expect(result.evaluatedRuleIds).toHaveLength(3);
    expect(result.evaluatedRuleIds.every((id) => id.startsWith("m03.career."))).toBe(true);
    expect(result.findings.some((f) => f.ruleId === "m03.career.output-wealth")).toBe(true);
    expect(input).toEqual(before);
    expect(Object.isFrozen(result.findings)).toBe(true);
  });
  it("retains context review ahead of tentative interpretations", () => {
    const result = evaluateTopic(context(), "temperament");
    expect(result.findings[0].kind).toBe("context-review");
    expect(
      result.findings
        .filter((f) => f.kind === "candidate")
        .every((f) => f.disposition === "deferred"),
    ).toBe(true);
    expect(result.status).toBe("partial");
  });
  it("rejects an unsupported topic and inconsistent module data safely", () => {
    expect(() => evaluateTopic(context(), "synthetic-private-topic")).toThrow(
      "Topic was rejected.",
    );
    const input = context();
    expect(() =>
      evaluateTopic({ ...input, structure: { ...input.structure, conflicts: [] } }, "career"),
    ).toThrow("Topic context was rejected.");
  });
});
