import { CalculationReasonSchema as CommonCalculationReasonSchema } from "@/domain/contracts";
import { CoverageStatusSchema } from "@/domain/contracts";
import { z } from "zod";
import { CalculationPolicySchema, InputInformationSchema } from "@/domain/input";
import { DerivedNatalFactsSchema } from "@/domain/natal-facts/schemas";
import { PolicyPillarsProvenanceSchema } from "@/domain/policy-calendar";
import { ResolvedTimeSchema } from "@/domain/timezone";
import { EvaluationBaseSchema as JudgmentEvaluationSchema } from "@/domain/judgment/schemas";
import {
  BaseArbitrationSchema,
  ArbitrationResultSchema,
} from "@/domain/judgment/arbitration-schemas";
import {
  EvaluationBaseSchema,
  JudgmentFindingSchema,
  ExceptionSchema,
} from "@/domain/judgment/schemas";

const Status = CoverageStatusSchema;
export const CalculationReasonSchema = CommonCalculationReasonSchema;
export const CoreExportSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    scope: z.literal("base-structural-observations"),
    status: Status,
    calculation: z
      .strictObject({
        status: z.enum(["calculated", "partial", "rejected", "unavailable"]),
        policy: CalculationPolicySchema,
        information: InputInformationSchema,
        reasons: z.array(CalculationReasonSchema).max(10).readonly(),
        library: PolicyPillarsProvenanceSchema.nullable(),
        normalization: ResolvedTimeSchema.unwrap().shape.provenance.nullable(),
      })
      .readonly(),
    facts: DerivedNatalFactsSchema.nullable(),
    evaluation: JudgmentEvaluationSchema.nullable(),
    resolution: BaseArbitrationSchema.nullable(),
  })
  .readonly();
export type CoreExport = z.infer<typeof CoreExportSchema>;
const VerifiedFindingSchema = JudgmentFindingSchema.unwrap()
  .extend({
    precision: z.literal("confirmed"),
    exceptionsApplied: z.array(ExceptionSchema).length(0).readonly(),
    evidence: JudgmentFindingSchema.unwrap().shape.evidence.unwrap().min(1).readonly(),
  })
  .readonly();
export const ManualPromptDataSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    promptVersion: z.literal("1.0.0"),
    scope: z.literal("base-structural-observations"),
    status: Status,
    verifiedFindings: z.array(VerifiedFindingSchema).max(20).readonly(),
    limitations: z
      .strictObject({
        input: InputInformationSchema,
        calculationReasons: z.array(CalculationReasonSchema).max(10).readonly(),
        uncertainties: z
          .array(
            z
              .strictObject({
                ruleId: z.string().min(1),
                coverage: z.enum(["partial", "none"]),
                exceptionsApplied: z.array(ExceptionSchema).min(1).readonly(),
              })
              .readonly(),
          )
          .max(20)
          .readonly(),
        excludedFindingIds: z.array(z.string().min(1)).max(20).readonly(),
        arbitration: ArbitrationResultSchema.unwrap().shape.limitations,
      })
      .readonly(),
    judgmentProvenance: EvaluationBaseSchema.unwrap().shape.provenance.nullable(),
    arbitrationProvenance: ArbitrationResultSchema.unwrap().shape.provenance.nullable(),
  })
  .refine((value) => value.status !== "unavailable" || value.verifiedFindings.length === 0)
  .readonly();

export type ManualPromptData = z.infer<typeof ManualPromptDataSchema>;
