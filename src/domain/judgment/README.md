# 고전 출처와 기초 판단 규칙 — WBS-11

`evaluateBaseJudgments(facts)`는 WBS-10의 확정 facts만 읽는 순수 평가기다.
기둥·십성·오행을 다시 계산하거나 변경하지 않는다. 카탈로그는
[catalog.ts](catalog.ts)에 고전 4종의 출처 항목 6개와 구현 검토 규칙 20개를 담는다.

| 규칙 ID (`base.` 접두사)        | 확인하는 최소 조건                      | 출처 항목             |
| ------------------------------- | --------------------------------------- | --------------------- |
| day-wood                        | 일간 오행 목                            | dts.stems             |
| day-fire                        | 일간 오행 화                            | dts.stems             |
| day-earth                       | 일간 오행 토                            | dts.stems             |
| day-metal                       | 일간 오행 금                            | dts.stems             |
| day-water                       | 일간 오행 수                            | dts.stems             |
| month-spring                    | 월지 인·묘·진                           | qtbj.seasons          |
| month-summer                    | 월지 사·오·미                           | qtbj.seasons          |
| month-autumn                    | 월지 신·유·술                           | qtbj.seasons          |
| month-winter                    | 월지 해·자·축                           | qtbj.seasons          |
| exact-hidden-root               | 일간과 장간의 동일 글자                 | zpzq.roots            |
| month-main-exposed              | 월지 본기가 연·월·시간 천간에 존재      | zpzq.exposure         |
| month-other-exposed             | 월지 기타 장간이 연·월·시간 천간에 존재 | zpzq.exposure         |
| companions-visible              | 표면 천간에 비견/겁재                   | smth.families         |
| output-visible                  | 표면 천간에 식신/상관                   | smth.families         |
| wealth-visible                  | 표면 천간에 편재/정재                   | smth.families         |
| officers-visible                | 표면 천간에 편관/정관                   | smth.families         |
| resources-visible               | 표면 천간에 편인/정인                   | smth.families         |
| officer-killing-coexist         | 천간/장간에 정관과 편관                 | smth.families         |
| food-indirect-resource-coexist  | 천간/장간에 식신과 편인                 | smth.families         |
| hurting-direct-resource-coexist | 천간/장간에 상관과 정인                 | zpzq.hurting-resource |

표면 천간 검색은 일간 자체를 제외한다. 동일 장간 글자 일치는 통근 논의의 좁은 기초
조건이다. 불일치를 통근 전체의 부재로 해석하지 않는다. 노출·동시 존재도 관살혼잡,
효신탈식, 상관패인 등 전체 판단의 성립이나 길흉을 확정하지 않는다.
사계 분류는 절기 월지의 전통 분류이며 현재 날씨/양력 월/강약 판정이 아니다.

출처 항목은 work/edition/section/url/excerpt/checkedAt와 대조 방법·한계를 보존한다.
적천수 천간론, 궁통보감 사계 구분, 자평진전 근/투출·상관 논의, 삼명통회 십성 분류를
확인한 뒤 계산 가능한 조건만 별도로 명시했다. 각 규칙의 adoption/caveats가 고전 문맥과
구현 조건의 차이를 설명한다. 숙명적 단정과 현대 AI 해설은 실행 근거로 사용하지 않는다.

`text-checked`는 해당 원문 구절을 대조했다는 뜻이며 비평 정본 인증이 아니다.
일부 자평진전 전사본의 직접 요청은 시간 초과되어 검색 색인의 원문을 사용했다.
근 논의는 국가도서관 소장 영인 PDF의 색인 구절을 참조하며 전체 영인 교감 완료로 표시하지 않는다.
`source-and-tests-checked`는 구현자의 구절·조건·예외·수기 fixture 검토 기록이다.
명리 전문가의 승인이나 사용자의 PR 리뷰 완료를 뜻하지 않는다.

각 규칙은 ruleId/ruleVersion, sourceRefs, inputPaths, priority, 선언한 exceptions,
review와 adoption을 갖는다. 카탈로그는 출처 참조·개수·중복·검토 상태·버전을 검증한다.
검토된 1.0.0 내용의 순서 변경은 허용하지만 내용만 바꾸고 같은 버전을 붙인 입력은 거절한다.

각 결과는 matched/not-matched/unavailable와 coverage를 구분한다. matched만 finding을 만든다.
확인된 일부 기둥의 존재 증거는 보존하고 미상 영역이 있으면 coverage=partial로 남긴다.
관찰되지 않은 조건은 검색 범위가 모두 알려진 경우에만 not-matched다.
필수 일간/월지나 충분한 검색 범위가 없으면 unavailable/coverage=none이며,
이때도 이미 읽은 관찰값은 evidence에 남을 수 있다. 단일 장간 월지에 기타 장간이 없는
사실은 다른 기둥이 미상이어도 해당 월지에서 완전히 확인할 수 있다.

finding에는 안정된 ID와 assertion, 규칙/출처/우선순위/입력 경로, 실제 관찰값,
선언/적용 예외와 precision/caveats가 포함된다. 모든 evidence 경로·값이 실제 facts와
일치하는지 검사한다. sourcePillars와 SDK/facts/규칙/출처 버전을 함께 보존한다.
우선순위는 정렬·추적 용도다. 여러 관찰을 삭제/통합하거나 충돌을 중재하지 않는다.
WBS-12의 별도 [충돌·불확실성 중재](ARBITRATION.md)는 이 평가를 보존하고
채택/억제/보류 및 미상 trace를 추가한다. `arbitrate-facts`로 실행한다.

```sh
npm run --silent saju -- judge-facts < tests/fixtures/cli-input.json
```

`application/judgment.calculateJudgments`는 기존 calculateNatalFacts를 한 번 호출하고
확정 facts에만 적용한다. 원래 계산/후보와 facts는 analysis에 그대로 남는다.
facts가 null이면 evaluation도 null이다. 시각 미상 후보의 일간/시주를 확정 근거로 가져오지 않는다.
전체 상태는 기존 분석의 complete/partial/unavailable을 유지하고 CLI 종료는 각각 0/2/2다.
입력 오류는 2, 공급자/설정 오류는 비식별 오류와 함께 1이다.

이 complete는 기초 관찰의 평가 범위다. 강약/용신·성격·길흉, WBS-12의 충돌/불확실성
중재, 확장 M01/F01~F11, P06·DB·LLM 서술 완료를 의미하지 않는다.
검증은 `npm test -- tests/judgment.test.ts tests/judgment-service.test.ts`로 실행한다.
기대값은 명시된 조건에 대해 수기로 선택한 양성/음성 기둥이며 평가기 결과에서 복사하지 않았다.
