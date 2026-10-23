import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { calculateHashedCoreExport } from "@/application/core-fingerprint";
import { calculateCoreExport } from "@/application/core-export";
import { HashedCoreExportSchema, verifyCoreFingerprint } from "@/domain/core-fingerprint";
import { parseCoreExport } from "@/domain/core-export";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { runCli } from "@/cli/run";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";

const dependencies = { ...fingerprintDependencies, hash: nodeSha256Adapter };

describe("100-run determinism and hashed core CLI", () => {
  it("calculates the same input 100 times with one identical hash and manifest", () => {
    const load = vi.fn(fingerprintDependencies.symbols.load);
    const pillars = vi.fn(fingerprintDependencies.pillars.calculate);
    const hashes = new Set<string>(),
      manifests = new Set<string>();
    const before = structuredClone(fingerprintInput);
    for (let index = 0; index < 100; index++) {
      const result = calculateHashedCoreExport(
        fingerprintInput,
        { ...fingerprintDependencies, symbols: { load }, pillars: { calculate: pillars } },
        nodeSha256Adapter,
      );
      hashes.add(result.fingerprint.hash);
      manifests.add(JSON.stringify(result.fingerprint.versions));
    }
    expect(hashes.size).toBe(1);
    expect(manifests.size).toBe(1);
    expect(load).toHaveBeenCalledTimes(100);
    expect(pillars).toHaveBeenCalledTimes(100);
    expect(fingerprintInput).toEqual(before);
  }, 30000);

  it("preserves the old document and calls the hash adapter once", () => {
    const digest = vi.fn(nodeSha256Adapter.digest);
    const result = calculateHashedCoreExport(fingerprintInput, fingerprintDependencies, { digest });
    expect(result.document).toEqual(calculateCoreExport(fingerprintInput, fingerprintDependencies));
    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest.mock.calls[0][0]).not.toContain("2024-02-10");
    expect(result.fingerprint).not.toHaveProperty("modelId");
    expect(result.fingerprint).not.toHaveProperty("promptVersion");
  });

  it("keeps partial and unavailable CLI status/exit codes without inventing complete data", () => {
    for (const value of [
      {
        ...fingerprintInput,
        birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
      },
      {
        ...fingerprintInput,
        calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
    ]) {
      const result = runCli(
        ["hash-json"],
        JSON.stringify(value),
        manseryeokCalendarAdapter,
        dependencies,
      );
      expect(result).toMatchObject({ exitCode: 2, stderr: "" });
      expect(verifyCoreFingerprint(JSON.parse(result.stdout), nodeSha256Adapter)).toBe(true);
      expect(JSON.parse(result.stdout).status).not.toBe("complete");
    }
  }, 15000);

  it("keeps prior JSON/manual/schema commands available with synthetic input", () => {
    const text = JSON.stringify(fingerprintInput);
    const plain = runCli(["export-json"], text, manseryeokCalendarAdapter, dependencies);
    const hashed = runCli(["hash-json"], text, manseryeokCalendarAdapter, dependencies);
    expect(plain.exitCode).toBe(0);
    expect(parseCoreExport(plain.stdout)).toEqual(JSON.parse(hashed.stdout).document);
    expect(
      runCli(["manual-prompt"], text, manseryeokCalendarAdapter, dependencies).stdout,
    ).toContain("<analysis_data>");
    expect(runCli(["export-schema"], "", manseryeokCalendarAdapter).exitCode).toBe(0);
    expect(runCli(["--help"], "", manseryeokCalendarAdapter).stdout).toContain("hash-json");
  });

  it("sanitizes invalid input, missing configuration and hash supplier errors", () => {
    expect(
      runCli(["hash-json"], "{ private", manseryeokCalendarAdapter, dependencies).exitCode,
    ).toBe(2);
    expect(runCli(["hash-json"], "{}", manseryeokCalendarAdapter, dependencies).exitCode).toBe(2);
    expect(
      runCli(
        ["hash-json"],
        JSON.stringify(fingerprintInput),
        manseryeokCalendarAdapter,
        fingerprintDependencies,
      ).exitCode,
    ).toBe(1);
    const result = runCli(
      ["hash-json"],
      JSON.stringify(fingerprintInput),
      manseryeokCalendarAdapter,
      {
        ...dependencies,
        hash: {
          digest: () => {
            throw new Error("private 2024-02-10 secret");
          },
        },
      },
    );
    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
    expect(result.stderr).not.toMatch(/private|2024|secret/);
  });

  it("runs actual CLI in different host timezones with an identical hash and private-free output", () => {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run through npm test.");
    const hashes = [];
    for (const timezone of ["UTC", "Pacific/Honolulu"]) {
      const result = spawnSync(
        process.execPath,
        [npmCli, "run", "--silent", "saju", "--", "hash-json"],
        {
          input: JSON.stringify(fingerprintInput),
          encoding: "utf8",
          timeout: 20000,
          windowsHide: true,
          env: { ...process.env, TZ: timezone },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(result.stdout).not.toMatch(/2024-02-10|05:30|birthDate/);
      const parsed = HashedCoreExportSchema.parse(JSON.parse(result.stdout));
      expect(verifyCoreFingerprint(parsed, nodeSha256Adapter)).toBe(true);
      hashes.push(parsed.fingerprint.hash);
    }
    expect(new Set(hashes).size).toBe(1);
  }, 45000);
});
