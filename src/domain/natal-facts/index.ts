import { deepEqualCanonical } from "@/domain/json";
import { TenGodSchema } from "@/domain/contracts";
import { defineCodedError } from "@/domain/utilities";
import { z } from "zod";
import {
  DerivedNatalFactsSchema,
  KnownPillarsSchema,
  SymbolCatalogSchema,
  StemSchema,
  ElementSchema,
  hidden,
  type DerivedNatalFacts,
} from "@/domain/natal-facts/schemas";
export * from "@/domain/natal-facts/schemas";
type Stem = z.infer<typeof StemSchema>;
const positions = ["year", "month", "day", "hour"] as const;

const sourceRef = "https://zh.wikisource.org/zh-hant/淵海子平大全";
const PositionFactsSchema = DerivedNatalFactsSchema.unwrap()
  .shape.positions.unwrap()
  .shape.year.unwrap();
/** Explicit semantic boundary; structural schemas never run an engine. */
export const natalFactsInvariants = (value: DerivedNatalFacts) => {
  let known = 0,
    hiddenCount = 0;
  const surface = emptyCounts(),
    concealed = emptyCounts();
  if (value.dayMaster !== (value.sourcePillars.day?.heavenlyStem ?? null)) return false;
  for (const position of positions) {
    const pillar = value.sourcePillars[position],
      facts = value.positions[position];
    if (pillar === null || facts === null) {
      if (pillar !== null || facts !== null) return false;
      continue;
    }
    if (pillar.heavenlyStem !== facts.stem.stem || pillar.earthlyBranch !== facts.branch.branch)
      return false;
    if (value.dayMaster === null) {
      if (
        facts.stem.tenGod !== null ||
        facts.branch.tenGod !== null ||
        facts.branch.hiddenStems.some((entry) => entry.tenGod !== null)
      )
        return false;
    } else if (
      position === "day"
        ? facts.stem.tenGod !== "일간"
        : !TenGodSchema.safeParse(facts.stem.tenGod).success
    )
      return false;
    if (
      value.dayMaster !== null &&
      (facts.branch.tenGod === null ||
        facts.branch.hiddenStems.some((entry) => !TenGodSchema.safeParse(entry.tenGod).success))
    )
      return false;
    known += 2;
    surface[facts.stem.element]++;
    surface[facts.branch.element]++;
    for (const entry of facts.branch.hiddenStems) {
      concealed[entry.element]++;
      hiddenCount++;
    }
  }
  const expectedStatus = known === 8 ? "complete" : known === 0 ? "unavailable" : "partial";
  const limitations = [
    ...(known < 8 ? ["MISSING_PILLARS"] : []),
    ...(value.dayMaster === null ? ["DAY_MASTER_UNKNOWN"] : []),
  ];
  return (
    value.status === expectedStatus &&
    value.distribution.knownSurfaceSymbols === known &&
    value.distribution.missingSurfaceSymbols === 8 - known &&
    value.distribution.hiddenStemOccurrences === hiddenCount &&
    ElementSchema.options.every(
      (element) =>
        surface[element] === value.distribution.surface[element] &&
        concealed[element] === value.distribution.hidden[element],
    ) &&
    deepEqualCanonical(value.limitations, limitations)
  );
};
export function parseDerivedNatalFacts(value: unknown): DerivedNatalFacts {
  const parsed = DerivedNatalFactsSchema.parse(value);
  if (!natalFactsInvariants(parsed)) throw new NatalFactsError("INPUT_REJECTED");
  return parsed;
}

function emptyCounts(): Record<z.infer<typeof ElementSchema>, number> {
  return { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
}
const messages = {
  INPUT_REJECTED: "Natal facts input was rejected.",
  CATALOG_LOAD_FAILED: "Symbol catalog could not be loaded.",
  OUTPUT_INVALID: "Natal facts source or output was invalid.",
} as const;
export class NatalFactsError extends defineCodedError("NatalFactsError", messages) {}

/** Pure derivation from confirmed pillars and a validated provider-independent catalog. */
export function deriveNatalFacts(value: unknown, rawCatalog: unknown): DerivedNatalFacts {
  const input = KnownPillarsSchema.safeParse(value);
  if (!input.success) throw new NatalFactsError("INPUT_REJECTED");
  const parsed = SymbolCatalogSchema.safeParse(rawCatalog);
  if (!parsed.success) throw new NatalFactsError("OUTPUT_INVALID");
  const catalog = parsed.data,
    dayMaster = input.data.day?.heavenlyStem ?? null;
  const describe = (stem: Stem) => ({
    ...catalog.stems.find((entry) => entry.stem === stem)!,
    tenGod:
      dayMaster === null
        ? null
        : catalog.tenGods.find((entry) => entry.dayMaster === dayMaster && entry.target === stem)!
            .tenGod,
  });
  const facts: Record<(typeof positions)[number], z.infer<typeof PositionFactsSchema> | null> = {
    year: null,
    month: null,
    day: null,
    hour: null,
  };
  const surface = emptyCounts(),
    concealed = emptyCounts();
  let known = 0,
    hiddenCount = 0;
  for (const position of positions) {
    const pillar = input.data[position];
    if (!pillar) continue;
    const stem = describe(pillar.heavenlyStem);
    const hiddenStems = hidden[pillar.earthlyBranch].map((entry, index) => ({
      ...describe(entry),
      isMain: index === 0,
    }));
    const branch = {
      ...catalog.branches.find((entry) => entry.branch === pillar.earthlyBranch)!,
      mainStem: hiddenStems[0].stem,
      tenGod: hiddenStems[0].tenGod,
      hiddenStems,
    };
    facts[position] = PositionFactsSchema.parse({
      stem: { ...stem, tenGod: position === "day" ? "일간" : stem.tenGod },
      branch,
    });
    known += 2;
    surface[stem.element]++;
    surface[branch.element]++;
    for (const entry of hiddenStems) {
      concealed[entry.element]++;
      hiddenCount++;
    }
  }
  const metadata = (ruleId: string, reference: string) => ({
    ruleId,
    ruleVersion: "1.0.0",
    sourceRef: reference,
  });
  const result = DerivedNatalFactsSchema.safeParse({
    status: known === 8 ? "complete" : known === 0 ? "unavailable" : "partial",
    sourcePillars: input.data,
    dayMaster,
    positions: facts,
    distribution: {
      surface,
      hidden: concealed,
      knownSurfaceSymbols: known,
      missingSurfaceSymbols: 8 - known,
      hiddenStemOccurrences: hiddenCount,
    },
    limitations: [
      ...(known < 8 ? ["MISSING_PILLARS"] : []),
      ...(dayMaster === null ? ["DAY_MASTER_UNKNOWN"] : []),
    ],
    provenance: {
      library: catalog.provenance,
      elements: metadata("facts.symbol-elements", "manseryeok@2.0.0/public-elements-api"),
      tenGods: metadata("facts.day-master-ten-gods", sourceRef + "#基礎"),
      hiddenStems: metadata("facts.hidden-stems", sourceRef + "#又地支藏遁歌"),
      counts: metadata("facts.element-occurrences", "policy:separate-unit-occurrences"),
      hiddenStemConvention: "yuanhai-28-main-first",
      schemaVersion: "1.0.0",
    },
  });
  if (!result.success) throw new NatalFactsError("OUTPUT_INVALID");
  return result.data;
}
