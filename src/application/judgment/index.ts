import { z } from "zod";
import {
  evaluateBaseJudgments,
  JudgmentEvaluationSchema,
  evidenceMatchesFacts,
} from "@/domain/judgment";
import {
  arbitrateBaseJudgments,
  arbitrationMatchesEvaluation,
  BaseArbitrationSchema,
} from "@/domain/judgment/arbitration";
import {
  calculateNatalFacts,
  NatalFactsCalculationResultSchema,
  type NatalFactsDependencies,
} from "@/application/natal-facts";

export const JudgmentCalculationResultSchema = z
  .strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    analysis: NatalFactsCalculationResultSchema,
    evaluation: JudgmentEvaluationSchema.nullable(),
  })
  .refine(
    (value) =>
      value.status === value.analysis.status &&
      (value.analysis.facts === null
        ? value.evaluation === null
        : value.evaluation !== null &&
          evidenceMatchesFacts(value.analysis.facts, value.evaluation)),
  )
  .readonly();
export type JudgmentCalculationResult = z.infer<typeof JudgmentCalculationResultSchema>;

/** Evaluate existing confirmed facts without altering calendar calculations or candidate charts. */
export function calculateJudgments(
  value: unknown,
  dependencies: NatalFactsDependencies,
): JudgmentCalculationResult {
  const analysis = calculateNatalFacts(value, dependencies);
  const evaluation = analysis.facts === null ? null : evaluateBaseJudgments(analysis.facts);
  return JudgmentCalculationResultSchema.parse({ status: analysis.status, analysis, evaluation });
}

export const ArbitratedJudgmentCalculationResultSchema = z
  .strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    judgment: JudgmentCalculationResultSchema,
    resolution: BaseArbitrationSchema.nullable(),
  })
  .refine(({ status, judgment, resolution }) => {
    if (judgment.evaluation === null) return resolution === null && status === judgment.status;
    if (resolution === null || !arbitrationMatchesEvaluation(judgment.evaluation, resolution))
      return false;
    const states = [judgment.status, resolution.arbitration.status];
    return (
      status ===
      (states.includes("unavailable")
        ? "unavailable"
        : states.includes("partial")
          ? "partial"
          : "complete")
    );
  })
  .readonly();
export type ArbitratedJudgmentCalculationResult = z.infer<
  typeof ArbitratedJudgmentCalculationResultSchema
>;

/** Preserve the source analysis/evaluation and add independently traceable arbitration. */
export function calculateArbitratedJudgments(
  value: unknown,
  dependencies: NatalFactsDependencies,
): ArbitratedJudgmentCalculationResult {
  const judgment = calculateJudgments(value, dependencies);
  const resolution =
    judgment.evaluation === null ? null : arbitrateBaseJudgments(judgment.evaluation);
  const states = [judgment.status, resolution?.arbitration.status ?? judgment.status];
  const status = states.includes("unavailable")
    ? "unavailable"
    : states.includes("partial")
      ? "partial"
      : "complete";
  return ArbitratedJudgmentCalculationResultSchema.parse({ status, judgment, resolution });
}
