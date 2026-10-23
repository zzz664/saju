import { deriveNatalFacts, type DerivedNatalFacts } from "@/domain/natal-facts";
import { diagnoseStructure } from "@/domain/judgment/structure";
import { analyzeRelations } from "@/domain/judgment/relations";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";

export type TopicPillars = DerivedNatalFacts["sourcePillars"];
export const topicPillars: TopicPillars = {
  year: { heavenlyStem: "임", earthlyBranch: "자" },
  month: { heavenlyStem: "병", earthlyBranch: "인" },
  day: { heavenlyStem: "갑", earthlyBranch: "진" },
  hour: { heavenlyStem: "경", earthlyBranch: "신" },
};
export function topicContext(pillars: TopicPillars = topicPillars) {
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
export function uniformChart(
  heavenlyStem: NonNullable<TopicPillars["year"]>["heavenlyStem"],
  earthlyBranch: NonNullable<TopicPillars["year"]>["earthlyBranch"],
  dayBranch: NonNullable<TopicPillars["day"]>["earthlyBranch"] = "자",
): TopicPillars {
  const pillar = { heavenlyStem, earthlyBranch };
  return {
    year: pillar,
    month: pillar,
    day: { heavenlyStem: "갑", earthlyBranch: dayBranch },
    hour: pillar,
  };
}
