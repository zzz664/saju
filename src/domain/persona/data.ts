import { z } from "zod";
import { ManualPromptDataSchema } from "@/domain/core-export/schemas";
import { FeatureJudgmentSchema, FeatureLimitationSchema } from "@/domain/features/schemas";
import { CoverageStatusSchema } from "@/domain/contracts";

export const FeaturePersonaDataSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    scope: z.literal("feature-observations"),
    featureId: z.literal("F03"),
    status: CoverageStatusSchema,
    verifiedFindings: z
      .array(
        FeatureJudgmentSchema.unwrap()
          .omit({ judgmentId: true })
          .extend({
            findingId: z.string().min(1).max(300),
            status: z.literal("complete"),
            precision: z.literal("confirmed"),
            disposition: z.literal("accepted"),
          })
          .readonly(),
      )
      .max(20)
      .readonly(),
    limitations: z
      .strictObject({
        codes: z.array(FeatureLimitationSchema).max(6).readonly(),
        notes: z.array(z.string().min(1).max(600)).min(1).max(12).readonly(),
      })
      .readonly(),
  })
  .refine((data) => data.status !== "unavailable" || data.verifiedFindings.length === 0)
  .readonly();
export const PersonaNarrationDataSchema = z.union([
  ManualPromptDataSchema,
  FeaturePersonaDataSchema,
]);
export type PersonaNarrationData = z.infer<typeof PersonaNarrationDataSchema>;
