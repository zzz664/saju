import { DeveloperAnalysisResponseSchema } from "@/domain/developer-analysis/schemas";
import { buildManualPrompt, validateCoreExport } from "@/domain/core-export";
import { parseHashedCoreExport } from "@/domain/core-fingerprint";
export * from "@/domain/developer-analysis/schemas";
export function parseDeveloperAnalysisResponse(value: unknown) {
  const parsed = DeveloperAnalysisResponseSchema.parse(value);
  parseHashedCoreExport(parsed.analysis);
  validateCoreExport(parsed.analysis.document);
  if (parsed.manualPrompt !== buildManualPrompt(parsed.analysis.document))
    throw new Error("Developer response was rejected.");
  return parsed;
}
