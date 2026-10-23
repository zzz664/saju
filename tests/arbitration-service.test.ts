import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  calculateArbitratedJudgments,
  ArbitratedJudgmentCalculationResultSchema,
  calculateJudgments,
} from "@/application/judgment";
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
  birthInput: { ...input.birthInput, birthDate: "2024-02-10", timezoneId: "Asia/Seoul" },
};

describe("arbitrated judgment application and CLI", () => {
  it("calculates once, preserves original judgments, and binds resolution to the source evaluation", () => {
    const load = vi.fn(manseryeokSymbolCatalogAdapter.load);
    const result = calculateArbitratedJudgments(base, { ...dependencies, symbols: { load } });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("complete");
    expect(result.judgment).toEqual(calculateJudgments(base, dependencies));
    expect(result.resolution?.arbitration.conflicts).toEqual([]);
    expect(
      ArbitratedJudgmentCalculationResultSchema.parse(JSON.parse(JSON.stringify(result))),
    ).toEqual(result);
    expect(
      ArbitratedJudgmentCalculationResultSchema.safeParse({ ...result, resolution: null }).success,
    ).toBe(false);
    const partial = calculateArbitratedJudgments(
      { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } },
      dependencies,
    );
    expect(
      ArbitratedJudgmentCalculationResultSchema.safeParse({
        ...result,
        resolution: partial.resolution,
      }).success,
    ).toBe(false);
    expect(
      ArbitratedJudgmentCalculationResultSchema.safeParse({ ...partial, status: "complete" })
        .success,
    ).toBe(false);
    expect(
      ArbitratedJudgmentCalculationResultSchema.safeParse({
        ...partial,
        resolution: { ...partial.resolution, uncertainties: [] },
      }).success,
    ).toBe(false);
  }, 15000);

  it.each(["midnight", "zi-start"])(
    "does not promote unknown-time %s candidates or omit limitations",
    (dayBoundary) => {
      const value = {
        ...base,
        birthInput: { ...base.birthInput, birthTime: { status: "unknown" } },
        calculationPolicy: { ...base.calculationPolicy, dayBoundary },
      };
      const result = calculateArbitratedJudgments(value, dependencies);
      expect(result.status).toBe("partial");
      expect(result.resolution?.arbitration.status).toBe("partial");
      expect(result.resolution?.arbitration.limitations).toContain("UPSTREAM_PARTIAL");
      expect(result.resolution?.uncertainties.length).toBeGreaterThan(0);
      expect(
        result.resolution?.arbitration.findings.every((finding) =>
          finding.evidence.every((entry) => !entry.inputPath.startsWith("positions.hour.")),
        ),
      ).toBe(true);
      if (dayBoundary === "zi-start") expect(result.judgment.analysis.facts?.dayMaster).toBeNull();
    },
    15000,
  );

  it("returns null resolution for ambiguous or unsupported calendar input", () => {
    for (const value of [
      {
        ...base,
        birthInput: {
          ...base.birthInput,
          birthDate: "1988-10-09",
          birthTime: { status: "known", time: "02:30" },
        },
      },
      { ...base, calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" } },
    ])
      expect(calculateArbitratedJudgments(value, dependencies)).toMatchObject({
        status: "unavailable",
        judgment: { evaluation: null },
        resolution: null,
      });
  });

  it("sanitizes errors and keeps CLI exit semantics", () => {
    expect(
      runCli(["arbitrate-facts"], "{}", manseryeokCalendarAdapter, dependencies).exitCode,
    ).toBe(2);
    expect(
      runCli(["arbitrate-facts"], JSON.stringify(base), manseryeokCalendarAdapter).exitCode,
    ).toBe(1);
    const result = runCli(["arbitrate-facts"], JSON.stringify(base), manseryeokCalendarAdapter, {
      ...dependencies,
      symbols: {
        load: () => {
          throw new Error("private birth 2024-02-10");
        },
      },
    });
    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).not.toContain("2024");
    expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
  });

  it("runs known and unknown input through the actual CLI as one JSON document", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    for (const known of [true, false]) {
      const value = known
        ? base
        : { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } };
      const result = spawnSync(
        process.execPath,
        [npmCli, "run", "--silent", "saju", "--", "arbitrate-facts"],
        {
          input: JSON.stringify(value),
          encoding: "utf8",
          env: { ...process.env, TZ: "Pacific/Honolulu" },
          timeout: 20000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(known ? 0 : 2);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      const output = JSON.parse(result.stdout);
      expect(output.judgment.evaluation.results).toHaveLength(20);
      expect(output.resolution.arbitration.provenance.policyVersion).toBe("1.0.0");
      expect(output.resolution.arbitration.status).toBe(known ? "complete" : "partial");
    }
  }, 45000);
});
