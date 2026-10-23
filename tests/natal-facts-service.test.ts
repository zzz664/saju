import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { calculateNatalFacts } from "@/application/natal-facts";
import { runCli } from "@/cli/run";
import {
  manseryeokCalendarAdapter,
  manseryeokCalendarConversionAdapter,
  manseryeokEquationOfTimeAdapter,
  manseryeokPolicyCalendarAdapter,
  manseryeokSymbolCatalogAdapter,
} from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import input from "./fixtures/core-reference-input.json";

const dependencies = {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
  equationOfTime: manseryeokEquationOfTimeAdapter,
  pillars: manseryeokPolicyCalendarAdapter,
  symbols: manseryeokSymbolCatalogAdapter,
};
const base = {
  ...input,
  birthInput: {
    ...input.birthInput,
    birthDate: "2024-02-10",
    birthTime: { status: "known", time: "12:00" },
    timezoneId: "Asia/Seoul",
  },
};
const unknown = { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } };

describe("confirmed natal facts application and CLI", () => {
  it("connects real policy pillars to facts exactly once without mutating the birth input", () => {
    const load = vi.fn(manseryeokSymbolCatalogAdapter.load);
    const before = structuredClone(base);
    expect(calculateNatalFacts(base, { ...dependencies, symbols: { load } })).toMatchObject({
      status: "complete",
      calculation: { status: "calculated" },
      facts: { status: "complete", dayMaster: "갑", distribution: { knownSurfaceSymbols: 8 } },
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(base).toEqual(before);
  });

  it("uses only confirmed pillars for an unknown birth hour", () => {
    expect(calculateNatalFacts(unknown, dependencies)).toMatchObject({
      status: "partial",
      facts: {
        status: "partial",
        dayMaster: "갑",
        positions: { hour: null },
        distribution: { knownSurfaceSymbols: 6, missingSurfaceSymbols: 2 },
      },
    });
  }, 15000);

  it("does not use a hypothetical day/hour to calculate relative ten gods", () => {
    const result = calculateNatalFacts(
      { ...unknown, calculationPolicy: { ...unknown.calculationPolicy, dayBoundary: "zi-start" } },
      dependencies,
    );
    expect(result).toMatchObject({
      status: "partial",
      facts: {
        dayMaster: null,
        positions: { year: { stem: { tenGod: null } }, day: null, hour: null },
        distribution: { knownSurfaceSymbols: 4 },
      },
    });
  }, 15000);

  it("keeps facts unavailable when the boundary day has no common confirmed pillars", () => {
    expect(
      calculateNatalFacts(
        {
          ...unknown,
          birthInput: { ...unknown.birthInput, birthDate: "2024-02-04" },
          calculationPolicy: { ...unknown.calculationPolicy, dayBoundary: "zi-start" },
        },
        dependencies,
      ),
    ).toMatchObject({
      status: "partial",
      facts: { status: "unavailable", dayMaster: null, distribution: { knownSurfaceSymbols: 0 } },
    });
  }, 15000);

  it("does not load a catalog for a rejected fold or missing required longitude", () => {
    const load = vi.fn();
    const fold = {
      ...base,
      birthInput: {
        ...base.birthInput,
        birthDate: "1988-10-09",
        birthTime: { status: "known", time: "02:30" },
      },
    };
    expect(calculateNatalFacts(fold, { ...dependencies, symbols: { load } })).toMatchObject({
      status: "unavailable",
      calculation: { status: "rejected" },
      facts: null,
    });
    expect(
      calculateNatalFacts(
        { ...base, calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" } },
        { ...dependencies, symbols: { load } },
      ),
    ).toMatchObject({ status: "unavailable", facts: null });
    expect(load).not.toHaveBeenCalled();
  });

  it("sanitizes catalog failures and CLI errors", () => {
    const failed = {
      ...dependencies,
      symbols: {
        load: () => {
          throw new Error("private birth 2024-02-10");
        },
      },
    };
    try {
      calculateNatalFacts(base, failed);
      expect.fail("Expected failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "CATALOG_LOAD_FAILED" });
      expect(String(error)).not.toContain("2024");
      expect(error).not.toHaveProperty("cause");
    }
    const result = runCli(
      ["derive-facts"],
      JSON.stringify(base),
      manseryeokCalendarAdapter,
      failed,
    );
    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
    expect(result.stderr).not.toContain("2024");
    expect(runCli(["derive-facts"], "{}", manseryeokCalendarAdapter, dependencies).exitCode).toBe(
      2,
    );
    expect(runCli(["derive-facts"], JSON.stringify(base), manseryeokCalendarAdapter).exitCode).toBe(
      1,
    );
  });

  it("runs actual derive-facts CLI with complete and partial JSON", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    for (const value of [base, unknown]) {
      const complete = value.birthInput.birthTime.status === "known";
      const result = spawnSync(
        process.execPath,
        [npmCli, "run", "--silent", "saju", "--", "derive-facts"],
        {
          input: JSON.stringify(value),
          encoding: "utf8",
          env: { ...process.env, TZ: "Pacific/Honolulu" },
          timeout: 20000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(complete ? 0 : 2);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(result.stdout).facts.distribution.knownSurfaceSymbols).toBe(
        complete ? 8 : 6,
      );
    }
  }, 45000);
});
