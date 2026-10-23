import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  calculateStructureDiagnosis,
  StructureCalculationResultSchema,
} from "@/application/structure";
import { calculateCoreExport } from "@/application/core-export";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { runCli } from "@/cli/run";
import {
  fingerprintInput as input,
  fingerprintDependencies as dependencies,
} from "./helpers/fingerprint-input";

const json = JSON.stringify(input);
describe("M01 application and CLI boundary", () => {
  it("uses the existing calculation once and leaves the base export and fingerprint unchanged", () => {
    const load = vi.fn(dependencies.symbols.load),
      calculate = vi.fn(dependencies.pillars.calculate);
    const result = calculateStructureDiagnosis(input, {
      ...dependencies,
      pillars: { calculate },
      symbols: { load },
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    const core = calculateCoreExport(input, dependencies);
    expect(result.core).toEqual(core);
    expect(fingerprintCoreExport(result.core, nodeSha256Adapter)).toEqual(
      fingerprintCoreExport(core, nodeSha256Adapter),
    );
    expect(result).toMatchObject({ status: "partial", structure: { moduleId: "M01" } });
    expect(StructureCalculationResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
    expect(JSON.stringify(result)).not.toContain(input.birthInput.birthDate);
  });
  it("uses the established absolute solar-term boundary, before / at / after Lichun", () => {
    const results = ["17:26", "17:27", "17:28"].map((time) =>
      calculateStructureDiagnosis(
        {
          ...input,
          birthInput: {
            ...input.birthInput,
            birthDate: "2024-02-04",
            birthTime: { status: "known", time },
          },
        },
        dependencies,
      ),
    );
    // Independently transcribed existing KASI minute fixture; before 乙丑, at/after 丙寅.
    expect(results.map((result) => result.structure?.facts.month?.branch)).toEqual([
      "축",
      "인",
      "인",
    ]);
    expect(results.map((result) => result.structure?.facts.month?.mainStem)).toEqual([
      "기",
      "갑",
      "갑",
    ]);
    expect(results.map((result) => result.structure?.facts.month?.seasonalElement)).toEqual([
      "수",
      "목",
      "목",
    ]);
  });
  it.each(["midnight", "zi-start"] as const)(
    "retains confirmed pillars only for unknown birth time / %s",
    (dayBoundary) => {
      const result = calculateStructureDiagnosis(
        {
          ...input,
          birthInput: { ...input.birthInput, birthTime: { status: "unknown" } },
          calculationPolicy: { ...input.calculationPolicy, dayBoundary },
        },
        dependencies,
      );
      expect(result.structure?.facts.sourcePillars.hour).toBeNull();
      expect(result.structure?.facts.sourcePillars.day === null).toBe(dayBoundary === "zi-start");
      expect(
        result.structure?.judgments
          .filter((j) => j.topic === "strength")
          .some((j) => ["strong-candidate", "weak-candidate"].includes(j.value)),
      ).toBe(false);
      expect(result.status).toBe("partial");
    },
  );
  it("does not fabricate a diagnosis for unavailable core data and preserves its reason", () => {
    const result = calculateStructureDiagnosis(
      { ...input, calculationPolicy: { ...input.calculationPolicy, solarTime: "true-solar" } },
      dependencies,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      structure: null,
      core: { calculation: { reasons: ["LONGITUDE_UNKNOWN"] } },
    });
  });
  it("reports candidate-only partial output via CLI instead of falsely claiming completion", () => {
    const result = runCli(["diagnose-structure"], json, manseryeokCalendarAdapter, dependencies);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "partial",
      structure: {
        moduleId: "M01",
        limitations: expect.arrayContaining(["RELATIONS_NOT_ASSESSED"]),
      },
    });
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const unavailable = runCli(
      ["diagnose-structure"],
      JSON.stringify({
        ...input,
        calculationPolicy: { ...input.calculationPolicy, solarTime: "true-solar" },
      }),
      manseryeokCalendarAdapter,
      dependencies,
    );
    expect(unavailable.exitCode).toBe(2);
    expect(JSON.parse(unavailable.stdout).structure).toBeNull();
  });
  it("keeps invalid input and unavailable adapters distinct and sanitizes provider exceptions", () => {
    expect(
      runCli(["diagnose-structure"], "{}", manseryeokCalendarAdapter, dependencies),
    ).toMatchObject({ exitCode: 2, stdout: "" });
    expect(runCli(["diagnose-structure"], json, manseryeokCalendarAdapter)).toMatchObject({
      exitCode: 1,
      stdout: "",
    });
    const result = runCli(["diagnose-structure"], json, manseryeokCalendarAdapter, {
      ...dependencies,
      symbols: {
        load: () => {
          throw new Error("synthetic-private-provider-message");
        },
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("synthetic-private");
    expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
  });
  it("wires the actual stdin CLI entry point without live keys or network", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "diagnose-structure"],
      { cwd: process.cwd(), input: json, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).structure.moduleId).toBe("M01");
    expect(result.stdout).not.toContain(input.birthInput.birthDate);
  });
});
