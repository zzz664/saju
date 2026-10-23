import { CoverageStatusSchema } from "@/domain/contracts";
import { HexDigestSchema } from "@/domain/contracts";
import { z } from "zod";
import { CoreExportSchema, type CoreExport } from "@/domain/core-export/schemas";
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
export function versions(document: CoreExport): z.infer<typeof VersionManifestSchema> {
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
    status: CoverageStatusSchema,
    document: CoreExportSchema,
    fingerprint: z
      .strictObject({
        algorithm: z.literal(FINGERPRINT_POLICY.algorithm),
        policyId: z.literal(FINGERPRINT_POLICY.policyId),
        policyVersion: z.literal(FINGERPRINT_POLICY.policyVersion),
        canonicalization: z.literal(FINGERPRINT_POLICY.canonicalization),
        versions: VersionManifestSchema,
        hash: HexDigestSchema,
      })
      .readonly(),
  })
  .readonly();
export type HashedCoreExport = z.infer<typeof HashedCoreExportSchema>;
