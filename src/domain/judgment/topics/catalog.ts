import { z } from "zod";
import { TenGodSchema } from "@/domain/contracts";
import { TopicSchema } from "@/domain/judgment/topics/schemas";

export const FAMILY_GODS = z
  .record(
    z.enum(["resource", "output", "authority", "wealth", "peer"]),
    z.array(TenGodSchema).length(2).readonly(),
  )
  .readonly()
  .parse({
    resource: ["정인", "편인"],
    output: ["식신", "상관"],
    authority: ["정관", "편관"],
    wealth: ["정재", "편재"],
    peer: ["비견", "겁재"],
  });
const family = z.enum(["resource", "output", "authority", "wealth", "peer"]);
export const TOPIC_SOURCES = z
  .array(
    z
      .strictObject({
        id: z.string(),
        work: z.string(),
        section: z.string(),
        url: z.url(),
        checkedAt: z.literal("2026-10-24"),
        limitation: z.string(),
      })
      .readonly(),
  )
  .readonly()
  .parse(
    [
      {
        id: "m03.smth-families",
        work: "삼명통회",
        section: "권5 논고인립인식관재명의",
        url: "https://zh.wikisource.org/wiki/三命通會/卷五",
      },
      {
        id: "m03.smth-context",
        work: "삼명통회",
        section: "권5 인·식·관·재의 생극제화 맥락",
        url: "https://zh.wikisource.org/wiki/三命通會/卷五",
      },
      {
        id: "m03.smth-relations",
        work: "삼명통회",
        section: "권2 지원육합/삼형/충격의 글자 관계",
        url: "https://zh.wikisource.org/wiki/三命通會/卷二",
      },
    ].map((source) => ({
      ...source,
      checkedAt: "2026-10-24",
      limitation:
        "원전 전사의 기호 분류·복합 맥락만 참조한다. 현대 주제 문구는 구현 정책이며 고전 성격 알고리즘·전문가 승인·과학적 예측 인증이 아니다. 성별 역할·빈부·길흉·인과 단정은 제외한다.",
    })),
  );
const condition = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("family-pair"),
      families: z
        .tuple([family, family])
        .refine((value) => value[0] !== value[1])
        .readonly(),
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal("day-relation"),
      relation: z.enum(["combination", "opposition"]),
    })
    .readonly(),
  z.strictObject({ kind: z.literal("context-review") }).readonly(),
]);
const ruleSchema = z
  .strictObject({
    topic: TopicSchema,
    key: z.string().regex(/^[a-z-]+$/),
    ruleId: z.string(),
    ruleVersion: z.literal("1.0.0"),
    priority: z.number().int(),
    condition,
    assertion: z.string(),
    sourceRefs: z.array(z.string()).min(1).readonly(),
    adoption: z.string(),
    caveat: z.string(),
  })
  .readonly();
const definitions: z.input<typeof ruleSchema>[] = [];
function pair(
  topic: z.infer<typeof TopicSchema>,
  key: string,
  families: [z.infer<typeof family>, z.infer<typeof family>],
  assertion: string,
) {
  definitions.push({
    topic,
    key,
    ruleId: `m03.${topic}.${key}`,
    ruleVersion: "1.0.0",
    priority: 60,
    condition: { kind: "family-pair", families },
    assertion,
    sourceRefs: ["m03.smth-families", "m03.smth-context"],
    adoption:
      "일간 기준으로 서로 다른 두 십성군의 관측 증거가 모두 있어야 한다. 두 범주의 현대적 검토 연결은 제한적 구현 정책이며 실제 성향/능력/성과 확정이 아니다.",
    caveat:
      "장간 노출·강도/합화의 실효성은 미평가다. 단일 기호·성별·개수로 성향이나 적성을 단정하지 않는다.",
  });
}
pair(
  "temperament",
  "resource-output",
  ["resource", "output"],
  "인성과 식상 단서가 함께 있어, 수용·학습과 표현을 연결하는 기질 검토 후보다.",
);
pair(
  "temperament",
  "peer-authority",
  ["peer", "authority"],
  "비겁과 관살 단서가 함께 있어, 자기기준과 역할·규범의 조율을 살피는 기질 검토 후보다.",
);
pair(
  "strengths",
  "resource-output",
  ["resource", "output"],
  "인성과 식상 단서가 함께 있어, 학습한 내용을 정리·표현하는 강점의 검토 후보다. 실제 능력 평가는 별개다.",
);
pair(
  "strengths",
  "authority-resource",
  ["authority", "resource"],
  "관살과 인성 단서가 함께 있어, 역할 이해와 학습·지원을 연결하는 강점의 검토 후보다.",
);
pair(
  "career",
  "authority-resource",
  ["authority", "resource"],
  "관살과 인성 단서가 함께 있어, 절차·역할과 자료 학습을 함께 다루는 업무 맥락의 검토 후보다. 특정 직업이나 취업 성과를 정하지 않는다.",
);
pair(
  "career",
  "output-wealth",
  ["output", "wealth"],
  "식상과 재성 단서가 함께 있어, 산출·표현과 자원 관리를 연결하는 업무 맥락의 검토 후보다.",
);
pair(
  "wealth",
  "output-wealth",
  ["output", "wealth"],
  "식상과 재성 단서가 함께 있어, 산출과 자원 관리의 접점을 살피는 재물 주제 검토 후보다. 자산·소득이나 투자 성과는 추정하지 않는다.",
);
pair(
  "wealth",
  "wealth-peer",
  ["wealth", "peer"],
  "재성과 비겁 단서가 함께 있어, 자원 사용과 공동 관리·자기기준의 조율을 살피는 검토 후보다. 재물 손실을 단정하지 않는다.",
);
pair(
  "social",
  "peer-output",
  ["peer", "output"],
  "비겁과 식상 단서가 함께 있어, 동료·자기기준과 의사표현의 접점을 살피는 대인관계 검토 후보다.",
);
pair(
  "social",
  "peer-authority",
  ["peer", "authority"],
  "비겁과 관살 단서가 함께 있어, 동료 관계와 조직 역할의 조율을 살피는 검토 후보다.",
);
for (const relation of ["combination", "opposition"] as const)
  definitions.push({
    topic: "romance",
    key: `day-${relation}`,
    ruleId: `m03.romance.day-${relation}`,
    ruleVersion: "1.0.0",
    priority: 60,
    condition: { kind: "day-relation", relation },
    sourceRefs: ["m03.smth-relations", "m03.smth-context"],
    assertion:
      relation === "combination"
        ? "확정 일지에 연결된 결합 표지와 월지 맥락이 있어, 관계의 기대·조율을 살피는 연애 주제 검토 후보다."
        : "확정 일지에 연결된 대립 표지와 월지 맥락이 있어, 관계의 경계·조율을 살피는 연애 주제 검토 후보다. 실제 갈등을 뜻하지 않는다.",
    adoption:
      "확정 일간/일지·월지와 일지를 포함한 지지 관계를 함께 요구한다. 성별별 배우자성이나 타인의 마음·결혼/이별을 추론하지 않는다.",
    caveat:
      "원국 표지의 존재와 실제 연애 성향은 별개다. 성별 역할·배우자 조건·관계 결과를 단정하지 않는다.",
  });
for (const topic of TopicSchema.options)
  definitions.push({
    topic,
    key: "context-review",
    ruleId: `m03.${topic}.context-review`,
    ruleVersion: "1.0.0",
    priority: 100,
    condition: { kind: "context-review" },
    sourceRefs: ["m03.smth-context"],
    assertion:
      "구조의 불확실성 또는 관련 관계의 공존 맥락이 있어, 주제 후보의 성향 해석을 보류하고 근거를 함께 검토해야 한다.",
    adoption:
      "M01 관법 충돌·혼재/미결 강약 또는 관련 M02 검토 항목이 있으면 낮은 우선순위 후보를 보존한 채 해석을 보류한다.",
    caveat:
      "보류는 반대 성향이나 능력 부족 판정이 아니며, 기호 존재만으로 원전의 사건·길흉을 재현하지 않는다.",
  });
export const TOPIC_RULES = z.array(ruleSchema).length(18).readonly().parse(definitions);
export type TopicRule = z.infer<typeof ruleSchema>;
