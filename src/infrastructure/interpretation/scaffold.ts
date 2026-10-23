import { StemSchema, BranchSchema } from "@/domain/natal-facts/schemas";
import type { Topic } from "@/domain/judgment/topics/schemas";
import type {
  InterpretationSource,
  InterpretationUnit,
  TenGodFamily,
} from "@/domain/interpretation/schemas";

/**
 * Deterministic condition → public-domain locator scaffold. The developer owns the keys;
 * passages and Korean summaries arrive only through the scripts in scripts/interpretation.
 * Nothing here is a 명리 interpretation written by the maintainers.
 */
export const SCAFFOLD_VERSION = "1.0.0";
const WIKISOURCE = "https://zh.wikisource.org/wiki/";
const STEM_HANJA: Record<string, string> = {
  갑: "甲",
  을: "乙",
  병: "丙",
  정: "丁",
  무: "戊",
  기: "己",
  경: "庚",
  신: "辛",
  임: "壬",
  계: "癸",
};
const STEM_ELEMENT_HANJA: Record<string, string> = {
  갑: "木",
  을: "木",
  병: "火",
  정: "火",
  무: "土",
  기: "土",
  경: "金",
  신: "金",
  임: "水",
  계: "水",
};
/** 寅 month is 正月; the traditional month index follows the twelve jie boundaries, not civil months. */
const MONTH_NAME_BY_BRANCH: Record<string, string> = {
  인: "正月",
  묘: "二月",
  진: "三月",
  사: "四月",
  오: "五月",
  미: "六月",
  신: "七月",
  유: "八月",
  술: "九月",
  해: "十月",
  자: "十一月",
  축: "十二月",
};
const STEM_ROMAN: Record<string, string> = {
  갑: "gap",
  을: "eul",
  병: "byeong",
  정: "jeong",
  무: "mu",
  기: "gi",
  경: "gyeong",
  신: "sin",
  임: "im",
  계: "gye",
};
const BRANCH_ROMAN: Record<string, string> = {
  자: "ja",
  축: "chuk",
  인: "in",
  묘: "myo",
  진: "jin",
  사: "sa",
  오: "o",
  미: "mi",
  신: "sin",
  유: "yu",
  술: "sul",
  해: "hae",
};
/**
 * 三命通會 volume (卷) that carries each 十神 chapter, confirmed by the collector's `--inspect`
 * output: 論正官·論偏官 are in 卷五, 論印綬·論食神·論正財 in 卷六. The collector still probes the
 * neighbouring volumes when a locator is absent and records the page it actually used.
 */
const FAMILY_LOCATOR: Record<
  TenGodFamily,
  { locator: string; volume: string; topics: readonly Topic[] }
> = {
  resource: { locator: "論印綬", volume: "卷六", topics: ["temperament", "strengths", "career"] },
  output: {
    locator: "論食神",
    volume: "卷六",
    topics: ["temperament", "strengths", "career", "wealth", "social"],
  },
  authority: { locator: "論正官", volume: "卷五", topics: ["career", "social", "strengths"] },
  wealth: { locator: "論正財", volume: "卷六", topics: ["wealth", "career"] },
  // `|` lists alternatives the collector tries in order; the matched one is recorded with the passage.
  peer: { locator: "論比肩|論劫財|論比劫", volume: "卷六", topics: ["social", "temperament"] },
};
const SMTH = (volume: string) => WIKISOURCE + encodeURIComponent(`三命通會/${volume}`);
const FAMILY_PAIRS: readonly {
  key: string;
  families: readonly [TenGodFamily, TenGodFamily];
  topics: readonly Topic[];
}[] = [
  {
    key: "resource-output",
    families: ["resource", "output"],
    topics: ["temperament", "strengths"],
  },
  {
    key: "authority-resource",
    families: ["authority", "resource"],
    topics: ["strengths", "career"],
  },
  {
    key: "output-wealth",
    families: ["output", "wealth"],
    topics: ["career", "wealth"],
  },
  {
    key: "wealth-peer",
    families: ["wealth", "peer"],
    topics: ["wealth"],
  },
  {
    key: "peer-output",
    families: ["peer", "output"],
    topics: ["social"],
  },
  {
    key: "peer-authority",
    families: ["peer", "authority"],
    topics: ["social", "temperament"],
  },
];
const COMMON_CAVEATS = [
  "원전 구절의 AI 한국어 요약이며 명리 전문가의 감수를 받지 않았다. 사람 검토 전까지 참고 설명으로만 제시한다.",
  "조건 일치는 기호의 존재만 뜻한다. 강약·격국·합화의 실효성과 실제 성향·사건은 확정하지 않는다.",
] as const;

export type ScaffoldEntry = {
  readonly source: Omit<InterpretationSource, "passage" | "retrievedAt" | "passageDigest">;
  readonly unit: Omit<InterpretationUnit, "summary" | "reviewStatus">;
};

/** 120 day-master×month, 10 day-master, 5 family and 6 family-pair slots. */
export function buildScaffold(): readonly ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];
  for (const stem of StemSchema.options) {
    const hanja = STEM_HANJA[stem] + STEM_ELEMENT_HANJA[stem];
    for (const branch of BranchSchema.options) {
      const id = `${STEM_ROMAN[stem]}-${BRANCH_ROMAN[branch]}`;
      entries.push({
        source: {
          sourceId: `src.qtbj.${id}`,
          work: "궁통보감",
          locator: `${MONTH_NAME_BY_BRANCH[branch]}${hanja}`,
          url: WIKISOURCE + encodeURIComponent("穷通宝鉴"),
          license: "public-domain",
          language: "zh-Hant",
        },
        unit: {
          unitId: `iu.qtbj.${id}`,
          condition: { kind: "day-master-month", dayMaster: stem, monthBranch: branch },
          topics: ["temperament", "strengths", "career"],
          sourceId: `src.qtbj.${id}`,
          caveats: [...COMMON_CAVEATS],
        },
      });
    }
    entries.push({
      source: {
        sourceId: `src.dts.${STEM_ROMAN[stem]}`,
        work: "적천수",
        locator: hanja,
        url: WIKISOURCE + encodeURIComponent("滴天髓"),
        license: "public-domain",
        language: "zh-Hant",
      },
      unit: {
        unitId: `iu.dts.${STEM_ROMAN[stem]}`,
        condition: { kind: "day-master", dayMaster: stem },
        topics: ["temperament", "strengths"],
        sourceId: `src.dts.${STEM_ROMAN[stem]}`,
        caveats: [...COMMON_CAVEATS],
      },
    });
  }
  for (const [family, entry] of Object.entries(FAMILY_LOCATOR) as [
    TenGodFamily,
    (typeof FAMILY_LOCATOR)[TenGodFamily],
  ][]) {
    entries.push({
      source: {
        sourceId: `src.smth.${family}`,
        work: "삼명통회",
        locator: entry.locator,
        url: SMTH(entry.volume),
        license: "public-domain",
        language: "zh-Hant",
      },
      unit: {
        unitId: `iu.smth.${family}`,
        condition: { kind: "ten-god-family", family },
        topics: entry.topics,
        sourceId: `src.smth.${family}`,
        caveats: [...COMMON_CAVEATS],
      },
    });
  }
  for (const pair of FAMILY_PAIRS)
    entries.push({
      source: {
        sourceId: `src.smth.pair.${pair.key}`,
        work: "삼명통회",
        locator: pair.families.map((family) => FAMILY_LOCATOR[family].locator).join("·"),
        // A pair may span two volumes; the url names the first family's volume, parts resolve per page.
        url: SMTH(FAMILY_LOCATOR[pair.families[0]].volume),
        license: "public-domain",
        language: "zh-Hant",
      },
      unit: {
        unitId: `iu.smth.pair.${pair.key}`,
        condition: { kind: "ten-god-family-pair", families: pair.families },
        topics: pair.topics,
        sourceId: `src.smth.pair.${pair.key}`,
        caveats: [...COMMON_CAVEATS],
      },
    });
  return Object.freeze(entries);
}
