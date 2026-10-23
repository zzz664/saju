import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { calculateTopic, TopicCalculationResultSchema } from "@/application/topics";
import { calculateRelations } from "@/application/relations";
import { evaluateTopic, TopicSchema } from "@/domain/judgment/topics";
import { parseStructureDiagnosis } from "@/domain/judgment/structure";
import { parseRelationAnalysis } from "@/domain/judgment/relations";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { runCli } from "@/cli/run";
import {
  fingerprintInput as input,
  fingerprintDependencies as dependencies,
} from "./helpers/fingerprint-input";

const json = JSON.stringify(input);
describe("M03 topic application and CLI", () => {
  it("calculates once, preserves M01/M02/core hashes, and reuses verified module identity", () => {
    const calculate = vi.fn(dependencies.pillars.calculate),
      load = vi.fn(dependencies.symbols.load);
    const result = calculateTopic(input, "career", {
      ...dependencies,
      pillars: { calculate },
      symbols: { load },
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    const original = calculateRelations(input, dependencies);
    expect(result.analysis).toEqual(original);
    expect(fingerprintCoreExport(result.analysis.analysis.core, nodeSha256Adapter)).toEqual(
      fingerprintCoreExport(original.analysis.core, nodeSha256Adapter),
    );
    const core = result.analysis.analysis.core,
      structure = result.analysis.analysis.structure!,
      relations = result.analysis.relations!;
    expect(parseStructureDiagnosis(core.facts!, structure)).toBe(structure);
    expect(parseRelationAnalysis(relations)).toBe(relations);
    expect(TopicCalculationResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(input.birthInput.birthDate);
  });
  it("applies all six topics to one existing context without changing its data or hash", () => {
    const original = calculateRelations(input, dependencies),
      core = original.analysis.core;
    const context = {
      facts: core.facts!,
      structure: original.analysis.structure!,
      relations: original.relations!,
    };
    const before = structuredClone(context),
      hash = fingerprintCoreExport(core, nodeSha256Adapter);
    const results = TopicSchema.options.map((topic) => evaluateTopic(context, topic));
    expect(results.map((result) => result.topic)).toEqual(TopicSchema.options);
    expect(context).toEqual(before);
    expect(fingerprintCoreExport(core, nodeSha256Adapter)).toEqual(hash);
  });
  it("does not use male/female/unspecified direction basis to assign different topic stereotypes", () => {
    for (const topic of TopicSchema.options) {
      const results = ["male", "female", "unspecified"].map(
        (directionBasis) =>
          calculateTopic(
            { ...input, birthInput: { ...input.birthInput, directionBasis } },
            topic,
            dependencies,
          ).evaluation,
      );
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    }
  });
  it.each(["midnight", "zi-start"] as const)(
    "retains unknown time/day limitations under %s",
    (dayBoundary) => {
      const result = calculateTopic(
        {
          ...input,
          birthInput: { ...input.birthInput, birthTime: { status: "unknown" } },
          calculationPolicy: { ...input.calculationPolicy, dayBoundary },
        },
        "romance",
        dependencies,
      );
      expect(result.evaluation?.limitations).toContain("MISSING_PILLARS");
      expect(result.analysis.analysis.core.facts?.sourcePillars.hour).toBeNull();
      if (dayBoundary === "zi-start") {
        expect(result.status).toBe("unavailable");
        expect(result.evaluation?.findings.filter((f) => f.kind === "candidate")).toEqual([]);
      }
    },
  );
  it("retains unavailable core reasons and validates unsupported topics before any adapter call", () => {
    const result = calculateTopic(
      { ...input, calculationPolicy: { ...input.calculationPolicy, solarTime: "true-solar" } },
      "wealth",
      dependencies,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      evaluation: null,
      analysis: { analysis: { core: { calculation: { reasons: ["LONGITUDE_UNKNOWN"] } } } },
    });
    const calculate = vi.fn(dependencies.pillars.calculate);
    expect(() =>
      calculateTopic(input, "private-topic", { ...dependencies, pillars: { calculate } }),
    ).toThrow("Topic was rejected.");
    expect(calculate).not.toHaveBeenCalled();
  });
  it("dispatches one topic through CLI and keeps syntax/input/provider errors distinct", () => {
    const result = runCli(
      ["diagnose-topic", "career"],
      json,
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      topic: "career",
      evaluation: { moduleId: "M03", topic: "career" },
    });
    for (const args of [
      ["diagnose-topic"],
      ["diagnose-topic", "private-topic"],
      ["diagnose-topic", "wealth", "extra"],
    ]) {
      const failure = runCli(args, json, manseryeokCalendarAdapter, dependencies);
      expect(failure.exitCode).toBe(2);
      expect(failure.stdout).toBe("");
      expect(JSON.parse(failure.stderr).error.code).toBe("USAGE");
      expect(failure.stderr).not.toContain("private-topic");
    }
    expect(
      JSON.parse(
        runCli(["diagnose-topic", "wealth"], "{", manseryeokCalendarAdapter, dependencies).stderr,
      ).error.code,
    ).toBe("INVALID_JSON");
    expect(
      JSON.parse(
        runCli(["diagnose-topic", "wealth"], "{}", manseryeokCalendarAdapter, dependencies).stderr,
      ).error.code,
    ).toBe("INVALID_INPUT");
    const failure = runCli(["diagnose-topic", "wealth"], json, manseryeokCalendarAdapter, {
      ...dependencies,
      symbols: {
        load: () => {
          throw new Error("synthetic-private");
        },
      },
    });
    expect(failure.exitCode).toBe(1);
    expect(failure.stderr).not.toContain("synthetic-private");
  });
  it("connects actual bounded UTF-8 stdin and rejects invalid topic arguments without waiting for stdin", () => {
    const valid = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "diagnose-topic", "career"],
      { cwd: process.cwd(), input: json, encoding: "utf8" },
    );
    expect(valid.status, valid.stderr).toBe(2);
    expect(valid.stderr).toBe("");
    expect(JSON.parse(valid.stdout).evaluation.moduleId).toBe("M03");
    const invalid = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "diagnose-topic", "private-topic"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(JSON.parse(invalid.stderr).error.code).toBe("USAGE");
  });
});
