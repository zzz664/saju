# M09 기능 조합·공통 계약 — WBS-30

`executeFeature(request, deps)`와 비동기 `featureEngine.execute`는 필요한 모듈만 호출해
FeatureResult를 조합한다. 공통 DTO는 엔진 없는 `@/schemas/features`에서 내보낸다.
기존 `/api/analysis`의 AnalysisInput/R01 계약·해시·사용자 P06은 유지한다. 이번 범위는
서비스 포트·검토 CLI이며 신규 HTTP 라우트나 사용자 화면을 만들지 않는다.

## 요청

기본 요청은 `{featureId, birthInput, calculationPolicy}`다. 기존 AnalysisInput에 ID를 더한다.

| 기능            | 추가 필수 필드                                                         |
| --------------- | ---------------------------------------------------------------------- |
| F01~F07         | 없음. target/상대 필드 거절                                            |
| F08             | `target: {at: ISO instant with offset, timezoneId}`                    |
| F09             | `target: {year, timezoneId}`                                           |
| F10 monthly     | `target: {kind: "monthly", year, month, timezoneId}`                   |
| F10 daily/today | `target: {kind: "daily" 또는 "today", date: "YYYY-MM-DD", timezoneId}` |
| F11             | `otherBirthInput`, `otherCalculationPolicy`                            |

두 사람의 정책은 독립적이다. F10은 하위 타입 3개지만 외부 ID는 하나다. today도 날짜를
명시하며 현재 시각을 추정하지 않는다. 대상은 조회 라벨이며 M06의 기간 `[start,end)`/간지를
계산한 것으로 표시하지 않는다. 날짜·시간대·대상 종류·누락/추가 필드를 Zod로 검증한다.

## 의존성·등록·상태

registry.ts는 설계 10의 11개 프로파일과 주제를 선언한다. M03은 M01/M02, M07은
M01/M02/M05/M06, M08은 양쪽 M01/M02/M03에 의존한다. F01은 F02~F07과 social 맥락을
조합한다. 코어는 요청당 1회, F11은 A/B 각각 1회 산출하고 모듈/사람/주제별로 요청 내 재사용한다.
외부 영속 캐시는 이번에 구현하지 않는다.

기본 구현은 기존 M01~M03 어댑터까지다. M04~M08은 MODULE_NOT_IMPLEMENTED,
F04~F11 실행기는 EXECUTOR_NOT_IMPLEMENTED로 남긴다. F02는 WBS-32의
[기질 관측·조건부 검토 실행기](../../../domain/features/temperament.md), F03은 WBS-31의
[관측·조건부 검토 실행기](../../../domain/features/README.md)를 등록했다. F01은 하위 상태/근거를 합치는
프레임워크이며 WBS-38의 종합 풀이 완료가 아니다. 미구현 기능을 공개 활성화하지 않는다.

서버가 신뢰하는 moduleExecutors/featureExecutors 포트로 후속 구현을 주입한다. 모듈 포트는
자기 모듈/대상/주제의 판단을 반환하고 기능 포트는 제공된 근거 ID만 선택한다. 미등록 ID,
다른 주제 근거·잘못된 모듈/추가 필드·예외는 거절한다. 코어와 상위 근거는 불변이다.
클라이언트 요청·LLM 응답이 포트를 구성할 수 없다. 테스트 Mock의 complete는 조합 검증이며
실제 후속 모듈/기능 완료가 아니다.

실행기 누락/상위 partial은 partial, 필수 모듈/원국 불가는 unavailable이다. F01은 원국이
있으면 미완료 하위를 partial로 보존하며 전체 원국 불가면 unavailable이다. complete는 모든
필수 코어·모듈·실행기와 F01 하위 6개가 완비되어야 가능하며 후보/보류를 확정으로 승격하지 않는다.
판단 ID를 중복 제거·정렬하고 같은 ID의 중복 모듈 판단은 거절한다.

결과에는 기존 코어 JSON/해시, 실제 모듈·프로파일·실행기 버전, 하위 상태/한계와 대상이
포함된다. 캐시 키는 코어 fingerprint/실제 manifest와 기능·대상·모듈·프로파일·실행기·선택
근거를 정규화해 SHA-256으로 만든다. 원본 출생정보는 출력이나 프리이미지에 넣지 않는다.
A/B 순서도 보존한다. 계산 캐시는 모델 ID에 의존하지 않으며 향후 서술 캐시는 별도로
모델/프롬프트/페르소나 버전을 포함해야 한다.

## 서술 입력·개발 검토

buildFeatureNarrationInput은 엔진이 만든 검증된 불변 결과만 받는다. 구조 스키마를 통과한
외부 JSON만으로 재사용할 수 없다. complete/confirmed/accepted 근거만 verifiedFindings에
투영하며, 관법 충돌 M01은 deferred로, M03 후보/보류는 partial로 유지해 확정 근거에서 제외한다.
WBS-31에서 F03은 공통 R01과 보호된 개발자 API 테스트의 Mock/Live 공급자에 연결했다.
R02/R03/P06에는 연결하지 않으며 Mock 소비자의 계산 변경도 차단한다.

검토 CLI feature-json은 FeatureRequest 한 개를 표준입력으로 받는다. F02/F03도 상위 해석 한계를
보존하므로 정상 요청이 partial·종료 2다. 그 외 실행기 미구현도 partial/unavailable을 명시한다. 입력/공급자 오류의 빈 stdout과
고정 오류 stderr와 구분한다. complete에만 종료 0을 사용한다. M09는 새 명리 판단이나 문장을
창작하지 않고 기존 판단의 구조 투영·선택·상태 조합만 담당한다.

[완료 조건·검증 기록](../../../../docs/evaluations/WBS-30-features.md)
