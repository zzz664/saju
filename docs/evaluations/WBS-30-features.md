# WBS-30 — M09 기능 조합·공통 API 계약

## 구현 전 완료 조건

- 직전/선행 PR #31의 develop MERGED(`66f1f4c`)와 origin/develop 포함, 선행 WBS-13 PR #14(`df6c7c6`) 포함 확인. develop 갱신과 이전 브랜치 안전 삭제 후 `feature/WBS-30-feature-orchestration` 한 개에서 실행순서 31의 WBS-30만 수행한다.
- FeatureRequest/FeatureResult/NarrationInput Zod 계약과 F01~F11 프로파일/의존성 레지스트리를 정의한다. F08~F10 대상, F11 상대 출생정보/계산정책을 필수로 구분한다. F10 monthly/daily/today는 한 기능의 하위 타입이며 today도 명시 날짜를 요구해 현재 시각을 추정하지 않는다.
- 기존 코어는 요청당 1회(F11은 A/B 각각 1회) 산출하며 필요한 M01/M02/M03/주제만 실행하고 요청 내 결과를 재사용한다. 필요한 M04~M08과 기능 실행기가 없으면 미구현·partial/unavailable을 명시한다. 미래 WBS의 명리 규칙/기능 실행기는 구현하지 않는다.
- F01은 F02~F07을 같은 원국으로 조합하는 기반만 구현하고 하위 기능·필수 모듈 미완료를 complete로 승격하지 않는다. 중복 판단 ID 제거·결정적 정렬·모듈/프로파일/코어 버전을 반영한 비식별 캐시 키를 추가한다.
- 기능 실행기는 검증된 모듈 근거의 ID만 선택한다. M09가 명리 문장을 창작하거나 후보를 확정으로 바꾸지 않는다. NarrationInput은 확정·채택 근거만 허용하며 실제 LLM/저장/제품 P06 경로는 연결하지 않는다.
- 서비스 포트와 검토 CLI를 제공하고 기존 /api/analysis 개발자 API·R01 및 JSON/해시는 유지한다. 신규 공개 HTTP/API·UI·DB·CI·Live 호출은 포함하지 않는다. 모듈/기능 포트의 테스트 Mock으로 라우팅·미래 모듈 완비 상황만 검증하며 구현 완료로 표시하지 않는다.

## 먼저 정의한 테스트

- 계약: 11개 기능/추가 필드 거절, 대상 필수/상호 배제, 날짜·시간대, F10 세 하위 타입, F11 상대 정보/별도 정책 필수.
- 계획/조합: 설계의 11개 의존성 표·전이 의존성, 필요한 모듈/주제만 호출, 공유 코어 1회·A/B 2회, F01 하위 6기능 1회씩, 중복/정렬·미구현 처리·complete 승격 방지.
- 오류/경계: 미상 시각·계산 불가·한쪽 원국 불가, 잘못된 모듈/기능 포트 반환/알 수 없는 근거 ID 거절, 원문 없는 오류, 불변/JSON 왕복.
- 버전/Mock: 원국 해시 보존, 기능/대상/상대/프로파일·모듈 버전별 캐시 분리, 확정 근거만 서술 투영, Mock 소비자의 계산 변경 차단, 실제 API 호출 0회.
- 통합: 실제 stdin CLI·기존 관련 원국/모듈/해시/CLI 회귀, 타입/린트/문서/변경 파일 포맷. 전체 테스트는 일괄 실행하지 않는다.

## 구현·검증 결과

- `executeFeature`/비동기 FeatureEngine 포트, 엔진 없는 공통 DTO, 고정 프로파일/전이 의존성 레지스트리, `feature-json` CLI를 추가했다. 요청 내 코어/모듈/주제를 재사용하며 F01은 하위 6개를 조합한다. F11은 두 원국을 독립 계산한다.
- 기존 코어 해시와 규칙을 유지한다. 선택 근거·대상·상대·실제 버전별 SHA-256 캐시 키를 생성한다. 모듈 반환/선택 ID를 검증하며 상충 M01과 미확정 M03을 확정 서술에서 제외한다. 외부 JSON은 서술용 검증 객체로 가장할 수 없다.
- 최초 테스트는 모듈 부재 RED였다. 구현 중 비동기 포트의 암시적 any를 명시 타입으로 수정했다. 최종 검사에서 테스트의 미사용 변수 경고 1건과 registry 포맷을 수정했다. 실패 무시/skip 없이 재검증했다.
- `npm test --`로 신규 4파일 53건과 관련 기존 21파일 584건, 총 **25파일 637건 PASS**. 미사용 변수 수정 후 해당 계약 테스트 16건도 재검증 PASS. 실제 CLI 자식 프로세스는 기존 Windows 샌드박스 ENOMEM 제약을 피하는 정상 환경에서 실행했다.
- 관련 기존 검증: topics 3파일, relations 4파일, structure 3파일, natal-facts 2파일, judgment 2파일, arbitration, core-export 2파일, core-fingerprint, independent-core-golden, cli, policy-cli. 실행은 이 목록과 features 4파일만 대상으로 했으며 전체 테스트 일괄 실행은 하지 않았다.
- `npx tsc --noEmit`, `npm run lint`(경고 0), 변경 TS/모듈·CLI README의 LF Prettier 검사 PASS. `npm run check:docs`: 58파일/92링크/0오류. diff 공백 검사도 수행한다. 기존 CRLF 파일은 일괄 재포맷하지 않았다.
- 서비스 조합 포트/공통 API 계약이며 신규 HTTP 라우트·UI·제품 P06 연결은 없다. UI/웹 route 변경 없음으로 build/E2E 미실행. next-env.d.ts의 사용자 변경을 보존하기 위해 Next typegen 대신 tsc를 실행했다.

## 제약과 후속 경계

- M04~M08 및 F02~F11 실행기는 미구현이다. F01은 조합 기반이며 WBS-38의 실제 종합 풀이가 아니다. 기본 요청은 partial/unavailable이고 Mock의 complete는 미래 포트 연결 검증이다. 현재 명리 규칙/후속 기능 완료로 주장하지 않는다.
- M02는 관계 계산을 M03에 재사용하며 공통 모듈 상태로 노출한다. 별도 관계 효과/길흉 판단을 만들어 넣지 않는다. M01/M02/M03의 기존 partial/관법 충돌/전문가 미승인 한계를 유지한다.
- 외부 영속 캐시·저장·소유권·후속 서술 제공자 연결은 포함하지 않는다. 실제 API 호출 0회/LIVE_NOT_RUN. .env/.local 실제 예산 파일 열람·변경, DB/PG/시크릿/CI 변경 없음.
- AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 변경은 보존하고 커밋에서 제외한다. develop PR 한 건 생성 후 다음 WBS 없이 중지한다.
