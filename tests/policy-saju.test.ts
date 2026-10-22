import { describe, expect, it, vi } from "vitest";
import { calculatePolicySaju, PolicyCalculationResultSchema } from "@/application/policy-saju";
import { manseryeokCalendarConversionAdapter, manseryeokEquationOfTimeAdapter, manseryeokPolicyCalendarAdapter } from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import { CalendarAdapterError } from "@/domain/calendar";
import input from "./fixtures/cli-input.json";

const dependencies = { timeZone: temporalTimeZoneAdapter, calendar: manseryeokCalendarConversionAdapter, equationOfTime: manseryeokEquationOfTimeAdapter, pillars: manseryeokPolicyCalendarAdapter };
const base = { ...input, birthInput: { ...input.birthInput, birthDate: "2024-02-10", timezoneId: "Asia/Seoul", birthTime: { status: "known", time: "23:00" } }, calculationPolicy: { ...input.calculationPolicy, dayBoundary: "zi-start" } };
const unknown = { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } };

describe("policy-aware saju application", () => {
  it("connects civil, solar and SDK day/hour policies while preserving the original input", () => {
    const before = structuredClone(base);
    expect(calculatePolicySaju(base, dependencies)).toMatchObject({ status: "calculated", snapshot: { pillars: { day: { heavenlyStem: "을", earthlyBranch: "사" }, hour: { heavenlyStem: "병", earthlyBranch: "자" } } }, time: { resolved: { instant: "2024-02-10T14:00:00Z" } } });
    expect(base).toEqual(before);
  });

  it("uses the corrected solar clock for day/hour and original UTC for year/month", () => {
    const result = calculatePolicySaju({ ...base, birthInput: { ...base.birthInput, birthDate: "2024-02-04", birthTime: { status: "known", time: "17:27" }, longitudeDeg: 120 }, calculationPolicy: { ...base.calculationPolicy, solarTime: "mean-solar" } }, dependencies);
    expect(result).toMatchObject({ status: "calculated", solarTime: { policyClock: "2024-02-04T16:27:00.000" }, snapshot: { pillars: { year: { heavenlyStem: "갑", earthlyBranch: "진" }, month: { heavenlyStem: "병", earthlyBranch: "인" } } } });
  });

  it("lets solar correction cross the day and zi-start boundaries", () => {
    const value = { ...base, birthInput: { ...base.birthInput, birthTime: { status: "known", time: "00:00" }, longitudeDeg: 127.5 }, calculationPolicy: { ...base.calculationPolicy, solarTime: "mean-solar" } };
    expect(calculatePolicySaju(value, dependencies)).toMatchObject({ solarTime: { policyClock: "2024-02-09T23:30:00.000" }, snapshot: { pillars: { day: { heavenlyStem: "갑", earthlyBranch: "진" } } } });
    expect(calculatePolicySaju({ ...value, calculationPolicy: { ...value.calculationPolicy, dayBoundary: "midnight" } }, dependencies)).toMatchObject({ snapshot: { pillars: { day: { heavenlyStem: "계", earthlyBranch: "묘" } } } });
  });

  it("normalizes lunar leap dates before the two SDK projections", () => {
    expect(calculatePolicySaju({ ...base, birthInput: { ...base.birthInput, calendarType: "lunar", birthDate: "2023-02-01", isLeapMonth: true } }, dependencies)).toMatchObject({ status: "calculated", time: { request: { localDateTime: "2023-03-22T23:00" } } });
  });

  it("rejects a fold without a pillar call and honors explicit earlier/later", () => {
    const value = { ...base, birthInput: { ...base.birthInput, birthDate: "1988-10-09", birthTime: { status: "known", time: "02:30" } } };
    const calculate = vi.fn();
    expect(calculatePolicySaju(value, { ...dependencies, pillars: { calculate } }).status).toBe("rejected");
    expect(calculate).not.toHaveBeenCalled();
    for (const dstDisambiguation of ["earlier", "later"]) expect(calculatePolicySaju({ ...value, calculationPolicy: { ...value.calculationPolicy, dstDisambiguation } }, dependencies).status).toBe("calculated");
  });

  it.each(["standard", "true-solar"])("keeps missing longitude explicit for %s", (solarTime) => {
    const result = calculatePolicySaju({ ...base, calculationPolicy: { ...base.calculationPolicy, solarTime } }, dependencies);
    expect(result.status).toBe(solarTime === "standard" ? "calculated" : "unavailable");
  });

  it("does not call the SDK outside either projected clock range", () => {
    const calculate = vi.fn();
    const result = calculatePolicySaju({ ...base, birthInput: { ...base.birthInput, birthDate: "2300-12-31", timezoneId: "America/New_York", birthTime: { status: "known", time: "23:59" } } }, { ...dependencies, pillars: { calculate } });
    expect(result).toMatchObject({ status: "unavailable", reasons: ["PILLAR_RANGE_UNSUPPORTED"] });
    expect(calculate).not.toHaveBeenCalled();
  });

  it("enumerates all civil input minutes as possibilities, with no confirmed hour or snapshot", () => {
    const before = structuredClone(unknown);
    const result = calculatePolicySaju(unknown, dependencies);
    expect(result).toMatchObject({ status: "partial", confirmedPillars: { year: { heavenlyStem: "갑", earthlyBranch: "진" }, month: { heavenlyStem: "병", earthlyBranch: "인" }, day: null, hour: null }, information: { unknownFields: expect.arrayContaining(["birthTime"]) } });
    expect(result).not.toHaveProperty("snapshot");
    expect(result).not.toHaveProperty("time");
    if (result.status === "partial") {
      expect(result.candidates).toHaveLength(13);
      expect(result.candidates[0]).toMatchObject({ startMinute: 0, endMinuteExclusive: 60, status: "possible", pillars: { hour: { heavenlyStem: "갑", earthlyBranch: "자" } } });
      expect(result.candidates.at(-1)).toMatchObject({ startMinute: 1380, endMinuteExclusive: 1440, pillars: { day: { heavenlyStem: "을", earthlyBranch: "사" }, hour: { heavenlyStem: "병", earthlyBranch: "자" } } });
      expect(result.candidates.reduce((sum, slot) => sum + slot.endMinuteExclusive - slot.startMinute, 0)).toBe(1440);
      expect(Object.isFrozen(result.candidates[0])).toBe(true);
      expect(PolicyCalculationResultSchema.safeParse({ ...result, confirmedPillars: { ...result.confirmedPillars, hour: result.candidates[0].status === "possible" ? result.candidates[0].pillars.hour : {} } }).success).toBe(false);
      expect(PolicyCalculationResultSchema.safeParse({ ...result, candidates: result.candidates.slice(1) }).success).toBe(false);
    }
    expect(unknown).toEqual(before);
  }, 15000);

  it("confirms the same midnight-policy day while leaving hour unknown", () => {
    expect(calculatePolicySaju({ ...unknown, calculationPolicy: { ...unknown.calculationPolicy, dayBoundary: "midnight" } }, dependencies)).toMatchObject({ status: "partial", confirmedPillars: { day: { heavenlyStem: "갑", earthlyBranch: "진" }, hour: null } });
  }, 15000);

  it("keeps year/month unknown on an absolute solar-term boundary day", () => {
    expect(calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, birthDate: "2024-02-04" } }, dependencies)).toMatchObject({ status: "partial", confirmedPillars: { year: null, month: null, hour: null } });
  }, 15000);

  it("retains rejected DST minutes and avoids confirming across unresolved coverage", () => {
    const result = calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, birthDate: "1988-10-09" } }, dependencies);
    expect(result).toMatchObject({ status: "partial", confirmedPillars: { year: null, month: null, day: null, hour: null } });
    if (result.status === "partial") expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "rejected", startMinute: 120, endMinuteExclusive: 180, reason: "AMBIGUOUS_LOCAL_TIME" })]));
  }, 15000);

  it("evaluates true-solar possibilities without replacing unknown with a representative clock", () => {
    const result = calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, longitudeDeg: 127.5 }, calculationPolicy: { ...unknown.calculationPolicy, solarTime: "true-solar" } }, dependencies);
    expect(result.status).toBe("partial");
    if (result.status === "partial") { expect(result.confirmedPillars.hour).toBeNull(); expect(result.candidates[0].startMinute).toBe(0); }
    expect(result).not.toHaveProperty("solarTime");
  }, 15000);

  it("converts an unknown lunar leap date once and preserves the original calendar context", () => {
    const convert = vi.fn(manseryeokCalendarConversionAdapter.convert);
    const result = calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, calendarType: "lunar", birthDate: "2023-02-01", isLeapMonth: true } }, { ...dependencies, calendar: { convert } });
    expect(result).toMatchObject({ status: "partial", context: { birthDate: "2023-02-01", calendarType: "lunar", isLeapMonth: true, birthTime: "unknown" } });
    expect(convert).toHaveBeenCalledTimes(1);
  }, 15000);

  it("preserves unavailable minute intervals at the SDK range end", () => {
    const result = calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, birthDate: "2300-12-31", timezoneId: "America/New_York" } }, dependencies);
    expect(result).toMatchObject({ status: "partial", confirmedPillars: { year: null, month: null, day: null, hour: null } });
    if (result.status === "partial") expect(result.candidates.at(-1)).toMatchObject({ status: "unavailable", startMinute: 600, endMinuteExclusive: 1440, reasons: ["PILLAR_RANGE_UNSUPPORTED"] });
  }, 15000);

  it("returns unavailable for a whole skipped civil date and an invalid lunar date", () => {
    expect(calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, birthDate: "2011-12-30", timezoneId: "Pacific/Apia" } }, dependencies)).toMatchObject({ status: "unavailable", reasons: ["NO_RESOLVED_CANDIDATES"] });
    expect(calculatePolicySaju({ ...unknown, birthInput: { ...unknown.birthInput, calendarType: "lunar", birthDate: "2024-01-30" } }, dependencies)).toMatchObject({ status: "unavailable", reasons: ["CALENDAR_INPUT_REJECTED"] });
  }, 15000);

  it("rejects malformed input and unknown solar longitude before calling any dependency", () => {
    const resolve = vi.fn(), convert = vi.fn(), calculate = vi.fn();
    const deps = { ...dependencies, timeZone: { resolve }, calendar: { convert }, pillars: { calculate } };
    expect(() => calculatePolicySaju({}, deps)).toThrow();
    expect(calculatePolicySaju({ ...unknown, calculationPolicy: { ...unknown.calculationPolicy, solarTime: "true-solar" } }, deps)).toMatchObject({ status: "unavailable", reasons: ["LONGITUDE_UNKNOWN"] });
    for (const fn of [resolve, convert, calculate]) expect(fn).not.toHaveBeenCalled();
  });

  it("preserves a minute-specific provider rejection alongside later valid candidates", () => {
    const result = calculatePolicySaju(unknown, { ...dependencies, pillars: { calculate(request) {
      if (request.policyClock.endsWith("T00:00:00.000")) throw new CalendarAdapterError("INPUT_REJECTED");
      return manseryeokPolicyCalendarAdapter.calculate(request);
    } } });
    expect(result.status).toBe("partial");
    if (result.status === "partial") expect(result.candidates[0]).toMatchObject({ startMinute: 0, endMinuteExclusive: 1, status: "unavailable", reasons: ["CALENDAR_INPUT_REJECTED"] });
  }, 15000);
});
