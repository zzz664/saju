import { calculateHashedCoreExport } from "../core-fingerprint/index";
import { buildManualPrompt } from "../../domain/core-export/index";
import { DeveloperAnalysisResponseSchema, type DeveloperAnalysisResponse } from "../../domain/developer-analysis/index";
import type { NatalFactsDependencies } from "../natal-facts/index";
import type { Sha256Adapter } from "../../domain/core-fingerprint/index";

export function calculateDeveloperAnalysis(value: unknown, dependencies: NatalFactsDependencies, hash: Sha256Adapter): DeveloperAnalysisResponse {
  const analysis = calculateHashedCoreExport(value, dependencies, hash);
  return DeveloperAnalysisResponseSchema.parse({ analysis, manualPrompt: buildManualPrompt(analysis.document) });
}
