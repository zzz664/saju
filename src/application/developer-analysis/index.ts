import { calculateHashedCoreExport } from "@/application/core-fingerprint";
import { buildManualPrompt } from "@/domain/core-export";
import type { DeveloperAnalysisResponse } from "@/domain/developer-analysis";
import type { NatalFactsDependencies } from "@/application/natal-facts";
import type { Sha256Adapter } from "@/domain/core-fingerprint";

export function calculateDeveloperAnalysis(
  value: unknown,
  dependencies: NatalFactsDependencies,
  hash: Sha256Adapter,
): DeveloperAnalysisResponse {
  const analysis = calculateHashedCoreExport(value, dependencies, hash);
  return Object.freeze({ analysis, manualPrompt: buildManualPrompt(analysis.document) });
}
