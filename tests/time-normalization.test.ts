import { describe, expect, it, vi } from "vitest";

import { normalizeBirthTime } from "@/application/time-normalization";
import { CalendarAdapterError } from "@/domain/calendar";
import { TimeZoneAdapterError, type TimeZoneAdapter } from "@/domain/timezone";
import { manseryeokCalendarConversionAdapter } from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import input from "./fixtures/cli-input.json";

const dependencies = { timeZone: temporalTimeZoneAdapter, calendar: manseryeokCalendarConversionAdapter };

describe("birth civil-time normalization application", () => {
  it("connects the existing AnalysisInput to a timezone port without calendar or saju calculation", () => {
    const resolve = vi.fn(temporalTimeZoneAdapter.resolve);
    const convert = vi.fn(manseryeokCalendarConversionAdapter.convert);
    const value = { ...input, birthInput: { ...input.birthInput, timezoneId: "Asia/Seoul" } };
    const before = structuredClone(value);
    const result = normalizeBirthTime(value, { timeZone: { resolve }, calendar: { convert } });
    expect(result.status).toBe("normalized");
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ localDateTime: "1992-10-24T05:30", timezoneId: "Asia/Seoul", disambiguation: "reject" });
    expect(convert).not.toHaveBeenCalled();
    expect(result.information.unknownFields).toEqual(["longitudeDeg", "latitudeDeg", "directionBasis"]);
    expect(value).toEqual(before);
  });

  it("converts lunar input before IANA resolution, preserving the explicit leap flag", () => {
    const result = normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, calendarType: "lunar", birthDate: "2023-02-01", isLeapMonth: true, timezoneId: "Asia/Seoul" } }, dependencies);
    expect(result).toMatchObject({ status: "normalized", time: { request: { localDateTime: "2023-03-22T05:30" }, resolved: { instant: "2023-03-21T20:30:00Z" } } });
  });

  it("returns rejected fold/gap results without fabricating an instant", () => {
    const result = normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, birthDate: "1988-10-09", birthTime: { status: "known", time: "02:30" }, timezoneId: "Asia/Seoul" } }, dependencies);
    expect(result).toMatchObject({ status: "rejected", time: { kind: "fold", reason: "AMBIGUOUS_LOCAL_TIME" } });
    if (result.status === "rejected") expect(result.time).not.toHaveProperty("resolved");
  });

  it("honors the requested DST choice while leaving solar/day policy for later stages", () => {
    const result = normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, birthDate: "1988-05-08", birthTime: { status: "known", time: "02:30" }, timezoneId: "Asia/Seoul" }, calculationPolicy: { solarTime: "true-solar", dayBoundary: "zi-start", dstDisambiguation: "later" } }, dependencies);
    expect(result).toMatchObject({ status: "normalized", time: { kind: "gap", resolved: { instant: "1988-05-07T17:30:00Z", localDateTime: "1988-05-08T03:30:00" } } });
    expect(result.information.limitations).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SOLAR_TIME_INPUT_MISSING" })]));
  });

  it("keeps an unknown clock unavailable and makes no provider calls", () => {
    const resolve = vi.fn();
    const convert = vi.fn();
    const result = normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, birthTime: { status: "unknown" } } }, { timeZone: { resolve }, calendar: { convert } });
    expect(result).toMatchObject({ status: "unavailable", reasons: ["BIRTH_TIME_UNKNOWN"] });
    expect(resolve).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
  });

  it.each(["1799-01-01", "2301-01-01"])("rejects normalization range %s before calling the port", (birthDate) => {
    const resolve = vi.fn();
    expect(normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, birthDate } }, { ...dependencies, timeZone: { resolve } })).toMatchObject({ status: "unavailable", reasons: ["TIME_RANGE_UNSUPPORTED"] });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not normalize an invalid real lunar date", () => {
    const resolve = vi.fn();
    const result = normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, calendarType: "lunar", birthDate: "2024-01-30" } }, { ...dependencies, timeZone: { resolve } });
    expect(result).toMatchObject({ status: "unavailable", reasons: ["CALENDAR_INPUT_REJECTED"] });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("handles the conversion year limit separately from the timezone limit", () => {
    expect(normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, calendarType: "lunar", birthDate: "2101-01-01" } }, dependencies)).toMatchObject({ status: "unavailable", reasons: ["CALENDAR_RANGE_UNSUPPORTED"] });
  });

  it("rejects malformed input before calling dependencies", () => {
    const resolve = vi.fn();
    expect(() => normalizeBirthTime({}, { ...dependencies, timeZone: { resolve } })).toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects damaged or mismatched timezone responses at the application boundary", () => {
    const valid = temporalTimeZoneAdapter.resolve({ localDateTime: "1992-10-24T05:30", timezoneId: "Etc/GMT-9", disambiguation: "reject" });
    const wrong = temporalTimeZoneAdapter.resolve({ localDateTime: "1992-10-25T05:30", timezoneId: "Etc/GMT-9", disambiguation: "reject" });
    for (const raw of [null, wrong, { ...valid, provenance: { ...valid.provenance, engineVersion: "future" } }]) {
      const timeZone = { resolve: () => raw } as unknown as TimeZoneAdapter;
      expect(() => normalizeBirthTime(input, { ...dependencies, timeZone })).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
    }
  });

  it("sanitizes unexpected dependency errors instead of preserving input or causes", () => {
    for (const deps of [
      { ...dependencies, timeZone: { resolve: () => { throw new Error("private date 1992-10-24"); } } },
      { ...dependencies, timeZone: { resolve: () => { throw new TimeZoneAdapterError("RESOLUTION_FAILED"); } } },
    ]) {
      try { normalizeBirthTime(input, deps); expect.fail("Expected failure"); }
      catch (error) { expect(error).toBeInstanceOf(TimeZoneAdapterError); expect(error).not.toHaveProperty("cause"); expect(String(error)).not.toContain("1992"); }
    }
    const result = normalizeBirthTime(input, { ...dependencies, timeZone: { resolve: () => { throw new TimeZoneAdapterError("INPUT_REJECTED"); } } });
    expect(result).toMatchObject({ status: "unavailable", reasons: ["TIMEZONE_INPUT_REJECTED"] });
    expect(() => normalizeBirthTime({ ...input, birthInput: { ...input.birthInput, calendarType: "lunar" } }, { ...dependencies, calendar: { convert: () => { throw new CalendarAdapterError("CALCULATION_FAILED"); } } })).toThrow(TimeZoneAdapterError);
  });
});
