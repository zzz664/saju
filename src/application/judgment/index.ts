import { z } from "zod";
import { evaluateBaseJudgments, JudgmentEvaluationSchema, evidenceMatchesFacts } from "../../domain/judgment/index";
import { calculateNatalFacts, NatalFactsCalculationResultSchema, type NatalFactsDependencies } from "../natal-facts/index";

export const JudgmentCalculationResultSchema = z.strictObject({
  status: z.enum(["complete", "partial", "unavailable"]),
  analysis: NatalFactsCalculationResultSchema,
  evaluation: JudgmentEvaluationSchema.nullable(),
}).refine((value) => value.status === value.analysis.status && (value.analysis.facts === null ? value.evaluation === null
  : value.evaluation !== null && evidenceMatchesFacts(value.analysis.facts, value.evaluation))).readonly();
export type JudgmentCalculationResult = z.infer<typeof JudgmentCalculationResultSchema>;

/** Evaluate existing confirmed facts without altering calendar calculations or candidate charts. */
export function calculateJudgments(value: unknown, dependencies: NatalFactsDependencies): JudgmentCalculationResult {
  const analysis = calculateNatalFacts(value, dependencies);
  const evaluation = analysis.facts === null ? null : evaluateBaseJudgments(analysis.facts);
  return JudgmentCalculationResultSchema.parse({ status: analysis.status, analysis, evaluation });
}
