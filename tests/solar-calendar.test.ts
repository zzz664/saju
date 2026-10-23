import { describe, expect, it } from "vitest";

import {
  CalendarAdapterError,
  SolarTermsSnapshotSchema,
  YearMonthSnapshotSchema,
  type CalendarRequest,
  type SolarCalendarAdapter,
} from "@/domain/calendar";
import { manseryeokSolarCalendarAdapter } from "@/infrastructure/manseryeok";
import golden from "./fixtures/solar-terms-golden.json";

const adapter: SolarCalendarAdapter = manseryeokSolarCalendarAdapter;
const base = {
  calendarType: "solar",
  isLeapMonth: false,
  timeReference: "fixed-utc+09:00",
  dayBoundary: "midnight",
} as const;

function at(localDate: string, offsetMinutes = 0): CalendarRequest {
  // Read fixed UTC+9 fields via UTC getters; never depend on the host timezone.
  const date = new Date(Date.parse(`${localDate}+09:00`) + (9 * 60 + offsetMinutes) * 60_000);
  return {
    ...base,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function pillars(request: CalendarRequest) {
  const result = adapter.calculateYearMonth(request);
  const name = (pillar: typeof result.pillars.year) => pillar.heavenlyStem + pillar.earthlyBranch;
  return { year: name(result.pillars.year), month: name(result.pillars.month) };
}

describe("solar terms and year/month pillars (actual pinned package)", () => {
  it("returns all 24 terms, validated UTC strings and explicit policy metadata", () => {
    const result = adapter.getSolarTerms({ year: 2024 });
    expect(result.terms).toHaveLength(24);
    expect(result.terms.filter((term) => term.isMonthBoundary)).toHaveLength(12);
    expect(result.provenance).toEqual({
      libraryName: "manseryeok",
      libraryVersion: "2.0.0",
      precision: "minute",
      ruleId: "calendar.solar-terms",
      ruleVersion: "1.0.0",
    });
    for (let index = 0; index < 24; index++) {
      const term = result.terms[index];
      expect(term.index).toBe(index);
      expect(term.name).toBe(golden.terms[index][0]);
      expect(term.isMonthBoundary).toBe(index % 2 === 0);
      // Official notice independently confirms all dates, not minute accuracy.
      expect(new Date(Date.parse(term.startsAt) + 9 * 3_600_000).toISOString().slice(5, 10)).toBe(
        golden.terms[index][1].slice(0, 5),
      );
      expect(Object.isFrozen(term)).toBe(true);
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.terms)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(SolarTermsSnapshotSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it.each(golden.boundaries)(
    "uses the independent minute and start-inclusive boundary for jeol $index",
    (boundary) => {
      const local = `2024-${golden.terms[boundary.index][1]}`;
      expect(adapter.getSolarTerms({ year: 2024 }).terms[boundary.index].startsAt).toBe(
        new Date(`${local}+09:00`).toISOString(),
      );
      expect(pillars(at(local, -1))).toEqual({
        year: boundary.beforeYear,
        month: boundary.beforeMonth,
      });
      expect(pillars(at(local))).toEqual({ year: boundary.afterYear, month: boundary.afterMonth });
      expect(pillars(at(local, 1))).toEqual({
        year: boundary.afterYear,
        month: boundary.afterMonth,
      });
    },
  );

  it.each(
    golden.terms
      .map(([name, date], index) => ({ name, date, index }))
      .filter(({ index }) => index % 2 === 1),
  )("does not change pillars at the middle term $name", ({ date }) => {
    const local = `2024-${date}`;
    expect(pillars(at(local, -1))).toEqual(pillars(at(local)));
    expect(pillars(at(local, 1))).toEqual(pillars(at(local)));
  });

  it("records the known one-minute Xiaoxue discrepancy rather than claiming independent agreement", () => {
    const { index, offsetMinutes } = golden.knownProviderDifference;
    const reference = Date.parse(`2024-${golden.terms[index][1]}+09:00`);
    const actual = Date.parse(adapter.getSolarTerms({ year: 2024 }).terms[index].startsAt);
    expect(actual - reference).toBe(offsetMinutes * 60_000);
  });

  it.each([
    ["2023-12-31T23:59", "계묘", "갑자"],
    ["2024-01-01T00:00", "계묘", "갑자"],
    ["2024-02-09T23:59", "갑진", "병인"],
    ["2024-02-10T00:00", "갑진", "병인"],
    ["2024-12-31T23:59", "갑진", "병자"],
    ["2025-01-01T00:00", "갑진", "병자"],
  ])("does not use Gregorian/Lunar New Year as a boundary: %s", (date, year, month) => {
    expect(pillars(at(date))).toEqual({ year, month });
  });

  it("preserves lunar conversion and does not treat a leap-month start as a solar month boundary", () => {
    const request = {
      ...at("2023-03-22T12:00"),
      calendarType: "lunar",
      month: 2,
      day: 1,
      isLeapMonth: true,
    } as const;
    expect(pillars(request)).toEqual({ year: "계묘", month: "을묘" });
    expect(pillars(request)).toEqual(pillars(at("2023-03-22T12:00")));
    expect(pillars(at("2023-03-21T12:00"))).toEqual(pillars(request));
  });

  it("returns only immutable year/month pillars with adopted rule versions", () => {
    const result = adapter.calculateYearMonth(at("2024-02-04T17:27"));
    expect(Object.keys(result.pillars)).toEqual(["year", "month"]);
    expect(result.provenance).toEqual({
      libraryName: "manseryeok",
      libraryVersion: "2.0.0",
      precision: "minute",
      timeReference: "fixed-utc+09:00",
      yearBoundary: "lichun",
      monthBoundary: "12-jeol",
      boundaryInclusion: "start-inclusive",
      ruleId: "calendar.year-month-pillars",
      ruleVersion: "1.0.0",
    });
    for (const item of [
      result,
      result.pillars,
      result.pillars.year,
      result.pillars.month,
      result.provenance,
    ])
      expect(Object.isFrozen(item)).toBe(true);
    expect(YearMonthSnapshotSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it.each([1800, 2300])("accepts supported endpoint %s (provider regression)", (year) => {
    expect(adapter.getSolarTerms({ year }).terms).toHaveLength(24);
    expect(
      YearMonthSnapshotSchema.safeParse(
        adapter.calculateYearMonth({ ...at("2024-06-01T12:00"), year }),
      ).success,
    ).toBe(true);
  });

  it.each([
    null,
    {},
    { year: 1799 },
    { year: 2301 },
    { year: "2024" },
    { year: 2024.5 },
    { year: NaN },
    { year: Infinity },
    { year: 2024, timezone: "Asia/Seoul" },
  ])("rejects unsupported schedule requests %j", (input) => {
    expect(() => adapter.getSolarTerms(input as { year: number })).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });

  it.each([
    { hour: undefined },
    { year: 1799 },
    { year: 2301 },
    { month: 2, day: 30 },
    { dayBoundary: "zi-start" },
    { timeReference: "Asia/Seoul" },
    { calendarType: "lunar", year: 2101 },
    { isLeapMonth: true },
  ])("rejects invalid calculation requests without raw causes %j", (patch) => {
    try {
      adapter.calculateYearMonth({ ...at("2024-02-04T17:27"), ...patch } as CalendarRequest);
      expect.fail("Expected input rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarAdapterError);
      expect(error).toMatchObject({
        code: "INPUT_REJECTED",
        message: "Calendar input was rejected.",
      });
      expect(error).not.toHaveProperty("cause");
    }
  });
});
