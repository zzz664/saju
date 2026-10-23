import { parseDerivedNatalFacts } from "@/domain/natal-facts";
import { FAMILY_GODS, TOPIC_RULES } from "@/domain/judgment/topics/catalog";
import {
  FeatureJudgmentSchema,
  type FeatureJudgment,
  type Subject,
} from "@/domain/features/schemas";

export const TEMPERAMENT_VERSION = "1.0.0";
const reviewQuestions: Readonly<Record<string, string>> = Object.freeze({
  "resource-output":
    "새 정보를 받아들이고 자신의 말로 설명할 때 어떤 순서와 속도가 편한지 실제 경험과 대조해 볼 수 있다.",
  "peer-authority":
    "자기기준과 공동의 역할·규칙을 조율할 때 어떤 방식이 편한지 실제 경험과 대조해 볼 수 있다.",
});

/** F02 confirms symbolic observations only; the existing M03 temperament candidates remain tentative. */
export function observeTemperament(
  value: unknown,
  subject: Subject = "primary",
): readonly FeatureJudgment[] {
  const facts = parseDerivedNatalFacts(value);
  const month = facts.positions.month?.branch;
  if (!facts.dayMaster || !month) return Object.freeze([]);
  const common = {
    originModule: "M03" as const,
    subject,
    topic: "temperament" as const,
    status: "complete" as const,
    precision: "confirmed" as const,
    disposition: "accepted" as const,
    ruleVersion: TEMPERAMENT_VERSION,
    exceptionsApplied: facts.limitations,
    caveats: [
      "확정은 관측 기호에만 적용한다. 점검 방향은 구현 정책이며 실제 성격·기질·능력이나 정신건강을 판정하지 않는다.",
      "단일 오행·십성·성별·개수로 성향을 정하지 않는다. 강약·관법·관계의 해석 효과와 미상 기둥은 추정하지 않는다.",
    ],
  };
  const findings: FeatureJudgment[] = [
    FeatureJudgmentSchema.parse({
      ...common,
      judgmentId: `${subject}:M03:f02:natal-context`,
      ruleId: "f02.observation.natal-context",
      assertion: `확정 일간은 ${facts.dayMaster}(${facts.positions.day!.stem.element})이고 월지는 ${month.branch}, 월지 본기는 ${month.mainStem}(${month.tenGod})이다. 일간·월지의 기호는 기질 검토의 배경이며 이 값만으로 실제 성격을 단정하지 않는다.`,
      sourceRefs: [
        facts.provenance.elements.sourceRef,
        facts.provenance.tenGods.sourceRef,
        facts.provenance.hiddenStems.sourceRef,
      ],
      evidence: [
        { inputPath: "facts.dayMaster", value: facts.dayMaster },
        { inputPath: "facts.positions.day.stem.element", value: facts.positions.day!.stem.element },
        { inputPath: "facts.positions.month.branch.branch", value: month.branch },
        { inputPath: "facts.positions.month.branch.mainStem", value: month.mainStem },
        { inputPath: "facts.positions.month.branch.tenGod", value: month.tenGod! },
      ],
    }),
  ];
  const entries: { inputPath: string; value: string }[] = [];
  for (const position of ["year", "month", "day", "hour"] as const) {
    const fact = facts.positions[position];
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
  // Reuse the adopted M03 family-pair definitions instead of inventing a second temperament taxonomy.
  for (const rule of TOPIC_RULES.filter((rule) => rule.topic === "temperament")) {
    if (rule.condition.kind !== "family-pair") continue;
    const question = reviewQuestions[rule.key];
    if (!question) continue;
    const selected = rule.condition.families.map((family) =>
      entries.find((entry) => FAMILY_GODS[family].some((god) => god === entry.value)),
    );
    if (selected.some((entry) => !entry)) continue;
    findings.push(
      FeatureJudgmentSchema.parse({
        ...common,
        judgmentId: `${subject}:M03:f02:${rule.key}`,
        ruleId: `f02.observation.${rule.key}`,
        assertion: `${selected.map((entry) => entry!.value).join("·")} 기호가 서로 다른 두 십성군의 단서로 함께 관측된다. ${question} 이 점검은 실제 성향의 확정이나 반대 성향의 배제가 아니다.`,
        sourceRefs: [
          facts.provenance.tenGods.sourceRef,
          ...rule.sourceRefs,
          "policy:f02-review-questions-v1",
        ],
        evidence: [
          ...(selected as { inputPath: string; value: string }[]),
          { inputPath: "facts.dayMaster", value: facts.dayMaster },
          { inputPath: "facts.positions.month.branch.branch", value: month.branch },
        ],
      }),
    );
  }
  return Object.freeze(findings);
}
