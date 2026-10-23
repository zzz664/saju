import { z } from "zod";
import { HashedCoreExportSchema } from "@/domain/core-fingerprint/schemas";
export const DeveloperAnalysisResponseSchema = z
  .strictObject({
    analysis: HashedCoreExportSchema,
    manualPrompt: z.string().min(1).max(200000),
  })
  .readonly();
export type DeveloperAnalysisResponse = z.infer<typeof DeveloperAnalysisResponseSchema>;
