import { z } from "zod";
import { StructureRuleSetSchema } from "@/domain/judgment/structure/schemas";
import { RelationRuleSetSchema } from "@/domain/judgment/relations/schemas";

export const TopicSchema = z.enum([
  "temperament",
  "strengths",
  "career",
  "wealth",
  "romance",
  "social",
]);
export const TopicLimitationSchema = z.enum([
  "INTERPRETATION_CANDIDATE_ONLY",
  "MISSING_PILLARS",
  "DAY_MASTER_UNKNOWN",
  "NO_ADOPTED_PATTERN",
  "STRUCTURE_CONTEXT_UNCERTAIN",
  "RELATION_CONTEXT_CONFLICT",
  "EFFECT_NOT_ASSESSED",
]);
export const TopicEvidenceSchema = z
  .strictObject({
    inputPath: z.string().regex(/^(facts|structure|relations)\.[a-zA-Z0-9.]+$/),
    value: z.string().min(1).max(300),
  })
  .readonly();
export const TopicFindingSchema = z
  .strictObject({
    findingId: z.string().regex(/^m03:[a-z-]+:[a-z-]+$/),
    topic: TopicSchema,
    kind: z.enum(["candidate", "context-review"]),
    disposition: z.enum(["candidate", "deferred", "review-required"]),
    status: z.literal("partial"),
    precision: z.literal("partial"),
    assertion: z.string().min(1).max(400),
    ruleId: z.string().regex(/^m03\.[a-z-]+\.[a-z-]+$/),
    ruleVersion: z.literal("1.0.0"),
    priority: z.number().int().min(0).max(100),
    sourceRefs: z.array(z.string().min(1)).min(1).max(3).readonly(),
    inputPaths: z.array(z.string()).min(1).max(8).readonly(),
    evidence: z.array(TopicEvidenceSchema).min(1).max(8).readonly(),
    exceptionsApplied: z.array(TopicLimitationSchema).max(7).readonly(),
    caveats: z.array(z.string().min(1).max(400)).min(1).max(3).readonly(),
    conflictingWith: z.array(z.string().min(1)).max(3).readonly(),
  })
  .readonly();
export const TopicEvaluationSchema = z
  .strictObject({
    moduleId: z.literal("M03"),
    schemaVersion: z.literal("1.0.0"),
    topic: TopicSchema,
    status: z.enum(["partial", "unavailable"]),
    findings: z.array(TopicFindingSchema).max(3).readonly(),
    evaluatedRuleIds: z.array(z.string().min(1)).length(3).readonly(),
    conflicts: z
      .array(
        z
          .strictObject({
            guardFindingId: z.string(),
            candidateFindingIds: z.array(z.string()).min(1).max(2).readonly(),
            resolution: z.literal("defer-candidates"),
          })
          .readonly(),
      )
      .max(1)
      .readonly(),
    limitations: z.array(TopicLimitationSchema).max(7).readonly(),
    provenance: z
      .strictObject({
        ruleSetId: z.literal("m03.contextual-topics"),
        rulesVersion: z.literal("1.0.0"),
        sourceCatalogVersion: z.literal("1.0.0"),
        factsSchemaVersion: z.literal("1.0.0"),
        structure: StructureRuleSetSchema,
        relations: RelationRuleSetSchema,
      })
      .readonly(),
  })
  .readonly();
export type Topic = z.infer<typeof TopicSchema>;
export type TopicFinding = z.infer<typeof TopicFindingSchema>;
export type TopicEvaluation = z.infer<typeof TopicEvaluationSchema>;
export type TopicEvidence = z.infer<typeof TopicEvidenceSchema>;
export type TopicLimitation = z.infer<typeof TopicLimitationSchema>;
