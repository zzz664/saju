import { z } from "zod";
import { HexDigestSchema } from "@/domain/contracts";
import { StemSchema, BranchSchema } from "@/domain/natal-facts/schemas";
import { TopicSchema } from "@/domain/judgment/topics/schemas";

/** Ten-god family keys shared with the M03 catalog (FAMILY_GODS). */
export const TenGodFamilySchema = z.enum(["resource", "output", "authority", "wealth", "peer"]);
export type TenGodFamily = z.infer<typeof TenGodFamilySchema>;

/** A condition is a lookup key the rule engine already confirms; it is never inferred by the LLM. */
export const InterpretationConditionSchema = z
  .discriminatedUnion("kind", [
    z
      .strictObject({
        kind: z.literal("day-master-month"),
        dayMaster: StemSchema,
        monthBranch: BranchSchema,
      })
      .readonly(),
    z.strictObject({ kind: z.literal("day-master"), dayMaster: StemSchema }).readonly(),
    z.strictObject({ kind: z.literal("ten-god-family"), family: TenGodFamilySchema }).readonly(),
    z
      .strictObject({
        kind: z.literal("ten-god-family-pair"),
        families: z
          .tuple([TenGodFamilySchema, TenGodFamilySchema])
          .refine((value) => value[0] !== value[1])
          .readonly(),
      })
      .readonly(),
  ])
  .readonly();
export type InterpretationCondition = z.infer<typeof InterpretationConditionSchema>;

export const ClassicalWorkSchema = z.enum([
  "궁통보감",
  "적천수",
  "자평진전",
  "삼명통회",
  "연해자평",
]);

/** One public-domain passage slot. `passage` is filled by the collector script, never typed by hand. */
export const InterpretationSourceSchema = z
  .strictObject({
    sourceId: z.string().regex(/^src\.[a-z0-9.-]+$/),
    work: ClassicalWorkSchema,
    locator: z.string().min(1).max(120),
    url: z.url().startsWith("https://"),
    license: z.literal("public-domain"),
    language: z.literal("zh-Hant"),
    passage: z.string().min(1).max(4000).nullable(),
    retrievedAt: z.iso.datetime().nullable(),
    passageDigest: HexDigestSchema.nullable(),
  })
  .refine(
    (value) =>
      (value.passage === null) === (value.retrievedAt === null) &&
      (value.passage === null) === (value.passageDigest === null),
    { message: "Collected passages carry their retrieval time and digest together." },
  )
  .readonly();
export type InterpretationSource = z.infer<typeof InterpretationSourceSchema>;

/** Korean summary produced by the offline generation script from the stored passage only. */
export const InterpretationSummarySchema = z
  .strictObject({
    text: z.string().trim().min(1).max(800),
    modelId: z.string().min(1).max(128),
    promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    generatedAt: z.iso.datetime(),
    passageDigest: HexDigestSchema,
    entailment: z
      .strictObject({
        status: z.enum(["passed", "failed"]),
        modelId: z.string().min(1).max(128),
        checkedAt: z.iso.datetime(),
      })
      .readonly(),
  })
  .readonly();
export type InterpretationSummary = z.infer<typeof InterpretationSummarySchema>;

export const ReviewStatusSchema = z.enum([
  "scaffold",
  "ai-summarized-unreviewed",
  "human-reviewed",
]);

export const InterpretationUnitSchema = z
  .strictObject({
    unitId: z.string().regex(/^iu\.[a-z0-9.-]+$/),
    condition: InterpretationConditionSchema,
    topics: z.array(TopicSchema).min(1).max(6).readonly(),
    sourceId: InterpretationSourceSchema.unwrap().shape.sourceId,
    summary: InterpretationSummarySchema.nullable(),
    reviewStatus: ReviewStatusSchema,
    caveats: z.array(z.string().min(1).max(400)).min(1).max(4).readonly(),
  })
  .refine(
    (unit) => (unit.reviewStatus === "scaffold" ? unit.summary === null : unit.summary !== null),
    { message: "Only scaffold units may lack a summary; summarized units must carry one." },
  )
  .readonly();
export type InterpretationUnit = z.infer<typeof InterpretationUnitSchema>;

export const InterpretationCatalogSchema = z
  .strictObject({
    catalogId: z.literal("interpretation.classical-lookup"),
    catalogVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    schemaVersion: z.literal("1.0.0"),
    sources: z.array(InterpretationSourceSchema).max(400).readonly(),
    units: z.array(InterpretationUnitSchema).max(400).readonly(),
  })
  .refine((catalog) => {
    const sourceIds = new Set(catalog.sources.map((source) => source.sourceId));
    const sourceDigest = new Map(
      catalog.sources.map((source) => [source.sourceId, source.passageDigest]),
    );
    return (
      sourceIds.size === catalog.sources.length &&
      new Set(catalog.units.map((unit) => unit.unitId)).size === catalog.units.length &&
      catalog.units.every(
        (unit) =>
          sourceIds.has(unit.sourceId) &&
          // A summary is bound to the exact passage it was generated from.
          (unit.summary === null || unit.summary.passageDigest === sourceDigest.get(unit.sourceId)),
      )
    );
  }, "Catalog ids must be unique, every unit must reference a source, and summaries must match their passage digest.")
  .readonly();
export type InterpretationCatalog = z.infer<typeof InterpretationCatalogSchema>;

export const MatchedInterpretationSchema = z
  .strictObject({
    unitId: InterpretationUnitSchema.unwrap().shape.unitId,
    condition: InterpretationConditionSchema,
    topics: z.array(TopicSchema).min(1).readonly(),
    source: z
      .strictObject({
        sourceId: InterpretationSourceSchema.unwrap().shape.sourceId,
        work: ClassicalWorkSchema,
        locator: z.string(),
        url: z.string(),
        collected: z.boolean(),
      })
      .readonly(),
    summary: z.string().nullable(),
    reviewStatus: ReviewStatusSchema,
    /** True only when a passage was collected and its summary passed the entailment check. */
    usable: z.boolean(),
    evidence: z
      .array(z.strictObject({ inputPath: z.string().min(1), value: z.string().min(1) }).readonly())
      .min(1)
      .readonly(),
    caveats: z.array(z.string()).min(1).readonly(),
  })
  .readonly();
export type MatchedInterpretation = z.infer<typeof MatchedInterpretationSchema>;
