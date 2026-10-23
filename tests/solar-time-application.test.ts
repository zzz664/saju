import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { prepareBirthTime } from "@/application/solar-time";
import { runCli } from "@/cli/run";
import {
  manseryeokCalendarAdapter,
  manseryeokCalendarConversionAdapter,
  manseryeokEquationOfTimeAdapter,
} from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import input from "./fixtures/core-reference-input.json";

const dependencies = {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
  equationOfTime: manseryeokEquationOfTimeAdapter,
};
const base = {
  ...input,
  birthInput: {
    ...input.birthInput,
    birthDate: "2024-01-01",
    birthTime: { status: "known", time: "12:00" },
    timezoneId: "Asia/Seoul",
    longitudeDeg: 127.5,
  },
  calculationPolicy: { ...input.calculationPolicy, solarTime: "mean-solar" },
};

describe("solar time application and CLI", () => {
  it("applies explicit longitude after IANA normalization without mutating input", () => {
    const before = structuredClone(base);
    expect(prepareBirthTime(base, dependencies)).toMatchObject({
      status: "normalized",
      time: { resolved: { instant: "2024-01-01T03:00:00Z" } },
      solarTime: { policyClock: "2024-01-01T11:30:00.000", correctionSeconds: -1800 },
    });
    expect(base).toEqual(before);
  });

  it("converts a real lunar leap date before resolving the EoT instant", () => {
    const calculate = vi.fn(manseryeokEquationOfTimeAdapter.calculate);
    const result = prepareBirthTime(
      {
        ...base,
        birthInput: {
          ...base.birthInput,
          calendarType: "lunar",
          birthDate: "2023-02-01",
          isLeapMonth: true,
        },
        calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" },
      },
      { ...dependencies, equationOfTime: { calculate } },
    );
    expect(result).toMatchObject({
      status: "normalized",
      time: { request: { localDateTime: "2023-03-22T12:00" } },
      solarTime: { instant: "2023-03-22T03:00:00Z" },
    });
    expect(calculate).toHaveBeenCalledExactlyOnceWith({ instant: "2023-03-22T03:00:00Z" });
  });

  it.each(["mean-solar", "true-solar"])(
    "keeps missing longitude unavailable for %s without any dependency calls",
    (solarTime) => {
      const resolve = vi.fn(),
        convert = vi.fn(),
        calculate = vi.fn();
      const result = prepareBirthTime(
        {
          ...base,
          birthInput: { ...base.birthInput, longitudeDeg: null },
          calculationPolicy: { ...base.calculationPolicy, solarTime },
        },
        { timeZone: { resolve }, calendar: { convert }, equationOfTime: { calculate } },
      );
      expect(result).toMatchObject({
        status: "unavailable",
        reasons: ["LONGITUDE_UNKNOWN"],
        information: {
          limitations: expect.arrayContaining([
            expect.objectContaining({ code: "SOLAR_TIME_INPUT_MISSING" }),
          ]),
        },
      });
      expect(result).not.toHaveProperty("solarTime");
      for (const fn of [resolve, convert, calculate]) expect(fn).not.toHaveBeenCalled();
    },
  );

  it("does not fabricate an unknown birth clock or call dependencies", () => {
    const resolve = vi.fn(),
      convert = vi.fn(),
      calculate = vi.fn();
    expect(
      prepareBirthTime(
        { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } },
        { timeZone: { resolve }, calendar: { convert }, equationOfTime: { calculate } },
      ),
    ).toMatchObject({ status: "unavailable", reasons: ["BIRTH_TIME_UNKNOWN"] });
    for (const fn of [resolve, convert, calculate]) expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ["1800-01-01", "Asia/Seoul", "1799-12-31"],
    ["2300-12-31", "America/New_York", "2301-01-01"],
  ])(
    "handles the civil range endpoint %s including the adjacent UTC year",
    (birthDate, timezoneId, utcDate) => {
      const result = prepareBirthTime(
        {
          ...base,
          birthInput: {
            ...base.birthInput,
            birthDate,
            timezoneId,
            birthTime: { status: "known", time: birthDate.startsWith("1800") ? "00:00" : "23:59" },
          },
          calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" },
        },
        dependencies,
      );
      expect(result.status).toBe("normalized");
      if (result.status === "normalized")
        expect(result.solarTime.equationOfTime?.instant.startsWith(utcDate)).toBe(true);
    },
  );

  it("does not calculate EoT for rejected fold/gap or invalid lunar input", () => {
    const calculate = vi.fn();
    for (const [birthDate, time] of [
      ["1988-10-09", "02:30"],
      ["1988-05-08", "02:30"],
    ]) {
      const result = prepareBirthTime(
        {
          ...base,
          birthInput: { ...base.birthInput, birthDate, birthTime: { status: "known", time } },
          calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" },
        },
        { ...dependencies, equationOfTime: { calculate } },
      );
      expect(result.status).toBe("rejected");
      expect(result).not.toHaveProperty("solarTime");
    }
    expect(
      prepareBirthTime(
        {
          ...base,
          birthInput: { ...base.birthInput, calendarType: "lunar", birthDate: "2024-01-30" },
        },
        { ...dependencies, equationOfTime: { calculate } },
      ).status,
    ).toBe("unavailable");
    expect(calculate).not.toHaveBeenCalled();
  });

  it.each(["earlier", "later"])(
    "uses resolved gap clock and offset once for %s",
    (dstDisambiguation) => {
      const result = prepareBirthTime(
        {
          ...base,
          birthInput: {
            ...base.birthInput,
            birthDate: "1988-05-08",
            birthTime: { status: "known", time: "02:30" },
          },
          calculationPolicy: { ...base.calculationPolicy, dstDisambiguation },
        },
        dependencies,
      );
      expect(result).toMatchObject({
        status: "normalized",
        solarTime: {
          policyClock:
            dstDisambiguation === "earlier" ? "1988-05-08T01:00:00.000" : "1988-05-08T02:00:00.000",
        },
      });
    },
  );

  it("accepts zero longitude and standard without longitude or EoT", () => {
    expect(
      prepareBirthTime(
        { ...base, birthInput: { ...base.birthInput, longitudeDeg: 0 } },
        dependencies,
      ),
    ).toMatchObject({ solarTime: { policyClock: "2024-01-01T03:00:00.000" } });
    expect(
      prepareBirthTime(input, { timeZone: dependencies.timeZone, calendar: dependencies.calendar }),
    ).toMatchObject({
      status: "normalized",
      solarTime: { mode: "standard", correctionSeconds: 0, longitudeDeg: null },
    });
  });

  it("outputs solar metadata as one JSON and never calculates pillars", () => {
    const calculate = vi.fn();
    const result = runCli(["normalize-time"], JSON.stringify(base), { calculate }, dependencies);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      solarTime: { policyClock: "2024-01-01T11:30:00.000" },
    });
    expect(calculate).not.toHaveBeenCalled();
  });

  it("returns exit 2 for missing longitude, exit 1 for EoT failure, and keeps calculate gated", () => {
    const missing = runCli(
      ["normalize-time"],
      JSON.stringify({ ...base, birthInput: { ...base.birthInput, longitudeDeg: null } }),
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(missing.exitCode).toBe(2);
    expect(JSON.parse(missing.stdout)).toMatchObject({
      status: "unavailable",
      reasons: ["LONGITUDE_UNKNOWN"],
    });
    const failed = runCli(
      ["normalize-time"],
      JSON.stringify({
        ...base,
        calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" },
      }),
      manseryeokCalendarAdapter,
      {
        ...dependencies,
        equationOfTime: {
          calculate: () => {
            throw new Error("private 2024-01-01");
          },
        },
      },
    );
    expect(failed).toMatchObject({ exitCode: 1, stdout: "" });
    expect(JSON.parse(failed.stderr)).toEqual({
      error: { code: "TIME_NORMALIZATION_FAILED", message: "Local time normalization failed." },
    });
    expect(
      runCli(["calculate"], JSON.stringify(base), manseryeokCalendarAdapter, dependencies).exitCode,
    ).toBe(2);
  });

  it("runs actual true-solar npm CLI identically across host timezones", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    const value = {
      ...base,
      calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" },
    };
    const expected = prepareBirthTime(value, dependencies);
    for (const TZ of ["UTC", "Pacific/Honolulu"]) {
      const result = spawnSync(
        process.execPath,
        [npmCli, "run", "--silent", "saju", "--", "normalize-time"],
        {
          input: JSON.stringify(value),
          encoding: "utf8",
          env: { ...process.env, TZ },
          timeout: 15000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual(expected);
    }
  }, 35000);
});
