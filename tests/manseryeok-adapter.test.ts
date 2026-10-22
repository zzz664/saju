import { describe, expect, expectTypeOf, it } from "vitest";

import {
  calculateManseryeokSnapshot,
  ManseryeokAdapterError,
  ManseryeokRequestSchema,
  ManseryeokSnapshotSchema,
  type ManseryeokSnapshot,
} from "@/infrastructure/manseryeok";
import golden from "./fixtures/manseryeok-day-golden.json";

const request = {
  year: 1992, month: 10, day: 24, hour: 5, minute: 30,
  calendarType: "solar", isLeapMonth: false,
  timeReference: "fixed-utc+09:00", dayBoundary: "midnight",
} as const;

describe("pinned manseryeok adapter (real package, no mock)", () => {
  it("calls the installed API and projects a validated plain-data snapshot", () => {
    // Upstream README smoke example: integration regression, not independent gold.
    const snapshot = calculateManseryeokSnapshot(request);

    expectTypeOf(snapshot).toEqualTypeOf<ManseryeokSnapshot>();
    expect(snapshot.pillars).toEqual({
      year: { heavenlyStem: "임", earthlyBranch: "신" },
      month: { heavenlyStem: "경", earthlyBranch: "술" },
      day: { heavenlyStem: "계", earthlyBranch: "유" },
      hour: { heavenlyStem: "을", earthlyBranch: "묘" },
    });
    expect(snapshot.provenance).toEqual({ libraryName: "manseryeok", libraryVersion: "2.0.0", timeReference: "fixed-utc+09:00", dayBoundary: "midnight" });
    expect(ManseryeokSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pillars.day)).toBe(true);
    expect(Object.keys(snapshot)).toEqual(["pillars", "provenance"]);
  });

  it("passes lunar calendar selection to the real API", () => {
    const lunar = { ...request, calendarType: "lunar", month: 9, day: 29 };

    expect(calculateManseryeokSnapshot(lunar).pillars).toEqual(calculateManseryeokSnapshot(request).pillars);
  });

  it("passes the explicit leap-month flag without treating it as the regular month", () => {
    const leap = { ...request, year: 2020, month: 4, day: 1, calendarType: "lunar", isLeapMonth: true };
    const solar = { ...request, year: 2020, month: 5, day: 23 };

    expect(calculateManseryeokSnapshot(leap).pillars).toEqual(calculateManseryeokSnapshot(solar).pillars);
    expect(calculateManseryeokSnapshot({ ...leap, isLeapMonth: false }).pillars).not.toEqual(calculateManseryeokSnapshot(solar).pillars);
  });

  it.each(golden.cases)("matches independent KASI day reference at midday: $solarDate", ({ solarDate, day }) => {
    const [year, month, date] = solarDate.split("-").map(Number);
    const snapshot = calculateManseryeokSnapshot({ ...request, year, month, day: date, hour: 12, minute: 0 });

    expect(snapshot.pillars.day).toEqual(day);
  });

  it.each([[1800, 1, 1], [2300, 12, 31]])("accepts solar API range boundary %s-%s-%s", (year, month, day) => {
    expect(ManseryeokSnapshotSchema.safeParse(calculateManseryeokSnapshot({ ...request, year, month, day })).success).toBe(true);
  });

  it.each([1800, 2100])("accepts lunar API year boundary %s", (year) => {
    expect(ManseryeokSnapshotSchema.safeParse(calculateManseryeokSnapshot({ ...request, year, month: 1, day: 1, calendarType: "lunar" })).success).toBe(true);
  });

  it.each([[0, 0], [23, 59]])("accepts a known clock at %s:%s", (hour, minute) => {
    expect(calculateManseryeokSnapshot({ ...request, hour, minute }).pillars.hour).toBeDefined();
  });

  it.each([{ year: 1799 }, { year: 2301 }, { calendarType: "lunar", year: 2101 }, { hour: 24 }, { hour: null }, { minute: -1 }, { minute: 60 }, { year: "1992" }, { month: NaN }, { isLeapMonth: true }, { dayBoundary: "zi-start" }, { timeReference: "Asia/Seoul" }, { timezoneId: "America/New_York" }, { trueSolarTime: { longitude: 127 } }, { gender: "male" }])("rejects invalid or unsupported adapter requests %j", (patch) => {
    expect(() => calculateManseryeokSnapshot({ ...request, ...patch })).toThrow();
  });

  it.each(Object.keys(request))("requires explicit field %s without library default substitution", (field) => {
    const input: Record<string, unknown> = { ...request };
    delete input[field];

    expect(ManseryeokRequestSchema.safeParse(input).success).toBe(false);
  });

  it.each([{ year: 2023, month: 2, day: 29 }, { year: 2024, month: 4, day: 31 }, { year: 2024, month: 1, day: 1, calendarType: "lunar", isLeapMonth: true }])("sanitizes an actual library rejection for %j", (patch) => {
    let caught: unknown;
    try {
      calculateManseryeokSnapshot({ ...request, ...patch });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ManseryeokAdapterError);
    expect(caught).toMatchObject({ code: "LIBRARY_REJECTED_INPUT", message: "The pinned calendar library rejected the request." });
    expect(String(caught)).not.toContain(String(patch.year));
    expect(caught).not.toHaveProperty("cause");
  });

  it("does not mutate or freeze caller input and is stable on repeated calls", () => {
    const input = { ...request };
    const before = structuredClone(input);
    const first = calculateManseryeokSnapshot(input);

    expect(calculateManseryeokSnapshot(input)).toEqual(first);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("rejects corrupted output shape or provenance without relying on SDK result methods", () => {
    const snapshot = calculateManseryeokSnapshot(request);

    expect(ManseryeokSnapshotSchema.safeParse({ ...snapshot, pillars: { ...snapshot.pillars, hour: null } }).success).toBe(false);
    expect(ManseryeokSnapshotSchema.safeParse({ ...snapshot, provenance: { ...snapshot.provenance, libraryVersion: "1.0.0" } }).success).toBe(false);
    expect(ManseryeokSnapshotSchema.safeParse({ ...snapshot, toString: () => "SDK method" }).success).toBe(false);
  });
});
