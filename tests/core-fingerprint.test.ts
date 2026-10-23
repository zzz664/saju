import { describe, expect, it } from "vitest";
import { calculateCoreExport } from "@/application/core-export";
import {
  canonicalizeJson,
  fingerprintCoreExport,
  verifyCoreFingerprint,
  HashedCoreExportSchema,
} from "@/domain/core-fingerprint";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";

const core = calculateCoreExport(fingerprintInput, fingerprintDependencies);
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  return value;
}

describe("versioned deterministic core fingerprint", () => {
  it("canonicalizes nested/numeric object keys while preserving arrays, Unicode and null", () => {
    const input = { z: ["한글", null, false, -0], a: { "2": 2, "10": 10, quote: '"\n' } };
    const before = structuredClone(input);
    expect(canonicalizeJson(input)).toBe(
      '{"a":{"10":10,"2":2,"quote":"\\\"\\n"},"z":["한글",null,false,0]}',
    );
    expect(canonicalizeJson(reverseKeys(input))).toBe(canonicalizeJson(input));
    expect(input).toEqual(before);
    expect(canonicalizeJson([1, 2])).not.toBe(canonicalizeJson([2, 1]));
    expect(canonicalizeJson("é")).not.toBe(canonicalizeJson("e\u0301"));
  });

  it("matches independently specified SHA-256 vectors", () => {
    expect(nodeSha256Adapter.digest("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(nodeSha256Adapter.digest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(nodeSha256Adapter.digest(canonicalizeJson({ b: 2, a: 1 }))).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });

  it("rejects non-JSON values, cycles, sparse arrays, extra array keys and accessors", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const extra = [1];
    Object.assign(extra, { other: 2 });
    let accessed = false;
    const accessor = Object.defineProperty({}, "a", {
      enumerable: true,
      get() {
        accessed = true;
        return 1;
      },
    });
    for (const value of [
      undefined,
      NaN,
      Infinity,
      BigInt(1),
      new Date(0),
      () => 1,
      Symbol("x"),
      cycle,
      [undefined],
      { x: undefined },
      Array(2),
      extra,
      accessor,
      { [Symbol("x")]: 1 },
    ])
      expect(() => canonicalizeJson(value)).toThrow("Fingerprint JSON value was rejected.");
    expect(accessed).toBe(false);
    const shared = { a: 1 };
    expect(canonicalizeJson([shared, shared])).toBe('[{"a":1},{"a":1}]');
    let nested: unknown = null;
    for (let depth = 0; depth < 64; depth++) nested = [nested];
    expect(() => canonicalizeJson(nested)).not.toThrow();
    expect(() => canonicalizeJson([nested])).toThrow("Fingerprint JSON value was rejected.");
  });

  it("hashes reordered objects and JSON whitespace identically and preserves the document", () => {
    const result = fingerprintCoreExport(core, nodeSha256Adapter);
    expect(fingerprintCoreExport(reverseKeys(core), nodeSha256Adapter)).toEqual(result);
    expect(
      fingerprintCoreExport(JSON.parse(JSON.stringify(core, null, 4)), nodeSha256Adapter),
    ).toEqual(result);
    expect(result.document).toEqual(core);
    expect(Object.isFrozen(result.fingerprint.versions.facts)).toBe(true);
    expect(verifyCoreFingerprint(JSON.parse(JSON.stringify(result)), nodeSha256Adapter)).toBe(true);
    expect(HashedCoreExportSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(result.fingerprint.versions).toMatchObject({
      coreSchemaVersion: "1.0.0",
      calculation: core.calculation.library,
      normalization: core.calculation.normalization,
      facts: core.facts?.provenance,
      judgment: core.evaluation?.provenance,
      arbitration: core.resolution?.arbitration.provenance,
    });
  });

  it("changes the digest when actual policy, supported runtime version or computed contents change", () => {
    const original = fingerprintCoreExport(core, nodeSha256Adapter).fingerprint.hash;
    const policy = {
      ...core,
      calculation: {
        ...core.calculation,
        policy: { ...core.calculation.policy, dstDisambiguation: "earlier" },
      },
    };
    const runtime = {
      ...core,
      calculation: {
        ...core.calculation,
        normalization: { ...core.calculation.normalization, tzdbVersion: "fixture-next-tzdb" },
      },
    };
    const different = calculateCoreExport(
      {
        ...fingerprintInput,
        birthInput: { ...fingerprintInput.birthInput, birthDate: "2024-02-11" },
      },
      fingerprintDependencies,
    );
    for (const changed of [policy, runtime, different])
      expect(fingerprintCoreExport(changed, nodeSha256Adapter).fingerprint.hash).not.toBe(original);
  });

  it("rejects altered hashes, manifests, unknown policies, status and internally invalid documents", () => {
    const result = fingerprintCoreExport(core, nodeSha256Adapter);
    const changed = {
      ...result.document,
      calculation: {
        ...result.document.calculation,
        policy: { ...result.document.calculation.policy, dstDisambiguation: "later" },
      },
    };
    for (const raw of [
      { ...result, fingerprint: { ...result.fingerprint, hash: "0".repeat(64) } },
      { ...result, document: changed },
      { ...result, status: "partial" },
      { ...result, fingerprint: { ...result.fingerprint, policyVersion: "2.0.0" } },
      { ...result, fingerprint: { ...result.fingerprint, algorithm: "md5" } },
      { ...result, fingerprint: { ...result.fingerprint, canonicalization: "unsupported" } },
      {
        ...result,
        fingerprint: {
          ...result.fingerprint,
          versions: { ...result.fingerprint.versions, judgment: null },
        },
      },
      { ...result, document: { ...core, evaluation: null } },
    ])
      expect(verifyCoreFingerprint(raw, nodeSha256Adapter)).toBe(false);
    expect(() =>
      fingerprintCoreExport({ ...core, schemaVersion: "2.0.0" }, nodeSha256Adapter),
    ).toThrow("Fingerprint document was rejected.");
  });

  it("sanitizes broken hash adapter output and exceptions", () => {
    for (const digest of [
      () => "bad",
      () => "A".repeat(64),
      () => {
        throw new Error("private birth secret");
      },
    ]) {
      expect(() => fingerprintCoreExport(core, { digest })).toThrow("Fingerprint hashing failed.");
    }
  });

  it.each(["partial", "unavailable"])(
    "preserves %s and produces the same digest for 100 repetitions",
    (status) => {
      const value =
        status === "partial"
          ? {
              ...fingerprintInput,
              birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
            }
          : {
              ...fingerprintInput,
              calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
            };
      const document = calculateCoreExport(value, fingerprintDependencies);
      const results = Array.from({ length: 100 }, () =>
        fingerprintCoreExport(document, nodeSha256Adapter),
      );
      expect(new Set(results.map((result) => result.fingerprint.hash)).size).toBe(1);
      expect(
        results.every((result) => result.status === status && result.document.status === status),
      ).toBe(true);
      expect(verifyCoreFingerprint(results[0], nodeSha256Adapter)).toBe(true);
      if (status === "unavailable") expect(results[0].fingerprint.versions.calculation).toBeNull();
    },
    30000,
  );
});
