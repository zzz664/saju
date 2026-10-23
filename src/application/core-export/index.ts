import { AnalysisInputSchema } from "@/domain/input";
import { validateCoreExport, type CoreExport } from "@/domain/core-export";
import { calculateArbitratedJudgments } from "@/application/judgment";
import type { NatalFactsDependencies } from "@/application/natal-facts";

/** Calculate once and project an explicit allowlist; raw input and time candidates stay local. */
export function calculateCoreExport(
  value: unknown,
  dependencies: NatalFactsDependencies,
): CoreExport {
  const input = AnalysisInputSchema.parse(value);
  const result = calculateArbitratedJudgments(input, dependencies);
  const { calculation, facts } = result.judgment.analysis;
  const reasons =
    calculation.status === "calculated"
      ? []
      : calculation.status === "partial"
        ? ["BIRTH_TIME_UNKNOWN"]
        : calculation.status === "rejected"
          ? [calculation.time.reason]
          : calculation.reasons;
  const library =
    calculation.status === "calculated"
      ? calculation.snapshot.provenance
      : calculation.status === "partial"
        ? calculation.provenance.library
        : null;
  const normalization =
    calculation.status === "calculated" || calculation.status === "rejected"
      ? calculation.time.provenance
      : calculation.status === "partial"
        ? calculation.provenance.normalization
        : null;
  return validateCoreExport({
    schemaVersion: "1.0.0",
    scope: "base-structural-observations",
    status: result.status,
    calculation: {
      status: calculation.status,
      policy: input.calculationPolicy,
      information: calculation.information,
      reasons,
      library,
      normalization,
    },
    facts,
    evaluation: result.judgment.evaluation,
    resolution: result.resolution,
  });
}
