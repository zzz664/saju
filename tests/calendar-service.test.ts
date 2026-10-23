import { describe, expect, it, vi } from "vitest";

import { calculateSajuSnapshot } from "@/application/saju";
import { CalendarAdapterError, type CalendarAdapter } from "@/domain/calendar";
import {
  calculateManseryeokSnapshot,
  manseryeokCalendarAdapter,
} from "@/infrastructure/manseryeok";
import input from "./fixtures/core-reference-input.json";

const snapshot = calculateManseryeokSnapshot({
  year: 1992,
  month: 10,
  day: 24,
  hour: 5,
  minute: 30,
  calendarType: "solar",
  isLeapMonth: false,
  timeReference: "fixed-utc+09:00",
  dayBoundary: "midnight",
});

describe("calendar application port", () => {
  it("maps validated AnalysisInput into the provider-independent port request", () => {
    const calculate = vi.fn(() => snapshot);
    const before = structuredClone(input);
    const result = calculateSajuSnapshot(input, { calculate });

    expect(result.status).toBe("calculated");
    expect(calculate).toHaveBeenCalledExactlyOnceWith({
      year: 1992,
      month: 10,
      day: 24,
      hour: 5,
      minute: 30,
      calendarType: "solar",
      isLeapMonth: false,
      timeReference: "fixed-utc+09:00",
      dayBoundary: "midnight",
    });
    expect(result.information.unknownFields).toEqual([
      "longitudeDeg",
      "latitudeDeg",
      "directionBasis",
    ]);
    expect(input).toEqual(before);
  });

  it("connects the real manseryeok adapter through the port", () => {
    const result = calculateSajuSnapshot(input, manseryeokCalendarAdapter);

    expect(result.status).toBe("calculated");
    if (result.status === "calculated") expect(result.snapshot).toEqual(snapshot);
  });

  it.each([
    { birthTime: { status: "unknown" } },
    { timezoneId: "Asia/Seoul" },
    { timezoneId: "America/New_York" },
    { birthDate: "1799-01-01" },
  ])("returns unavailable without a provider call for %j", (patch) => {
    const calculate = vi.fn(() => snapshot);
    const result = calculateSajuSnapshot(
      { ...input, birthInput: { ...input.birthInput, ...patch } },
      { calculate },
    );

    expect(result.status).toBe("unavailable");
    expect(result).not.toHaveProperty("snapshot");
    expect(calculate).not.toHaveBeenCalled();
  });

  it.each([
    { solarTime: "mean-solar" },
    { solarTime: "true-solar" },
    { dayBoundary: "zi-start" },
    { dstDisambiguation: "earlier" },
    { dstDisambiguation: "later" },
  ])("does not replace unsupported policy %j with defaults", (patch) => {
    const calculate = vi.fn(() => snapshot);

    expect(
      calculateSajuSnapshot(
        { ...input, calculationPolicy: { ...input.calculationPolicy, ...patch } },
        { calculate },
      ).status,
    ).toBe("unavailable");
    expect(calculate).not.toHaveBeenCalled();
  });

  it("keeps all unsupported reasons and missing information without a fake clock", () => {
    const result = calculateSajuSnapshot(
      {
        ...input,
        birthInput: {
          ...input.birthInput,
          birthTime: { status: "unknown" },
          timezoneId: "Asia/Seoul",
        },
        calculationPolicy: {
          ...input.calculationPolicy,
          solarTime: "true-solar",
          dayBoundary: "zi-start",
          dstDisambiguation: "later",
        },
      },
      { calculate: vi.fn() },
    );

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reasons).toEqual([
        "BIRTH_TIME_UNKNOWN",
        "TIMEZONE_UNSUPPORTED",
        "SOLAR_TIME_UNSUPPORTED",
        "DAY_BOUNDARY_UNSUPPORTED",
        "DST_POLICY_UNSUPPORTED",
      ]);
      expect(result.information.unknownFields).toContain("birthTime");
    }
  });

  it("rejects invalid input before calling the port", () => {
    const calculate = vi.fn(() => snapshot);

    expect(() => calculateSajuSnapshot({}, { calculate })).toThrow();
    expect(calculate).not.toHaveBeenCalled();
  });

  it.each(["00:00", "23:59"])("passes known clock boundary %s without date changes", (time) => {
    const calculate = vi.fn<CalendarAdapter["calculate"]>(() => snapshot);
    calculateSajuSnapshot(
      { ...input, birthInput: { ...input.birthInput, birthTime: { status: "known", time } } },
      { calculate },
    );

    const [hour, minute] = time.split(":").map(Number);
    expect(calculate.mock.calls[0][0]).toMatchObject({
      year: 1992,
      month: 10,
      day: 24,
      hour,
      minute,
    });
  });

  it("classifies actual invalid lunar calendar input as unavailable", () => {
    const result = calculateSajuSnapshot(
      {
        ...input,
        birthInput: {
          ...input.birthInput,
          calendarType: "lunar",
          birthDate: "2024-01-01",
          isLeapMonth: true,
        },
      },
      manseryeokCalendarAdapter,
    );

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable")
      expect(result.reasons).toEqual(["CALENDAR_INPUT_REJECTED"]);
  });

  it("rejects corrupted adapter output at the application boundary", () => {
    const adapter = {
      calculate: () => ({ ...snapshot, pillars: null }),
    } as unknown as CalendarAdapter;

    expect(() => calculateSajuSnapshot(input, adapter)).toThrow(CalendarAdapterError);
  });

  it("sanitizes unexpected port failures without preserving a raw cause", () => {
    let caught: unknown;
    try {
      calculateSajuSnapshot(input, {
        calculate: () => {
          throw new Error("private birth 1992-10-24");
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CalendarAdapterError);
    expect(String(caught)).not.toContain(input.birthInput.birthDate);
    expect(caught).not.toHaveProperty("cause");
  });
});
