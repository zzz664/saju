import { expect, it, vi } from "vitest";
import { calculatePolicySaju } from "@/application/policy-saju";
import { createCoreDependencies } from "@/server/core-dependencies";
import { candidateTimeZoneScope } from "@/infrastructure/timezone/candidate-scope";
import { candidatePolicyCalendarScope } from "@/infrastructure/manseryeok/candidate-scope";
import { CalendarAdapterError } from "@/domain/calendar";
import input from "./fixtures/core-reference-input.json";

const dependencies = createCoreDependencies();
const exhaustive = {
  ...dependencies,
  timeZone: { resolve: dependencies.timeZone.resolve },
  pillars: { calculate: dependencies.pillars.calculate },
};
const cases = [
  ["2024-02-10", "Asia/Seoul", "reject", "standard", "midnight"],
  ["2024-02-04", "Asia/Seoul", "reject", "standard", "zi-start"],
  ["1988-10-09", "Asia/Seoul", "reject", "standard", "midnight"],
  ["1988-10-09", "Asia/Seoul", "earlier", "true-solar", "zi-start"],
  ["1988-10-09", "Asia/Seoul", "later", "mean-solar", "midnight"],
  ["2024-03-10", "America/New_York", "reject", "standard", "midnight"],
  ["2024-03-10", "America/New_York", "earlier", "true-solar", "midnight"],
  ["2024-03-10", "America/New_York", "later", "mean-solar", "zi-start"],
  ["2024-04-07", "Australia/Lord_Howe", "reject", "true-solar", "zi-start"],
  ["2011-12-30", "Pacific/Apia", "reject", "standard", "midnight"],
  ["2011-12-30", "Pacific/Apia", "later", "true-solar", "zi-start"],
  ["1900-01-01", "Asia/Seoul", "reject", "true-solar", "midnight"],
  ["2300-12-31", "America/New_York", "reject", "standard", "midnight"],
  ["1800-01-01", "Pacific/Auckland", "reject", "mean-solar", "zi-start"],
] as const;
it.each(cases)(
  "matches all 1440 minutes for %s %s %s %s %s",
  (birthDate, timezoneId, dstDisambiguation, solarTime, dayBoundary) => {
    const value = {
      ...input,
      birthInput: {
        ...input.birthInput,
        birthDate,
        timezoneId,
        longitudeDeg: 127.5,
        birthTime: { status: "unknown" },
      },
      calculationPolicy: { dstDisambiguation, solarTime, dayBoundary },
    };
    expect(calculatePolicySaju(value, dependencies)).toEqual(
      calculatePolicySaju(value, exhaustive),
    );
  },
  15000,
);
it("matches an unknown lunar leap date without changing its original context", () => {
  const value = {
    ...input,
    birthInput: {
      ...input.birthInput,
      birthDate: "2023-02-01",
      calendarType: "lunar",
      isLeapMonth: true,
      birthTime: { status: "unknown" },
    },
  };
  expect(calculatePolicySaju(value, dependencies)).toEqual(calculatePolicySaju(value, exhaustive));
}, 15000);
it("performs one actual zone resolution and 13 SDK projections on a normal civil day", () => {
  const resolve = vi.fn(dependencies.timeZone.resolve),
    calculate = vi.fn(dependencies.pillars.calculate);
  const value = {
    ...input,
    birthInput: {
      ...input.birthInput,
      birthDate: "2024-02-10",
      timezoneId: "Asia/Seoul",
      birthTime: { status: "unknown" },
    },
  };
  const result = calculatePolicySaju(value, {
    ...dependencies,
    timeZone: { resolve, scopeForCandidates: () => candidateTimeZoneScope({ resolve }) },
    pillars: { calculate, scopeForCandidates: () => candidatePolicyCalendarScope({ calculate }) },
  });
  expect(result.status).toBe("partial");
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(calculate).toHaveBeenCalledTimes(13);
});
it("does not bypass wrapped providers or miss a rejection within a normally stable interval", () => {
  const calculate = vi.fn((request: Parameters<typeof dependencies.pillars.calculate>[0]) => {
    if (request.policyClock.includes("T00:37:")) throw new CalendarAdapterError("INPUT_REJECTED");
    return dependencies.pillars.calculate(request);
  });
  const value = {
    ...input,
    birthInput: { ...input.birthInput, birthDate: "2024-02-10", birthTime: { status: "unknown" } },
  };
  const result = calculatePolicySaju(value, {
    ...dependencies,
    pillars: { ...dependencies.pillars, calculate },
  });
  expect(calculate).toHaveBeenCalledTimes(1440);
  expect(result).toMatchObject({
    status: "partial",
    candidates: expect.arrayContaining([
      expect.objectContaining({ startMinute: 37, endMinuteExclusive: 38, status: "unavailable" }),
    ]),
  });
}, 15000);
