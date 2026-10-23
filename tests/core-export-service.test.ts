import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { calculateCoreExport } from "@/application/core-export";
import { calculateArbitratedJudgments } from "@/application/judgment";
import { parseCoreExport, ManualPromptDataSchema } from "@/domain/core-export";
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
    timezoneId: "Asia/Seoul",
    longitudeDeg: 127.123456,
    latitudeDeg: 37.654321,
  },
};
function dataFromCopy(text: string) {
  const match = text.match(/<analysis_data>\r?\n([\s\S]*?)\r?\n<\/analysis_data>/);
  if (!match) throw new Error("Incomplete copy block.");
  return ManualPromptDataSchema.parse(JSON.parse(match[1]));
}

describe("core export application and CLI", () => {
  it("calculates once and explicitly projects the existing facts/evaluation/resolution", () => {
    const load = vi.fn(manseryeokSymbolCatalogAdapter.load);
    const pillars = vi.fn(manseryeokPolicyCalendarAdapter.calculate);
    const before = structuredClone(base);
    const result = calculateCoreExport(base, {
      ...dependencies,
      symbols: { load },
      pillars: { calculate: pillars },
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(pillars).toHaveBeenCalledTimes(1);
    const original = calculateArbitratedJudgments(base, dependencies);
    expect(result.facts).toEqual(original.judgment.analysis.facts);
    expect(result.evaluation).toEqual(original.judgment.evaluation);
    expect(result.resolution).toEqual(original.resolution);
    expect(base).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(/2024-02-10|127\.123456|37\.654321|05:30/);
  });

  it("keeps safe input/supplier error exits without leaking raw input or exceptions", () => {
    for (const command of ["export-json", "manual-prompt"]) {
      expect(runCli([command], "{}", manseryeokCalendarAdapter, dependencies).exitCode).toBe(2);
      expect(runCli([command], JSON.stringify(base), manseryeokCalendarAdapter).exitCode).toBe(1);
      const result = runCli([command], JSON.stringify(base), manseryeokCalendarAdapter, {
        ...dependencies,
        symbols: {
          load: () => {
            throw new Error("private 2024-02-10 secret");
          },
        },
      });
      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).not.toMatch(/2024|private|secret/);
      expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
    }
  });

  it("returns complete/partial/unavailable artifacts with consistent exit codes", () => {
    for (const value of [
      base,
      { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } },
      {
        ...base,
        birthInput: { ...base.birthInput, longitudeDeg: null },
        calculationPolicy: { ...base.calculationPolicy, solarTime: "true-solar" },
      },
    ]) {
      const json = runCli(
        ["export-json"],
        JSON.stringify(value),
        manseryeokCalendarAdapter,
        dependencies,
      );
      const core = parseCoreExport(json.stdout);
      const copy = runCli(
        ["manual-prompt"],
        JSON.stringify(value),
        manseryeokCalendarAdapter,
        dependencies,
      );
      expect(dataFromCopy(copy.stdout).status).toBe(core.status);
      expect(copy.exitCode).toBe(json.exitCode);
      expect(json.exitCode).toBe(core.status === "complete" ? 0 : 2);
      expect(json.stderr).toBe("");
      expect(copy.stderr).toBe("");
    }
  }, 15000);

  it("exports JSON Schema without parsing birth input or requesting a provider", () => {
    const result = runCli(["export-schema"], "not birth input", manseryeokCalendarAdapter);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(JSON.parse(result.stdout).$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("copies actual npm CLI output losslessly with known/unknown input and schema-only mode", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    for (const known of [true, false]) {
      const value = known
        ? base
        : { ...base, birthInput: { ...base.birthInput, birthTime: { status: "unknown" } } };
      for (const command of ["export-json", "manual-prompt"]) {
        const result = spawnSync(
          process.execPath,
          [npmCli, "run", "--silent", "saju", "--", command],
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
        const copied = "\uFEFF" + result.stdout.replace(/\n/g, "\r\n");
        const data = command === "export-json" ? parseCoreExport(copied) : dataFromCopy(copied);
        expect(data.status).toBe(known ? "complete" : "partial");
        expect(result.stdout).not.toMatch(/2024-02-10|127\.123456|37\.654321/);
      }
    }
    const schema = spawnSync(
      process.execPath,
      [npmCli, "run", "--silent", "saju", "--", "export-schema"],
      {
        input: "",
        encoding: "utf8",
        timeout: 20000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    expect(schema.error).toBeUndefined();
    expect(schema.status).toBe(0);
    expect(schema.stderr).toBe("");
    expect(JSON.parse(schema.stdout).additionalProperties).toBe(false);
  }, 60000);
});
