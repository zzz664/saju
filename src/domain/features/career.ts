import { parseDerivedNatalFacts } from "@/domain/natal-facts";
import { FAMILY_GODS, TOPIC_RULES } from "@/domain/judgment/topics/catalog";
import {
  FeatureJudgmentSchema,
  type FeatureJudgment,
  type Subject,
} from "@/domain/features/schemas";

export const CAREER_VERSION = "1.0.0";
const reviewQuestions: Readonly<Record<string, string>> = Object.freeze({
  "authority-resource":
    "절차·책임을 이해하고 자료를 학습해 업무에 적용하는 방식이 편한지 실제 경험·교육·업무 조건과 대조해 볼 수 있다.",
  "output-wealth":
    "산출물·의사표현을 일정·비용·자원 관리와 연결하는 방식이 편한지 실제 경험·교육·업무 조건과 대조해 볼 수 있다.",
});

/** Confirm existing symbols only; work-review directions never certify aptitude or hiring outcomes. */
export function observeCareer(
  value: unknown,
  subject: Subject = "primary",
): readonly FeatureJudgment[] {
  const facts = parseDerivedNatalFacts(value),
    month = facts.positions.month?.branch;
  if (!facts.dayMaster || !month) return Object.freeze([]);
  const common = {
    originModule: "M03" as const,
    subject,
    topic: "career" as const,
    status: "complete" as const,
    precision: "confirmed" as const,
    disposition: "accepted" as const,
    ruleVersion: CAREER_VERSION,
    exceptionsApplied: facts.limitations,
    caveats: [
      "확정은 관측 기호에만 적용한다. 업무 점검 방향은 구현 정책이며 특정 직업의 적합도·능력·채용·승진·소득·성공을 판정하지 않는다.",
      "단일 십성·오행·개수·성별로 적성이나 직업을 정하지 않는다. 실제 경험·교육·희망·근무 조건을 함께 검토해야 한다.",
      "강약·격국·관계 효과와 해석 후보는 미확정이며 미상 기둥을 추정하지 않는다. 과학적 적성 검사나 전문가 승인이 아니다.",
    ],
  };
  const findings: FeatureJudgment[] = [
    FeatureJudgmentSchema.parse({
      ...common,
      judgmentId: `${subject}:M03:f04:natal-context`,
      ruleId: "f04.observation.natal-context",
      assertion: `확정 일간은 ${facts.dayMaster}이고 월지는 ${month.branch}, 월지 본기는 ${month.mainStem}(${month.tenGod})이다. 업무 성향 검토의 원국 배경으로만 사용하며 이 기호로 직업이나 적성을 확정하지 않는다.`,
      sourceRefs: [facts.provenance.tenGods.sourceRef, facts.provenance.hiddenStems.sourceRef],
      evidence: [
        { inputPath: "facts.dayMaster", value: facts.dayMaster },
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
  for (const rule of TOPIC_RULES.filter((rule) => rule.topic === "career")) {
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
        judgmentId: `${subject}:M03:f04:${rule.key}`,
        ruleId: `f04.observation.${rule.key}`,
        assertion: `${selected.map((entry) => entry!.value).join("·")} 기호가 서로 다른 두 십성군의 단서로 함께 관측된다. ${question} 이는 특정 직업 추천이나 적성·성과의 확정이 아니다.`,
        sourceRefs: [
          facts.provenance.tenGods.sourceRef,
          ...rule.sourceRefs,
          "policy:f04-work-review-v1",
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
