# WBS-32 — F02 성격·기질

## 구현 전 완료 조건과 테스트

- 직전/선행 WBS-31 PR #33이 develop MERGED(`8675d23`)이고 origin/develop에 포함됨을 확인했다. develop fast-forward와 이전 브랜치 git branch -d 후 실행순서 33의 WBS-32 한 건만 구현한다.
- M01/M03 temperament를 재사용하는 F02 실행기를 등록한다. 일간·월지 맥락과 인성+식상/비겁+관살의 복합 관측을 조건부 기질 점검 방향으로 연결한다. 단일 오행·십성/개수/성별로 성격·능력·정신건강을 확정하지 않는다.
- 확정 기호 관측과 M03 해석 후보/보류를 구분한다. 관법/관계 충돌과 미상 시각 예외·근거/출처/정책/버전을 보존한다. 시주·기질을 추정하거나 기존 부분 결과를 complete로 승격하지 않는다.
- 정상/복합 패턴 성립·미성립, 일간·월주 누락, 출생시각 미상/경계 정책, 관법 충돌/관계 검토, 실제 evidence 경로/값, 결정성/원국 해시/불변/JSON 왕복/잘못된 입력을 검사한다.
- feature-json F02와 공통 FeatureResult→NarrationInput을 검증한다. Mock 소비자에게 확정 관측만 전달하고 계산 변경을 차단한다. F01 안에서 F02/F03은 같은 코어·M01/M02를 재사용하며 필요한 주제만 호출한다. 기존 F03 회귀와 다른 기능 미활성화를 확인한다.
- 관련 npm test·타입·린트·변경 파일 포맷·문서 검사를 실행한다. 신규 HTTP/UI/R01 Provider 연결·P06/SSE·DB/PG/CI는 포함하지 않는다. 실제 OpenAI 호출은 0회/LIVE_NOT_RUN이며 .env/실제 예산 장부는 열람하지 않는다. 사용자 수정 3개는 보존·커밋 제외한다. develop PR 한 건 생성 후 중지한다.

## 구현과 제약

- F02 규칙/실행기 v1.0.0, F02 프로파일/M03 temperament 투영 v1.1.0을 등록했다. 일간·오행·월지 본기/십성 배경과 M03이 채택한 두 복합 십성군만 사용한다. 성격 검토 문구는 policy:f02-review-questions-v1이며 실제 성향·능력·정신건강 확정이 아니다.
- confirmed는 기호의 관측에만 적용한다. M03 후보/보류와 M01 관법 충돌/부분 상태는 그대로 남기며 확정 서술에서 제외한다. 기본 F02는 partial, 코어/필수 모듈 불가는 unavailable이다. 표에 없는 조합을 반대 성향으로 해석하지 않는다.
- F02/F03의 서버 실행기 등록 표를 공유하고 필요한 주제만 투영한다. F01에서 같은 코어·M01/M02를 재사용한다. F03 규칙과 기존 코어 JSON/해시는 유지한다. 다른 기능 실행기는 구현하지 않았다.
- 검토 경로는 feature-json F02와 buildFeatureNarrationInput이다. Mock 소비자는 확정 관측만 받고 근거를 바꿀 수 없다. 기존 /dev/api-test의 F02 거절을 유지하며 R01/실 Provider 연결은 이번 범위가 아니다. 새 사용자 화면·API·CI·DB/PG 작업 없음.

## 검증 결과

- 최초 F02 implementation=missing의 RED를 확인했다. 월주 컨테이너와 branch 필드를 혼동한 타입/실행 오류는 branch 참조로 수정했다. 음성 테스트의 잘못된 계자 간지는 유효한 임자로 바로잡았다. 실패 무시/skip 없이 재검증했다.
- 신규 **3파일 19건**, 관련 기존 21파일 302건 포함 **24파일 321건 PASS**. npm test는 아래 파일만 지정했다. 실제 CLI 자식 프로세스는 기존 Windows 샌드박스 ENOMEM 제약을 피하는 정상 환경에서 실행했다.

```text
npm test -- tests/temperament.test.ts tests/temperament-service.test.ts tests/temperament-cli.test.ts
  tests/features.test.ts tests/features-contract.test.ts tests/features-orchestration.test.ts tests/features-cli.test.ts
  tests/strengths.test.ts tests/strengths-narration.test.ts
  tests/topics.test.ts tests/topics-policy.test.ts tests/topics-service.test.ts
  tests/structure.test.ts tests/structure-policy.test.ts tests/structure-service.test.ts tests/relations-service.test.ts
  tests/core-export.test.ts tests/core-export-service.test.ts tests/core-fingerprint.test.ts
  tests/independent-core-golden.test.ts tests/cli.test.ts tests/policy-cli.test.ts
  tests/api-test.test.ts tests/api-test-catalog.test.ts
```

- 독립 기대값: 임자/병인/갑진/경신 합성 기둥에서 일간 갑/목, 월지 인·본기 갑/비견, 연간 편인+월간 식신, 월지 장간 비견+시간 편관을 수동 열거했다. 시주 미상에서는 시간 편관을 의존하는 비겁+관살 관측만 사라지고 인성+식상은 유지한다. 모든 evidence 경로의 실제 값도 대조한다.
- 2024-04-04 17:30 KST의 진월/무일 관법 충돌은 M01의 기존 독립 경계 사례를 재사용했다. 서로 다른 관법의 확정 관측도 deferred로 보존하고 M03 후보를 확정 성격으로 선택하지 않음을 검증했다. midnight/zi-start 시각 미상과 성별 기준값 불변도 확인했다.
- npx tsc --noEmit, npm run lint(경고 0), 변경 TS/README LF 포맷·diff 공백 검사, 문서 링크 검사(62파일/102링크/0오류)를 확인한다. 전체 테스트/전체 포맷·build/E2E는 실행하지 않았다(UI/HTTP/전송 변경 없음).
- 실제 OpenAI 호출 0회/LIVE_NOT_RUN. .env/실제 .local 예산 장부 열람·변경 없음. AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 변경 보존·커밋 제외. 원전 분류·검토 질문 정책과 테스트 통과는 전문가 승인·성격 예측 정확도 보증이 아니다.
