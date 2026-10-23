import { z } from "zod";
import { BranchSchema, StemSchema, ElementSchema } from "@/domain/natal-facts/schemas";
import { RelationRuleSetSchema, RelationTypeSchema } from "@/domain/judgment/relations/schemas";

export const DEFAULT_RELATION_RULE_SET = RelationRuleSetSchema.parse({
  ruleSetId: "m02.classical-relations",
  ruleSetVersion: "1.0.0",
  stemClash: "four-pairs",
  punishment: "pairwise",
});
const smth = "https://zh.wikisource.org/wiki/三命通會/卷二";
const sources = [
  {
    id: "m02.smth-stem",
    work: "삼명통회",
    section: "권2 논십간합/논십간화기",
    url: smth,
    retrieval: "page-text",
  },
  {
    id: "m02.smth-branch",
    work: "삼명통회",
    section: "권2 논지원육합/논지원삼합/논삼형/논육해/논충격",
    url: smth,
    retrieval: "page-text",
  },
  {
    id: "m02.smth-direction",
    work: "삼명통회 사고전서본",
    section: "권6 東西南北 所屬 방위 집합",
    url: "https://zh.wikisource.org/wiki/三命通會_(四庫全書本)/卷06",
    retrieval: "indexed-primary-text",
  },
  {
    id: "m02.xzjy-stem-clash",
    work: "선택기요",
    section: "상편 天干相沖 (戊己無沖)",
    url: "https://zh.wikisource.org/wiki/選擇紀要/上編",
    retrieval: "page-text",
  },
  {
    id: "m02.lr-break",
    work: "육임대전",
    section: "권1 破의 여섯 글자 대응만 참조",
    url: "https://zh.wikisource.org/wiki/六壬大全/1",
    retrieval: "page-text",
  },
];
export const RELATION_SOURCES = z
  .array(
    z
      .strictObject({
        id: z.string(),
        work: z.string(),
        section: z.string(),
        url: z.url(),
        retrieval: z.enum(["page-text", "indexed-primary-text"]),
        checkedAt: z.literal("2026-10-24"),
        limitation: z.string(),
      })
      .readonly(),
  )
  .readonly()
  .parse(
    sources.map((source) => ({
      ...source,
      checkedAt: "2026-10-24",
      limitation:
        "원전 전사/검색 색인의 글자 대응만 확인했다. 교감 정본·전문가 승인·과학적 예측 인증이 아니다. 점단·길흉·질병·인과/강도는 채택하지 않는다.",
    })),
  );

const ruleSchema = z
  .strictObject({
    ruleId: z.string().regex(/^m02\.[a-z0-9.-]+$/),
    ruleVersion: z.literal("1.0.0"),
    relationType: RelationTypeSchema,
    layer: z.enum(["heavenlyStem", "earthlyBranch"]),
    symbols: z
      .array(z.union([StemSchema, BranchSchema]))
      .min(2)
      .max(3)
      .readonly(),
    elementAssociation: ElementSchema.nullable(),
    priority: z.number().int().min(0).max(100),
    sourceRefs: z.array(z.string()).min(1).readonly(),
    policy: z.enum(["always", "stem-clash", "punishment-pair", "punishment-group"]),
    adoption: z.string(),
    caveat: z.string(),
  })
  .refine((rule) =>
    rule.symbols.every(
      (symbol) =>
        (rule.layer === "heavenlyStem" ? StemSchema : BranchSchema).safeParse(symbol).success,
    ),
  )
  .readonly();
type RuleInput = Pick<z.infer<typeof ruleSchema>, "relationType" | "layer" | "sourceRefs"> &
  Partial<Pick<z.infer<typeof ruleSchema>, "policy" | "adoption">>;
const definitions: z.input<typeof ruleSchema>[] = [];
function add(
  spec: RuleInput,
  rows: readonly (readonly string[])[],
  elements?: readonly z.infer<typeof ElementSchema>[],
) {
  rows.forEach((symbols, index) =>
    definitions.push({
      ...spec,
      ruleId: `m02.${spec.relationType}.${spec.policy ?? "always"}.${index + 1}`,
      ruleVersion: "1.0.0",
      symbols: symbols as z.infer<typeof ruleSchema>["symbols"],
      elementAssociation: elements?.[index] ?? null,
      priority: symbols.length === 3 ? 90 : 80,
      policy: spec.policy ?? "always",
      adoption:
        spec.adoption ??
        "입력의 서로 다른 기둥 참조에서 표의 글자가 모두 확인될 때 관계 존재만 기록한다.",
      caveat:
        "관계 존재는 합화·강도·길흉 확정이 아니다. 위치 인접성/계절/투출/다른 관계의 실효성은 미평가다.",
    }),
  );
}
add(
  { relationType: "stem-combination", layer: "heavenlyStem", sourceRefs: ["m02.smth-stem"] },
  [
    ["갑", "기"],
    ["을", "경"],
    ["병", "신"],
    ["정", "임"],
    ["무", "계"],
  ],
  ["토", "금", "수", "목", "화"],
);
add(
  {
    relationType: "stem-clash",
    layer: "heavenlyStem",
    sourceRefs: ["m02.xzjy-stem-clash"],
    policy: "stem-clash",
    adoption:
      "천간충 네 쌍만 선택 채택한다. 戊己 충은 만들지 않으며 not-adopted 정책에서는 평가하지 않는다.",
  },
  [
    ["갑", "경"],
    ["을", "신"],
    ["병", "임"],
    ["정", "계"],
  ],
);
add(
  {
    relationType: "branch-six-combination",
    layer: "earthlyBranch",
    sourceRefs: ["m02.smth-branch"],
    adoption: "육합 존재만 기록한다. 특히 午未 등 합화 오행 관법을 일괄 확정하지 않는다.",
  },
  [
    ["자", "축"],
    ["인", "해"],
    ["묘", "술"],
    ["진", "유"],
    ["사", "신"],
    ["오", "미"],
  ],
);
add(
  {
    relationType: "branch-three-combination",
    layer: "earthlyBranch",
    sourceRefs: ["m02.smth-branch"],
    adoption: "삼합은 서로 다른 세 글자 완비만 채택한다. 반합/공합/辰戌丑未土局은 미채택이다.",
  },
  [
    ["신", "자", "진"],
    ["사", "유", "축"],
    ["인", "오", "술"],
    ["해", "묘", "미"],
  ],
  ["수", "금", "화", "목"],
);
add(
  {
    relationType: "branch-directional-combination",
    layer: "earthlyBranch",
    sourceRefs: ["m02.smth-direction"],
    adoption: "동서남북 방위의 세 글자 완비를 방합 존재 표로 운영화한다. 오행 변화 확정이 아니다.",
  },
  [
    ["인", "묘", "진"],
    ["사", "오", "미"],
    ["신", "유", "술"],
    ["해", "자", "축"],
  ],
  ["목", "화", "금", "수"],
);
add({ relationType: "branch-clash", layer: "earthlyBranch", sourceRefs: ["m02.smth-branch"] }, [
  ["자", "오"],
  ["축", "미"],
  ["인", "신"],
  ["묘", "유"],
  ["진", "술"],
  ["사", "해"],
]);
add(
  { relationType: "branch-punishment", layer: "earthlyBranch", sourceRefs: ["m02.smth-branch"] },
  [["자", "묘"]],
);
add(
  {
    relationType: "branch-punishment",
    layer: "earthlyBranch",
    sourceRefs: ["m02.smth-branch"],
    policy: "punishment-pair",
    adoption:
      "寅巳申/丑戌未 형의 글자 쌍을 존재로 채택한다. 형의 방향·실효·사건은 해석하지 않는다.",
  },
  [
    ["인", "사"],
    ["사", "신"],
    ["신", "인"],
    ["축", "술"],
    ["술", "미"],
    ["미", "축"],
  ],
);
add(
  {
    relationType: "branch-punishment",
    layer: "earthlyBranch",
    sourceRefs: ["m02.smth-branch"],
    policy: "punishment-group",
    adoption:
      "보수적 full-group 선택에서는 寅巳申/丑戌未 세 글자 완비만 기록한다. 子卯와 반복 자형은 별도 규칙이다.",
  },
  [
    ["인", "사", "신"],
    ["축", "술", "미"],
  ],
);
add(
  {
    relationType: "branch-self-punishment",
    layer: "earthlyBranch",
    sourceRefs: ["m02.smth-branch"],
    adoption:
      "辰午酉亥 중 같은 글자가 서로 다른 기둥 참조에 두 번 있어야 한다. 단일 기둥의 자기 비교는 금지한다.",
  },
  [
    ["진", "진"],
    ["오", "오"],
    ["유", "유"],
    ["해", "해"],
  ],
);
add(
  {
    relationType: "branch-break",
    layer: "earthlyBranch",
    sourceRefs: ["m02.lr-break"],
    adoption:
      "육임대전의 破 여섯 글자 대응만 표로 채택한다. 육임 점단이나 명리적 길흉을 이식하지 않는다.",
  },
  [
    ["자", "유"],
    ["묘", "오"],
    ["진", "축"],
    ["미", "술"],
    ["인", "해"],
    ["사", "신"],
  ],
);
add({ relationType: "branch-harm", layer: "earthlyBranch", sourceRefs: ["m02.smth-branch"] }, [
  ["자", "미"],
  ["축", "오"],
  ["인", "사"],
  ["묘", "진"],
  ["신", "해"],
  ["유", "술"],
]);
export const RELATION_RULES = z.array(ruleSchema).length(54).readonly().parse(definitions);
export type RelationRule = z.infer<typeof ruleSchema>;
