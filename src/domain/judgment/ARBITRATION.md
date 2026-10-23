# 충돌·불확실성 중재 — WBS-12

`arbitration.ts`는 계산이나 전통 해석을 추가하지 않는 순수 중재 계층이다.
`arbitrateBaseJudgments(evaluation)`는 WBS-11 평가를 검증하고 matched finding만
중재 후보로 옮긴다. 미상 결과와 부분 근거의 원래 trace는 `uncertainties`에 남긴다.

`arbitrateJudgments({ status, candidates })`는 검증된 판단을 받는 서버 내부 함수다.
각 후보에는 원래 `finding` 전체와 `claim: { key, value, method }`가 필요하다.
같은 key의 서로 다른 value만 양립할 수 없는 대안으로 선언한다. key는 동일한
분석 대상·시점·범위를 나타내야 하며, 다른 대상이나 기간의 판단을 같은 key로 합치면 안 된다.
assertion 문구, 십성의 동시 존재, sourceRefs 차이만으로 충돌을 추측하지 않는다.
method는 관법 식별자이며 출처의 신뢰도 점수가 아니다.

| 같은 key에서의 상황                                      | 처리                                                      | 결과 상태에 미치는 영향 |
| -------------------------------------------------------- | --------------------------------------------------------- | ----------------------- |
| value가 모두 같음                                        | 모든 지지 근거 accepted, 관법별 trace 보존                | 원래 상태 유지          |
| value가 다르고 method가 다름                             | 전체 deferred, method-disagreement                        | partial                 |
| 같은 method지만 부분 근거가 하나라도 있음                | 전체 deferred, incomplete-evidence                        | partial                 |
| 모두 confirmed, 최상위 priority에 서로 다른 value가 있음 | 전체 deferred, tie                                        | partial                 |
| 모두 confirmed, 최상위 priority가 하나의 value를 지지함  | 그 value의 모든 지지 후보 accepted, 다른 value suppressed | 원래 상태 유지          |

관법 차이 → 부분 근거 → 동률 → 우선순위 순으로 중재 사유를 정한다.
최상위 priority가 같아도 같은 value를 지지하면 동률 충돌이 아니다.
하위 우선순위가 상위 우선순위를 덮어쓰지 않으며, 서로 다른 key의 후보에는 영향을 주지 않는다.
우선순위로 채택한 결과도 정책상 선택일 뿐 과학적 사실이나 고전 전체 해석의 승인을 뜻하지 않는다.

출력에는 원본 `candidates`, 후보별 `decisions`와 대칭 `conflictingWith`, 그룹별
`conflicts`(사유·상태·전체 후보 ID·선택된 value의 지지 ID), accepted 원문 `findings`가 있다.
suppressed/deferred 판단도 원래 assertion·ruleId/ruleVersion·sourceRefs·입력 경로·근거·
선언/적용 예외·priority·precision·caveats와 함께 candidates에 남는다.
부분 근거는 accepted되어도 precision=partial이며 confirmed로 승격하지 않는다.
미해결 그룹과 무관한 관찰은 계속 반환한다. 여러 근거를 더해 점수를 만들지 않는다.

upstream partial/unavailable은 유지한다. upstream complete라도 미해결 충돌이 있으면 partial이다.
평가 가능한 후보가 없는 unavailable 입력은 unavailable/빈 findings이며, 알려진 일부 입력에서
후보가 없더라도 partial을 유지한다. `limitations`는 UPSTREAM_PARTIAL/UPSTREAM_UNAVAILABLE,
PARTIAL_EVIDENCE, UNRESOLVED_CONFLICT를 명시한다. 완전히 평가한 빈 결과는 complete일 수 있다.

입력은 최대 100개 후보, 고유 findingId, 0~100 정수 priority, 비어 있지 않은 출처·실제 근거,
precision/적용 예외 일관성을 검증한다. 결과는 strict/readonly Zod 계약이며 입력 후보로
결정을 재구성해 상태·링크·선택·중재 기록의 누락/변조를 거절한다. ID와 key 정렬은
로캘과 무관한 문자열 순서다. 입력 변경이나 외부 I/O가 없다.
중재기의 형태 검증 자체가 출처 내용이나 근거의 진실성을 증명하지는 않는다.
호출자는 원국·규칙·출처를 먼저 검증해야 하며 임의 사용자/LLM 후보를 넣으면 안 된다.

기초 규칙 연결에서는 일간 오행 다섯 대안은 `base.day-element`, 사계 네 대안은
`base.month-season`을 공유한다. 다른 존재 관찰은 각 ruleId를 독립 key로 쓴다.
method는 `base-structural-observations`다. 유효한 현재 기초 규칙 평가에서는
일간/사계가 각각 한 가지이고 다른 관찰들이 공존할 수 있어 보통 conflicts는 비어 있다.
충돌을 보여 주려고 새 고전 해석을 만들지 않는다. 충돌 테스트의 fixture 후보는 중재
정책 검증용 가상 데이터이며 출처가 검토된 새 명리 규칙으로 등록하지 않았다.

`calculateArbitratedJudgments`는 기존 calculateJudgments를 한 번 실행하고 `judgment`에
그대로 보존한다. `resolution`은 해당 evaluation에 다시 대조해 다른 분석 결과의 혼입이나
불확실성 trace 누락을 거절한다. evaluation=null이면 resolution=null이다.
출생시각 미상 후보의 일주/시주를 확정 근거로 가져오지 않는다.

```sh
npm run --silent saju -- arbitrate-facts < tests/fixtures/cli-input.json
npm test -- tests/arbitration.test.ts tests/arbitration-service.test.ts
```

CLI 입력은 기존 AnalysisInput이다. 출력은 `{ status, judgment, resolution }`이며
complete/partial/unavailable 종료 코드는 0/2/2, 입력 오류 2, 공급자 오류 1이다.
오류에는 원문·공급자 메시지·stack을 노출하지 않는다.
중재 정책은 `arbitration.explicit-claims` 1.0.0으로 추적하고 원래 규칙/출처/SDK 버전은 유지한다.
complete는 이 기초 판단 범위의 완료다. 강약·용신·성격·길흉, 확장 M01/F01~F11,
수동 ChatGPT/LLM 입력 조합, 해시, DB·리포트 완료는 각 후속 WBS의 범위다.
