import { PINNED_CALENDAR_LIBRARY } from "@/domain/provenance";
import { CoverageStatusSchema } from "@/domain/contracts";
import { TenGodSchema } from "@/domain/contracts";
import { z } from "zod";
import {
  StemSchema,
  BranchSchema,
  ElementSchema,
  KnownPillarsSchema,
} from "@/domain/natal-facts/schemas";

export const ExceptionSchema = z.enum([
  "DAY_MASTER_UNKNOWN",
  "MONTH_PILLAR_UNKNOWN",
  "INCOMPLETE_SEARCH_SCOPE",
]);
const Nonempty = z.string().min(1).max(1000);
const InputPathSchema = z
  .string()
  .regex(
    /^(dayMaster|positions\.(year|month|day|hour|\*)\.(stem\.(stem|element|tenGod)|branch\.(branch|mainStem|hiddenStems\.(\d+|\*)\.(stem|tenGod))))$/,
  );
const ConditionSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("day-element"), element: ElementSchema }),
    z.strictObject({
      kind: z.literal("month-season"),
      branches: z.array(BranchSchema).length(3).readonly(),
    }),
    z.strictObject({ kind: z.literal("exact-hidden-root") }),
    z.strictObject({ kind: z.literal("month-exposure"), part: z.enum(["main", "other"]) }),
    z.strictObject({
      kind: z.literal("visible-family"),
      tenGods: z.array(TenGodSchema).length(2).readonly(),
    }),
    z.strictObject({ kind: z.literal("coexistence"), left: TenGodSchema, right: TenGodSchema }),
  ])
  .readonly();

export const RuleDefinitionSchema = z
  .strictObject({
    ruleId: z.string().regex(/^base\.[a-z-]+$/),
    ruleVersion: z.literal("1.0.0"),
    assertion: Nonempty,
    sourceRefs: z.array(z.string().min(1)).min(1).readonly(),
    inputPaths: z.array(InputPathSchema).min(1).readonly(),
    priority: z.number().int().min(0).max(100),
    exceptions: z.array(ExceptionSchema).readonly(),
    caveats: z.array(Nonempty).min(1).readonly(),
    adoption: Nonempty,
    condition: ConditionSchema,
    review: z
      .strictObject({
        status: z.literal("source-and-tests-checked"),
        checkedAt: z.iso.date(),
        reviewerRole: z.literal("implementation-review"),
        method: z.literal("primary-text-and-explicit-fixtures"),
      })
      .readonly(),
  })
  .readonly();

export const CatalogBaseSchema = z
  .strictObject({
    ruleSetVersion: z.literal("1.0.0"),
    sourceCatalogVersion: z.literal("1.0.0"),
    sources: z
      .array(
        z
          .strictObject({
            id: z.string().min(1),
            work: z.enum(["적천수", "궁통보감", "자평진전", "삼명통회"]),
            edition: Nonempty,
            section: Nonempty,
            url: z.url().startsWith("https://"),
            excerpt: Nonempty,
            checkedAt: z.iso.date(),
            verification: z.literal("text-checked"),
            retrieval: z.enum(["page-text", "indexed-primary-text"]),
            limitations: z.array(Nonempty).min(1).readonly(),
          })
          .readonly(),
      )
      .min(4)
      .readonly(),
    rules: z.array(RuleDefinitionSchema).min(1).max(100).readonly(),
  })
  .refine((catalog) => {
    const ids = new Set(catalog.sources.map((source) => source.id));
    return (
      ids.size === catalog.sources.length &&
      new Set(catalog.rules.map((rule) => rule.ruleId)).size === catalog.rules.length &&
      catalog.rules.every(
        (rule) =>
          new Set(rule.sourceRefs).size === rule.sourceRefs.length &&
          rule.sourceRefs.every((id) => ids.has(id)),
      )
    );
  })
  .readonly();
export type JudgmentCatalog = z.infer<typeof CatalogBaseSchema>;
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;

export const EvidenceSchema = z
  .strictObject({
    inputPath: InputPathSchema.refine((path) => !path.includes("*")),
    value: z.union([StemSchema, BranchSchema, ElementSchema, TenGodSchema, z.literal("일간")]),
  })
  .readonly();
export type Evidence = z.infer<typeof EvidenceSchema>;
const Trace = {
  ruleId: z.string().min(1),
  ruleVersion: z.literal("1.0.0"),
  sourceRefs: z.array(z.string().min(1)).min(1).readonly(),
  inputPaths: z.array(InputPathSchema).min(1).readonly(),
  priority: z.number().int().min(0).max(100),
  exceptionsDeclared: z.array(ExceptionSchema).readonly(),
  exceptionsApplied: z.array(ExceptionSchema).readonly(),
  evidence: z.array(EvidenceSchema).readonly(),
  caveats: z.array(Nonempty).min(1).readonly(),
};
export const JudgmentFindingSchema = z
  .strictObject({
    ...Trace,
    findingId: z.string().min(1),
    assertion: Nonempty,
    precision: z.enum(["confirmed", "partial"]),
  })
  .readonly();
export const RuleEvaluationSchema = z
  .strictObject({
    ...Trace,
    status: z.enum(["matched", "not-matched", "unavailable"]),
    coverage: z.enum(["complete", "partial", "none"]),
  })
  .readonly();
export const EvaluationBaseSchema = z
  .strictObject({
    status: CoverageStatusSchema,
    sourcePillars: KnownPillarsSchema,
    results: z.array(RuleEvaluationSchema).min(1).max(100).readonly(),
    findings: z.array(JudgmentFindingSchema).max(20).readonly(),
    provenance: z
      .strictObject({
        ruleSetVersion: z.literal("1.0.0"),
        sourceCatalogVersion: z.literal("1.0.0"),
        factsSchemaVersion: z.literal("1.0.0"),
        libraryName: z.literal(PINNED_CALENDAR_LIBRARY.name),
        libraryVersion: z.literal(PINNED_CALENDAR_LIBRARY.version),
        scope: z.literal("base-structural-observations"),
      })
      .readonly(),
  })
  .readonly();

export { TenGodSchema } from "@/domain/contracts";
