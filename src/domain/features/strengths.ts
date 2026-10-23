import { parseDerivedNatalFacts } from "@/domain/natal-facts";
import { FAMILY_GODS } from "@/domain/judgment/topics/catalog";
import {
  FeatureJudgmentSchema,
  type FeatureJudgment,
  type Subject,
} from "@/domain/features/schemas";

export const STRENGTHS_VERSION = "1.0.0";
// These are review questions, not validated personality/ability conclusions.
export const STRENGTHS_REVIEW_PAIRS = Object.freeze([
  Object.freeze({
    key: "resource-output",
    families: Object.freeze(["resource", "output"] as const),
    observation: "인성과 식상",
    strength: "배운 내용을 정리해 표현하는 장면이 있는가",
    weakness: "준비와 표현·실행의 균형을 점검할 필요가 있는가",
  }),
  Object.freeze({
    key: "authority-resource",
    families: Object.freeze(["authority", "resource"] as const),
    observation: "관살과 인성",
    strength: "역할을 이해하고 필요한 자료·지원을 활용하는 장면이 있는가",
    weakness: "역할의 요구와 자신의 학습 속도를 조율할 필요가 있는가",
  }),
]);

/** M03 strengths projection: confirm observed symbols only; preserve tentative trait findings separately. */
export function observeStrengths(
  value: unknown,
  subject: Subject = "primary",
): readonly FeatureJudgment[] {
  const facts = parseDerivedNatalFacts(value);
  if (!facts.dayMaster || !facts.positions.month) return Object.freeze([]);
  const findings: FeatureJudgment[] = [];
  const common = {
    originModule: "M03" as const,
    subject,
    topic: "strengths" as const,
    status: "complete" as const,
    precision: "confirmed" as const,
    disposition: "accepted" as const,
    ruleVersion: STRENGTHS_VERSION,
    caveats: [
      "확정은 관측 사실에만 적용한다. 실제 강점·약점은 행동·경험과 대조해야 하며 기호의 개수·성별로 판단하지 않는다.",
      "강약·격국·합화의 실효성은 확정하지 않는다. 검토 질문은 구현 정책이며 전문가 승인이나 과학적 능력 평가가 아니다.",
    ],
    exceptionsApplied: facts.limitations,
  };
  for (const unit of ["surface", "hidden"] as const) {
    const counts = facts.distribution[unit];
    const summary = Object.entries(counts)
      .map(([element, count]) => `${element} ${count}`)
      .join("·");
    const key = `elements-${unit}`;
    findings.push(
      FeatureJudgmentSchema.parse({
        ...common,
        judgmentId: `${subject}:M03:f03:${key}`,
        ruleId: `f03.observation.${key}`,
        assertion: `${unit === "surface" ? "확정된 겉글자" : "확정된 지지의 지장간 출현"}의 오행 개수는 ${summary}이다. 두 집계는 단위가 달라 합산하지 않는다. 많거나 적다는 이유로 강점·약점이나 오행의 강약을 정하지 않는다. 시주 미상은 집계에서 제외한다.`,
        sourceRefs: [
          "policy:separate-unit-occurrences",
          facts.provenance.elements.sourceRef,
          ...(unit === "hidden" ? [facts.provenance.hiddenStems.sourceRef] : []),
        ],
        evidence: Object.entries(counts).map(([element, count]) => ({
          inputPath: `facts.distribution.${unit}.${element}`,
          value: String(count),
        })),
      }),
    );
  }
  const entries: { inputPath: string; value: string; element: string; elementPath: string }[] = [];
  for (const position of ["year", "month", "day", "hour"] as const) {
    const fact = facts.positions[position];
    if (!fact) continue;
    if (position !== "day" && fact.stem.tenGod)
      entries.push({
        inputPath: `facts.positions.${position}.stem.tenGod`,
        value: fact.stem.tenGod,
        element: fact.stem.element,
        elementPath: `facts.positions.${position}.stem.element`,
      });
    fact.branch.hiddenStems.forEach((hidden, index) => {
      if (hidden.tenGod)
        entries.push({
          inputPath: `facts.positions.${position}.branch.hiddenStems.${index}.tenGod`,
          value: hidden.tenGod,
          element: hidden.element,
          elementPath: `facts.positions.${position}.branch.hiddenStems.${index}.element`,
        });
    });
  }
  for (const pair of STRENGTHS_REVIEW_PAIRS) {
    const selected = pair.families.map((family) =>
      entries.find((entry) => FAMILY_GODS[family].some((god) => god === entry.value)),
    );
    if (selected.some((entry) => !entry)) continue;
    findings.push(
      FeatureJudgmentSchema.parse({
        ...common,
        judgmentId: `${subject}:M03:f03:${pair.key}`,
        ruleId: `f03.observation.${pair.key}`,
        assertion: `${pair.observation} 단서가 함께 관측된다. 강점 점검 질문은 '${pair.strength}'이며 보완점 점검 질문은 '${pair.weakness}'이다. 질문은 조건부 검토 방향이며 실제 능력·약점 판정이 아니다.`,
        sourceRefs: [facts.provenance.tenGods.sourceRef, "policy:f03-review-questions-v1"],
        evidence: [
          ...selected.flatMap((entry) => [
            { inputPath: entry!.inputPath, value: entry!.value },
            { inputPath: entry!.elementPath, value: entry!.element },
          ]),
          { inputPath: "facts.dayMaster", value: facts.dayMaster },
          {
            inputPath: "facts.positions.month.branch.branch",
            value: facts.positions.month.branch.branch,
          },
        ],
      }),
    );
  }
  return Object.freeze(findings);
}
