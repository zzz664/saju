import {
  TopicSchema,
  TopicEvaluationSchema,
  type Topic,
  type TopicEvaluation,
  type TopicEvidence,
  type TopicFinding,
  type TopicLimitation,
} from "@/domain/judgment/topics/schemas";
import { FAMILY_GODS, TOPIC_RULES, type TopicRule } from "@/domain/judgment/topics/catalog";
import { parseTopicContext, type TopicContext } from "@/domain/judgment/topics/context";
import { compareText, defineCodedError } from "@/domain/utilities";

export * from "@/domain/judgment/topics/schemas";
export { FAMILY_GODS, TOPIC_RULES, TOPIC_SOURCES } from "@/domain/judgment/topics/catalog";
export class TopicError extends defineCodedError("TopicError", {
  INPUT_REJECTED: "Topic context was rejected.",
  TOPIC_REJECTED: "Topic was rejected.",
  OUTPUT_INVALID: "Topic output failed validation.",
}) {}

function observations(context: TopicContext): TopicEvidence[] {
  const entries: TopicEvidence[] = [];
  for (const position of ["year", "month", "day", "hour"] as const) {
    const fact = context.facts.positions[position];
    if (!fact) continue;
    if (position !== "day" && fact.stem.tenGod)
      entries.push({
        inputPath: `facts.positions.${position}.stem.tenGod`,
        value: fact.stem.tenGod,
      });
    fact.branch.hiddenStems.forEach((hidden, index) => {
      if (hidden.tenGod)
        entries.push({
          inputPath: `facts.positions.${position}.branch.hiddenStems.${index}.tenGod`,
          value: hidden.tenGod,
        });
    });
  }
  return entries;
}
function relevantConflicts(context: TopicContext, topic: Topic) {
  const day = context.relations.pillars.find((ref) => ref.position === "day")!;
  return context.relations.conflicts.filter(
    (conflict) =>
      topic !== "romance" ||
      (conflict.referenceId === day.referenceId &&
        conflict.relationIds.some((id) =>
          context.relations.relations.some(
            (r) => r.relationId === id && r.relationType.startsWith("branch-"),
          ),
        )),
  );
}
function reviewEvidence(context: TopicContext, topic: Topic): TopicEvidence[] {
  const evidence: TopicEvidence[] = [];
  context.structure.judgments.forEach((judgment, index) => {
    if (judgment.topic === "strength" && ["mixed", "undetermined"].includes(judgment.value))
      evidence.push({ inputPath: `structure.judgments.${index}.value`, value: judgment.value });
  });
  if (context.structure.conflicts.length)
    evidence.push({
      inputPath: "structure.conflicts.0.conflictId",
      value: context.structure.conflicts[0].conflictId,
    });
  for (const conflict of relevantConflicts(context, topic).slice(0, 2))
    evidence.push({
      inputPath: `relations.conflicts.${context.relations.conflicts.indexOf(conflict)}.reason`,
      value: conflict.reason,
    });
  return evidence;
}
function match(
  rule: TopicRule,
  context: TopicContext,
  entries: TopicEvidence[],
  review: TopicEvidence[],
): TopicEvidence[] | null {
  const condition = rule.condition;
  if (condition.kind === "context-review") return review.length ? review : null;
  if (!context.facts.dayMaster || !context.structure.facts.month) return null;
  if (condition.kind === "family-pair") {
    const evidence = condition.families.map((family) =>
      entries.find((entry) => FAMILY_GODS[family].some((god) => god === entry.value)),
    );
    if (evidence.some((entry) => !entry)) return null;
    return [
      ...(evidence as TopicEvidence[]),
      { inputPath: "facts.dayMaster", value: context.facts.dayMaster },
      { inputPath: "structure.facts.month.branch", value: context.structure.facts.month.branch },
    ];
  }
  const day = context.relations.pillars.find((ref) => ref.position === "day")!;
  const relation = context.relations.relations.find(
    (relation) =>
      relation.relationType.startsWith("branch-") &&
      relation.participants.includes(day.referenceId) &&
      relation.relationType.endsWith("combination") === (condition.relation === "combination"),
  );
  if (!relation) return null;
  return [
    {
      inputPath: `relations.relations.${context.relations.relations.indexOf(relation)}.relationId`,
      value: relation.relationId,
    },
    {
      inputPath: "facts.positions.day.branch.branch",
      value: context.facts.positions.day!.branch.branch,
    },
    { inputPath: "structure.facts.month.branch", value: context.structure.facts.month.branch },
  ];
}

/** Evaluate one bounded topic pack; never infer a final personal trait or mutate upstream modules. */
export function evaluateTopic(value: unknown, requestedTopic: unknown): TopicEvaluation {
  const topic = TopicSchema.safeParse(requestedTopic);
  if (!topic.success) throw new TopicError("TOPIC_REJECTED");
  let context: TopicContext;
  try {
    context = parseTopicContext(value);
  } catch {
    throw new TopicError("INPUT_REJECTED");
  }
  const rules = TOPIC_RULES.filter((rule) => rule.topic === topic.data);
  const review = reviewEvidence(context, topic.data),
    entries = observations(context);
  const limitations: TopicLimitation[] = ["INTERPRETATION_CANDIDATE_ONLY", "EFFECT_NOT_ASSESSED"];
  if (context.facts.limitations.includes("MISSING_PILLARS")) limitations.push("MISSING_PILLARS");
  if (!context.facts.dayMaster) limitations.push("DAY_MASTER_UNKNOWN");
  if (review.some((entry) => entry.inputPath.startsWith("structure")))
    limitations.push("STRUCTURE_CONTEXT_UNCERTAIN");
  if (relevantConflicts(context, topic.data).length) limitations.push("RELATION_CONTEXT_CONFLICT");
  const findings: TopicFinding[] = [];
  for (const rule of rules) {
    const evidence = match(rule, context, entries, review);
    if (!evidence) continue;
    const guard = rule.condition.kind === "context-review";
    findings.push({
      findingId: `m03:${topic.data}:${rule.key}`,
      topic: topic.data,
      kind: guard ? "context-review" : "candidate",
      disposition: guard ? "review-required" : review.length ? "deferred" : "candidate",
      status: "partial",
      precision: "partial",
      assertion: rule.assertion,
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
      priority: rule.priority,
      sourceRefs: rule.sourceRefs,
      inputPaths: evidence.map((entry) => entry.inputPath),
      evidence,
      exceptionsApplied: limitations,
      caveats: [rule.adoption, rule.caveat],
      conflictingWith: [],
    });
  }
  const candidates = findings
    .filter((finding) => finding.kind === "candidate")
    .sort((a, b) => compareText(a.findingId, b.findingId));
  if (!candidates.length) limitations.push("NO_ADOPTED_PATTERN");
  const guard = findings.find((finding) => finding.kind === "context-review");
  const resolved = findings
    .map((finding) => ({
      ...finding,
      exceptionsApplied: limitations,
      conflictingWith:
        guard && candidates.length
          ? finding.kind === "candidate"
            ? [guard.findingId]
            : candidates.map((candidate) => candidate.findingId)
          : [],
    }))
    .sort((a, b) => b.priority - a.priority || compareText(a.findingId, b.findingId));
  const output = TopicEvaluationSchema.safeParse({
    moduleId: "M03",
    schemaVersion: "1.0.0",
    topic: topic.data,
    status: context.facts.dayMaster && findings.length ? "partial" : "unavailable",
    findings: resolved,
    evaluatedRuleIds: rules.map((rule) => rule.ruleId),
    conflicts:
      guard && candidates.length
        ? [
            {
              guardFindingId: guard.findingId,
              candidateFindingIds: candidates.map((candidate) => candidate.findingId),
              resolution: "defer-candidates",
            },
          ]
        : [],
    limitations,
    provenance: {
      ruleSetId: "m03.contextual-topics",
      rulesVersion: "1.0.0",
      sourceCatalogVersion: "1.0.0",
      factsSchemaVersion: context.facts.provenance.schemaVersion,
      structure: context.structure.ruleSet,
      relations: context.relations.ruleSet,
    },
  });
  if (!output.success) throw new TopicError("OUTPUT_INVALID");
  return output.data;
}
