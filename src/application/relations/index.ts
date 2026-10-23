import { z } from "zod";
import {
  calculateStructureDiagnosis,
  StructureCalculationResultSchema,
} from "@/application/structure";
import type { NatalFactsDependencies } from "@/application/natal-facts";
import {
  analyzeRelations,
  RelationAnalysisSchema,
  type PillarReference,
} from "@/domain/judgment/relations";
import { deepEqualCanonical } from "@/domain/json";

const positions = ["year", "month", "day", "hour"] as const;
export const RelationsCalculationResultSchema = z
  .strictObject({
    status: z.enum(["partial", "unavailable"]),
    analysis: StructureCalculationResultSchema,
    relations: RelationAnalysisSchema.nullable(),
  })
  .refine((value) => {
    const facts = value.analysis.core.facts;
    if (!facts) return value.status === "unavailable" && value.relations === null;
    return (
      value.relations !== null &&
      value.status === value.relations.status &&
      deepEqualCanonical(value.relations.pillars, natalReferences(facts.sourcePillars))
    );
  })
  .readonly();
export type RelationsCalculationResult = z.infer<typeof RelationsCalculationResultSchema>;

function natalReferences(pillars: {
  readonly [K in (typeof positions)[number]]: PillarReference["pillar"];
}): PillarReference[] {
  return positions
    .map((position): PillarReference => ({
      referenceId: `natal:${position}`,
      source: "natal",
      contextId: "native",
      position,
      pillar: pillars[position],
    }))
    .sort((a, b) => (a.referenceId < b.referenceId ? -1 : a.referenceId > b.referenceId ? 1 : 0));
}

/** Reuse confirmed core and M01 once. Do not reevaluate M01 candidates using unassessed effects. */
export function calculateRelations(
  value: unknown,
  dependencies: NatalFactsDependencies,
): RelationsCalculationResult {
  const analysis = calculateStructureDiagnosis(value, dependencies);
  const relations = analysis.core.facts
    ? analyzeRelations(natalReferences(analysis.core.facts.sourcePillars))
    : null;
  const result = RelationsCalculationResultSchema.parse({
    status: relations?.status ?? "unavailable",
    analysis,
    relations,
  });
  return Object.freeze({ ...result, analysis, relations });
}
