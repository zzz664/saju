import { CoverageStatusSchema } from "@/domain/contracts";
import { z } from "zod";
import { JudgmentFindingSchema, RuleEvaluationSchema } from "@/domain/judgment/schemas";
const Status = CoverageStatusSchema;
const Identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/);
const CandidateSchema = z
  .strictObject({
    finding: JudgmentFindingSchema,
    // Different values of the same key are mutually exclusive. Methods stay explicit.
    claim: z.strictObject({ key: Identifier, value: Identifier, method: Identifier }).readonly(),
  })
  .refine(
    ({ finding }) =>
      finding.evidence.length > 0 &&
      new Set(finding.exceptionsApplied).size === finding.exceptionsApplied.length &&
      finding.exceptionsApplied.every((entry) => finding.exceptionsDeclared.includes(entry)) &&
      (finding.precision === "confirmed"
        ? finding.exceptionsApplied.length === 0
        : finding.exceptionsApplied.length === 1 &&
          finding.exceptionsApplied[0] === "INCOMPLETE_SEARCH_SCOPE"),
  )
  .readonly();
export const ArbitrationInputSchema = z
  .strictObject({
    status: Status,
    candidates: z.array(CandidateSchema).max(100).readonly(),
  })
  .refine(
    ({ status, candidates }) =>
      new Set(candidates.map(({ finding }) => finding.findingId)).size === candidates.length &&
      (status !== "unavailable" || candidates.length === 0) &&
      (status !== "complete" ||
        candidates.every(({ finding }) => finding.precision === "confirmed")),
  )
  .readonly();
export type Input = z.infer<typeof ArbitrationInputSchema>;
export type Candidate = Input["candidates"][number];
export const Resolution = z.enum(["priority", "tie", "method-disagreement", "incomplete-evidence"]);
export const DecisionSchema = z
  .strictObject({
    findingId: z.string().min(1),
    disposition: z.enum(["accepted", "suppressed", "deferred"]),
    reason: z.enum(["non-conflicting", ...Resolution.options]),
    conflictingWith: z.array(z.string().min(1)).readonly(),
  })
  .readonly();
export const ConflictSchema = z
  .strictObject({
    conflictId: z.string().min(1),
    key: Identifier,
    status: z.enum(["resolved", "unresolved"]),
    resolution: Resolution,
    candidateIds: z.array(z.string().min(1)).min(2).readonly(),
    winnerIds: z.array(z.string().min(1)).readonly(),
  })
  .readonly();
export const Limitation = z.enum([
  "UPSTREAM_PARTIAL",
  "UPSTREAM_UNAVAILABLE",
  "PARTIAL_EVIDENCE",
  "UNRESOLVED_CONFLICT",
]);

export const ArbitrationResultSchema = z
  .strictObject({
    status: Status,
    upstreamStatus: Status,
    candidates: z.array(CandidateSchema).max(100).readonly(),
    decisions: z.array(DecisionSchema).max(100).readonly(),
    conflicts: z.array(ConflictSchema).max(100).readonly(),
    findings: z.array(JudgmentFindingSchema).max(100).readonly(),
    limitations: z.array(Limitation).readonly(),
    provenance: z
      .strictObject({
        policyId: z.literal("arbitration.explicit-claims"),
        policyVersion: z.literal("1.0.0"),
        scope: z.literal("structural-candidate-arbitration"),
      })
      .readonly(),
  })
  .readonly();
export const BaseArbitrationSchema = z
  .strictObject({
    arbitration: ArbitrationResultSchema,
    uncertainties: z.array(RuleEvaluationSchema).max(20).readonly(),
  })
  .readonly();
export type BaseArbitration = z.infer<typeof BaseArbitrationSchema>;
export type ArbitrationResult = z.infer<typeof ArbitrationResultSchema>;
