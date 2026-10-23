import { defineCodedError } from "@/domain/utilities";
import { deepEqualCanonical } from "@/domain/json";
import { z } from "zod";
import {
  BASE_RULE_CATALOG,
  parseJudgmentEvaluation,
  type JudgmentEvaluation,
} from "@/domain/judgment";
import {
  ArbitrationInputSchema,
  ArbitrationResultSchema,
  BaseArbitrationSchema,
  DecisionSchema,
  ConflictSchema,
  Limitation,
  Resolution,
  type Input,
  type Candidate,
  type ArbitrationResult,
  type BaseArbitration,
} from "@/domain/judgment/arbitration-schemas";
export * from "@/domain/judgment/arbitration-schemas";
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

export function parseArbitrationResult(value: unknown): ArbitrationResult {
  const parsed = ArbitrationResultSchema.parse(value);
  const input = ArbitrationInputSchema.parse({
    status: parsed.upstreamStatus,
    candidates: parsed.candidates,
  });
  if (!deepEqualCanonical(parsed, resolve(input))) throw new ArbitrationError("INPUT_REJECTED");
  return parsed;
}
const messages = {
  INPUT_REJECTED: "Arbitration input was rejected.",
  OUTPUT_INVALID: "Arbitration output was invalid.",
} as const;
export class ArbitrationError extends defineCodedError("ArbitrationError", messages) {}
/** Pure server-side mechanics. The caller must supply validated, sourced judgments. */
export function arbitrateJudgments(value: unknown): ArbitrationResult {
  const input = ArbitrationInputSchema.safeParse(value);
  if (!input.success) throw new ArbitrationError("INPUT_REJECTED");
  const output = ArbitrationResultSchema.safeParse(resolve(input.data));
  if (!output.success) throw new ArbitrationError("OUTPUT_INVALID");
  return output.data;
}

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
  let data: JudgmentEvaluation;
  try {
    data = parseJudgmentEvaluation(value);
  } catch {
    throw new ArbitrationError("INPUT_REJECTED");
  }
  const evaluation = { data };
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
  return deepEqualCanonical(resolution, arbitrateBaseJudgments(evaluation));
}
