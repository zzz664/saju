import { parseDerivedNatalFacts, type DerivedNatalFacts } from "@/domain/natal-facts";
import { defineCodedError } from "@/domain/utilities";
import { deepEqualCanonical } from "@/domain/json";
import { DEFAULT_STRUCTURE_RULE_SET, STRUCTURE_RULES } from "@/domain/judgment/structure/catalog";
import {
  MethodSchema,
  PositionSchema,
  StructureDiagnosisSchema,
  StructureRuleSetSchema,
  type StructureDiagnosis,
  type StructureFacts,
  type StructureJudgment,
  type Method,
  type Evidence,
  type Limitation,
  type Candidate,
} from "@/domain/judgment/structure/schemas";

export * from "@/domain/judgment/structure/schemas";
export {
  DEFAULT_STRUCTURE_RULE_SET,
  STRUCTURE_RULES,
  STRUCTURE_SOURCES,
} from "@/domain/judgment/structure/catalog";

export class StructureError extends defineCodedError("StructureError", {
  INPUT_REJECTED: "Structure facts were rejected.",
  RULE_SET_REJECTED: "Structure rule set was rejected.",
  OUTPUT_INVALID: "Structure diagnosis failed validation.",
}) {}

type Element = NonNullable<StructureFacts["dayElement"]>;
type Topic = StructureJudgment["topic"];
type Value = StructureJudgment["value"];
const verifiedStructures = new WeakMap<StructureDiagnosis, DerivedNatalFacts>();

/** Trusted immutable results are reused; external JSON is checked against its original facts. */
export function parseStructureDiagnosis(
  facts: DerivedNatalFacts,
  value: unknown,
): StructureDiagnosis {
  const original =
    value && typeof value === "object"
      ? verifiedStructures.get(value as StructureDiagnosis)
      : undefined;
  if (original && deepEqualCanonical(original, facts)) return value as StructureDiagnosis;
  const parsed = StructureDiagnosisSchema.safeParse(value);
  if (!parsed.success) throw new StructureError("INPUT_REJECTED");
  const expected = diagnoseStructure(facts, parsed.data.ruleSet);
  if (!deepEqualCanonical(parsed.data, expected)) throw new StructureError("INPUT_REJECTED");
  return expected;
}
const generates: Record<Element, Element> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const controls: Record<Element, Element> = { 목: "토", 화: "금", 토: "수", 금: "목", 수: "화" };
const seasonal: Record<NonNullable<StructureFacts["month"]>["branch"], Element> = {
  인: "목",
  묘: "목",
  진: "목",
  사: "화",
  오: "화",
  미: "화",
  신: "금",
  유: "금",
  술: "금",
  해: "수",
  자: "수",
  축: "수",
};
const visible = ["year", "month", "hour"] as const;

function project(facts: DerivedNatalFacts): StructureFacts {
  const dayElement = facts.positions.day?.stem.element ?? null;
  const missingPositions = PositionSchema.options.filter(
    (position) => facts.positions[position] === null,
  );
  const month = facts.positions.month?.branch;
  const roots: StructureFacts["roots"]["exact"][number][] = [];
  const exposures: StructureFacts["exposures"][number][] = [];
  for (const position of PositionSchema.options) {
    facts.positions[position]?.branch.hiddenStems.forEach((hidden, hiddenIndex) => {
      if (hidden.element === dayElement)
        roots.push({
          position,
          hiddenIndex,
          stem: hidden.stem,
          element: hidden.element,
          isMain: hidden.isMain,
        });
      for (const visiblePosition of visible) {
        if (hidden.stem === facts.positions[visiblePosition]?.stem.stem)
          exposures.push({
            branchPosition: position,
            hiddenIndex,
            stem: hidden.stem,
            visiblePosition,
          });
      }
    });
  }
  return {
    sourcePillars: facts.sourcePillars,
    dayMaster: facts.dayMaster,
    dayElement,
    month: month
      ? {
          branch: month.branch,
          mainStem: month.mainStem,
          mainElement: month.hiddenStems[0].element,
          mainTenGod: month.tenGod,
          seasonalElement: seasonal[month.branch],
        }
      : null,
    roots: {
      status:
        dayElement === null ? "unavailable" : missingPositions.length ? "partial" : "complete",
      exact: roots.filter((root) => root.stem === facts.dayMaster),
      sameElement: roots,
    },
    exposures,
    missingPositions,
  };
}

function collectEvidence(facts: DerivedNatalFacts): Evidence[] {
  const evidence: Evidence[] = [{ inputPath: "dayMaster", value: facts.dayMaster ?? "unknown" }];
  for (const position of PositionSchema.options) {
    const fact = facts.positions[position];
    if (!fact) {
      evidence.push({ inputPath: `positions.${position}`, value: "unknown" });
      continue;
    }
    evidence.push({ inputPath: `positions.${position}.stem.stem`, value: fact.stem.stem });
    evidence.push({ inputPath: `positions.${position}.branch.branch`, value: fact.branch.branch });
    if (position !== "day")
      evidence.push({
        inputPath: `positions.${position}.stem.tenGod`,
        value: fact.stem.tenGod ?? "unknown",
      });
    fact.branch.hiddenStems.forEach((hidden, index) => {
      evidence.push({
        inputPath: `positions.${position}.branch.hiddenStems.${index}.stem`,
        value: hidden.stem,
      });
      evidence.push({
        inputPath: `positions.${position}.branch.hiddenStems.${index}.tenGod`,
        value: hidden.tenGod ?? "unknown",
      });
    });
  }
  return evidence;
}

function season(day: Element | null, dominant: Element | undefined): Value {
  if (!day || !dominant) return "unknown";
  if (dominant === day) return "旺";
  if (generates[dominant] === day) return "相";
  if (generates[day] === dominant) return "休";
  if (controls[day] === dominant) return "囚";
  return "死";
}

/** Pure, conservative policy: observed evidence and candidates, never a final strength score. */
export function diagnoseStructure(
  value: unknown,
  selector: unknown = DEFAULT_STRUCTURE_RULE_SET,
): StructureDiagnosis {
  let facts: DerivedNatalFacts;
  try {
    facts = parseDerivedNatalFacts(value);
  } catch {
    throw new StructureError("INPUT_REJECTED");
  }
  const selected = StructureRuleSetSchema.safeParse(selector);
  if (!selected.success) throw new StructureError("RULE_SET_REJECTED");
  const ruleSet = {
    ...selected.data,
    methods: MethodSchema.options.filter((method) => selected.data.methods.includes(method)),
  };
  const projected = project(facts),
    evidence = collectEvidence(facts);
  const limitations: Limitation[] = [];
  if (!facts.dayMaster) limitations.push("DAY_MASTER_UNKNOWN");
  if (!projected.month) limitations.push("MONTH_PILLAR_UNKNOWN");
  if (projected.missingPositions.length) limitations.push("MISSING_PILLARS");
  limitations.push("RELATIONS_NOT_ASSESSED", "STRENGTH_CANDIDATE_ONLY", "PATTERN_CANDIDATE_ONLY");
  const climateAdopted = facts.dayMaster === "갑" && projected.month?.branch === "인";
  if (!climateAdopted) limitations.push("CLIMATE_RULE_NOT_ADOPTED");
  const judgments: StructureJudgment[] = [],
    patternCandidates: Candidate[] = [],
    usefulGodCandidates: Candidate[] = [];
  const allKnown = projected.missingPositions.length === 0;
  const gods = [
    ...visible.map((position) => facts.positions[position]?.stem.tenGod),
    ...PositionSchema.options.flatMap(
      (position) =>
        facts.positions[position]?.branch.hiddenStems.map((hidden) => hidden.tenGod) ?? [],
    ),
  ].filter((god) => god != null && god !== "일간");
  const helpers = gods.some((god) => ["비견", "겁재", "정인", "편인"].includes(god));
  const adverse = gods.some((god) => !["비견", "겁재", "정인", "편인"].includes(god));

  function judgment(
    method: Method,
    topic: Topic,
    value: Value,
    assertion: string,
    confirmed = false,
  ) {
    const rule = STRUCTURE_RULES.find((rule) => rule.topic === topic)!;
    const unknown = value === "unknown" || value === "undetermined" || value === "not-adopted";
    const result: StructureJudgment = {
      judgmentId: `m01:${method}:${topic}`,
      topic,
      methodId: method,
      value,
      status: unknown ? "unavailable" : confirmed ? "complete" : "partial",
      precision: unknown ? "unknown" : confirmed ? "confirmed" : "partial",
      assertion,
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
      priority: rule.priority,
      sourceRefs: rule.sourceRefs,
      inputPaths: rule.inputPaths,
      evidence,
      exceptionsApplied: limitations.slice(),
      caveats: [rule.caveat],
    };
    judgments.push(result);
    return result.judgmentId;
  }

  for (const method of ruleSet.methods) {
    const month = projected.month;
    const seasonalState = season(
      projected.dayElement,
      method === "four-season-exact-root" ? month?.seasonalElement : month?.mainElement,
    );
    judgment(
      method,
      "season",
      seasonalState,
      `채택한 월령 분류의 일간 상태: ${seasonalState}. 일별 사령이나 최종 강약이 아니다.`,
      seasonalState !== "unknown",
    );
    const roots =
      method === "four-season-exact-root" ? projected.roots.exact : projected.roots.sameElement;
    const rootValue = !facts.dayMaster
      ? "unknown"
      : roots.length
        ? "observed"
        : allKnown
          ? "not-observed"
          : "unknown";
    judgment(
      method,
      "root",
      rootValue,
      `해당 관법의 장간 통근: ${rootValue}. 위치와 본기 여부는 facts.roots에서 보존한다.`,
      rootValue !== "unknown",
    );
    const exposed = projected.exposures.length > 0;
    const exposureValue = exposed ? "observed" : allKnown ? "not-observed" : "unknown";
    judgment(
      method,
      "exposure",
      exposureValue,
      `연·월·시간으로의 동일 장간 투출: ${exposureValue}. 일간 자신은 제외한다.`,
      exposureValue !== "unknown",
    );
    let strength: Value = "undetermined";
    if (facts.dayMaster && month) {
      const support = ["旺", "相"].includes(seasonalState) || roots.length > 0 || helpers;
      const opposition = ["囚", "死"].includes(seasonalState) || adverse;
      if (support && opposition) strength = "mixed";
      else if (
        allKnown &&
        ["旺", "相"].includes(seasonalState) &&
        roots.length > 0 &&
        helpers &&
        !adverse
      )
        strength = "strong-candidate";
      else if (
        allKnown &&
        ["囚", "死"].includes(seasonalState) &&
        roots.length === 0 &&
        !helpers &&
        adverse
      )
        strength = "weak-candidate";
    }
    judgment(
      method,
      "strength",
      strength,
      `월령·통근·천간/장간 인비·설극을 결합한 보수적 후보: ${strength}. 합충·합화와 전체 격국 성패는 미평가다.`,
    );

    const patternId = judgment(
      method,
      "pattern",
      facts.dayMaster && month ? "candidate" : "unknown",
      "월지 본기 또는 투출 장간의 십성 후보다. 건록·양인·성격·파격을 확정하지 않는다.",
    );
    if (facts.dayMaster && month) {
      const hidden = facts.positions.month!.branch.hiddenStems;
      const exposedHidden = hidden.filter((entry) =>
        projected.exposures.some(
          (exposure) => exposure.branchPosition === "month" && exposure.stem === entry.stem,
        ),
      );
      const targets =
        method === "month-qi-element-root" && exposedHidden.length ? exposedHidden : [hidden[0]];
      for (const target of targets) {
        const index = hidden.indexOf(target);
        const basis =
          method === "month-qi-element-root" && exposedHidden.length
            ? "exposed-month-hidden"
            : "month-main";
        const candidateEvidence: Evidence[] = [
          { inputPath: `positions.month.branch.hiddenStems.${index}.stem`, value: target.stem },
          { inputPath: "dayMaster", value: facts.dayMaster },
        ];
        if (basis === "exposed-month-hidden") {
          const exposure = projected.exposures.find(
            (exposure) => exposure.branchPosition === "month" && exposure.stem === target.stem,
          )!;
          candidateEvidence.push({
            inputPath: `positions.${exposure.visiblePosition}.stem.stem`,
            value: target.stem,
          });
        }
        for (const purpose of ["pattern", "month-order"] as const) {
          const candidate: Candidate = {
            candidateId: `m01:${method}:${purpose}:${target.stem}`,
            methodId: method,
            purpose,
            targetStem: target.stem,
            tenGod: target.tenGod === "일간" ? null : target.tenGod,
            basis,
            precision: "partial",
            judgmentId: patternId,
            evidence: candidateEvidence,
          };
          (purpose === "pattern" ? patternCandidates : usefulGodCandidates).push(candidate);
        }
      }
    }
    const climateId = judgment(
      method,
      "climate",
      climateAdopted ? "candidate" : "not-adopted",
      climateAdopted
        ? "갑·인월의 조후 검토 대상으로 병·계를 제시한다. 전역 용신이나 실제 기온 판단이 아니다."
        : "이 일간·월지 조합의 조후 규칙은 v1에서 채택하지 않았다.",
    );
    if (climateAdopted) {
      for (const targetStem of ["병", "계"] as const)
        usefulGodCandidates.push({
          candidateId: `m01:${method}:climate:${targetStem}`,
          methodId: method,
          purpose: "climate",
          targetStem,
          tenGod: targetStem === "병" ? "식신" : "정인",
          basis: "jia-yin-climate",
          precision: "partial",
          judgmentId: climateId,
          evidence: [
            { inputPath: "dayMaster", value: "갑" },
            { inputPath: "positions.month.branch.branch", value: "인" },
          ],
        });
    }
  }
  const conflicts: StructureDiagnosis["conflicts"][number][] = [];
  for (const topic of ["season", "root", "exposure", "strength", "pattern", "climate"] as const) {
    const related = judgments.filter((judgment) => judgment.topic === topic);
    if (related.length !== 2) continue;
    const patternDiffers =
      topic === "pattern" &&
      ruleSet.methods
        .map((method) =>
          patternCandidates
            .filter((candidate) => candidate.methodId === method)
            .map((candidate) => candidate.targetStem)
            .join(","),
        )
        .some((key, index, keys) => index > 0 && key !== keys[0]);
    if (related[0].value !== related[1].value || patternDiffers)
      conflicts.push({
        conflictId: `m01:conflict:${topic}`,
        topic,
        judgmentIds: related.map((judgment) => judgment.judgmentId),
        reason: "METHOD_DISAGREEMENT",
        resolution: "unresolved",
      });
  }
  if (conflicts.length) limitations.push("METHOD_DISAGREEMENT");
  const output = StructureDiagnosisSchema.safeParse({
    moduleId: "M01",
    schemaVersion: "1.0.0",
    status: PositionSchema.options.every((position) => facts.positions[position] === null)
      ? "unavailable"
      : "partial",
    ruleSet,
    facts: projected,
    judgments,
    conflicts,
    patternCandidates,
    usefulGodCandidates,
    limitations,
    provenance: {
      rulesVersion: "1.0.0",
      sourceCatalogVersion: "1.0.0",
      facts: {
        schemaVersion: facts.provenance.schemaVersion,
        hiddenStemConvention: facts.provenance.hiddenStemConvention,
      },
    },
  });
  if (!output.success) throw new StructureError("OUTPUT_INVALID");
  verifiedStructures.set(output.data, facts);
  return output.data;
}
