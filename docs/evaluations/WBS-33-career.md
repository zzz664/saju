# WBS-33 — F04 직업 적성·업무 성향

## 구현 전 완료 조건·테스트

- PR #34의 develop MERGED(`43fe91f`)와 origin/develop 포함을 확인했다. develop fast-forward·이전 브랜치 안전 삭제 후 실행순서 34/선행 WBS-32를 충족한 WBS-33 한 건만 수행한다.
- M01/M03 career와 기존 facts를 재사용하는 F04 실행기를 등록한다. 일간·월지 배경과 관살+인성/식상+재성의 복합 관측을 업무 경험 대조용 검토 방향으로 제공한다. 특정 직업·채용/승진·소득·능력·적성 점수나 성공을 단정하지 않는다.
- 관측 사실과 미확정 후보/보류를 구분하고 M01 관법·M02 관계 검토, 미상 시각, 출처/정책/규칙·프로파일·투영 버전을 보존한다. 코어/필수 모듈 불가는 unavailable, 상위 해석 미확정은 partial로 유지한다.
- 정상/양성·음성, 일간·월주 누락, 시주에만 있는 단서의 제외, 두 성별 기준값 불변, 관법 충돌·보류, 실제 evidence 경로/값, 과장 금지 문구·JSON 왕복/변조 거절·불변·캐시를 테스트한다.
- feature-json F04, 공통 FeatureResult→NarrationInput/Mock 소비자 계약과 F01의 코어/모듈 재사용을 검증한다. 기존 F02/F03·원국 해시·CLI·개발자 API 테스트 회귀를 확인한다. 전체 npm test는 자동 실행하지 않는다.
- 관련 테스트·타입·린트·변경 파일 포맷·문서 검사를 실행하고 worklog에 기록한다. 신규 HTTP/UI/R01 Provider 연결·P06/SSE·DB/PG·시크릿·CI는 포함하지 않는다. 실제 OpenAI 호출은 0회/LIVE_NOT_RUN이며 .env/실제 장부를 열람하지 않는다. 사용자 수정 3개를 보존·커밋 제외하고 PR 한 건 생성 후 중지한다.

## 구현·한계

- F04 규칙/실행기 v1.0.0, F04 프로파일/M03 career 투영 v1.1.0을 등록했다. 기존 M03 career의 두 family-pair 조건과 십성군 표를 재사용하며 신규 역법·십성·강약 계산은 하지 않는다. 업무 점검 문구는 policy:f04-work-review-v1로 추적한다.
- 확정 관측과 실제 적성을 분리한다. 정상 F04도 M01/M03 해석 한계를 보존해 partial이다. 원국/필수 모듈 불가는 unavailable이며 미상 기둥을 추정하지 않는다. 후보/보류·관법 충돌을 확정 직업 판단으로 승격하지 않는다. 특정 직업명·추천 목록·성공 확률·적성 점수는 생성하지 않는다.
- F01에서 코어·M01/M02를 재사용하고 F04의 동일 결과를 합친다. 기존 F02/F03 규칙·원국 JSON/해시는 유지한다. F05 이후 실행기는 미구현 상태다.
- 검토 경로는 feature-json F04와 공통 FeatureResult→NarrationInput/Mock 소비자다. 실제 R01/Provider·웹 선택지 연결은 추가하지 않았다. 기존 /dev/api-test의 core-base/F03 경로를 회귀 검증한다. 제품 P06/SSE·DB/PG·CI 변경 없음.

## 검증 결과

- 최초 테스트에서 implementation=missing RED를 확인했다. 과장 금지 검사의 직업명 '의사' 정규식이 '의사표현'을 잘못 잡는 음성 테스트 오류를 수정했다. 실패 무시/skip 없이 재검증했다.
- 신규 **3파일 21건**과 관련 기존 24파일 321건, 총 **27파일 342건 PASS**. 아래 파일만 npm test -- 인자로 지정했으며 전체 테스트는 일괄 실행하지 않았다. 실제 CLI 자식 프로세스는 기존 Windows 샌드박스 ENOMEM 제약을 피하는 정상 환경에서 실행했다.

```text
tests/career.test.ts tests/career-service.test.ts tests/career-cli.test.ts
tests/temperament.test.ts tests/temperament-service.test.ts tests/temperament-cli.test.ts
tests/features.test.ts tests/features-contract.test.ts tests/features-orchestration.test.ts tests/features-cli.test.ts
tests/strengths.test.ts tests/strengths-narration.test.ts
tests/topics.test.ts tests/topics-policy.test.ts tests/topics-service.test.ts
tests/structure.test.ts tests/structure-policy.test.ts tests/structure-service.test.ts tests/relations-service.test.ts
tests/core-export.test.ts tests/core-export-service.test.ts tests/core-fingerprint.test.ts
tests/independent-core-golden.test.ts tests/cli.test.ts tests/policy-cli.test.ts
tests/api-test.test.ts tests/api-test-catalog.test.ts
```

- 독립 기대값: 임자/병인/갑진/경신 합성 기둥에서 일간 갑·인월 본기 갑/비견, 시간 편관+연간 편인, 월간 식신+인월 장간 편재를 수동 열거했다. 시주 미상은 관살+인성 관측을 제외하지만 식상+재성은 유지한다. 실제 evidence 경로/값·JSON 왕복도 대조했다.
- 2024-04-04 17:30 KST의 기존 독립 절입 경계 사례로 진월/무일의 관법 충돌을 확인했다. M01은 deferred, M03 career 후보는 deferred/review-required를 보존한다. 자시 정책별 시각 미상, 성별 기준값 불변, F01 공유 계산, 입력의 임의 직업/점수/대상 필드 거절과 불변 Mock 경계를 검사했다.
- tsc --noEmit, lint(경고 0), 변경 TS/README LF 포맷·diff 공백 검사, 문서 링크 64파일/106링크/0오류를 확인한다. UI/HTTP/전송 변경이 없어 build/E2E는 실행하지 않았다. 기존 CRLF 파일 전체 재포맷 없음.
- 실제 OpenAI 호출 0회/LIVE_NOT_RUN. .env/실제 .local 장부 열람·변경 없음. AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 수정은 보존·커밋 제외하며 두 파일 해시는 작업 전과 동일하다. 전통 기호·검토 질문과 테스트 통과는 전문가 승인·과학적 적성 예측 보증이 아니다.
