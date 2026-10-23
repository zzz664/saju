import { deepEqualCanonical } from "@/domain/json";
import { z } from "zod";
import {
  deriveNatalFacts,
  DerivedNatalFactsSchema,
  NatalFactsError,
  type SymbolCatalogAdapter,
} from "@/domain/natal-facts";
import {
  calculatePolicySaju,
  PolicyCalculationResultSchema,
  type PolicySajuDependencies,
} from "@/application/policy-saju";

export interface NatalFactsDependencies extends PolicySajuDependencies {
  readonly symbols: SymbolCatalogAdapter;
}

export const NatalFactsCalculationResultSchema = z
  .strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    calculation: PolicyCalculationResultSchema,
    facts: DerivedNatalFactsSchema.nullable(),
  })
  .refine((value) => {
    const calculation = value.calculation;
    if (calculation.status === "rejected" || calculation.status === "unavailable")
      return value.status === "unavailable" && value.facts === null;
    const source =
      calculation.status === "calculated"
        ? calculation.snapshot.pillars
        : calculation.confirmedPillars;
    return (
      value.facts !== null &&
      deepEqualCanonical(source, value.facts.sourcePillars) &&
      value.status === (calculation.status === "calculated" ? "complete" : "partial")
    );
  })
  .readonly();
export type NatalFactsCalculationResult = z.infer<typeof NatalFactsCalculationResultSchema>;

/** Derive once from confirmed pillars; candidate charts are never merged into an observed chart. */
export function calculateNatalFacts(
  value: unknown,
  dependencies: NatalFactsDependencies,
): NatalFactsCalculationResult {
  const calculation = calculatePolicySaju(value, dependencies);
  if (calculation.status === "rejected" || calculation.status === "unavailable") {
    return NatalFactsCalculationResultSchema.parse({
      status: "unavailable",
      calculation,
      facts: null,
    });
  }
  let catalog: unknown;
  try {
    catalog = dependencies.symbols.load();
  } catch (error) {
    throw new NatalFactsError(
      error instanceof NatalFactsError ? error.code : "CATALOG_LOAD_FAILED",
    );
  }
  const facts = deriveNatalFacts(
    calculation.status === "calculated"
      ? calculation.snapshot.pillars
      : calculation.confirmedPillars,
    catalog,
  );
  return NatalFactsCalculationResultSchema.parse({
    status: calculation.status === "calculated" ? "complete" : "partial",
    calculation,
    facts,
  });
}
