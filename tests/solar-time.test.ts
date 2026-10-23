import { describe, expect, it, vi } from "vitest";

import {
  applySolarTimePolicy,
  SolarTimeError,
  SolarTimeSnapshotSchema,
  type SolarTimeRequest,
} from "@/domain/solar-time";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import { manseryeokEquationOfTimeAdapter } from "@/infrastructure/manseryeok";
import golden from "./fixtures/equation-of-time-golden.json";

function civil(localDateTime = "2024-01-01T12:00", timezoneId = "Asia/Seoul") {
  const result = temporalTimeZoneAdapter.resolve({
    localDateTime,
    timezoneId,
    disambiguation: "reject",
  });
  if (result.status !== "resolved") throw new Error("Expected an unambiguous fixture");
  return result;
}

const base = { time: civil(), mode: "mean-solar", longitudeDeg: 127.5 } as const;

describe("explicit solar-time policy", () => {
  it.each([
    [135, "2024-01-01T12:00:00.000", 0],
    [127.5, "2024-01-01T11:30:00.000", -1800],
    [0, "2024-01-01T03:00:00.000", -32400],
    [-75, "2023-12-31T22:00:00.000", -50400],
    [180, "2024-01-01T15:00:00.000", 10800],
    [-180, "2023-12-31T15:00:00.000", -75600],
  ])(
    "uses east-positive longitude %s with no default meridian",
    (longitudeDeg, policyClock, correctionSeconds) => {
      const calculate = vi.fn();
      const result = applySolarTimePolicy({ ...base, longitudeDeg }, { calculate });
      expect(result).toMatchObject({
        mode: "mean-solar",
        policyClock,
        correctionSeconds,
        longitudeDeg,
        equationOfTime: null,
        instant: "2024-01-01T03:00:00Z",
      });
      expect(calculate).not.toHaveBeenCalled();
    },
  );

  it("preserves the resolved legal clock for standard, including DST, without using longitude or EoT", () => {
    const calculate = vi.fn();
    const result = applySolarTimePolicy(
      { time: civil("1988-07-01T12:00"), mode: "standard", longitudeDeg: null },
      { calculate },
    );
    expect(result).toMatchObject({
      policyClock: "1988-07-01T12:00:00.000",
      civilOffsetSeconds: 36000,
      correctionSeconds: 0,
      longitudeDeg: null,
      equationOfTime: null,
    });
    expect(calculate).not.toHaveBeenCalled();
  });

  it("applies the historical IANA offset once when selecting mean solar time", () => {
    expect(applySolarTimePolicy({ ...base, time: civil("1988-07-01T12:00") })).toMatchObject({
      policyClock: "1988-07-01T10:30:00.000",
      correctionSeconds: -5400,
    });
    expect(applySolarTimePolicy({ ...base, time: civil("1955-01-01T12:00") })).toMatchObject({
      policyClock: "1955-01-01T12:00:00.000",
      correctionSeconds: 0,
    });
    expect(
      applySolarTimePolicy({ ...base, time: civil("1900-01-01T12:00"), longitudeDeg: 126.978 }),
    ).toMatchObject({ policyClock: "1900-01-01T12:00:02.720" });
  });

  it("uses the actual UTC instant for true solar time and preserves it after correction", () => {
    const calculate = vi.fn(manseryeokEquationOfTimeAdapter.calculate);
    const result = applySolarTimePolicy({ ...base, mode: "true-solar" }, { calculate });
    expect(calculate).toHaveBeenCalledExactlyOnceWith({ instant: "2024-01-01T03:00:00Z" });
    expect(result.instant).toBe("2024-01-01T03:00:00Z");
    expect(result.equationOfTime?.instant).toBe(result.instant);
  });

  it.each([
    [-5, "2024-01-01T11:25:00.000"],
    [0, "2024-01-01T11:30:00.000"],
    [5, "2024-01-01T11:35:00.000"],
  ])("adds signed EoT %s minutes to mean solar time", (minutes, policyClock) => {
    const snapshot = manseryeokEquationOfTimeAdapter.calculate({
      instant: base.time.resolved.instant,
    });
    expect(
      applySolarTimePolicy(
        { ...base, mode: "true-solar" },
        { calculate: () => ({ ...snapshot, minutes }) },
      ),
    ).toMatchObject({ policyClock, offsetFromUtcSeconds: 30600 + minutes * 60 });
  });

  it("ignores even a supplied longitude in standard mode", () => {
    expect(applySolarTimePolicy({ ...base, mode: "standard", longitudeDeg: -180 })).toMatchObject({
      longitudeDeg: null,
      policyClock: "2024-01-01T12:00:00.000",
      correctionSeconds: 0,
    });
  });

  it("produces the same solar clock for the same UTC and longitude across legal timezones", () => {
    const seoul = civil("2024-06-01T21:00");
    const ny = civil("2024-06-01T08:00", "America/New_York");
    for (const mode of ["mean-solar", "true-solar"] as const) {
      expect(
        applySolarTimePolicy({ ...base, time: seoul, mode }, manseryeokEquationOfTimeAdapter)
          .policyClock,
      ).toBe(
        applySolarTimePolicy({ ...base, time: ny, mode }, manseryeokEquationOfTimeAdapter)
          .policyClock,
      );
    }
  });

  it.each([
    [-0.000003, "2023-12-31T23:59:59.999"],
    [0.000003, "2024-01-01T00:00:00.001"],
  ])("records nearest-millisecond rounding for longitude %s", (longitudeDeg, policyClock) => {
    expect(
      applySolarTimePolicy({ ...base, time: civil("2024-01-01T00:00", "UTC"), longitudeDeg })
        .policyClock,
    ).toBe(policyClock);
  });

  it("returns immutable JSON data with explicit rounding and rule provenance", () => {
    const input = Object.freeze({ ...base });
    const result = applySolarTimePolicy(input);
    expect(result.provenance).toEqual({
      ruleId: "time.solar-policy",
      ruleVersion: "1.0.0",
      rounding: "nearest-millisecond",
      standardBasis: "resolved-civil-clock",
      longitudeConvention: "east-positive",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(SolarTimeSnapshotSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(input).toEqual(base);
  });

  it.each(["mean-solar", "true-solar"])(
    "rejects unknown longitude for %s before calling EoT",
    (mode) => {
      const calculate = vi.fn();
      expect(() =>
        applySolarTimePolicy({ ...base, mode, longitudeDeg: null }, { calculate }),
      ).toThrow(expect.objectContaining({ code: "LONGITUDE_REQUIRED" }));
      expect(calculate).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { ...base, longitudeDeg: undefined },
    { ...base, longitudeDeg: NaN },
    { ...base, longitudeDeg: Infinity },
    { ...base, longitudeDeg: 181 },
    { ...base, longitudeDeg: -181 },
    { ...base, mode: "automatic" },
    { ...base, time: null },
    { ...base, latitudeDeg: 37 },
  ])("rejects invalid requests %j", (value) => {
    expect(() => applySolarTimePolicy(value as SolarTimeRequest)).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });

  it("requires an EoT provider only for true-solar and sanitizes failures", () => {
    expect(() => applySolarTimePolicy({ ...base, mode: "true-solar" })).toThrow(SolarTimeError);
    try {
      applySolarTimePolicy(
        { ...base, mode: "true-solar" },
        {
          calculate: () => {
            throw new Error("private date 2024-01-01");
          },
        },
      );
      expect.fail("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SolarTimeError);
      expect(String(error)).not.toContain("2024");
      expect(error).not.toHaveProperty("cause");
    }
  });
});

describe("real pinned equation-of-time adapter", () => {
  it.each(golden.cases)(
    "matches the independent NOAA approximation at $instant within the declared 30 seconds",
    (fixture) => {
      const result = manseryeokEquationOfTimeAdapter.calculate({ instant: fixture.instant });
      expect(Math.abs(result.minutes - fixture.minutes) * 60).toBeLessThanOrEqual(
        golden.toleranceSeconds,
      );
      expect(result.provenance).toEqual({
        libraryName: "manseryeok",
        libraryVersion: "2.0.0",
        model: "meeus-28.3",
        convention: "apparent-minus-mean",
        ruleId: "astro.equation-of-time",
        ruleVersion: "1.0.0",
      });
    },
  );

  it.each([
    {},
    { instant: "bad" },
    { instant: "2024-01-01T12:00" },
    { instant: "2024-01-01T12:00:00Z", longitude: 127 },
    { instant: "1798-01-01T00:00:00Z" },
  ])("rejects invalid EoT requests %j", (value) => {
    expect(() => manseryeokEquationOfTimeAdapter.calculate(value as { instant: string })).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });
});
