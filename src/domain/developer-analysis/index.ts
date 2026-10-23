import { z } from "zod";
import { HashedCoreExportSchema } from "@/domain/core-fingerprint";
import { buildManualPrompt } from "@/domain/core-export";

export const DeveloperAnalysisResponseSchema = z
  .strictObject({
    analysis: HashedCoreExportSchema,
    manualPrompt: z.string().min(1).max(200000),
  })
  .refine((value) => value.manualPrompt === buildManualPrompt(value.analysis.document))
  .readonly();
export type DeveloperAnalysisResponse = z.infer<typeof DeveloperAnalysisResponseSchema>;
