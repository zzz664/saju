import { z } from "zod";
import {
  BirthInputSchema,
  CalculationPolicySchema,
  TimezoneIdSchema,
} from "@/domain/input/schemas";
import { CoverageStatusSchema, HexDigestSchema } from "@/domain/contracts";
import { HashedCoreExportSchema } from "@/domain/core-fingerprint/schemas";
import { TopicSchema } from "@/domain/judgment/topics/schemas";
import { isGregorianDate } from "@/domain/utilities";

export const FeatureIdSchema = z.enum([
  "F01",
  "F02",
  "F03",
  "F04",
  "F05",
  "F06",
  "F07",
  "F08",
  "F09",
  "F10",
  "F11",
]);
export const ModuleIdSchema = z.enum(["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"]);
export const SubjectSchema = z.enum(["primary", "other", "pair"]);
export const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const year = z.number().int().min(1).max(9999);
const date = z
  .string()
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    return month >= 1 && month <= 12 && isGregorianDate({ year, month, day });
  });
export const LuckTargetSchema = z
  .strictObject({ at: z.iso.datetime({ offset: true }), timezoneId: TimezoneIdSchema })
  .readonly();
export const AnnualTargetSchema = z.strictObject({ year, timezoneId: TimezoneIdSchema }).readonly();
export const DailyTargetSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("monthly"),
      year,
      month: z.number().int().min(1).max(12),
      timezoneId: TimezoneIdSchema,
    }),
    z.strictObject({ kind: z.literal("daily"), date, timezoneId: TimezoneIdSchema }),
    z.strictObject({ kind: z.literal("today"), date, timezoneId: TimezoneIdSchema }),
  ])
  .readonly();
export const FeatureTargetSchema = z.union([
  LuckTargetSchema,
  AnnualTargetSchema,
  DailyTargetSchema,
]);
const common = { birthInput: BirthInputSchema, calculationPolicy: CalculationPolicySchema };
export const FeatureRequestSchema = z
  .discriminatedUnion("featureId", [
    z.strictObject({ featureId: z.literal("F01"), ...common }),
    z.strictObject({ featureId: z.literal("F02"), ...common }),
    z.strictObject({ featureId: z.literal("F03"), ...common }),
    z.strictObject({ featureId: z.literal("F04"), ...common }),
    z.strictObject({ featureId: z.literal("F05"), ...common }),
    z.strictObject({ featureId: z.literal("F06"), ...common }),
    z.strictObject({ featureId: z.literal("F07"), ...common }),
    z.strictObject({ featureId: z.literal("F08"), ...common, target: LuckTargetSchema }),
    z.strictObject({ featureId: z.literal("F09"), ...common, target: AnnualTargetSchema }),
    z.strictObject({ featureId: z.literal("F10"), ...common, target: DailyTargetSchema }),
    z.strictObject({
      featureId: z.literal("F11"),
      ...common,
      otherBirthInput: BirthInputSchema,
      otherCalculationPolicy: CalculationPolicySchema,
    }),
  ])
  .readonly();
export const FeatureLimitationSchema = z.enum([
  "CORE_UNAVAILABLE",
  "UPSTREAM_PARTIAL",
  "MODULE_NOT_IMPLEMENTED",
  "EXECUTOR_NOT_IMPLEMENTED",
  "SUBFEATURE_INCOMPLETE",
  "EXECUTION_UNAVAILABLE",
]);
export const FeatureJudgmentSchema = z
  .strictObject({
    judgmentId: z.string().min(1).max(300),
    originModule: z.union([z.literal("base"), ModuleIdSchema]),
    subject: SubjectSchema,
    topic: TopicSchema.nullable(),
    assertion: z.string().min(1).max(600),
    status: z.enum(["complete", "partial"]),
    precision: z.enum(["confirmed", "partial"]),
    disposition: z.enum(["accepted", "candidate", "deferred", "review-required"]),
    ruleId: z.string().min(1).max(150),
    ruleVersion: VersionSchema,
    sourceRefs: z.array(z.string().min(1)).min(1).max(4).readonly(),
    evidence: z
      .array(
        z
          .strictObject({
            inputPath: z.string().min(1).max(300),
            value: z.string().min(1).max(300),
          })
          .readonly(),
      )
      .min(1)
      .max(64)
      .readonly(),
    caveats: z.array(z.string().min(1).max(600)).min(1).max(4).readonly(),
    exceptionsApplied: z.array(z.string()).max(20).readonly(),
  })
  .readonly();
export const ModuleSnapshotSchema = z
  .strictObject({
    moduleId: ModuleIdSchema,
    subject: SubjectSchema,
    topic: TopicSchema.nullable(),
    version: VersionSchema.nullable(),
    status: CoverageStatusSchema,
    judgments: z.array(FeatureJudgmentSchema).max(100).readonly(),
    limitations: z.array(FeatureLimitationSchema).max(6).readonly(),
  })
  .readonly();
export const ComponentSchema = z
  .strictObject({
    featureId: FeatureIdSchema,
    profileVersion: VersionSchema,
    executorVersion: VersionSchema.nullable(),
    status: CoverageStatusSchema,
    implementation: z.enum(["registered", "missing", "aggregate"]),
    judgmentIds: z.array(z.string()).max(500).readonly(),
    limitations: z.array(FeatureLimitationSchema).max(6).readonly(),
  })
  .readonly();
export const FeatureResultSchema = z
  .strictObject({
    featureId: FeatureIdSchema,
    status: CoverageStatusSchema,
    judgments: z.array(FeatureJudgmentSchema).max(500).readonly(),
    limitations: z.array(FeatureLimitationSchema).max(6).readonly(),
    target: FeatureTargetSchema.nullable(),
    core: HashedCoreExportSchema,
    otherCore: HashedCoreExportSchema.nullable(),
    modules: z.array(ModuleSnapshotSchema).max(40).readonly(),
    components: z.array(ComponentSchema).min(1).max(7).readonly(),
    provenance: z
      .strictObject({
        moduleId: z.literal("M09"),
        schemaVersion: z.literal("1.0.0"),
        rulesVersion: z.literal("1.0.0"),
        featureProfileVersion: VersionSchema,
        calculationPolicyVersion: z.literal("core-manifest-v1"),
      })
      .readonly(),
    cacheKey: HexDigestSchema,
  })
  .refine(
    (result) =>
      new Set(result.judgments.map((j) => j.judgmentId)).size === result.judgments.length &&
      new Set(result.components.map((component) => component.featureId)).size ===
        result.components.length &&
      (result.featureId === "F01"
        ? result.components.length === 7 &&
          ["F01", "F02", "F03", "F04", "F05", "F06", "F07"].every((id) =>
            result.components.some((component) => component.featureId === id),
          )
        : result.components.length === 1) &&
      new Set(
        result.modules.map(
          (module) => `${module.subject}:${module.moduleId}:${module.topic ?? ""}`,
        ),
      ).size === result.modules.length &&
      (result.featureId === "F08"
        ? LuckTargetSchema.safeParse(result.target).success
        : result.featureId === "F09"
          ? AnnualTargetSchema.safeParse(result.target).success
          : result.featureId === "F10"
            ? DailyTargetSchema.safeParse(result.target).success
            : result.target === null) &&
      result.components.every((component) =>
        component.judgmentIds.every((id) => result.judgments.some((j) => j.judgmentId === id)),
      ) &&
      result.components.some(
        (component) =>
          component.featureId === result.featureId && component.status === result.status,
      ) &&
      (result.featureId === "F11" ? result.otherCore !== null : result.otherCore === null) &&
      (result.status !== "complete" ||
        (result.limitations.length === 0 &&
          result.core.status === "complete" &&
          (result.otherCore === null || result.otherCore.status === "complete") &&
          result.modules.every(
            (m) => m.status === "complete" && m.version !== null && m.limitations.length === 0,
          ) &&
          result.components.every(
            (c) =>
              c.status === "complete" &&
              c.limitations.length === 0 &&
              c.implementation !== "missing" &&
              (c.implementation === "aggregate" || c.executorVersion !== null),
          ) &&
          result.judgments.every(
            (j) =>
              j.status === "complete" &&
              j.precision === "confirmed" &&
              j.disposition === "accepted",
          ))),
  )
  .readonly();
export const FeatureNarrationInputSchema = z
  .strictObject({
    featureId: FeatureIdSchema,
    status: CoverageStatusSchema,
    target: FeatureTargetSchema.nullable(),
    verifiedFindings: z.array(FeatureJudgmentSchema).max(500).readonly(),
    limitations: z.array(FeatureLimitationSchema).max(6).readonly(),
  })
  .refine(
    (value) =>
      value.verifiedFindings.every(
        (j) =>
          j.status === "complete" && j.precision === "confirmed" && j.disposition === "accepted",
      ) &&
      (value.status !== "unavailable" || value.verifiedFindings.length === 0),
  )
  .readonly();
export type FeatureId = z.infer<typeof FeatureIdSchema>;
export type ModuleId = z.infer<typeof ModuleIdSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type FeatureRequest = z.infer<typeof FeatureRequestSchema>;
export type FeatureTarget = z.infer<typeof FeatureTargetSchema>;
export type FeatureJudgment = z.infer<typeof FeatureJudgmentSchema>;
export type ModuleSnapshot = z.infer<typeof ModuleSnapshotSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type FeatureLimitation = z.infer<typeof FeatureLimitationSchema>;
export type FeatureResult = z.infer<typeof FeatureResultSchema>;
export type FeatureNarrationInput = z.infer<typeof FeatureNarrationInputSchema>;
