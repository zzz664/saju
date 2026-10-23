import { describe, expect, it } from "vitest";
import {
  deriveNatalFacts,
  DerivedNatalFactsSchema,
  SymbolCatalogSchema,
} from "@/domain/natal-facts";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";
import golden from "./fixtures/natal-facts-golden.json";

const catalog = manseryeokSymbolCatalogAdapter.load();
const pillars = {
  year: { heavenlyStem: "병", earthlyBranch: "인" },
  month: { heavenlyStem: "신", earthlyBranch: "축" },
  day: { heavenlyStem: "갑", earthlyBranch: "자" },
  hour: { heavenlyStem: "정", earthlyBranch: "묘" },
};

describe("SDK-backed symbols and pure natal facts", () => {
  it.each(
    golden.stems.flatMap((dayMaster, row) =>
      golden.stems.map((target, column) => ({
        dayMaster,
        target,
        expected: golden.tenGodRows[row][column],
      })),
    ),
  )("matches independent ten-god $dayMaster -> $target", ({ dayMaster, target, expected }) => {
    expect(
      catalog.tenGods.find((entry) => entry.dayMaster === dayMaster && entry.target === target)
        ?.tenGod,
    ).toBe(expected);
  });

  it.each(golden.hiddenStems)(
    "preserves the adopted hidden-stem set and main stem for $branch",
    ({ branch, stems }) => {
      const branchIndex = golden.hiddenStems.findIndex((entry) => entry.branch === branch);
      const result = deriveNatalFacts(
        {
          ...pillars,
          year: { heavenlyStem: branchIndex % 2 === 0 ? "갑" : "을", earthlyBranch: branch },
        },
        catalog,
      );
      expect(result.positions.year?.branch.hiddenStems.map((entry) => entry.stem)).toEqual(stems);
      expect(result.positions.year?.branch.mainStem).toBe(stems[0]);
      expect(result.positions.year?.branch.hiddenStems.map((entry) => entry.isMain)).toEqual(
        stems.map((_, index) => index === 0),
      );
    },
  );

  it("derives relative stem/main/hidden ten gods and keeps surface and hidden counts separate", () => {
    const result = deriveNatalFacts(pillars, catalog);
    expect(result).toMatchObject({
      status: "complete",
      dayMaster: "갑",
      positions: {
        year: {
          stem: { element: "화", polarity: "양", tenGod: "식신" },
          branch: { mainStem: "갑", tenGod: "비견" },
        },
        day: { stem: { tenGod: "일간" } },
      },
      distribution: {
        surface: { 목: 3, 화: 2, 토: 1, 금: 1, 수: 1 },
        knownSurfaceSymbols: 8,
        missingSurfaceSymbols: 0,
        hiddenStemOccurrences: 8,
      },
    });
    expect(result.positions.year?.branch.hiddenStems.map((entry) => entry.tenGod)).toEqual([
      "비견",
      "식신",
      "편재",
    ]);
    expect(Object.values(result.distribution.hidden).reduce((a, b) => a + b, 0)).toBe(8);
  });

  it("keeps an unknown hour empty and counts only six observed symbols", () => {
    expect(deriveNatalFacts({ ...pillars, hour: null }, catalog)).toMatchObject({
      status: "partial",
      positions: { hour: null },
      distribution: { knownSurfaceSymbols: 6, missingSurfaceSymbols: 2 },
    });
  });

  it("keeps all relative ten gods unknown without a confirmed day master", () => {
    const result = deriveNatalFacts({ ...pillars, day: null, hour: null }, catalog);
    expect(result.dayMaster).toBeNull();
    expect(result.positions.year?.stem.tenGod).toBeNull();
    expect(result.positions.year?.branch.tenGod).toBeNull();
    expect(result.positions.year?.branch.hiddenStems.every((entry) => entry.tenGod === null)).toBe(
      true,
    );
    expect(result.distribution.knownSurfaceSymbols).toBe(4);
  });

  it("returns unavailable with zero counts for an entirely unknown chart", () => {
    expect(
      deriveNatalFacts({ year: null, month: null, day: null, hour: null }, catalog),
    ).toMatchObject({
      status: "unavailable",
      distribution: {
        knownSurfaceSymbols: 0,
        missingSurfaceSymbols: 8,
        hiddenStemOccurrences: 0,
        surface: { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 },
      },
    });
  });

  it("preserves repeated occurrences and zero elements without interpreting strength", () => {
    const same = { heavenlyStem: "을", earthlyBranch: "묘" };
    expect(
      deriveNatalFacts({ year: same, month: same, day: same, hour: same }, catalog).distribution,
    ).toMatchObject({
      surface: { 목: 8, 화: 0, 토: 0, 금: 0, 수: 0 },
      hidden: { 목: 4, 화: 0, 토: 0, 금: 0, 수: 0 },
    });
  });

  it("is immutable, deterministic and validates JSON round-trips and totals", () => {
    const before = structuredClone(pillars);
    const result = deriveNatalFacts(pillars, catalog);
    expect(deriveNatalFacts(pillars, catalog)).toEqual(result);
    expect(Object.isFrozen(result.positions.year?.branch.hiddenStems)).toBe(true);
    expect(DerivedNatalFactsSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(
      DerivedNatalFactsSchema.safeParse({
        ...result,
        distribution: { ...result.distribution, knownSurfaceSymbols: 7 },
      }).success,
    ).toBe(false);
    expect(pillars).toEqual(before);
  });

  it.each([
    {},
    { ...pillars, hour: undefined },
    { ...pillars, extra: null },
    { ...pillars, year: { heavenlyStem: "甲", earthlyBranch: "자" } },
    { ...pillars, year: { heavenlyStem: "갑", earthlyBranch: "축" } },
  ])("rejects invalid pillar input %j", (value) => {
    expect(() => deriveNatalFacts(value, catalog)).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });

  it("blocks damaged, duplicated and incorrectly versioned catalogs", () => {
    for (const value of [
      null,
      { ...catalog, stems: catalog.stems.slice(1) },
      { ...catalog, tenGods: Array(100).fill(catalog.tenGods[0]) },
      { ...catalog, provenance: { ...catalog.provenance, libraryVersion: "future" } },
    ]) {
      expect(SymbolCatalogSchema.safeParse(value).success).toBe(false);
      expect(() => deriveNatalFacts(pillars, value)).toThrow(
        expect.objectContaining({ code: "OUTPUT_INVALID" }),
      );
    }
  });

  it("projects all ten stems and twelve branches with the declared element and polarity order", () => {
    expect(catalog.stems.map((entry) => entry.element)).toEqual([
      "목",
      "목",
      "화",
      "화",
      "토",
      "토",
      "금",
      "금",
      "수",
      "수",
    ]);
    expect(catalog.stems.map((entry) => entry.polarity)).toEqual([
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
    ]);
    expect(catalog.branches.map((entry) => entry.element)).toEqual([
      "수",
      "토",
      "목",
      "목",
      "토",
      "화",
      "화",
      "토",
      "금",
      "금",
      "토",
      "수",
    ]);
    expect(catalog.branches.map((entry) => entry.polarity)).toEqual([
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
      "양",
      "음",
    ]);
  });
});
