import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "@/cli/run";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { FeatureResultSchema } from "@/schemas/features";
import { executeFeature, buildFeatureNarrationInput } from "@/application/saju/features";
import {
  featureDependencies as deps,
  featureRequest,
  mockFeaturePorts,
} from "./helpers/feature-input";
import { fingerprintInput } from "./helpers/fingerprint-input";

describe("M09 developer CLI and port boundaries", () => {
  it("prints the shared feature contract with pending limits and no input echo", () => {
    const result = runCli(
      ["feature-json"],
      JSON.stringify(featureRequest("F03")),
      manseryeokCalendarAdapter,
      deps,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    const parsed = FeatureResultSchema.parse(JSON.parse(result.stdout));
    expect(parsed.featureId).toBe("F03");
    expect(parsed.limitations).toContain("EXECUTOR_NOT_IMPLEMENTED");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(result.stdout).not.toContain("2024-02-10");
  });
  it("rejects invalid requests before adapters and sanitizes unavailable/failed providers", () => {
    const calculate = vi.fn(deps.pillars.calculate);
    const invalid = runCli(
      ["feature-json"],
      JSON.stringify({ ...featureRequest("F08"), target: undefined }),
      manseryeokCalendarAdapter,
      { ...deps, pillars: { calculate } },
    );
    expect(invalid.exitCode).toBe(2);
    expect(JSON.parse(invalid.stderr).error.code).toBe("INVALID_INPUT");
    expect(calculate).not.toHaveBeenCalled();
    expect(
      runCli(["feature-json"], JSON.stringify(featureRequest("F03")), manseryeokCalendarAdapter)
        .exitCode,
    ).toBe(1);
    const failure = runCli(
      ["feature-json"],
      JSON.stringify(featureRequest("F03")),
      manseryeokCalendarAdapter,
      {
        ...deps,
        symbols: {
          load: () => {
            throw new Error("synthetic-private");
          },
        },
      },
    );
    expect(failure.exitCode).toBe(1);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).not.toContain("synthetic-private");
  });
  it("prevents tentative M03 findings from entering the confirmed narration projection", () => {
    const result = executeFeature(featureRequest("F03"), {
      ...deps,
      featureExecutors: {
        F03: {
          version: "1.0.0",
          execute: (context) => ({
            status: "complete",
            judgmentIds: context.availableJudgments
              .filter((j) => j.originModule === "M03")
              .map((j) => j.judgmentId),
          }),
        },
      },
    });
    expect(result.judgments.length).toBeGreaterThan(0);
    expect(result.status).toBe("partial");
    expect(buildFeatureNarrationInput(result).verifiedFindings).toEqual([]);
  });
  it("does not let a trusted Mock module mutate the immutable calculated core", () => {
    let attempted = true;
    const ports = mockFeaturePorts();
    const result = executeFeature(featureRequest("F03"), {
      ...deps,
      ...ports,
      moduleExecutors: {
        ...ports.moduleExecutors,
        M01: {
          version: "1.0.0",
          execute: (context) => {
            attempted = Reflect.set(context.core.document, "status", "unavailable");
            return { status: "complete", judgments: [], limitations: [] };
          },
        },
      },
    });
    expect(attempted).toBe(false);
    expect(result.core.document.status).toBe("complete");
  });
  it("keeps conflicting M01 method observations deferred even when each method is locally confirmed", () => {
    // After the independently checked 2024 Qingming boundary: 辰 month / 戊 day, seasonal 木 vs main-qi 土.
    const request = {
      ...featureRequest("F03"),
      birthInput: {
        ...fingerprintInput.birthInput,
        birthDate: "2024-04-04",
        birthTime: { status: "known", time: "17:30" },
      },
    };
    const result = executeFeature(request, {
      ...deps,
      featureExecutors: {
        F03: {
          version: "1.0.0",
          execute: (context) => ({
            status: "complete",
            judgmentIds: context.availableJudgments
              .filter((j) => j.originModule === "M01" && j.ruleId === "m01.season")
              .map((j) => j.judgmentId),
          }),
        },
      },
    });
    expect(result.judgments).toHaveLength(2);
    expect(
      result.judgments.every((j) => j.precision === "confirmed" && j.disposition === "deferred"),
    ).toBe(true);
    expect(buildFeatureNarrationInput(result).verifiedFindings).toEqual([]);
  });
  it("executes the actual bounded UTF-8 stdin command without live keys", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "feature-json"],
      { cwd: process.cwd(), input: JSON.stringify(featureRequest("F03")), encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).provenance.moduleId).toBe("M09");
  });
});
