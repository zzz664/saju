import { z } from "zod";
import { CoverageStatusSchema, TenGodSchema } from "@/domain/contracts";
import {
  BranchSchema,
  ElementSchema,
  KnownPillarsSchema,
  StemSchema,
} from "@/domain/natal-facts/schemas";

export const PositionSchema = z.enum(["year", "month", "day", "hour"]);
export const MethodSchema = z.enum(["four-season-exact-root", "month-qi-element-root"]);
export const StructureRuleSetSchema = z
  .strictObject({
    ruleSetId: z.literal("m01.conservative-structure"),
    ruleSetVersion: z.literal("1.0.0"),
    methods: z
      .array(MethodSchema)
      .min(1)
      .max(2)
      .refine((value) => new Set(value).size === value.length)
      .readonly(),
  })
  .readonly();
export const LimitationSchema = z.enum([
  "DAY_MASTER_UNKNOWN",
  "MONTH_PILLAR_UNKNOWN",
  "MISSING_PILLARS",
  "RELATIONS_NOT_ASSESSED",
  "STRENGTH_CANDIDATE_ONLY",
  "PATTERN_CANDIDATE_ONLY",
  "CLIMATE_RULE_NOT_ADOPTED",
  "METHOD_DISAGREEMENT",
]);
export const EvidenceSchema = z
  .strictObject({
    inputPath: z
      .string()
      .regex(
        /^(dayMaster|positions\.(year|month|day|hour)(\.(stem\.(stem|element|tenGod)|branch\.(branch|mainStem|element|tenGod|hiddenStems\.\d+\.(stem|element|tenGod))))?)$/,
      ),
    value: z.string().min(1).max(20),
  })
  .readonly();
const RootSchema = z
  .strictObject({
    position: PositionSchema,
    hiddenIndex: z.number().int().min(0).max(2),
    stem: StemSchema,
    element: ElementSchema,
    isMain: z.boolean(),
  })
  .readonly();
const ExposureSchema = z
  .strictObject({
    branchPosition: PositionSchema,
    hiddenIndex: z.number().int().min(0).max(2),
    stem: StemSchema,
    visiblePosition: z.enum(["year", "month", "hour"]),
  })
  .readonly();
export const StructureFactsSchema = z
  .strictObject({
    sourcePillars: KnownPillarsSchema,
    dayMaster: StemSchema.nullable(),
    dayElement: ElementSchema.nullable(),
    month: z
      .strictObject({
        branch: BranchSchema,
        mainStem: StemSchema,
        mainElement: ElementSchema,
        mainTenGod: TenGodSchema.nullable(),
        seasonalElement: ElementSchema,
      })
      .readonly()
      .nullable(),
    roots: z
      .strictObject({
        status: CoverageStatusSchema,
        exact: z.array(RootSchema).max(12).readonly(),
        sameElement: z.array(RootSchema).max(12).readonly(),
      })
      .readonly(),
    exposures: z.array(ExposureSchema).max(36).readonly(),
    missingPositions: z.array(PositionSchema).max(4).readonly(),
  })
  .readonly();
export const TopicSchema = z.enum(["season", "root", "exposure", "strength", "pattern", "climate"]);
export const JudgmentValueSchema = z.enum([
  "旺",
  "相",
  "休",
  "囚",
  "死",
  "observed",
  "not-observed",
  "unknown",
  "strong-candidate",
  "weak-candidate",
  "mixed",
  "undetermined",
  "candidate",
  "not-adopted",
]);
export const StructureJudgmentSchema = z
  .strictObject({
    judgmentId: z.string().regex(/^m01:[a-z-]+:[a-z-]+$/),
    topic: TopicSchema,
    methodId: MethodSchema,
    value: JudgmentValueSchema,
    status: CoverageStatusSchema,
    precision: z.enum(["confirmed", "partial", "unknown"]),
    assertion: z.string().min(1).max(500),
    ruleId: z.string().regex(/^m01\.[a-z-]+$/),
    ruleVersion: z.literal("1.0.0"),
    priority: z.number().int().min(0).max(100),
    sourceRefs: z.array(z.string().min(1)).min(1).max(3).readonly(),
    inputPaths: z.array(z.string().min(1)).min(1).max(12).readonly(),
    evidence: z.array(EvidenceSchema).max(64).readonly(),
    exceptionsApplied: z.array(LimitationSchema).max(8).readonly(),
    caveats: z.array(z.string().min(1).max(500)).min(1).max(4).readonly(),
  })
  .readonly();
const CandidateSchema = z
  .strictObject({
    candidateId: z.string().min(1).max(180),
    methodId: MethodSchema,
    purpose: z.enum(["pattern", "month-order", "climate"]),
    targetStem: StemSchema,
    tenGod: TenGodSchema.nullable(),
    basis: z.enum(["month-main", "exposed-month-hidden", "jia-yin-climate"]),
    precision: z.literal("partial"),
    judgmentId: z.string().min(1),
    evidence: z.array(EvidenceSchema).min(1).max(8).readonly(),
  })
  .readonly();
export const StructureDiagnosisSchema = z
  .strictObject({
    moduleId: z.literal("M01"),
    schemaVersion: z.literal("1.0.0"),
    status: CoverageStatusSchema,
    ruleSet: StructureRuleSetSchema,
    facts: StructureFactsSchema,
    judgments: z.array(StructureJudgmentSchema).min(6).max(12).readonly(),
    conflicts: z
      .array(
        z
          .strictObject({
            conflictId: z.string().min(1),
            topic: TopicSchema,
            judgmentIds: z.array(z.string().min(1)).length(2).readonly(),
            reason: z.literal("METHOD_DISAGREEMENT"),
            resolution: z.literal("unresolved"),
          })
          .readonly(),
      )
      .max(6)
      .readonly(),
    patternCandidates: z.array(CandidateSchema).max(8).readonly(),
    usefulGodCandidates: z.array(CandidateSchema).max(12).readonly(),
    limitations: z.array(LimitationSchema).max(8).readonly(),
    provenance: z
      .strictObject({
        rulesVersion: z.literal("1.0.0"),
        sourceCatalogVersion: z.literal("1.0.0"),
        facts: z
          .object({
            schemaVersion: z.literal("1.0.0"),
            hiddenStemConvention: z.literal("yuanhai-28-main-first"),
          })
          .strict()
          .readonly(),
      })
      .readonly(),
  })
  .readonly();
export type StructureDiagnosis = z.infer<typeof StructureDiagnosisSchema>;
export type StructureJudgment = z.infer<typeof StructureJudgmentSchema>;
export type StructureFacts = z.infer<typeof StructureFactsSchema>;
export type Method = z.infer<typeof MethodSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Limitation = z.infer<typeof LimitationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
