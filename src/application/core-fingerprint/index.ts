import {
  fingerprintCoreExport,
  type HashedCoreExport,
  type Sha256Adapter,
} from "@/domain/core-fingerprint";
import { calculateCoreExport } from "@/application/core-export";
import type { NatalFactsDependencies } from "@/application/natal-facts";

/** Reuse the validated calculation once; fingerprinting never alters its facts. */
export function calculateHashedCoreExport(
  value: unknown,
  dependencies: NatalFactsDependencies,
  hash: Sha256Adapter,
): HashedCoreExport {
  return fingerprintCoreExport(calculateCoreExport(value, dependencies), hash);
}
