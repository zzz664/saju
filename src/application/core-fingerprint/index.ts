import { fingerprintCoreExport, type HashedCoreExport, type Sha256Adapter } from "../../domain/core-fingerprint/index";
import { calculateCoreExport } from "../core-export/index";
import type { NatalFactsDependencies } from "../natal-facts/index";

/** Reuse the validated calculation once; fingerprinting never alters its facts. */
export function calculateHashedCoreExport(value: unknown, dependencies: NatalFactsDependencies, hash: Sha256Adapter): HashedCoreExport {
  return fingerprintCoreExport(calculateCoreExport(value, dependencies), hash);
}
