import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { calculateRelations, RelationsCalculationResultSchema } from "@/application/relations";
import { calculateStructureDiagnosis } from "@/application/structure";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { runCli } from "@/cli/run";
import {
  fingerprintInput as input,
  fingerprintDependencies as dependencies,
} from "./helpers/fingerprint-input";

const json = JSON.stringify(input);
describe("M02 existing core and developer CLI integration", () => {
  it("calculates core once and preserves M01, core JSON and hash while adding natal relation evidence", () => {
    const calculate = vi.fn(dependencies.pillars.calculate),
      load = vi.fn(dependencies.symbols.load);
    const before = structuredClone(input);
    const result = calculateRelations(input, {
      ...dependencies,
      pillars: { calculate },
      symbols: { load },
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    const original = calculateStructureDiagnosis(input, dependencies);
    expect(result.analysis).toEqual(original);
    expect(fingerprintCoreExport(result.analysis.core, nodeSha256Adapter)).toEqual(
      fingerprintCoreExport(original.core, nodeSha256Adapter),
    );
    expect(
      result.relations?.pillars.every(
        (ref) => ref.source === "natal" && ref.contextId === "native",
      ),
    ).toBe(true);
    // Synthetic known chart: 甲辰 / 丙寅 / 甲辰 / 丁卯. Two distinct 辰 positions remain distinct.
    expect(
      result.relations?.relations
        .filter((r) => r.relationType === "branch-self-punishment")
        .map((r) => r.participants),
    ).toEqual([["natal:day", "natal:year"]]);
    expect(
      result.relations?.relations.filter(
        (r) => r.relationType === "branch-directional-combination",
      ),
    ).toHaveLength(2);
    expect(input).toEqual(before);
    expect(JSON.stringify(result)).not.toContain(input.birthInput.birthDate);
    expect(RelationsCalculationResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
  });
  it.each(["midnight", "zi-start"] as const)(
    "keeps unknown hour/day out of relations under %s",
    (dayBoundary) => {
      const result = calculateRelations(
        {
          ...input,
          birthInput: { ...input.birthInput, birthTime: { status: "unknown" } },
          calculationPolicy: { ...input.calculationPolicy, dayBoundary },
        },
        dependencies,
      );
      expect(result.relations?.coverage.status).toBe("partial");
      expect(result.relations?.coverage.missingReferenceIds).toEqual(
        dayBoundary === "zi-start" ? ["natal:day", "natal:hour"] : ["natal:hour"],
      );
      expect(result.relations?.relations.every((r) => !r.participants.includes("natal:hour"))).toBe(
        true,
      );
      if (dayBoundary === "zi-start")
        expect(
          result.relations?.relations.every((r) => !r.participants.includes("natal:day")),
        ).toBe(true);
      expect(result.analysis.structure?.limitations).toContain("RELATIONS_NOT_ASSESSED");
      expect(result.status).toBe("partial");
    },
  );
  it("does not fabricate relations when core calculation is unavailable", () => {
    const result = calculateRelations(
      { ...input, calculationPolicy: { ...input.calculationPolicy, solarTime: "true-solar" } },
      dependencies,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      relations: null,
      analysis: { structure: null, core: { calculation: { reasons: ["LONGITUDE_UNKNOWN"] } } },
    });
  });
  it("returns one safe partial observation document in CLI and distinguishes invalid JSON/input/adapters", () => {
    const result = runCli(["diagnose-relations"], json, manseryeokCalendarAdapter, dependencies);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "partial",
      relations: { moduleId: "M02", coverage: { status: "complete" } },
    });
    const invalidJson = runCli(
      ["diagnose-relations"],
      "{",
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(invalidJson.exitCode).toBe(2);
    expect(JSON.parse(invalidJson.stderr).error.code).toBe("INVALID_JSON");
    const invalidInput = runCli(
      ["diagnose-relations"],
      "{}",
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(invalidInput.exitCode).toBe(2);
    expect(JSON.parse(invalidInput.stderr).error.code).toBe("INVALID_INPUT");
    expect(runCli(["diagnose-relations"], json, manseryeokCalendarAdapter).exitCode).toBe(1);
    const error = runCli(["diagnose-relations"], json, manseryeokCalendarAdapter, {
      ...dependencies,
      pillars: {
        calculate: () => {
          throw new Error("synthetic-private-input");
        },
      },
    });
    expect(error.exitCode).toBe(1);
    expect(error.stdout).toBe("");
    expect(error.stderr).not.toContain("synthetic-private");
  });
  it("connects the actual bounded UTF-8 stdin CLI without keys or external API calls", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "diagnose-relations"],
      { cwd: process.cwd(), input: json, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).relations.moduleId).toBe("M02");
    expect(result.stdout).not.toContain(input.birthInput.birthDate);
  });
});
