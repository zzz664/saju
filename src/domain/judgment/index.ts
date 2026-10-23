import { z } from "zod";
import { DerivedNatalFactsSchema, type DerivedNatalFacts } from "@/domain/natal-facts";
import { BASE_RULE_CATALOG } from "@/domain/judgment/catalog";
import {
  CatalogBaseSchema,
  EvaluationBaseSchema,
  type Evidence,
  type RuleDefinition,
  type JudgmentCatalog,
} from "@/domain/judgment/schemas";
export { BASE_RULE_CATALOG } from "@/domain/judgment/catalog";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function canonical(catalog: JudgmentCatalog): string {
  return JSON.stringify({
    ...catalog,
    sources: [...catalog.sources].sort((a, b) => compare(a.id, b.id)),
    rules: [...catalog.rules].sort((a, b) => compare(a.ruleId, b.ruleId)),
  });
}
// This version permits ordering changes, not edits mislabeled as the reviewed 1.0.0 catalog.
export const JudgmentCatalogSchema = CatalogBaseSchema.refine(
  (value) => canonical(value) === canonical(BASE_RULE_CATALOG),
);
export const JudgmentEvaluationSchema = EvaluationBaseSchema.refine((value) => {
  const rules = new Map(BASE_RULE_CATALOG.rules.map((rule) => [rule.ruleId, rule]));
  const order = [...BASE_RULE_CATALOG.rules].sort(
    (a, b) => b.priority - a.priority || compare(a.ruleId, b.ruleId),
  );
  if (new Set(value.results.map((result) => result.ruleId)).size !== 20) return false;
  if (value.results.some((result, index) => result.ruleId !== order[index].ruleId)) return false;
  const known = Object.values(value.sourcePillars).filter((pillar) => pillar !== null).length;
  if (value.status !== (known === 4 ? "complete" : known === 0 ? "unavailable" : "partial"))
    return false;
  if (value.status === "complete" && value.results.some((result) => result.coverage !== "complete"))
    return false;
  if (
    value.status === "unavailable" &&
    value.results.some((result) => result.status !== "unavailable")
  )
    return false;
  for (const result of value.results) {
    const rule = rules.get(result.ruleId);
    if (
      !rule ||
      result.priority !== rule.priority ||
      JSON.stringify(result.sourceRefs) !== JSON.stringify(rule.sourceRefs) ||
      JSON.stringify(result.inputPaths) !== JSON.stringify(rule.inputPaths) ||
      JSON.stringify(result.caveats) !== JSON.stringify(rule.caveats) ||
      JSON.stringify(result.exceptionsDeclared) !== JSON.stringify(rule.exceptions) ||
      result.exceptionsApplied.some((exception) => !rule.exceptions.includes(exception))
    )
      return false;
    if (new Set(result.exceptionsApplied).size !== result.exceptionsApplied.length) return false;
    if (result.coverage === "complete" && result.exceptionsApplied.length !== 0) return false;
    if (
      result.coverage === "partial" &&
      JSON.stringify(result.exceptionsApplied) !== JSON.stringify(["INCOMPLETE_SEARCH_SCOPE"])
    )
      return false;
    if (result.coverage === "none" && result.exceptionsApplied.length === 0) return false;
    if (result.status === "matched" && result.evidence.length === 0) return false;
    if (result.status === "unavailable" ? result.coverage !== "none" : result.coverage === "none")
      return false;
  }
  const matched = value.results.filter((result) => result.status === "matched");
  return (
    matched.length === value.findings.length &&
    value.findings.every((finding, index) => {
      const result = matched[index],
        rule = rules.get(result.ruleId)!;
      const { findingId, assertion, precision, ...trace } = finding;
      const { status: ignoredStatus, coverage, ...resultTrace } = result;
      void ignoredStatus;
      return (
        findingId === `finding:${rule.ruleId}` &&
        assertion === rule.assertion &&
        precision === (coverage === "complete" ? "confirmed" : "partial") &&
        JSON.stringify(trace) === JSON.stringify(resultTrace)
      );
    })
  );
});
export type JudgmentEvaluation = z.infer<typeof JudgmentEvaluationSchema>;

/** Check every observed atom against the actual immutable facts, including array indices. */
export function evidenceMatchesFacts(
  facts: DerivedNatalFacts,
  evaluation: JudgmentEvaluation,
): boolean {
  if (
    evaluation.status !== facts.status ||
    JSON.stringify(evaluation.sourcePillars) !== JSON.stringify(facts.sourcePillars)
  )
    return false;
  return evaluation.results.every((result) =>
    result.evidence.every((entry) => {
      let current: unknown = facts;
      for (const field of entry.inputPath.split(".")) {
        if (current === null || typeof current !== "object") return false;
        current = (current as Record<string, unknown>)[field];
      }
      return current === entry.value;
    }),
  );
}

type Observation = { evidence: Evidence[]; missing: boolean };
const allPositions = ["year", "month", "day", "hour"] as const;
const visiblePositions = ["year", "month", "hour"] as const;
function visible(facts: DerivedNatalFacts, field: "stem" | "tenGod"): Observation {
  const evidence: Evidence[] = [];
  let missing = false;
  for (const position of visiblePositions) {
    const value = facts.positions[position]?.stem[field];
    if (value == null) missing = true;
    else evidence.push({ inputPath: `positions.${position}.stem.${field}`, value });
  }
  return { evidence, missing };
}
function concealed(facts: DerivedNatalFacts, field: "stem" | "tenGod"): Observation {
  const evidence: Evidence[] = [];
  let missing = false;
  for (const position of allPositions) {
    const branch = facts.positions[position]?.branch;
    if (!branch) {
      missing = true;
      continue;
    }
    branch.hiddenStems.forEach((entry, index) => {
      const value = entry[field];
      if (value == null) missing = true;
      else
        evidence.push({
          inputPath: `positions.${position}.branch.hiddenStems.${index}.${field}`,
          value,
        });
    });
  }
  return { evidence, missing };
}

function evaluate(rule: RuleDefinition, facts: DerivedNatalFacts) {
  const condition = rule.condition;
  const exceptionsApplied: RuleDefinition["exceptions"][number][] = [];
  const evidence: Evidence[] = [];
  let matched = false,
    missing = false,
    blocked = false;
  const needsMaster =
    condition.kind === "day-element" ||
    condition.kind === "exact-hidden-root" ||
    condition.kind === "visible-family" ||
    condition.kind === "coexistence";
  const needsMonth = condition.kind === "month-season" || condition.kind === "month-exposure";
  if (needsMaster && facts.dayMaster === null) {
    exceptionsApplied.push("DAY_MASTER_UNKNOWN");
    blocked = true;
  }
  if (needsMonth && facts.positions.month === null) {
    exceptionsApplied.push("MONTH_PILLAR_UNKNOWN");
    blocked = true;
  }
  if (!blocked) {
    if (needsMaster) evidence.push({ inputPath: "dayMaster", value: facts.dayMaster! });
    switch (condition.kind) {
      case "day-element": {
        const value = facts.positions.day!.stem.element;
        evidence.push({ inputPath: "positions.day.stem.element", value });
        matched = value === condition.element;
        break;
      }
      case "month-season": {
        const value = facts.positions.month!.branch.branch;
        evidence.push({ inputPath: "positions.month.branch.branch", value });
        matched = condition.branches.includes(value);
        break;
      }
      case "exact-hidden-root": {
        const scope = concealed(facts, "stem");
        evidence.push(...scope.evidence);
        missing = scope.missing;
        matched = scope.evidence.some((entry) => entry.value === facts.dayMaster);
        break;
      }
      case "month-exposure": {
        const branch = facts.positions.month!.branch;
        const targets = branch.hiddenStems
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => entry.isMain === (condition.part === "main"));
        evidence.push({ inputPath: "positions.month.branch.branch", value: branch.branch });
        evidence.push(
          ...targets.map(({ entry, index }) => ({
            inputPath: `positions.month.branch.hiddenStems.${index}.stem`,
            value: entry.stem,
          })),
        );
        const scope = visible(facts, "stem");
        evidence.push(...scope.evidence);
        missing = targets.length > 0 && scope.missing;
        matched = targets.some(({ entry }) =>
          scope.evidence.some((target) => target.value === entry.stem),
        );
        break;
      }
      case "visible-family": {
        const scope = visible(facts, "tenGod");
        evidence.push(...scope.evidence);
        missing = scope.missing;
        matched = scope.evidence.some((entry) =>
          condition.tenGods.some((god) => god === entry.value),
        );
        break;
      }
      case "coexistence": {
        const surface = visible(facts, "tenGod"),
          hidden = concealed(facts, "tenGod");
        const observed = [...surface.evidence, ...hidden.evidence];
        evidence.push(...observed);
        missing = surface.missing || hidden.missing;
        matched =
          observed.some((entry) => entry.value === condition.left) &&
          observed.some((entry) => entry.value === condition.right);
        break;
      }
    }
  }
  if (missing) exceptionsApplied.push("INCOMPLETE_SEARCH_SCOPE");
  const unavailable = blocked || (!matched && missing);
  return {
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    sourceRefs: rule.sourceRefs,
    inputPaths: rule.inputPaths,
    priority: rule.priority,
    exceptionsDeclared: rule.exceptions,
    exceptionsApplied,
    evidence,
    caveats: rule.caveats,
    status: unavailable
      ? ("unavailable" as const)
      : matched
        ? ("matched" as const)
        : ("not-matched" as const),
    coverage: unavailable
      ? ("none" as const)
      : missing
        ? ("partial" as const)
        : ("complete" as const),
  };
}
const messages = {
  INPUT_REJECTED: "Judgment facts were rejected.",
  CATALOG_INVALID: "Judgment catalog is unsupported or unreviewed.",
  OUTPUT_INVALID: "Judgment output was invalid.",
} as const;
export class JudgmentError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "JudgmentError";
  }
}
export function evaluateBaseJudgments(
  value: unknown,
  rawCatalog: unknown = BASE_RULE_CATALOG,
): JudgmentEvaluation {
  const facts = DerivedNatalFactsSchema.safeParse(value);
  if (!facts.success) throw new JudgmentError("INPUT_REJECTED");
  const catalog = JudgmentCatalogSchema.safeParse(rawCatalog);
  if (!catalog.success) throw new JudgmentError("CATALOG_INVALID");
  const rules = [...catalog.data.rules].sort(
    (a, b) => b.priority - a.priority || compare(a.ruleId, b.ruleId),
  );
  const results = rules.map((rule) => evaluate(rule, facts.data));
  const findings = results.flatMap(({ status, coverage, ...trace }, index) =>
    status === "matched"
      ? [
          {
            ...trace,
            findingId: `finding:${trace.ruleId}`,
            assertion: rules[index].assertion,
            precision: coverage === "complete" ? "confirmed" : "partial",
          },
        ]
      : [],
  );
  const output = JudgmentEvaluationSchema.safeParse({
    status: facts.data.status,
    sourcePillars: facts.data.sourcePillars,
    results,
    findings,
    provenance: {
      ruleSetVersion: catalog.data.ruleSetVersion,
      sourceCatalogVersion: catalog.data.sourceCatalogVersion,
      factsSchemaVersion: facts.data.provenance.schemaVersion,
      libraryName: facts.data.provenance.library.libraryName,
      libraryVersion: facts.data.provenance.library.libraryVersion,
      scope: "base-structural-observations",
    },
  });
  if (!output.success || !evidenceMatchesFacts(facts.data, output.data))
    throw new JudgmentError("OUTPUT_INVALID");
  return output.data;
}
