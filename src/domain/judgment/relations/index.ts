import { compareText, defineCodedError } from "@/domain/utilities";
import {
  DEFAULT_RELATION_RULE_SET,
  RELATION_RULES,
  type RelationRule,
} from "@/domain/judgment/relations/catalog";
import {
  RelationAnalysisSchema,
  RelationInputSchema,
  RelationRuleSetSchema,
  type RelationAnalysis,
  type RelationRuleSet,
  type GanjiRelation,
  type RelationLimitation,
  type PillarReference,
} from "@/domain/judgment/relations/schemas";

export * from "@/domain/judgment/relations/schemas";
export {
  DEFAULT_RELATION_RULE_SET,
  RELATION_RULES,
  RELATION_SOURCES,
} from "@/domain/judgment/relations/catalog";
export class RelationError extends defineCodedError("RelationError", {
  INPUT_REJECTED: "Relation input was rejected.",
  RULE_SET_REJECTED: "Relation rule set was rejected.",
  OUTPUT_INVALID: "Relation output failed validation.",
}) {}

function adopted(rule: RelationRule, policy: RelationRuleSet): boolean {
  switch (rule.policy) {
    case "always":
      return true;
    case "stem-clash":
      return policy.stemClash === "four-pairs";
    case "punishment-pair":
      return policy.punishment === "pairwise";
    case "punishment-group":
      return policy.punishment === "full-group";
  }
}

// Distinct references; equal glyphs can repeat only as often as they occur in the input.
function matches(rule: RelationRule, refs: readonly PillarReference[]): PillarReference[][] {
  const result: PillarReference[][] = [];
  function visit(start: number, chosen: PillarReference[]) {
    if (chosen.length === rule.symbols.length) {
      const symbols = chosen.map((ref) => ref.pillar![rule.layer]).sort(compareText);
      if (symbols.every((symbol, index) => symbol === sortedSymbols[index])) result.push(chosen);
      return;
    }
    for (let index = start; index <= refs.length - (rule.symbols.length - chosen.length); index++) {
      const ref = refs[index];
      if (ref.pillar && rule.symbols.includes(ref.pillar[rule.layer]))
        visit(index + 1, [...chosen, ref]);
    }
  }
  const sortedSymbols = [...rule.symbols].sort(compareText);
  visit(0, []);
  return result;
}

function conflictsFor(
  pillars: readonly PillarReference[],
  relations: readonly GanjiRelation[],
): RelationAnalysis["conflicts"] {
  const conflicts: RelationAnalysis["conflicts"][number][] = [];
  for (const ref of pillars)
    for (const layer of ["stem", "branch"] as const) {
      const related = relations.filter(
        (relation) =>
          relation.relationType.startsWith(layer + "-") &&
          relation.participants.includes(ref.referenceId),
      );
      const combinations = related.filter((relation) =>
        relation.relationType.endsWith("combination"),
      );
      const opposition = related.filter(
        (relation) => !relation.relationType.endsWith("combination"),
      );
      if (combinations.length && opposition.length)
        conflicts.push({
          conflictId: `m02:coexist:${layer}:${ref.referenceId}`,
          referenceId: ref.referenceId,
          reason: "COMBINATION_WITH_OPPOSITION",
          relationIds: related.map((relation) => relation.relationId),
          resolution: "unresolved",
        });
      // Same relation kind with different partners is retained, never greedily consumed.
      if (
        combinations.some(
          (relation) =>
            combinations.filter((other) => other.relationType === relation.relationType).length > 1,
        )
      )
        conflicts.push({
          conflictId: `m02:partners:${layer}:${ref.referenceId}`,
          referenceId: ref.referenceId,
          reason: "MULTIPLE_COMBINATION_PARTNERS",
          relationIds: combinations.map((relation) => relation.relationId),
          resolution: "unresolved",
        });
    }
  return conflicts.sort((a, b) => compareText(a.conflictId, b.conflictId));
}

/** Occurrences within supplied scope only. No transformation, strength, timing or event inference. */
export function analyzeRelations(
  value: unknown,
  selector: unknown = DEFAULT_RELATION_RULE_SET,
): RelationAnalysis {
  const input = RelationInputSchema.safeParse(value);
  if (!input.success) throw new RelationError("INPUT_REJECTED");
  const policy = RelationRuleSetSchema.safeParse(selector);
  if (!policy.success) throw new RelationError("RULE_SET_REJECTED");
  const pillars = [...input.data].sort((a, b) => compareText(a.referenceId, b.referenceId));
  const missingReferenceIds = pillars
    .filter((ref) => ref.pillar === null)
    .map((ref) => ref.referenceId);
  const knownPillars = pillars.length - missingReferenceIds.length;
  const limitations: RelationLimitation[] = [
    "EFFECT_NOT_ASSESSED",
    "TRANSFORMATION_NOT_ASSESSED",
    "ADJACENCY_NOT_ASSESSED",
  ];
  if (missingReferenceIds.length) limitations.push("MISSING_PILLARS");
  if (policy.data.stemClash === "not-adopted") limitations.push("STEM_CLASH_NOT_ADOPTED");
  if (policy.data.punishment === "full-group") limitations.push("FULL_GROUP_PUNISHMENT_POLICY");
  const relations: GanjiRelation[] = [];
  for (const rule of RELATION_RULES) {
    if (!adopted(rule, policy.data)) continue;
    for (const refs of matches(rule, pillars)) {
      const evidence = refs.map((ref) => ({
        referenceId: ref.referenceId,
        inputPath: `pillars.${pillars.indexOf(ref)}.pillar.${rule.layer}`,
        symbol: ref.pillar![rule.layer],
      }));
      relations.push({
        relationId: `${rule.ruleId}|${refs.map((ref) => ref.referenceId).join("|")}`,
        relationType: rule.relationType,
        participants: refs.map((ref) => ref.referenceId),
        status: "complete",
        precision: "confirmed",
        ruleId: rule.ruleId,
        ruleVersion: rule.ruleVersion,
        priority: rule.priority,
        sourceRefs: rule.sourceRefs,
        inputPaths: evidence.map((entry) => entry.inputPath),
        evidence,
        elementAssociation: rule.elementAssociation,
        effect: { status: "unavailable", intensity: null, transformation: "not-assessed" },
        exceptionsApplied: limitations,
        caveats: [rule.caveat, rule.adoption],
      });
    }
  }
  relations.sort((a, b) => compareText(a.relationId, b.relationId));
  const result = RelationAnalysisSchema.safeParse({
    moduleId: "M02",
    schemaVersion: "1.0.0",
    status: knownPillars ? "partial" : "unavailable",
    ruleSet: policy.data,
    pillars,
    coverage: {
      status: !knownPillars ? "unavailable" : missingReferenceIds.length ? "partial" : "complete",
      knownPillars,
      missingReferenceIds,
    },
    relations,
    conflicts: conflictsFor(pillars, relations),
    limitations,
    provenance: { rulesVersion: "1.0.0", sourceCatalogVersion: "1.0.0" },
  });
  if (!result.success) throw new RelationError("OUTPUT_INVALID");
  return result.data;
}
