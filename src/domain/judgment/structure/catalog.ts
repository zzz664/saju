import { z } from "zod";
import {
  MethodSchema,
  StructureRuleSetSchema,
  TopicSchema,
} from "@/domain/judgment/structure/schemas";

export const DEFAULT_STRUCTURE_RULE_SET = StructureRuleSetSchema.parse({
  ruleSetId: "m01.conservative-structure",
  ruleSetVersion: "1.0.0",
  methods: MethodSchema.options,
});
const source = z
  .strictObject({
    id: z.string(),
    work: z.string(),
    section: z.string(),
    url: z.url(),
    retrieval: z.enum(["page-text", "indexed-primary-text"]),
    checkedAt: z.literal("2026-10-24"),
    limitation: z.string(),
  })
  .readonly();
export const STRUCTURE_SOURCES = z
  .array(source)
  .readonly()
  .parse(
    [
      {
        id: "m01.smth-season",
        work: "삼명통회",
        section: "卷二 · 論五行旺相休囚死並寄生十二宮/論人元司事",
        url: "https://zh.wikisource.org/wiki/三命通會/卷二",
        retrieval: "page-text",
      },
      {
        id: "m01.zpzq-root",
        work: "자평진전",
        section: "論十干得時不旺失時不弱",
        url: "https://upload.wikimedia.org/wikipedia/commons/d/d5/NLC416-13jh002326-46443_淵海子平_子平真詮_第2卷.pdf",
        retrieval: "indexed-primary-text",
      },
      {
        id: "m01.zpzq-month",
        work: "자평진전",
        section: "八 · 論用神",
        url: "https://www.donglishuzhai.net/chapter/3721.html",
        retrieval: "indexed-primary-text",
      },
      {
        id: "m01.zpzq-exposure",
        work: "자평진전",
        section: "十 · 論用神變化",
        url: "https://www.donglishuzhai.net/chapter/3723.html",
        retrieval: "indexed-primary-text",
      },
      {
        id: "m01.qtbj-climate",
        work: "궁통보감",
        section: "三春甲木 · 正月甲木",
        url: "https://zh.wikisource.org/wiki/穷通宝鉴#三春甲木",
        retrieval: "page-text",
      },
    ].map((value) => ({
      ...value,
      checkedAt: "2026-10-24",
      limitation:
        "전자 원문/영인 색인 대조이며 비평 정본·명리 전문가 승인·과학적 유효성 인증이 아니다. 숙명/질병/빈부 단정은 채택하지 않는다.",
    })),
  );

const rule = z
  .strictObject({
    topic: TopicSchema,
    ruleId: z.string(),
    ruleVersion: z.literal("1.0.0"),
    priority: z.number().int(),
    sourceRefs: z.array(z.string()).min(1).readonly(),
    inputPaths: z.array(z.string()).min(1).readonly(),
    adoption: z.string(),
    caveat: z.string(),
  })
  .readonly();
export const STRUCTURE_RULES = z
  .array(rule)
  .length(6)
  .readonly()
  .parse(
    [
      {
        topic: "season",
        priority: 100,
        sourceRefs: ["m01.smth-season"],
        inputPaths: ["positions.day.stem.element", "positions.month.branch"],
        adoption: "사계 월지 분류와 월지 본기의 오행 기준을 별개 운영화 관법으로 비교한다.",
        caveat: "월지 본기는 일별 사령이 아니며 이 분류 하나로 일간 강약을 확정하지 않는다.",
      },
      {
        topic: "root",
        priority: 90,
        sourceRefs: ["m01.zpzq-root"],
        inputPaths: ["dayMaster", "positions.*.branch.hiddenStems"],
        adoption: "동일 글자와 동일 오행 장간을 별도 검색한다. 인성은 뿌리에 포함하지 않는다.",
        caveat:
          "본기/기타 장간은 위치를 보존하며 생왕묘고/합화 이후 뿌리 강도나 점수로 환산하지 않는다.",
      },
      {
        topic: "exposure",
        priority: 80,
        sourceRefs: ["m01.zpzq-exposure"],
        inputPaths: [
          "positions.*.branch.hiddenStems",
          "positions.year.stem.stem",
          "positions.month.stem.stem",
          "positions.hour.stem.stem",
        ],
        adoption:
          "모든 알려진 지장간의 연·월·시간 동일 글자 노출을 추적한다. 기존 코어와 같이 일간 자신은 제외한다.",
        caveat: "투출 존재는 격국 성립/성패·합화의 확정이 아니다.",
      },
      {
        topic: "strength",
        priority: 70,
        sourceRefs: ["m01.zpzq-root", "m01.smth-season"],
        inputPaths: [
          "positions.day.stem.element",
          "positions.month.branch",
          "positions.*.stem.tenGod",
          "positions.*.branch.hiddenStems",
        ],
        adoption:
          "월령·뿌리·천간/장간 인비·설극을 함께 보는 보수적인 후보 분기다. 개수·가중 점수를 쓰지 않는다.",
        caveat:
          "구체 분기는 원전 원칙을 제한적으로 운영화한 정책이다. M02 관계/합화 미평가로 최종 신강/신약이 아니다.",
      },
      {
        topic: "pattern",
        priority: 60,
        sourceRefs: ["m01.zpzq-month", "m01.zpzq-exposure"],
        inputPaths: ["dayMaster", "positions.month.branch.hiddenStems", "positions.*.stem.stem"],
        adoption:
          "월지 본기 우선 후보와 노출 장간 후보를 관법별로 보존한다. 십성 후보만 제시하고 정격/특수격의 성패를 확정하지 않는다.",
        caveat: "월령 용신과 조후 용신은 목적을 분리하며 하나의 보편적 용신을 선택하지 않는다.",
      },
      {
        topic: "climate",
        priority: 50,
        sourceRefs: ["m01.qtbj-climate"],
        inputPaths: ["dayMaster", "positions.month.branch.branch"],
        adoption:
          "갑·인월의 병/계만 조후 검토 후보로 등록한다. 다른 119개 조합에 기본 후보를 채우지 않는다.",
        caveat: "기후/실제 기온·길흉을 예측하지 않으며 조후 후보의 실효성·전국 배합은 미확정이다.",
      },
    ].map((value) => ({ ...value, ruleId: `m01.${value.topic}`, ruleVersion: "1.0.0" })),
  );
