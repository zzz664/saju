import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "@/cli/run";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { FeatureResultSchema } from "@/schemas/features";
import { featureDependencies as deps, featureRequest } from "./helpers/feature-input";

describe("F02 developer feature-json CLI", () => {
  it.each([{ status: "known", time: "05:30" }, { status: "unknown" }])(
    "exports traceable partial temperament for $status time",
    (birthTime) => {
      const request = featureRequest("F02");
      const output = runCli(
        ["feature-json"],
        JSON.stringify({ ...request, birthInput: { ...request.birthInput, birthTime } }),
        manseryeokCalendarAdapter,
        deps,
      );
      expect(output.exitCode).toBe(2);
      expect(output.stderr).toBe("");
      const result = FeatureResultSchema.parse(JSON.parse(output.stdout));
      expect(result).toMatchObject({ featureId: "F02", status: "partial" });
      expect(result.components[0].implementation).toBe("registered");
      expect(result.limitations).not.toContain("EXECUTOR_NOT_IMPLEMENTED");
      expect(result.judgments.some((j) => j.ruleId === "f02.observation.natal-context")).toBe(true);
      expect(output.stdout).not.toContain(request.birthInput.birthDate);
    },
  );
  it("rejects feature-inappropriate fields before adapters and emits no input or partial stdout", () => {
    const calculate = vi.fn(deps.pillars.calculate);
    for (const extra of [{ target: { year: 2026, timezoneId: "UTC" } }, { persona: "untrusted" }]) {
      const output = runCli(
        ["feature-json"],
        JSON.stringify({ ...featureRequest("F02"), ...extra }),
        manseryeokCalendarAdapter,
        { ...deps, pillars: { calculate } },
      );
      expect(output.exitCode).toBe(2);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr).error.code).toBe("INVALID_INPUT");
    }
    expect(calculate).not.toHaveBeenCalled();
  });
  it("executes actual UTF-8 stdin without a network provider", () => {
    const output = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "feature-json"],
      { cwd: process.cwd(), input: JSON.stringify(featureRequest("F02")), encoding: "utf8" },
    );
    expect(output.status, output.stderr).toBe(2);
    expect(output.stderr).toBe("");
    expect(FeatureResultSchema.parse(JSON.parse(output.stdout)).components[0]).toMatchObject({
      featureId: "F02",
      implementation: "registered",
    });
  });
});
