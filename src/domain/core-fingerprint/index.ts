import { validateCoreExport } from "@/domain/core-export";
import type { CoreExport } from "@/domain/core-export/schemas";
import { canonicalizeJson, deepEqualCanonical } from "@/domain/json";
import {
  FINGERPRINT_POLICY,
  HashedCoreExportSchema,
  versions,
  type HashedCoreExport,
} from "@/domain/core-fingerprint/schemas";
import { FingerprintError } from "@/domain/core-fingerprint/error";
export { canonicalizeJson } from "@/domain/json";
export { FingerprintError } from "@/domain/core-fingerprint/error";
export * from "@/domain/core-fingerprint/schemas";
export interface Sha256Adapter {
  readonly digest: (utf8Text: string) => string;
}
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
  let data: CoreExport;
  try {
    data = validateCoreExport(value);
  } catch {
    throw new FingerprintError("DOCUMENT_REJECTED");
  }
  const document = { data };
  return Object.freeze({
    status: document.data.status,
    document: document.data,
    fingerprint: Object.freeze({
      ...FINGERPRINT_POLICY,
      versions: Object.freeze(versions(document.data)),
      hash: digest(document.data, adapter),
    }),
  });
}

/** Schema validation is separate from recomputing and checking the checksum. */
export function verifyCoreFingerprint(value: unknown, adapter: Sha256Adapter): boolean {
  const parsed = HashedCoreExportSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.status !== parsed.data.document.status ||
    !deepEqualCanonical(parsed.data.fingerprint.versions, versions(parsed.data.document))
  )
    return false;
  try {
    validateCoreExport(parsed.data.document);
  } catch {
    return false;
  }
  return parsed.data.fingerprint.hash === digest(parsed.data.document, adapter);
}

/** Untrusted storage/transport metadata requires explicit semantic validation. */
export function parseHashedCoreExport(value: unknown): HashedCoreExport {
  const parsed = HashedCoreExportSchema.parse(value);
  if (
    parsed.status !== parsed.document.status ||
    !deepEqualCanonical(parsed.fingerprint.versions, versions(parsed.document))
  )
    throw new FingerprintError("DOCUMENT_REJECTED");
  validateCoreExport(parsed.document);
  return parsed;
}
