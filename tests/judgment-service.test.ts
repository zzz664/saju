import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { calculateJudgments } from "@/application/judgment";
import { runCli } from "@/cli/run";
import { manseryeokCalendarAdapter, manseryeokCalendarConversionAdapter, manseryeokEquationOfTimeAdapter, manseryeokPolicyCalendarAdapter, manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import input from "./fixtures/core-reference-input.json";

const dependencies = { timeZone: temporalTimeZoneAdapter, calendar: manseryeokCalendarConversionAdapter, equationOfTime: manseryeokEquationOfTimeAdapter, pillars: manseryeokPolicyCalendarAdapter, symbols: manseryeokSymbolCatalogAdapter };
const base = { ...input, birthInput: { ...input.birthInput, birthDate: "2024-02-10", timezoneId: "Asia/Seoul" } };

describe("classical judgment application and CLI", () => {
  it("reuses natal facts once and preserves all calculated data beside evidence", () => {
    const load = vi.fn(manseryeokSymbolCatalogAdapter.load);
    const before = structuredClone(base);
    const result = calculateJudgments(base, { ...dependencies, symbols: { load } });
    expect(result).toMatchObject({ status: "complete", analysis: { status: "complete", facts: { dayMaster: "갑" } }, evaluation: { status: "complete" } });
    expect(result.evaluation?.results).toHaveLength(20);
    expect(result.evaluation?.findings).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "base.day-wood" })]));
    expect(load).toHaveBeenCalledTimes(1);
    expect(base).toEqual(before);
  });

  it("propagates unknown-time limitations and never uses candidate day/hour as confirmed evidence", () => {
    const value = { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } }, calculationPolicy: { ...base.calculationPolicy, dayBoundary: "zi-start" } };
    const result = calculateJudgments(value, dependencies);
    expect(result.status).toBe("partial");
    expect(result.analysis.facts?.dayMaster).toBeNull();
    expect(result.evaluation?.results.find((entry) => entry.ruleId === "base.day-wood")?.status).toBe("unavailable");
    expect(result.evaluation?.findings.every((finding) => finding.evidence.every((entry) => !entry.inputPath.startsWith("positions.hour.")))).toBe(true);
  }, 15000);

  it("keeps rejected and unsupported calculations unavailable without evaluating fabricated facts", () => {
    const fold = { ...base, birthInput: { ...base.birthInput, birthDate: "1988-10-09", birthTime: { status: "known", time: "02:30" } } };
    expect(calculateJudgments(fold, dependencies)).toMatchObject({ status: "unavailable", evaluation: null });
    expect(calculateJudgments({ ...base, calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" } }, dependencies)).toMatchObject({ status: "unavailable", evaluation: null });
  });

  it("preserves safe input and supplier error exits through judge-facts", () => {
    expect(runCli(["judge-facts"], "{}", manseryeokCalendarAdapter, dependencies).exitCode).toBe(2);
    expect(runCli(["judge-facts"], JSON.stringify(base), manseryeokCalendarAdapter).exitCode).toBe(1);
    const result = runCli(["judge-facts"], JSON.stringify(base), manseryeokCalendarAdapter, { ...dependencies, symbols: { load: () => { throw new Error("private 2024-02-10"); } } });
    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
    expect(result.stderr).not.toContain("2024");
  });

  it("runs actual known and unknown judge-facts CLI as single JSON documents", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    for (const known of [true, false]) {
      const value = known ? base : { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } };
      const result = spawnSync(process.execPath, [npmCli, "run", "--silent", "saju", "--", "judge-facts"], { input: JSON.stringify(value), encoding: "utf8", env: { ...process.env, TZ: "Pacific/Honolulu" }, timeout: 20000, windowsHide: true });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(known ? 0 : 2);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(result.stdout).evaluation.results).toHaveLength(20);
    }
  }, 45000);
});
