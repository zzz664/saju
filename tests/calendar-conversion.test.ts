import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CalendarAdapterError,
  CalendarConversionRequestSchema,
  CalendarConversionSnapshotSchema,
  type CalendarConversionAdapter,
  type CalendarConversionSnapshot,
} from "@/domain/calendar";
import { manseryeokCalendarConversionAdapter } from "@/infrastructure/manseryeok";
import golden from "./fixtures/calendar-conversion-golden.json";

const adapter: CalendarConversionAdapter = manseryeokCalendarConversionAdapter;
const solar = { year: 2023, month: 3, day: 22, calendarType: "solar", isLeapMonth: false } as const;
const lunar = { year: 2023, month: 2, day: 1, calendarType: "lunar", isLeapMonth: true } as const;

function convert(value: unknown) {
  // Deliberately accept unknown here to test the runtime trust boundary as well.
  return adapter.convert(value as Parameters<CalendarConversionAdapter["convert"]>[0]);
}

describe("solar/lunar conversion (installed real package)", () => {
  it.each(golden.cases)("matches independent KASI dates in both directions: $id", (fixture) => {
    const fromSolar = convert({ ...fixture.solar, calendarType: "solar", isLeapMonth: false });
    const fromLunar = convert({ ...fixture.lunar, calendarType: "lunar" });
    expect(fromSolar.solar).toEqual(fixture.solar);
    expect(fromSolar.lunar).toEqual(fixture.lunar);
    expect(fromLunar).toEqual(fromSolar);
  });

  it.each(golden.cases)("round-trips without losing the leap flag: $id", (fixture) => {
    const first = convert({ ...fixture.lunar, calendarType: "lunar" });
    const second = convert({ ...first.solar, calendarType: "solar", isLeapMonth: false });
    const third = convert({ ...second.lunar, calendarType: "lunar" });
    expect(second.lunar).toEqual(fixture.lunar);
    expect(third).toEqual(first);
  });

  it("distinguishes regular and leap occurrences of the same month/day", () => {
    expect(convert(lunar).solar).toEqual({ year: 2023, month: 3, day: 22 });
    expect(convert({ ...lunar, isLeapMonth: false }).solar).toEqual({
      year: 2023,
      month: 2,
      day: 20,
    });
  });

  it("returns a versioned immutable plain DTO without time or SDK objects", () => {
    const input = Object.freeze({ ...lunar });
    const result = convert(input);
    expectTypeOf(result).toEqualTypeOf<CalendarConversionSnapshot>();
    expect(result.provenance).toEqual({
      libraryName: "manseryeok",
      libraryVersion: "2.0.0",
      ruleId: "calendar.solar-lunar-conversion",
      ruleVersion: "1.0.0",
    });
    expect(Object.keys(result)).toEqual(["solar", "lunar", "provenance"]);
    for (const value of [result, result.solar, result.lunar, result.provenance]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(CalendarConversionSnapshotSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
    expect(input).toEqual(lunar);
  });

  it.each([
    { year: 1391, month: 2, day: 13, lunar: { year: 1391, month: 1, day: 1, isLeapMonth: false } },
    {
      year: 2101,
      month: 1,
      day: 28,
      lunar: { year: 2100, month: 12, day: 29, isLeapMonth: false },
    },
  ])(
    "accepts exact provider solar endpoints $year-$month-$day (regression, not independent gold)",
    (fixture) => {
      const result = convert({
        ...solar,
        year: fixture.year,
        month: fixture.month,
        day: fixture.day,
      });
      expect(result.lunar).toEqual(fixture.lunar);
      expect(convert({ ...fixture.lunar, calendarType: "lunar" })).toEqual(result);
    },
  );

  it.each([
    { year: 1391, month: 2, day: 12 },
    { year: 2101, month: 1, day: 29 },
    { year: 1390 },
    { year: 2102 },
  ])("rejects outside the actual solar interval %j", (patch) => {
    expect(() => convert({ ...solar, ...patch })).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });

  it.each([1900, 2100])("rejects February 29 in Gregorian non-leap century %s", (year) => {
    expect(
      CalendarConversionRequestSchema.safeParse({ ...solar, year, month: 2, day: 29 }).success,
    ).toBe(false);
    expect(() => convert({ ...solar, year, month: 2, day: 29 })).toThrow(CalendarAdapterError);
  });

  it.each([2000, 2024])("accepts Gregorian February 29 in leap year %s", (year) => {
    const result = convert({ ...solar, year, month: 2, day: 29 });
    expect(convert({ ...result.lunar, calendarType: "lunar" })).toEqual(result);
  });

  it.each([
    null,
    undefined,
    {},
    { ...solar, year: "2023" },
    { ...solar, year: 2023.5 },
    { ...solar, year: NaN },
    { ...solar, year: Infinity },
    { ...solar, month: 0 },
    { ...solar, month: 13 },
    { ...solar, day: 0 },
    { ...solar, day: 32 },
    { ...solar, month: 4, day: 31 },
    { ...solar, year: 2023, month: 2, day: 29 },
    { ...solar, isLeapMonth: true },
    { ...solar, isLeapMonth: undefined },
    { ...lunar, isLeapMonth: "true" },
    { ...lunar, isLeapMonth: null },
    { ...lunar, isLeapMonth: undefined },
    { ...lunar, year: 1390 },
    { ...lunar, year: 2101 },
    { ...lunar, day: 31 },
    { ...lunar, day: 30 }, // 2023 leap second month has only 29 days.
    { ...lunar, month: 3 }, // No leap third month in 2023.
    { ...lunar, year: 2024 }, // No leap month in 2024.
    { ...lunar, month: 1, day: 30, isLeapMonth: false },
    { ...solar, calendarType: "gregorian" },
    { ...solar, hour: 12 },
    { ...solar, timezoneId: "Asia/Seoul" },
    { ...solar, gender: "male" },
    { ...solar, trueSolarTime: {} },
  ])("rejects invalid input without exposing the original value %j", (input) => {
    try {
      convert(input);
      expect.fail("Expected conversion rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarAdapterError);
      expect(error).toMatchObject({
        code: "INPUT_REJECTED",
        message: "Calendar input was rejected.",
      });
      expect(error).not.toHaveProperty("cause");
      expect(error).not.toHaveProperty("issues");
      expect(JSON.stringify(error)).not.toContain("2023");
      expect(String(error)).not.toContain("2023");
    }
  });

  it("validates dates and pinned provenance on the output boundary", () => {
    const result = convert(solar);
    for (const value of [
      { ...result, solar: { year: 2023, month: 2, day: 30 } },
      { ...result, lunar: { ...result.lunar, isLeapMonth: undefined } },
      { ...result, provenance: { ...result.provenance, libraryVersion: "3.0.0" } },
      { ...result, extra: true },
    ])
      expect(CalendarConversionSnapshotSchema.safeParse(value).success).toBe(false);
  });
});
