import { CatalogBaseSchema, type RuleDefinition } from "./schemas";

const checkedAt = "2026-10-22";
const transcriptionLimit = "전자 전사본의 해당 구절을 확인했으며 비평 정본·과학적 검증·전문가 승인을 뜻하지 않는다.";
const sources = [
  { id: "dts.stems", work: "적천수", edition: "Wikisource 滴天髓輯要 전사/주석 포함본", section: "天干論 · 甲木~癸水", url: "https://zh.wikisource.org/wiki/滴天髓#天干論", excerpt: "甲木；丙火；戊土；庚金；壬水", retrieval: "page-text" },
  { id: "qtbj.seasons", work: "궁통보감", edition: "Wikisource 穷通宝鉴 전사본", section: "十干分論 · 三春/三夏/三秋/三冬甲木", url: "https://zh.wikisource.org/wiki/穷通宝鉴#三春甲木", excerpt: "三春甲木；三夏甲木；三秋甲木；三冬甲木", retrieval: "page-text" },
  { id: "zpzq.roots", work: "자평진전", edition: "國家圖書館 소장본 디지털 영인 · Commons NLC416-13jh002326-46443", section: "論十干得時不旺失時不弱 · 원문 구절 색인", url: "https://upload.wikimedia.org/wikipedia/commons/d/d5/NLC416-13jh002326-46443_淵海子平_子平真詮_第2卷.pdf", excerpt: "只要四柱有根", retrieval: "indexed-primary-text" },
  { id: "zpzq.exposure", work: "자평진전", edition: "東里書齋 秘本子平真詮卷一 교감 전사본", section: "十 · 論用神變化", url: "https://www.donglishuzhai.net/chapter/3723.html", excerpt: "不透甲而透丙", retrieval: "indexed-primary-text" },
  { id: "smth.families", work: "삼명통회", edition: "Wikisource 三命通會 卷五 전사본", section: "論古人立印食官財名義 / 官煞混雜", url: "https://zh.wikisource.org/zh-hant/三命通會/卷五", excerpt: "印、食、官、財；食怕梟", retrieval: "page-text" },
  { id: "zpzq.hurting-resource", work: "자평진전", edition: "東里書齋 秘本子平真詮 교감 전사본", section: "四十一 · 論傷官", url: "https://donglishuzhai.net/chapter/3754.html", excerpt: "有傷官佩印者", retrieval: "indexed-primary-text" },
].map((source) => ({ ...source, checkedAt, verification: "text-checked", limitations: [transcriptionLimit,
  source.id === "zpzq.roots" ? "영인 PDF의 검색 색인 원문 구절을 대조한 범위이며 전체 영인 교감 완료가 아니다. 동일 글자 일치는 원문의 통근 개념 전체보다 좁은 구현 조건이다."
    : source.retrieval === "indexed-primary-text" ? "직접 페이지 요청은 시간 초과였으며 검색 색인의 고전 원문 전사 구절을 대조했다. AI/현대 해설은 근거로 사용하지 않았다." : "원문 문맥의 숙명적·성별 역할·길흉 단정은 실행 규칙에 포함하지 않는다.",
] }));

const caveat = "기초 기호/노출 조건만 확인하며 강약·격국·제화·성격·길흉을 확정하지 않는다.";
function rule(ruleId: string, assertion: string, sourceRefs: string[], condition: RuleDefinition["condition"], inputPaths: string[], priority: number, exceptions: RuleDefinition["exceptions"], adoption: string): unknown {
  return { ruleId, ruleVersion: "1.0.0", assertion, sourceRefs, condition, inputPaths, priority, exceptions,
    adoption, caveats: [caveat, adoption], review: { status: "source-and-tests-checked", checkedAt, reviewerRole: "implementation-review", method: "primary-text-and-explicit-fixtures" } };
}
const rules: unknown[] = [
  ...([ ["wood", "목"], ["fire", "화"], ["earth", "토"], ["metal", "금"], ["water", "수"] ] as const).map(([id, element]) => rule(
    `base.day-${id}`, `확정 일간의 오행은 ${element}이다.`, ["dts.stems"], { kind: "day-element", element },
    ["dayMaster", "positions.day.stem.element"], 100, ["DAY_MASTER_UNKNOWN"], "천간의 오행 분류만 채택하고 고전의 인격 묘사를 적용하지 않는다.")),
  ...([
    ["spring", "봄", ["인", "묘", "진"]], ["summer", "여름", ["사", "오", "미"]],
    ["autumn", "가을", ["신", "유", "술"]], ["winter", "겨울", ["해", "자", "축"]],
  ] as const).map(([id, season, branches]) => rule(`base.month-${id}`, `확정 월지는 전통 월지 사계 구분의 ${season}에 속한다.`, ["qtbj.seasons"], { kind: "month-season", branches },
    ["positions.month.branch.branch"], 90, ["MONTH_PILLAR_UNKNOWN"], "절기 월지의 사계 분류이며 양력 월·현재 날씨·일간의 강약이 아니다.")),
  rule("base.exact-hidden-root", "일간과 동일한 천간 글자가 확인된 지장간에 존재한다.", ["zpzq.roots"], { kind: "exact-hidden-root" },
    ["dayMaster", "positions.*.branch.hiddenStems.*.stem"], 80, ["DAY_MASTER_UNKNOWN", "INCOMPLETE_SEARCH_SCOPE"], "동일 글자 일치만 검사하는 통근 논의의 제한된 기초 조건이다. 불일치를 통근 전체의 부재로 읽지 않는다."),
  ...(["main", "other"] as const).map((part) => rule(`base.month-${part}-exposed`, `월지의 ${part === "main" ? "본기" : "본기 외 장간"}가 연·월·시간 천간에 노출되어 있다.`, ["zpzq.exposure"], { kind: "month-exposure", part },
    ["positions.month.branch.branch", "positions.month.branch.hiddenStems.*.stem", "positions.*.stem.stem"], 75, ["MONTH_PILLAR_UNKNOWN", "INCOMPLETE_SEARCH_SCOPE"], "일간은 노출 대상에서 제외한다. 장간의 동일 글자 노출만 검사하며 격국 변화/성립으로 확정하지 않는다.")),
  ...([
    ["companions", "비겁", ["비견", "겁재"]], ["output", "식상", ["식신", "상관"]], ["wealth", "재성", ["편재", "정재"]],
    ["officers", "관성", ["편관", "정관"]], ["resources", "인성", ["편인", "정인"]],
  ] as const).map(([id, name, tenGods]) => rule(`base.${id}-visible`, `연·월·시간의 확인된 표면 천간에 ${name} 분류가 존재한다.`, ["smth.families"], { kind: "visible-family", tenGods },
    ["dayMaster", "positions.*.stem.tenGod"], 60, ["DAY_MASTER_UNKNOWN", "INCOMPLETE_SEARCH_SCOPE"], "이미 계산된 상대 십성의 분류/존재만 사용한다. 일간 자체와 장간은 이 표면 검색에서 제외한다.")),
  ...([
    ["officer-killing", "정관", "편관", "smth.families"],
    ["food-indirect-resource", "식신", "편인", "smth.families"],
    ["hurting-direct-resource", "상관", "정인", "zpzq.hurting-resource"],
  ] as const).map(([id, left, right, source]) => rule(`base.${id}-coexist`, `확인된 천간/장간 범위에 ${left}과 ${right} 기호가 함께 존재한다.`, [source], { kind: "coexistence", left, right },
    ["dayMaster", "positions.*.stem.tenGod", "positions.*.branch.hiddenStems.*.tenGod"], 50, ["DAY_MASTER_UNKNOWN", "INCOMPLETE_SEARCH_SCOPE"], "동시 존재라는 필요 관찰만 채택한다. 관살혼잡/효신탈식/상관패인 등의 완성된 판단이나 상호 제어로 명명하지 않는다.")),
];
export const BASE_RULE_CATALOG = CatalogBaseSchema.parse({ ruleSetVersion: "1.0.0", sourceCatalogVersion: "1.0.0", sources, rules });
