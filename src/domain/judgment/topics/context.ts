import { z } from "zod";
import { parseDerivedNatalFacts } from "@/domain/natal-facts";
import { parseStructureDiagnosis } from "@/domain/judgment/structure";
import { parseRelationAnalysis } from "@/domain/judgment/relations";
import { deepEqualCanonical } from "@/domain/json";

const inputSchema = z.strictObject({
  facts: z.unknown(),
  structure: z.unknown(),
  relations: z.unknown(),
});
/** Semantic boundary; live immutable module results reuse their verified identity. */
export function parseTopicContext(value: unknown) {
  const raw = inputSchema.parse(value);
  const facts = parseDerivedNatalFacts(raw.facts);
  const structure = parseStructureDiagnosis(facts, raw.structure);
  const relations = parseRelationAnalysis(raw.relations);
  const refs = relations.pillars;
  if (refs.length !== 4 || new Set(refs.map((ref) => ref.contextId)).size !== 1)
    throw new Error("Inconsistent natal scope.");
  for (const position of ["year", "month", "day", "hour"] as const) {
    const matches = refs.filter((ref) => ref.source === "natal" && ref.position === position);
    if (
      matches.length !== 1 ||
      !deepEqualCanonical(matches[0].pillar, facts.sourcePillars[position])
    )
      throw new Error("Inconsistent natal scope.");
  }
  return Object.freeze({ facts, structure, relations });
}
export type TopicContext = ReturnType<typeof parseTopicContext>;
