import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CalendarAdapterError,
  DaySnapshotSchema,
  type CalendarRequest,
  type DayCalendarAdapter,
  type DaySnapshot,
} from "@/domain/calendar";
import { manseryeokDayCalendarAdapter } from "@/infrastructure/manseryeok";
import golden from "./fixtures/day-pillar-golden.json";

const adapter: DayCalendarAdapter = manseryeokDayCalendarAdapter;

function request(date: string, hour = 12, minute = 0): CalendarRequest {
  const [year, month, day] = date.split("-").map(Number);
  return {
    year,
    month,
    day,
    hour,
    minute,
    calendarType: "solar",
    isLeapMonth: false,
    timeReference: "fixed-utc+09:00",
    dayBoundary: "midnight",
  };
}

function day(input: CalendarRequest) {
  const result = adapter.calculateDay(input).pillars.day;
  return result.heavenlyStem + result.earthlyBranch;
}

describe("day pillar (installed real package, independent official reference)", () => {
  it.each(golden.quoted)("matches official solar and lunar dates: $solarDate", (fixture) => {
    expect(day(request(fixture.solarDate))).toBe(fixture.day);
    expect(
      day({
        ...request(fixture.lunarDate),
        calendarType: "lunar",
        isLeapMonth: fixture.isLeapMonth,
      }),
    ).toBe(fixture.day);
  });

  it.each(golden.quoted)(
    "keeps the official date's pillar across fixed-UTC+9 clock values: $solarDate",
    (fixture) => {
      // 00:00 local is on the previous UTC date. 23:00 must stay on this date.
      for (const [hour, minute] of [
        [0, 0],
        [22, 59],
        [23, 0],
        [23, 59],
      ]) {
        expect(day(request(fixture.solarDate, hour, minute))).toBe(fixture.day);
      }
    },
  );

  it.each(golden.derived)(
    "matches hand-derived boundary from an independent anchor: $solarDate",
    (fixture) => {
      expect(day(request(fixture.solarDate, 0, 0))).toBe(fixture.day);
      expect(day(request(fixture.solarDate, 23, 59))).toBe(fixture.day);
    },
  );

  it.each([
    ["2024-02-09", "계묘", "2024-02-10", "갑진"],
    ["2024-02-28", "임술", "2024-02-29", "계해"],
    ["2024-02-29", "계해", "2024-03-01", "갑자"],
    ["2024-12-30", "무진", "2024-12-31", "기사"],
    ["2024-12-31", "기사", "2025-01-01", "경오"],
  ])("switches at local midnight: %s -> %s -> %s -> %s", (before, previous, after, next) => {
    expect(day(request(before, 23, 59))).toBe(previous);
    expect(day(request(after, 0, 0))).toBe(next);
  });

  it("returns only the day pillar and explicit immutable provenance", () => {
    const input = Object.freeze(request("2024-02-10"));
    const snapshot = adapter.calculateDay(input);
    expectTypeOf(snapshot).toEqualTypeOf<DaySnapshot>();
    expect(Object.keys(snapshot.pillars)).toEqual(["day"]);
    expect(snapshot.provenance).toEqual({
      libraryName: "manseryeok",
      libraryVersion: "2.0.0",
      timeReference: "fixed-utc+09:00",
      dayBoundary: "midnight",
      ruleId: "calendar.day-pillar",
      ruleVersion: "1.0.0",
    });
    for (const item of [snapshot, snapshot.pillars, snapshot.pillars.day, snapshot.provenance])
      expect(Object.isFrozen(item)).toBe(true);
    expect(DaySnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(input).toEqual(request("2024-02-10"));
  });

  it("rejects unsupported response policies, versions and unexpected fields", () => {
    const snapshot = adapter.calculateDay(request("2024-02-10"));
    for (const value of [
      { ...snapshot, provenance: { ...snapshot.provenance, libraryVersion: "3.0.0" } },
      { ...snapshot, provenance: { ...snapshot.provenance, dayBoundary: "jasi" } },
      { ...snapshot, provenance: { ...snapshot.provenance, timeReference: "Asia/Seoul" } },
      { ...snapshot, pillars: { ...snapshot.pillars, hour: snapshot.pillars.day } },
      { ...snapshot, extra: true },
    ])
      expect(DaySnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("retains the leap-month flag through the actual provider (conversion regression)", () => {
    const leap = { ...request("2023-02-01"), calendarType: "lunar", isLeapMonth: true } as const;
    expect(day(leap)).toBe(day(request("2023-03-22")));
    expect(day({ ...leap, isLeapMonth: false })).toBe(day(request("2023-02-20")));
    expect(day(leap)).not.toBe(day({ ...leap, isLeapMonth: false }));
  });

  it.each(["1800-01-01", "2300-12-31"])(
    "accepts solar API range endpoint %s (provider regression)",
    (date) => {
      expect(DaySnapshotSchema.safeParse(adapter.calculateDay(request(date))).success).toBe(true);
    },
  );

  it.each([1800, 2100])("accepts lunar API year endpoint %s (provider regression)", (year) => {
    expect(
      DaySnapshotSchema.safeParse(
        adapter.calculateDay({ ...request(`${year}-01-01`), calendarType: "lunar" }),
      ).success,
    ).toBe(true);
  });

  it.each([1900, 2100])("rejects a nonexistent Gregorian leap day in century %s", (year) => {
    expect(() => adapter.calculateDay(request(`${year}-02-29`))).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });

  it("counts the Gregorian 2000 leap day in the sixty-day cycle (metamorphic regression)", () => {
    const start = day(request("2000-02-29"));
    expect(day(request("2000-04-29"))).toBe(start); // Exactly 60 civil days later.
    expect(day(request("2000-04-28"))).not.toBe(start);
    expect(day(request("2000-03-01"))).not.toBe(start);
  });

  it.each([
    null,
    {},
    { ...request("2024-02-10"), year: "2024" },
    { ...request("2024-02-10"), year: 1799 },
    { ...request("2024-02-10"), year: 2301 },
    { ...request("2024-02-30") },
    { ...request("2024-04-31") },
    { ...request("2024-02-10"), hour: undefined },
    { ...request("2024-02-10"), hour: 24 },
    { ...request("2024-02-10"), minute: 60 },
    { ...request("2024-02-10"), isLeapMonth: true },
    { ...request("2024-02-01"), calendarType: "lunar", isLeapMonth: true },
    { ...request("2024-01-30"), calendarType: "lunar" },
    { ...request("2101-01-01"), calendarType: "lunar" },
    { ...request("2024-02-10"), timeReference: "Asia/Seoul" },
    { ...request("2024-02-10"), dayBoundary: "zi-start" },
    { ...request("2024-02-10"), dayBoundary: "jasi" },
    { ...request("2024-02-10"), dayBoundary: "splitJasi" },
    { ...request("2024-02-10"), trueSolarTime: { longitude: 127 } },
  ])("rejects invalid or unsupported input without raw data %j", (input) => {
    try {
      adapter.calculateDay(input as CalendarRequest);
      expect.fail("Expected input rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarAdapterError);
      expect(error).toMatchObject({
        code: "INPUT_REJECTED",
        message: "Calendar input was rejected.",
      });
      expect(error).not.toHaveProperty("cause");
      expect(error).not.toHaveProperty("issues");
      expect(String(error)).not.toContain("2024");
    }
  });
});
