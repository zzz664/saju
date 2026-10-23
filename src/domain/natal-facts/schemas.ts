import { PINNED_CALENDAR_LIBRARY } from "@/domain/provenance";
import { CoverageStatusSchema } from "@/domain/contracts";
import { TenGodSchema } from "@/domain/contracts";
import { z } from "zod";
import { CalendarPillarsSchema } from "@/domain/calendar";

export const StemSchema = CalendarPillarsSchema.shape.day.unwrap().shape.heavenlyStem;
export const BranchSchema = CalendarPillarsSchema.shape.day.unwrap().shape.earthlyBranch;
export const ElementSchema = z.enum(["목", "화", "토", "금", "수"]);
const PolaritySchema = z.enum(["양", "음"]);

type Stem = z.infer<typeof StemSchema>;
type Branch = z.infer<typeof BranchSchema>;

export const SymbolCatalogSchema = z
  .strictObject({
    stems: z
      .array(
        z
          .strictObject({ stem: StemSchema, element: ElementSchema, polarity: PolaritySchema })
          .readonly(),
      )
      .length(10)
      .readonly(),
    branches: z
      .array(
        z
          .strictObject({ branch: BranchSchema, element: ElementSchema, polarity: PolaritySchema })
          .readonly(),
      )
      .length(12)
      .readonly(),
    tenGods: z
      .array(
        z
          .strictObject({ dayMaster: StemSchema, target: StemSchema, tenGod: TenGodSchema })
          .readonly(),
      )
      .length(100)
      .readonly(),
    provenance: z
      .strictObject({
        libraryName: z.literal(PINNED_CALENDAR_LIBRARY.name),
        libraryVersion: z.literal(PINNED_CALENDAR_LIBRARY.version),
        ruleId: z.literal("symbols.public-sdk"),
        ruleVersion: z.literal("1.0.0"),
      })
      .readonly(),
  })
  .refine(
    (value) =>
      new Set(value.stems.map((entry) => entry.stem)).size === 10 &&
      new Set(value.branches.map((entry) => entry.branch)).size === 12 &&
      new Set(value.tenGods.map((entry) => `${entry.dayMaster}/${entry.target}`)).size === 100,
  )
  .readonly();
export type SymbolCatalog = z.infer<typeof SymbolCatalogSchema>;
export interface SymbolCatalogAdapter {
  readonly load: () => SymbolCatalog;
}

// Yuanhai's cangdun sets. Main stem first; remaining order is display order, not strength.
export const hidden: Readonly<Record<Branch, readonly Stem[]>> = {
  자: ["계"],
  축: ["기", "계", "신"],
  인: ["갑", "병", "무"],
  묘: ["을"],
  진: ["무", "을", "계"],
  사: ["병", "무", "경"],
  오: ["정", "기"],
  미: ["기", "을", "정"],
  신: ["경", "임", "무"],
  유: ["신"],
  술: ["무", "신", "정"],
  해: ["임", "갑"],
};
const positions = ["year", "month", "day", "hour"] as const;
export const KnownPillarsSchema = z
  .strictObject({
    year: CalendarPillarsSchema.shape.year.nullable(),
    month: CalendarPillarsSchema.shape.month.nullable(),
    day: CalendarPillarsSchema.shape.day.nullable(),
    hour: CalendarPillarsSchema.shape.hour.nullable(),
  })
  .refine(
    (value) =>
      positions.every((position) => {
        const pillar = value[position];
        return (
          pillar === null ||
          StemSchema.options.indexOf(pillar.heavenlyStem) % 2 ===
            BranchSchema.options.indexOf(pillar.earthlyBranch) % 2
        );
      }),
    { message: "Known pillars must be valid sexagenary stem/branch pairs." },
  )
  .readonly();
const stemFact = {
  stem: StemSchema,
  element: ElementSchema,
  polarity: PolaritySchema,
  tenGod: z.union([TenGodSchema, z.literal("일간")]).nullable(),
};
const PositionFactsSchema = z
  .strictObject({
    stem: z.strictObject(stemFact).readonly(),
    branch: z
      .strictObject({
        branch: BranchSchema,
        element: ElementSchema,
        polarity: PolaritySchema,
        mainStem: StemSchema,
        tenGod: TenGodSchema.nullable(),
        hiddenStems: z
          .array(z.strictObject({ ...stemFact, isMain: z.boolean() }).readonly())
          .min(1)
          .max(3)
          .readonly(),
      })
      .refine(
        (value) =>
          value.mainStem === hidden[value.branch][0] &&
          value.hiddenStems.length === hidden[value.branch].length &&
          value.hiddenStems.every(
            (entry, index) =>
              entry.stem === hidden[value.branch][index] && entry.isMain === (index === 0),
          ) &&
          value.tenGod === value.hiddenStems[0].tenGod,
      )
      .readonly(),
  })
  .readonly();
const CountsSchema = z
  .strictObject({
    목: z.number().int().min(0).max(12),
    화: z.number().int().min(0).max(12),
    토: z.number().int().min(0).max(12),
    금: z.number().int().min(0).max(12),
    수: z.number().int().min(0).max(12),
  })
  .readonly();
const sourceRef = "https://zh.wikisource.org/zh-hant/淵海子平大全";
const rule = (ruleId: string, reference: string) =>
  z
    .strictObject({
      ruleId: z.literal(ruleId),
      ruleVersion: z.literal("1.0.0"),
      sourceRef: z.literal(reference),
    })
    .readonly();
export const DerivedNatalFactsSchema = z
  .strictObject({
    status: CoverageStatusSchema,
    sourcePillars: KnownPillarsSchema,
    dayMaster: StemSchema.nullable(),
    positions: z
      .strictObject({
        year: PositionFactsSchema.nullable(),
        month: PositionFactsSchema.nullable(),
        day: PositionFactsSchema.nullable(),
        hour: PositionFactsSchema.nullable(),
      })
      .readonly(),
    distribution: z
      .strictObject({
        surface: CountsSchema,
        hidden: CountsSchema,
        knownSurfaceSymbols: z.number().int().min(0).max(8),
        missingSurfaceSymbols: z.number().int().min(0).max(8),
        hiddenStemOccurrences: z.number().int().min(0).max(12),
      })
      .readonly(),
    limitations: z.array(z.enum(["MISSING_PILLARS", "DAY_MASTER_UNKNOWN"])).readonly(),
    provenance: z
      .strictObject({
        library: SymbolCatalogSchema.unwrap().shape.provenance,
        elements: rule("facts.symbol-elements", "manseryeok@2.0.0/public-elements-api"),
        tenGods: rule("facts.day-master-ten-gods", sourceRef + "#基礎"),
        hiddenStems: rule("facts.hidden-stems", sourceRef + "#又地支藏遁歌"),
        counts: rule("facts.element-occurrences", "policy:separate-unit-occurrences"),
        hiddenStemConvention: z.literal("yuanhai-28-main-first"),
        schemaVersion: z.literal("1.0.0"),
      })
      .readonly(),
  })
  .readonly();
export type DerivedNatalFacts = z.infer<typeof DerivedNatalFactsSchema>;
