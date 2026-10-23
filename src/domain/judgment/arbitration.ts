import { z } from "zod";
import {
  BASE_RULE_CATALOG,
  JudgmentEvaluationSchema,
  type JudgmentEvaluation,
} from "@/domain/judgment";
import { JudgmentFindingSchema, RuleEvaluationSchema } from "@/domain/judgment/schemas";

const Status = z.enum(["complete", "partial", "unavailable"]);
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
type Input = z.infer<typeof ArbitrationInputSchema>;
type Candidate = Input["candidates"][number];
const Resolution = z.enum(["priority", "tie", "method-disagreement", "incomplete-evidence"]);
const DecisionSchema = z
  .strictObject({
    findingId: z.string().min(1),
    disposition: z.enum(["accepted", "suppressed", "deferred"]),
    reason: z.enum(["non-conflicting", ...Resolution.options]),
    conflictingWith: z.array(z.string().min(1)).readonly(),
  })
  .readonly();
const ConflictSchema = z
  .strictObject({
    conflictId: z.string().min(1),
    key: Identifier,
    status: z.enum(["resolved", "unresolved"]),
    resolution: Resolution,
    candidateIds: z.array(z.string().min(1)).min(2).readonly(),
    winnerIds: z.array(z.string().min(1)).readonly(),
  })
  .readonly();
const Limitation = z.enum([
  "UPSTREAM_PARTIAL",
  "UPSTREAM_UNAVAILABLE",
  "PARTIAL_EVIDENCE",
  "UNRESOLVED_CONFLICT",
]);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function resolve(input: Input) {
  const candidates = [...input.candidates].sort((a, b) =>
    compare(a.finding.findingId, b.finding.findingId),
  );
  const decisions: z.infer<typeof DecisionSchema>[] = [];
  const conflicts: z.infer<typeof ConflictSchema>[] = [];
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates)
    groups.set(candidate.claim.key, [...(groups.get(candidate.claim.key) ?? []), candidate]);
  for (const key of [...groups.keys()].sort(compare)) {
    const group = groups.get(key)!;
    if (new Set(group.map(({ claim }) => claim.value)).size === 1) {
      decisions.push(
        ...group.map(({ finding }) => ({
          findingId: finding.findingId,
          disposition: "accepted" as const,
          reason: "non-conflicting" as const,
          conflictingWith: [],
        })),
      );
      continue;
    }
    const topPriority = Math.max(...group.map(({ finding }) => finding.priority));
    const topValues = new Set(
      group
        .filter(({ finding }) => finding.priority === topPriority)
        .map(({ claim }) => claim.value),
    );
    const resolution: z.infer<typeof Resolution> =
      new Set(group.map(({ claim }) => claim.method)).size > 1
        ? "method-disagreement"
        : group.some(({ finding }) => finding.precision === "partial")
          ? "incomplete-evidence"
          : topValues.size > 1
            ? "tie"
            : "priority";
    const winners =
      resolution === "priority"
        ? group
            .filter(({ claim }) => topValues.has(claim.value))
            .map(({ finding }) => finding.findingId)
        : [];
    conflicts.push({
      conflictId: `conflict:${key}`,
      key,
      status: resolution === "priority" ? "resolved" : "unresolved",
      resolution,
      candidateIds: group.map(({ finding }) => finding.findingId),
      winnerIds: winners,
    });
    decisions.push(
      ...group.map(({ finding, claim }) => ({
        findingId: finding.findingId,
        disposition:
          resolution !== "priority"
            ? ("deferred" as const)
            : winners.includes(finding.findingId)
              ? ("accepted" as const)
              : ("suppressed" as const),
        reason: resolution,
        conflictingWith: group
          .filter((other) => other.claim.value !== claim.value)
          .map((other) => other.finding.findingId),
      })),
    );
  }
  decisions.sort((a, b) => compare(a.findingId, b.findingId));
  const accepted = new Set(
    decisions.filter((entry) => entry.disposition === "accepted").map((entry) => entry.findingId),
  );
  const unresolved = conflicts.some((entry) => entry.status === "unresolved");
  const limitations: z.infer<typeof Limitation>[] = [
    ...(input.status === "partial" ? ["UPSTREAM_PARTIAL" as const] : []),
    ...(input.status === "unavailable" ? ["UPSTREAM_UNAVAILABLE" as const] : []),
    ...(candidates.some(({ finding }) => finding.precision === "partial")
      ? ["PARTIAL_EVIDENCE" as const]
      : []),
    ...(unresolved ? ["UNRESOLVED_CONFLICT" as const] : []),
  ];
  return {
    status: input.status === "complete" && unresolved ? ("partial" as const) : input.status,
    upstreamStatus: input.status,
    candidates,
    decisions,
    conflicts,
    findings: candidates
      .filter(({ finding }) => accepted.has(finding.findingId))
      .map(({ finding }) => finding),
    limitations,
    provenance: {
      policyId: "arbitration.explicit-claims" as const,
      policyVersion: "1.0.0" as const,
      scope: "structural-candidate-arbitration" as const,
    },
  };
}

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
  .refine((value) => {
    const input = ArbitrationInputSchema.safeParse({
      status: value.upstreamStatus,
      candidates: value.candidates,
    });
    return input.success && JSON.stringify(value) === JSON.stringify(resolve(input.data));
  })
  .readonly();
export type ArbitrationResult = z.infer<typeof ArbitrationResultSchema>;

const messages = {
  INPUT_REJECTED: "Arbitration input was rejected.",
  OUTPUT_INVALID: "Arbitration output was invalid.",
} as const;
export class ArbitrationError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "ArbitrationError";
  }
}
/** Pure server-side mechanics. The caller must supply validated, sourced judgments. */
export function arbitrateJudgments(value: unknown): ArbitrationResult {
  const input = ArbitrationInputSchema.safeParse(value);
  if (!input.success) throw new ArbitrationError("INPUT_REJECTED");
  const output = ArbitrationResultSchema.safeParse(resolve(input.data));
  if (!output.success) throw new ArbitrationError("OUTPUT_INVALID");
  return output.data;
}

export const BaseArbitrationSchema = z
  .strictObject({
    arbitration: ArbitrationResultSchema,
    uncertainties: z.array(RuleEvaluationSchema).max(20).readonly(),
  })
  .readonly();
export type BaseArbitration = z.infer<typeof BaseArbitrationSchema>;
function baseInput(evaluation: JudgmentEvaluation): Input {
  return {
    status: evaluation.status,
    candidates: evaluation.findings.map((finding) => {
      const condition = BASE_RULE_CATALOG.rules.find(
        (rule) => rule.ruleId === finding.ruleId,
      )!.condition;
      const key =
        condition.kind === "day-element"
          ? "base.day-element"
          : condition.kind === "month-season"
            ? "base.month-season"
            : finding.ruleId;
      return {
        finding,
        claim: {
          key,
          value:
            condition.kind === "day-element" || condition.kind === "month-season"
              ? finding.ruleId
              : "present",
          method: "base-structural-observations",
        },
      };
    }),
  };
}
/** Map only WBS-11 matches; unknown/unmatched results never become invented findings. */
export function arbitrateBaseJudgments(value: unknown): BaseArbitration {
  const evaluation = JudgmentEvaluationSchema.safeParse(value);
  if (!evaluation.success) throw new ArbitrationError("INPUT_REJECTED");
  return BaseArbitrationSchema.parse({
    arbitration: arbitrateJudgments(baseInput(evaluation.data)),
    uncertainties: [
      ...evaluation.data.results.filter((entry) => entry.coverage !== "complete"),
    ].sort((a, b) => compare(a.ruleId, b.ruleId)),
  });
}

export function arbitrationMatchesEvaluation(
  evaluation: JudgmentEvaluation,
  resolution: BaseArbitration,
): boolean {
  return JSON.stringify(resolution) === JSON.stringify(arbitrateBaseJudgments(evaluation));
}
