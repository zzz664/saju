import { z } from "zod";
import { calculateRelations, RelationsCalculationResultSchema } from "@/application/relations";
import type { NatalFactsDependencies } from "@/application/natal-facts";
import {
  evaluateTopic,
  TopicSchema,
  TopicEvaluationSchema,
  TopicError,
} from "@/domain/judgment/topics";

export const TopicCalculationResultSchema = z
  .strictObject({
    status: z.enum(["partial", "unavailable"]),
    topic: TopicSchema,
    analysis: RelationsCalculationResultSchema,
    evaluation: TopicEvaluationSchema.nullable(),
  })
  .refine((value) =>
    value.analysis.analysis.core.facts === null
      ? value.status === "unavailable" && value.evaluation === null
      : value.evaluation !== null &&
        value.topic === value.evaluation.topic &&
        value.status === value.evaluation.status,
  )
  .readonly();
export type TopicCalculationResult = z.infer<typeof TopicCalculationResultSchema>;

/** Calculate once then apply one topic pack; M09 and feature/profile composition are separate work. */
export function calculateTopic(
  value: unknown,
  requestedTopic: unknown,
  dependencies: NatalFactsDependencies,
): TopicCalculationResult {
  const topic = TopicSchema.safeParse(requestedTopic);
  if (!topic.success) throw new TopicError("TOPIC_REJECTED");
  const analysis = calculateRelations(value, dependencies);
  const facts = analysis.analysis.core.facts,
    structure = analysis.analysis.structure,
    relations = analysis.relations;
  const evaluation =
    facts && structure && relations
      ? evaluateTopic({ facts, structure, relations }, topic.data)
      : null;
  const parsed = TopicCalculationResultSchema.parse({
    status: evaluation?.status ?? "unavailable",
    topic: topic.data,
    analysis,
    evaluation,
  });
  return Object.freeze({ ...parsed, analysis, evaluation });
}
