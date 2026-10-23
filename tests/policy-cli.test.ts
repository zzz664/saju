import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli/run";
import {
  manseryeokCalendarAdapter,
  manseryeokCalendarConversionAdapter,
  manseryeokEquationOfTimeAdapter,
  manseryeokPolicyCalendarAdapter,
} from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import input from "./fixtures/core-reference-input.json";

const dependencies = {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
  equationOfTime: manseryeokEquationOfTimeAdapter,
  pillars: manseryeokPolicyCalendarAdapter,
};
const value = {
  ...input,
  birthInput: {
    ...input.birthInput,
    birthDate: "2024-02-10",
    timezoneId: "Asia/Seoul",
    birthTime: { status: "known", time: "23:00" },
  },
  calculationPolicy: { ...input.calculationPolicy, dayBoundary: "zi-start" },
};

describe("calculate-policy CLI", () => {
  it("returns one policy-aware JSON and safe input/dependency errors", () => {
    const result = runCli(
      ["calculate-policy"],
      JSON.stringify(value),
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "calculated",
      snapshot: { pillars: { hour: { heavenlyStem: "병", earthlyBranch: "자" } } },
    });
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(
      runCli(["calculate-policy"], "{}", manseryeokCalendarAdapter, dependencies).exitCode,
    ).toBe(2);
    expect(
      runCli(["calculate-policy"], JSON.stringify(value), manseryeokCalendarAdapter).exitCode,
    ).toBe(1);
    const failed = runCli(["calculate-policy"], JSON.stringify(value), manseryeokCalendarAdapter, {
      ...dependencies,
      pillars: {
        calculate: () => {
          throw new Error("private 2024");
        },
      },
    });
    expect(failed).toMatchObject({ exitCode: 1, stdout: "" });
    expect(failed.stderr).not.toContain("2024");
  });

  it("runs actual known and unknown cases through npm while preserving exit/status semantics", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    for (const status of ["known", "unknown"]) {
      const data =
        status === "known"
          ? value
          : { ...value, birthInput: { ...value.birthInput, birthTime: { status: "unknown" } } };
      const result = spawnSync(
        process.execPath,
        [npmCli, "run", "--silent", "saju", "--", "calculate-policy"],
        {
          input: JSON.stringify(data),
          encoding: "utf8",
          env: { ...process.env, TZ: "Pacific/Honolulu" },
          timeout: 20000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status === "known" ? 0 : 2);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout).status).toBe(status === "known" ? "calculated" : "partial");
      if (status === "unknown")
        expect(JSON.parse(result.stdout)).toMatchObject({ confirmedPillars: { hour: null } });
    }
  }, 45000);
});
