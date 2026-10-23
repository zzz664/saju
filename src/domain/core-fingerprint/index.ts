import { z } from "zod";
import { CoreExportSchema, type CoreExport } from "@/domain/core-export";

export interface Sha256Adapter {
  readonly digest: (utf8Text: string) => string;
}
const messages = {
  JSON_REJECTED: "Fingerprint JSON value was rejected.",
  DOCUMENT_REJECTED: "Fingerprint document was rejected.",
  HASH_FAILED: "Fingerprint hashing failed.",
} as const;
export class FingerprintError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "FingerprintError";
  }
}

/** sorted-json-v1: UTF-16 key order, original array order, JSON string/number encoding. */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(item: unknown, depth: number): string {
    const reject = () => {
      throw new FingerprintError("JSON_REJECTED");
    };
    if (depth > 64) return reject();
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return JSON.stringify(item);
    if (typeof item === "number") return Number.isFinite(item) ? JSON.stringify(item) : reject();
    if (
      typeof item !== "object" ||
      ancestors.has(item) ||
      Object.getOwnPropertySymbols(item).length > 0
    )
      return reject();
    const array = Array.isArray(item),
      prototype = Object.getPrototypeOf(item);
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      return reject();
    const descriptors = Object.getOwnPropertyDescriptors(item);
    ancestors.add(item);
    try {
      const property = (key: string) => {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return reject();
        return encode(descriptor.value, depth + 1);
      };
      if (array) {
        if (Object.keys(descriptors).length !== item.length + 1) return reject();
        return (
          "[" +
          Array.from({ length: item.length }, (_, index) => property(String(index))).join(",") +
          "]"
        );
      }
      // Build text directly: integer-looking keys would be reordered by JSON.stringify(object).
      return (
        "{" +
        Object.keys(descriptors)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + property(key))
          .join(",") +
        "}"
      );
    } finally {
      ancestors.delete(item);
    }
  }
  return encode(value, 0);
}

export const FINGERPRINT_POLICY = Object.freeze({
  algorithm: "sha256" as const,
  policyId: "fingerprint.core-export" as const,
  policyVersion: "1.0.0" as const,
  canonicalization: "sorted-json-v1" as const,
});
const shape = CoreExportSchema.unwrap().shape;
const VersionManifestSchema = z
  .strictObject({
    coreSchemaVersion: shape.schemaVersion,
    calculation: shape.calculation.unwrap().shape.library,
    normalization: shape.calculation.unwrap().shape.normalization,
    facts: shape.facts.unwrap().unwrap().shape.provenance.nullable(),
    judgment: shape.evaluation.unwrap().unwrap().shape.provenance.nullable(),
    arbitration: shape.resolution
      .unwrap()
      .unwrap()
      .shape.arbitration.unwrap()
      .shape.provenance.nullable(),
  })
  .readonly();
function versions(document: CoreExport): z.infer<typeof VersionManifestSchema> {
  return {
    coreSchemaVersion: document.schemaVersion,
    calculation: document.calculation.library,
    normalization: document.calculation.normalization,
    facts: document.facts?.provenance ?? null,
    judgment: document.evaluation?.provenance ?? null,
    arbitration: document.resolution?.arbitration.provenance ?? null,
  };
}
export const HashedCoreExportSchema = z
  .strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    document: CoreExportSchema,
    fingerprint: z
      .strictObject({
        algorithm: z.literal(FINGERPRINT_POLICY.algorithm),
        policyId: z.literal(FINGERPRINT_POLICY.policyId),
        policyVersion: z.literal(FINGERPRINT_POLICY.policyVersion),
        canonicalization: z.literal(FINGERPRINT_POLICY.canonicalization),
        versions: VersionManifestSchema,
        hash: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .readonly(),
  })
  .refine(
    (value) =>
      value.status === value.document.status &&
      canonicalizeJson(value.fingerprint.versions) === canonicalizeJson(versions(value.document)),
  )
  .readonly();
export type HashedCoreExport = z.infer<typeof HashedCoreExportSchema>;

function digest(document: CoreExport, adapter: Sha256Adapter): string {
  // Domain separation and all actual versions are inside the hashed content.
  const text = canonicalizeJson({
    policy: FINGERPRINT_POLICY,
    versions: versions(document),
    document,
  });
  let hash: unknown;
  try {
    hash = adapter.digest(text);
  } catch {
    throw new FingerprintError("HASH_FAILED");
  }
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))
    throw new FingerprintError("HASH_FAILED");
  return hash;
}

/** Fingerprint a validated export; raw birth input is never used as a hash preimage. */
export function fingerprintCoreExport(value: unknown, adapter: Sha256Adapter): HashedCoreExport {
  const document = CoreExportSchema.safeParse(value);
  if (!document.success) throw new FingerprintError("DOCUMENT_REJECTED");
  return HashedCoreExportSchema.parse({
    status: document.data.status,
    document: document.data,
    fingerprint: {
      ...FINGERPRINT_POLICY,
      versions: versions(document.data),
      hash: digest(document.data, adapter),
    },
  });
}

/** Schema validation is separate from recomputing and checking the checksum. */
export function verifyCoreFingerprint(value: unknown, adapter: Sha256Adapter): boolean {
  const parsed = HashedCoreExportSchema.safeParse(value);
  return parsed.success && parsed.data.fingerprint.hash === digest(parsed.data.document, adapter);
}
