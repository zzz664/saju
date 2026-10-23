import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "@/cli/run";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { FeatureResultSchema } from "@/schemas/features";
import { featureDependencies as deps, featureRequest } from "./helpers/feature-input";

describe("F04 feature-json CLI", () => {
  it.each([{ status: "known", time: "05:30" }, { status: "unknown" }])(
    "exports bounded career JSON for $status time",
    (birthTime) => {
      const request = featureRequest("F04");
      const output = runCli(
        ["feature-json"],
        JSON.stringify({ ...request, birthInput: { ...request.birthInput, birthTime } }),
        manseryeokCalendarAdapter,
        deps,
      );
      expect(output.exitCode).toBe(2);
      expect(output.stderr).toBe("");
      const result = FeatureResultSchema.parse(JSON.parse(output.stdout));
      expect(result).toMatchObject({ featureId: "F04", status: "partial" });
      expect(result.components[0].implementation).toBe("registered");
      expect(result.limitations).not.toContain("EXECUTOR_NOT_IMPLEMENTED");
      expect(result.judgments.some((j) => j.ruleId === "f04.observation.natal-context")).toBe(true);
      expect(output.stdout).not.toContain(request.birthInput.birthDate);
    },
  );
  it("rejects client scores, occupations and target fields before any core calculation", () => {
    const calculate = vi.fn(deps.pillars.calculate);
    for (const extra of [
      { aptitudeScore: 100 },
      { occupation: "doctor" },
      { target: { year: 2026 } },
    ]) {
      const output = runCli(
        ["feature-json"],
        JSON.stringify({ ...featureRequest("F04"), ...extra }),
        manseryeokCalendarAdapter,
        { ...deps, pillars: { calculate } },
      );
      expect(output.exitCode).toBe(2);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr).error.code).toBe("INVALID_INPUT");
    }
    expect(calculate).not.toHaveBeenCalled();
  });
  it("runs the actual UTF-8 stdin command with no live provider", () => {
    const output = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "feature-json"],
      { cwd: process.cwd(), input: JSON.stringify(featureRequest("F04")), encoding: "utf8" },
    );
    expect(output.status, output.stderr).toBe(2);
    expect(output.stderr).toBe("");
    expect(FeatureResultSchema.parse(JSON.parse(output.stdout)).components[0]).toMatchObject({
      featureId: "F04",
      implementation: "registered",
    });
  });
});
