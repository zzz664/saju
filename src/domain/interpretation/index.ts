import { compareText, defineCodedError } from "@/domain/utilities";
import { parseDerivedNatalFacts, type DerivedNatalFacts } from "@/domain/natal-facts";
import { FAMILY_GODS } from "@/domain/judgment/topics/catalog";
import type { Topic } from "@/domain/judgment/topics/schemas";
import {
  InterpretationCatalogSchema,
  MatchedInterpretationSchema,
  TenGodFamilySchema,
  type InterpretationCatalog,
  type InterpretationUnit,
  type MatchedInterpretation,
  type TenGodFamily,
} from "@/domain/interpretation/schemas";

export * from "@/domain/interpretation/schemas";

export class InterpretationError extends defineCodedError("InterpretationError", {
  CATALOG_REJECTED: "Interpretation catalog was rejected.",
  FACTS_REJECTED: "Interpretation facts were rejected.",
}) {}

export function parseInterpretationCatalog(value: unknown): InterpretationCatalog {
  const parsed = InterpretationCatalogSchema.safeParse(value);
  if (!parsed.success) throw new InterpretationError("CATALOG_REJECTED");
  return parsed.data;
}

type Observation = { readonly inputPath: string; readonly value: string };
type FamilyObservation = Observation & { readonly family: TenGodFamily };

/** Ten-god observations on non-day stems and every hidden stem, mirroring M03/F03 scope. */
function observeFamilies(facts: DerivedNatalFacts): readonly FamilyObservation[] {
  const entries: FamilyObservation[] = [];
  const familyOf = (god: string): TenGodFamily | null => {
    for (const family of TenGodFamilySchema.options)
      if (FAMILY_GODS[family].some((member) => member === god)) return family;
    return null;
  };
  for (const position of ["year", "month", "day", "hour"] as const) {
    const fact = facts.positions[position];
    if (!fact) continue;
    if (position !== "day" && fact.stem.tenGod) {
      const family = familyOf(fact.stem.tenGod);
      if (family)
        entries.push({
          inputPath: `facts.positions.${position}.stem.tenGod`,
          value: fact.stem.tenGod,
          family,
        });
    }
    fact.branch.hiddenStems.forEach((hidden, index) => {
      const family = hidden.tenGod ? familyOf(hidden.tenGod) : null;
      if (family)
        entries.push({
          inputPath: `facts.positions.${position}.branch.hiddenStems.${index}.tenGod`,
          value: hidden.tenGod!,
          family,
        });
    });
  }
  return entries;
}

function matchUnit(
  unit: InterpretationUnit,
  facts: DerivedNatalFacts,
  families: readonly FamilyObservation[],
): readonly Observation[] | null {
  const condition = unit.condition;
  if (condition.kind === "day-master" || condition.kind === "day-master-month") {
    if (facts.dayMaster !== condition.dayMaster) return null;
    const evidence: Observation[] = [{ inputPath: "facts.dayMaster", value: facts.dayMaster }];
    if (condition.kind === "day-master-month") {
      const month = facts.positions.month;
      if (!month || month.branch.branch !== condition.monthBranch) return null;
      evidence.push({
        inputPath: "facts.positions.month.branch.branch",
        value: month.branch.branch,
      });
    }
    return evidence;
  }
  if (facts.dayMaster === null) return null;
  const wanted = condition.kind === "ten-god-family" ? [condition.family] : [...condition.families];
  const selected = wanted.map((family) => families.find((entry) => entry.family === family));
  if (selected.some((entry) => !entry)) return null;
  return [
    { inputPath: "facts.dayMaster", value: facts.dayMaster },
    ...selected.map((entry) => ({ inputPath: entry!.inputPath, value: entry!.value })),
  ];
}

export function isUsableInterpretation(
  unit: InterpretationUnit,
  catalog: InterpretationCatalog,
): boolean {
  const source = catalog.sources.find((entry) => entry.sourceId === unit.sourceId);
  return (
    !!source &&
    source.passage !== null &&
    unit.summary !== null &&
    unit.summary.entailment.status === "passed" &&
    unit.summary.passageDigest === source.passageDigest
  );
}

/** Pure lookup: confirmed facts select catalog units. Unusable units stay visible as limitations. */
export function matchInterpretations(
  value: unknown,
  rawCatalog: unknown,
  options: { readonly topics?: readonly Topic[] } = {},
): readonly MatchedInterpretation[] {
  let facts: DerivedNatalFacts;
  try {
    facts = parseDerivedNatalFacts(value);
  } catch {
    throw new InterpretationError("FACTS_REJECTED");
  }
  const catalog = parseInterpretationCatalog(rawCatalog);
  const families = observeFamilies(facts);
  const matched: MatchedInterpretation[] = [];
  for (const unit of catalog.units) {
    if (options.topics && !unit.topics.some((topic) => options.topics!.includes(topic))) continue;
    const evidence = matchUnit(unit, facts, families);
    if (!evidence) continue;
    const source = catalog.sources.find((entry) => entry.sourceId === unit.sourceId)!;
    matched.push(
      MatchedInterpretationSchema.parse({
        unitId: unit.unitId,
        condition: unit.condition,
        topics: unit.topics,
        source: {
          sourceId: source.sourceId,
          work: source.work,
          locator: source.locator,
          url: source.url,
          collected: source.passage !== null,
        },
        summary: unit.summary?.text ?? null,
        reviewStatus: unit.reviewStatus,
        usable: isUsableInterpretation(unit, catalog),
        evidence,
        caveats: unit.caveats,
      }),
    );
  }
  return Object.freeze(matched.sort((a, b) => compareText(a.unitId, b.unitId)));
}
