import { z } from "zod";
import { calculateCoreExport } from "@/application/core-export";
import type { NatalFactsDependencies } from "@/application/natal-facts";
import { CoreExportSchema } from "@/domain/core-export/schemas";
import { diagnoseStructure, StructureDiagnosisSchema } from "@/domain/judgment/structure";
import { deepEqualCanonical } from "@/domain/json";

export const StructureCalculationResultSchema = z
  .strictObject({
    status: z.enum(["partial", "unavailable"]),
    core: CoreExportSchema,
    structure: StructureDiagnosisSchema.nullable(),
  })
  .refine((value) =>
    value.core.facts === null
      ? value.status === "unavailable" && value.structure === null
      : value.structure !== null &&
        value.status === value.structure.status &&
        deepEqualCanonical(value.core.facts.sourcePillars, value.structure.facts.sourcePillars),
  )
  .readonly();
export type StructureCalculationResult = z.infer<typeof StructureCalculationResultSchema>;

/** M01 is a separate review artifact. The base export, hash and LLM contracts stay unchanged. */
export function calculateStructureDiagnosis(
  value: unknown,
  dependencies: NatalFactsDependencies,
): StructureCalculationResult {
  const core = calculateCoreExport(value, dependencies);
  const structure = core.facts === null ? null : diagnoseStructure(core.facts);
  return StructureCalculationResultSchema.parse({
    status: structure?.status ?? "unavailable",
    core,
    structure,
  });
}
