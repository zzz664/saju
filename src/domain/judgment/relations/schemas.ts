import { z } from "zod";
import { CoverageStatusSchema } from "@/domain/contracts";
import { StemSchema, BranchSchema, ElementSchema } from "@/domain/natal-facts/schemas";

export const MAX_RELATION_PILLARS = 32;
export const ReferenceIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/);
export const RelationSourceSchema = z.enum([
  "natal",
  "luck",
  "annual",
  "monthly",
  "daily",
  "personA",
  "personB",
]);
export const RelationPillarSchema = z
  .strictObject({ heavenlyStem: StemSchema, earthlyBranch: BranchSchema })
  .refine(
    (p) =>
      StemSchema.options.indexOf(p.heavenlyStem) % 2 ===
      BranchSchema.options.indexOf(p.earthlyBranch) % 2,
  )
  .readonly();
export const PillarReferenceSchema = z
  .strictObject({
    referenceId: ReferenceIdSchema,
    source: RelationSourceSchema,
    contextId: ReferenceIdSchema,
    position: z.enum(["year", "month", "day", "hour", "period"]),
    pillar: RelationPillarSchema.nullable(),
  })
  .readonly();
export const RelationInputSchema = z
  .array(PillarReferenceSchema)
  .min(1)
  .max(MAX_RELATION_PILLARS)
  .refine((refs) => new Set(refs.map((ref) => ref.referenceId)).size === refs.length)
  .refine(
    (refs) =>
      new Set(refs.map((ref) => `${ref.source}|${ref.contextId}|${ref.position}`)).size ===
      refs.length,
  )
  .readonly();
export const RelationRuleSetSchema = z
  .strictObject({
    ruleSetId: z.literal("m02.classical-relations"),
    ruleSetVersion: z.literal("1.0.0"),
    stemClash: z.enum(["four-pairs", "not-adopted"]),
    punishment: z.enum(["pairwise", "full-group"]),
  })
  .readonly();
export const RelationTypeSchema = z.enum([
  "stem-combination",
  "stem-clash",
  "branch-six-combination",
  "branch-three-combination",
  "branch-directional-combination",
  "branch-clash",
  "branch-punishment",
  "branch-self-punishment",
  "branch-break",
  "branch-harm",
]);
export const RelationLimitationSchema = z.enum([
  "MISSING_PILLARS",
  "EFFECT_NOT_ASSESSED",
  "TRANSFORMATION_NOT_ASSESSED",
  "ADJACENCY_NOT_ASSESSED",
  "STEM_CLASH_NOT_ADOPTED",
  "FULL_GROUP_PUNISHMENT_POLICY",
]);
const RelationIdSchema = z.string().min(1).max(300);
export const GanjiRelationSchema = z
  .strictObject({
    relationId: RelationIdSchema,
    relationType: RelationTypeSchema,
    participants: z.array(ReferenceIdSchema).min(2).max(3).readonly(),
    status: z.literal("complete"),
    precision: z.literal("confirmed"),
    ruleId: z.string().regex(/^m02\.[a-z0-9.-]+$/),
    ruleVersion: z.literal("1.0.0"),
    priority: z.number().int().min(0).max(100),
    sourceRefs: z.array(z.string().min(1)).min(1).max(2).readonly(),
    inputPaths: z.array(z.string().min(1)).min(2).max(3).readonly(),
    evidence: z
      .array(
        z
          .strictObject({
            referenceId: ReferenceIdSchema,
            inputPath: z.string().regex(/^pillars\.\d+\.pillar\.(heavenlyStem|earthlyBranch)$/),
            symbol: z.union([StemSchema, BranchSchema]),
          })
          .readonly(),
      )
      .min(2)
      .max(3)
      .readonly(),
    elementAssociation: ElementSchema.nullable(),
    effect: z
      .strictObject({
        status: z.literal("unavailable"),
        intensity: z.null(),
        transformation: z.literal("not-assessed"),
      })
      .readonly(),
    exceptionsApplied: z.array(RelationLimitationSchema).max(6).readonly(),
    caveats: z.array(z.string().min(1).max(400)).min(1).max(3).readonly(),
  })
  .readonly();
export const RelationAnalysisSchema = z
  .strictObject({
    moduleId: z.literal("M02"),
    schemaVersion: z.literal("1.0.0"),
    status: z.enum(["partial", "unavailable"]),
    ruleSet: RelationRuleSetSchema,
    pillars: RelationInputSchema,
    coverage: z
      .strictObject({
        status: CoverageStatusSchema,
        knownPillars: z.number().int().min(0).max(MAX_RELATION_PILLARS),
        missingReferenceIds: z.array(ReferenceIdSchema).max(MAX_RELATION_PILLARS).readonly(),
      })
      .readonly(),
    relations: z.array(GanjiRelationSchema).max(10000).readonly(),
    conflicts: z
      .array(
        z
          .strictObject({
            conflictId: RelationIdSchema,
            referenceId: ReferenceIdSchema,
            reason: z.enum(["COMBINATION_WITH_OPPOSITION", "MULTIPLE_COMBINATION_PARTNERS"]),
            relationIds: z.array(RelationIdSchema).min(2).max(10000).readonly(),
            resolution: z.literal("unresolved"),
          })
          .readonly(),
      )
      .max(MAX_RELATION_PILLARS * 4)
      .readonly(),
    limitations: z.array(RelationLimitationSchema).max(6).readonly(),
    provenance: z
      .strictObject({ rulesVersion: z.literal("1.0.0"), sourceCatalogVersion: z.literal("1.0.0") })
      .readonly(),
  })
  .readonly();
export type PillarReference = z.infer<typeof PillarReferenceSchema>;
export type RelationRuleSet = z.infer<typeof RelationRuleSetSchema>;
export type RelationAnalysis = z.infer<typeof RelationAnalysisSchema>;
export type GanjiRelation = z.infer<typeof GanjiRelationSchema>;
export type RelationLimitation = z.infer<typeof RelationLimitationSchema>;
