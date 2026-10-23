import { z } from "zod";
import { HexDigestSchema } from "@/domain/contracts";
import {
  parseInterpretationCatalog,
  InterpretationSummarySchema,
  type InterpretationCatalog,
} from "@/domain/interpretation";
import { buildScaffold, SCAFFOLD_VERSION } from "@/infrastructure/interpretation/scaffold";
import passagesFile from "@/infrastructure/interpretation/data/passages.json";
import summariesFile from "@/infrastructure/interpretation/data/summaries.json";

export const PassagesFileSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  note: z.string(),
  passages: z.record(
    z.string(),
    z.strictObject({
      passage: z.string().min(1).max(4000),
      retrievedAt: z.iso.datetime(),
      passageDigest: HexDigestSchema,
      /** Set by the collector when the passage was found on a sibling page, not the scaffold url. */
      url: z.url().startsWith("https://zh.wikisource.org/").optional(),
      /** Set by the collector when a `|` alternative or the season section matched instead. */
      locator: z.string().min(1).optional(),
    }),
  ),
});
export const SummariesFileSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  note: z.string(),
  summaries: z.record(z.string(), InterpretationSummarySchema),
});

/** Scaffold ⊕ collected passages ⊕ generated summaries. Unknown ids in the data files are rejected. */
export function composeInterpretationCatalog(
  rawPassages: unknown = passagesFile,
  rawSummaries: unknown = summariesFile,
  catalogVersion = SCAFFOLD_VERSION,
): InterpretationCatalog {
  const passages = PassagesFileSchema.parse(rawPassages).passages;
  const summaries = SummariesFileSchema.parse(rawSummaries).summaries;
  const scaffold = buildScaffold();
  const sourceIds = new Set(scaffold.map((entry) => entry.source.sourceId));
  const unitIds = new Set(scaffold.map((entry) => entry.unit.unitId));
  for (const id of Object.keys(passages))
    if (!sourceIds.has(id)) throw new Error("Unknown interpretation source id in passages.json");
  for (const id of Object.keys(summaries))
    if (!unitIds.has(id)) throw new Error("Unknown interpretation unit id in summaries.json");
  return parseInterpretationCatalog({
    catalogId: "interpretation.classical-lookup",
    catalogVersion,
    schemaVersion: "1.0.0",
    sources: scaffold.map((entry) => {
      const collected = passages[entry.source.sourceId];
      return {
        ...entry.source,
        url: collected?.url ?? entry.source.url,
        locator: collected?.locator ?? entry.source.locator,
        passage: collected?.passage ?? null,
        retrievedAt: collected?.retrievedAt ?? null,
        passageDigest: collected?.passageDigest ?? null,
      };
    }),
    units: scaffold.map((entry) => {
      const summary = summaries[entry.unit.unitId] ?? null;
      return {
        ...entry.unit,
        summary,
        reviewStatus: summary ? "ai-summarized-unreviewed" : "scaffold",
      };
    }),
  });
}

let cached: InterpretationCatalog | undefined;
/** Server-side composition root for the approved classical lookup catalog. */
export function loadInterpretationCatalog(): InterpretationCatalog {
  cached ??= composeInterpretationCatalog();
  return cached;
}
