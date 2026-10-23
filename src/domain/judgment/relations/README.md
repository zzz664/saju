# M02 천간·지지 관계 — WBS-28

`analyzeRelations(references, ruleSet?)`는 입력 범위의 간지 관계 존재만 계산하는 순수 함수다.
SDK·DB·LLM에 접근하지 않는다. 기존 `StemSchema`/`BranchSchema`를 재사용하고 음양이 맞는
육십갑자 기둥만 받는다. `schemas.ts`는 엔진 없는 구조 계약이며, 스키마 파싱만으로
외부 관계 JSON의 명리적 내용·출처를 검증했다고 간주하지 않는다.

## 입력과 관법

참조 1~32개를 받는다. 각 참조는 `{referenceId, source, contextId, position, pillar}`다.

- `source`: `natal | luck | annual | monthly | daily | personA | personB`.
- `contextId`: 원국/기간 등 호출자가 제공하는 비식별 맥락 ID. 기간 계산이나 소유권 검증을 대신하지 않는다.
- `position`: `year | month | day | hour | period`. `pillar`는 `{heavenlyStem, earthlyBranch}` 또는 미상 `null`.
- `referenceId`와 `(source, contextId, position)`은 각각 유일해야 한다. 기둥 하나를 중복 등록해 관계를 만들 수 없다. 실제 다른 위치의 같은 간지는 구별한다.

기본 정책은 `m02.classical-relations@1.0.0`, `stemClash: four-pairs`, `punishment: pairwise`다.
미지원 ID/버전·추가 옵션은 거절한다.

| 종류   | 채택 범위                     | 정책/예외                                                                          |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| 천간합 | 甲己/乙庚/丙辛/丁壬/戊癸      | 오행 연관값은 표의 분류이며 실제 합화가 아님                                       |
| 천간충 | 甲庚/乙辛/丙壬/丁癸           | 戊己 충 없음, `not-adopted`로 제외 가능                                            |
| 육합   | 子丑/寅亥/卯戌/辰酉/巳申/午未 | 합화 오행은 미채택, 연관값 null                                                    |
| 삼합   | 申子辰/巳酉丑/寅午戌/亥卯未   | 세 글자 완비. 반합/공합/土四庫局 미채택                                            |
| 방합   | 寅卯辰/巳午未/申酉戌/亥子丑   | 세 글자 완비. 방위 집합의 운영화                                                   |
| 충     | 子午/丑未/寅申/卯酉/辰戌/巳亥 | 존재만 기록                                                                        |
| 형     | 子卯 및 寅巳申/丑戌未         | `pairwise`는 각 쌍, `full-group`은 두 삼자 집합 완비만 채택. 子卯는 양쪽 정책 공통 |
| 자형   | 辰辰/午午/酉酉/亥亥           | 서로 다른 참조 두 개 필요                                                          |
| 파     | 子酉/卯午/辰丑/未戌/寅亥/巳申 | 육임대전의 대응표만 참조, 점단은 이식하지 않음                                     |
| 해     | 子未/丑午/寅巳/卯辰/申亥/酉戌 | 존재만 기록                                                                        |

형의 두 정책은 구현 선택을 명시한 것이며 고유 학파명을 새로 붙인 것이 아니다.
방향별 형의 실효성, 인접성, 쟁합의 강도, 계절/투출과 합화 성립은 계산하지 않는다.
다른 source/기간 사이의 비교 가능 범위는 호출자가 먼저 선택한다. 이 모듈은 기간 중첩이나
어느 사람의 어떤 운인지 추정하지 않는다. 전통 표의 내부 일관성 검증이며 과학적 예측 인증이 아니다.

## 근거·존재와 효과의 분리

각 `GanjiRelation`은 `participants`, `ruleId`, 독립 `ruleVersion`, `sourceRefs`, 우선순위,
입력 경로와 글자 값, 예외와 주의 문구를 갖는다. 출처/채택 설명은 `catalog.ts`와
[구현 전 완료 조건·원전 링크](../../../../docs/evaluations/WBS-28-relations.md)를 참조한다.
삼명통회 권6 방위 구절은 검색 색인 원문 확인 범위이며, 다른 출처와 원문 확인 방식을 구분한다.

참조를 ID로 정렬한 `pillars`가 결과에 포함된다. evidence의 `pillars.<index>.pillar.<field>`는
이 정규화 스냅샷을 가리킨다. 원래 입력 배열 순서가 바뀌어도 reference ID·출처·맥락과
관계 ID/출력 순서가 유지된다. 같은 규칙·참조 집합은 한 번만 기록하며 여러 위치의 같은
글자는 별개의 관계 참여자로 보존한다. 합을 먼저 찾았다고 참여자를 소모하지 않는다.

`status: complete`, `precision: confirmed`인 개별 관계는 **글자 존재**만 확정한다.
`effect`는 `{status: unavailable, intensity: null, transformation: not-assessed}`다.
오행 연관값으로 원래 간지나 M01 강약/격국/용신을 변경하지 않는다.

같은 기둥의 같은 층위(천간/지지)에 합과 충·형·파·해가 공존하거나, 같은 종류의 합 상대가
여러 개면 관련 ID를 묶어 미해결 검토 항목으로 남긴다. 이것이 논리적 모순이나 자동 합 해소,
특정 사건 발생을 뜻하지 않는다. 우선순위로 사실을 지우지 않는다.

`coverage`는 제공된 범위의 기둥 관측 상태다. `null`이 있으면 그 참조를 쓰는 관계만 제외하며
다른 관측 관계는 남긴다. 빈 관계 배열을 원국 전체의 관계 부재로 확대하지 않는다.
최상위 상태는 효과/합화 미평가로 `partial`, 전부 미상이면 `unavailable`이다.

`application/relations`의 `calculateRelations`는 기존 코어/M01을 한 번 계산하고
확정 natal 기둥만 추가 분석하여 `{status, analysis, relations}`를 반환한다. 원국 계산 불가면
`relations: null`이고 기존 사유가 유지된다. `diagnose-relations` CLI로 검토하며 정상 후보 출력도
종료 코드 2다. 기존 export/hash/M01 및 공개 사용자 화면·API/서술 계약은 유지한다.
