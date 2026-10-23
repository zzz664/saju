import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "@/cli/run";
import {
  manseryeokCalendarAdapter,
  manseryeokCalendarConversionAdapter,
} from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import input from "./fixtures/core-reference-input.json";

const dependencies = {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
};
const seoul = { ...input, birthInput: { ...input.birthInput, timezoneId: "Asia/Seoul" } };

describe("normalize-time CLI", () => {
  it("prints a single normalized civil-time JSON without calculating pillars", () => {
    const calculate = vi.fn();
    const result = runCli(["normalize-time"], JSON.stringify(seoul), { calculate }, dependencies);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "normalized",
      time: { resolved: { instant: "1992-10-23T20:30:00Z" } },
    });
    expect(calculate).not.toHaveBeenCalled();
  });

  it("returns reject/unavailable with exit 2 and no invented UTC or clock", () => {
    const fold = {
      ...seoul,
      birthInput: {
        ...seoul.birthInput,
        birthDate: "1988-10-09",
        birthTime: { status: "known", time: "02:30" },
      },
    };
    const rejected = runCli(
      ["normalize-time"],
      JSON.stringify(fold),
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(rejected.exitCode).toBe(2);
    expect(JSON.parse(rejected.stdout)).toMatchObject({
      status: "rejected",
      time: { reason: "AMBIGUOUS_LOCAL_TIME" },
    });
    const unknown = {
      ...seoul,
      birthInput: { ...seoul.birthInput, birthTime: { status: "unknown" } },
    };
    expect(
      runCli(["normalize-time"], JSON.stringify(unknown), manseryeokCalendarAdapter, dependencies)
        .exitCode,
    ).toBe(2);
  });

  it("returns safe static failures and input errors", () => {
    const fail = {
      ...dependencies,
      timeZone: {
        resolve: () => {
          throw new Error("private 1992-10-24");
        },
      },
    };
    const result = runCli(
      ["normalize-time"],
      JSON.stringify(seoul),
      manseryeokCalendarAdapter,
      fail,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("TIME_NORMALIZATION_FAILED");
    expect(result.stderr).not.toContain("1992");
    expect(runCli(["normalize-time"], "{}", manseryeokCalendarAdapter, dependencies).exitCode).toBe(
      2,
    );
    expect(
      runCli(["normalize-time"], JSON.stringify(seoul), manseryeokCalendarAdapter).exitCode,
    ).toBe(1);
  });

  it("does not silently broaden the existing calculate clock basis", () => {
    expect(
      runCli(["calculate"], JSON.stringify(seoul), manseryeokCalendarAdapter, dependencies)
        .exitCode,
    ).toBe(2);
  });

  it("runs through the actual npm CLI independently of the host timezone", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run this smoke test through npm test.");
    for (const TZ of ["UTC", "Pacific/Honolulu"]) {
      const result = spawnSync(
        process.execPath,
        [npmCli, "run", "--silent", "saju", "--", "normalize-time"],
        {
          input: JSON.stringify(seoul),
          encoding: "utf8",
          env: { ...process.env, TZ },
          timeout: 15000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "normalized",
        time: { resolved: { instant: "1992-10-23T20:30:00Z" } },
      });
    }
  }, 35000);
});
