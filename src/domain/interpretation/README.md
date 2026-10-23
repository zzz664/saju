# 해석 카탈로그(Interpretation Lookup) — WBS-69

규칙 엔진이 확정한 **조건 키**로 퍼블릭 도메인 고전 구절과 그 AI 한국어 요약을 조회하는 층이다.
LLM이 해석을 "새로 하는" 대신, 서버가 조회한 요약을 **근거 별칭**으로만 건네준다.
명리 지식이 없는 개발자가 해석 문장을 직접 쓰지 않고도 "출처가 있는 해석"을 제공하기 위한 구조다.
자세한 결정 배경은 [결정 메모](../../../docs/decisions/2026-10-24_해석층_재설계_결정.md).

## 계약

| 타입                      | 역할                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `InterpretationCondition` | `day-master-month`(일간×월지), `day-master`, `ten-god-family`, `ten-god-family-pair`. 엔진의 `DerivedNatalFacts`에서만 매칭한다. |
| `InterpretationSource`    | 원전·위치(`locator`)·URL·`passage`(수집 전 null)·`passageDigest`                                                                 |
| `InterpretationUnit`      | 조건 + 주제 + 출처 + `summary`(생성 전 null) + `reviewStatus` + 주의 문구                                                        |
| `InterpretationCatalog`   | 버전 있는 전체. 요약은 **원문 digest에 묶여** 원문이 바뀌면 자동으로 무효가 된다.                                                |
| `MatchedInterpretation`   | 매칭 결과. `usable`은 원문 수집 + 요약 존재 + 함의 검사 PASS + digest 일치일 때만 true.                                          |

`matchInterpretations(facts, catalog, { topics })`는 순수 함수다. 일간이 없으면 아무것도 매칭하지 않고,
월지가 없으면 일간×월지 조건을 건너뛴다. 사용 불가(unusable) 단위도 반환하므로 서술 계획이 "일치 N건 중 요약 M건"을 한계로 적을 수 있다.

## 데이터가 채워지는 방식

```
scaffold.ts (코드)         조건 키 141개: 궁통보감 120 + 적천수 10 + 삼명통회 5 + 조합 6
   ⊕ data/passages.json    scripts/interpretation/collect-passages.mjs  — Wikisource API, LLM 없음
   ⊕ data/summaries.json   scripts/interpretation/summarize-units.mjs  — 명시 Live, 요약 1회 + 함의 검사 1회
   = loadInterpretationCatalog()
```

1. `node scripts/interpretation/collect-passages.mjs --dry-run`으로 어느 슬롯의 제목이 Wikisource 본문에서 발견되는지 먼저 본다. 수집기는 **페이지 제목당 HTTP 요청 1회**(전체 3회)만 보내고 요청 사이 1.5초를 쉬며, 429는 `Retry-After`를 따라 1회만 재시도한다. `page <제목>: MISSING_TITLE`이면 `scaffold.ts`의 `url` 제목이 실제 Wikisource 제목과 다른 것이고, `RATE_LIMITED`면 몇 분 뒤 다시 실행한다. 발견되지 않는 슬롯은 `missing`으로 보고되고 null로 남는다. **제목이 안 맞는다고 손으로 구절을 붙이지 않는다.** `scaffold.ts`의 `locator`를 고쳐 다시 수집한다.
   - locator 매칭은 **렌더링 본문(zh-hant 변환, 하위 페이지·ProofreadPage 전사 포함) → 원시 wikitext** 순서로, 각각 **소제목(정확히 일치 또는 locator로 시작) → locator로 시작하는 단락** 순서로 찾는다. 궁통보감처럼 "正月甲木，…"이 소제목이 아니라 단락 첫 구절인 본문도 잡는다. `論印綬·論食神`처럼 `·`로 이은 locator는 두 부분이 모두 있어야 하며 순서대로 이어 붙인다.
   - 141건 전부 `missing`이면 페이지는 열렸지만 locator 모양이 본문과 다른 것이다. `--dry-run --inspect`로 페이지별 소제목 목록·본문 앞부분을 보고, 필요하면 `--dump tmp/wikisource`로 정규화 본문을 저장해 확인한다(`tmp/`는 커밋 제외).
2. `--dry-run`을 빼고 실행해 `passages.json`을 채운다. 커밋 전에 diff로 수집 범위를 확인한다.
3. 요약 생성은 **비용이 드는 Live 실행**이다. `ENABLE_INTERPRETATION_SUMMARY=true`, `OPENAI_API_KEY`, `--confirm`, `--max <n>`이 모두 있어야 시작한다. 단위마다 2회 호출(요약 + 함의 검사)이며 매 단위 저장하므로 중단해도 유료 작업이 사라지지 않는다.
4. 함의 검사 FAIL은 `summaries.json`에 `status: "failed"`로 남고 카탈로그에서 `usable=false`가 된다. 요약을 고쳐 쓰지 않고 다시 생성한다.
5. 모든 요약의 `reviewStatus`는 `ai-summarized-unreviewed`다. 사람이 검토하면 코드에서 `human-reviewed`로 올리는 절차를 그때 추가한다.

이 저장소의 현재 상태: 141개 슬롯 전부 `scaffold`(원문 없음). 이 세션의 실행 환경은 Wikisource 접근이 차단되어 수집을 실행하지 않았다.

## 하지 않는 것

- 요약을 사실로 승격하지 않는다. 서술 계획은 항상 "전통적으로 ~로 본다"는 조건부 전달과 미감수 고지를 붙인다.
- 강약·격국·합화의 실효성을 판정하지 않는다. 조건 일치는 기호의 존재만 뜻한다.
- 벡터 검색을 하지 않는다. 조건 키 조회표다. R03 후속 질문에서 필요해지면 별도 WBS로 검토한다.

```sh
npm test -- tests/interpretation.test.ts tests/interpretation-scripts.test.ts
node scripts/interpretation/collect-passages.mjs --dry-run
```
