# 작업 기록

## 2026-10-23 — WBS-24: API 예산 가드·실험 접근제어

### 선행 확인과 구현 전 완료 조건

- 직전/직접 선행 PR #18(WBS-23)의 GitHub 실제 MERGED, 대상 develop, 병합 시각 2026-10-23 14:39:34 KST와 merge commit `8af0bf564769af76918013360e7849aaf35a171b`를 확인했다. origin/develop 원격 hash 일치, fetch 후 ancestor 확인. WBS.csv 실행순서 20의 WBS-24 한 건만 진행했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-23-llm-provider-prompt-mock` 안전 삭제 성공. 최신 develop에서 `feature/WBS-24-experiment-budget-access-guard` 하나를 생성했다. AGENTS/WBS/02/05/06/08, 관련 07·WBS-22 기록과 WBS-23 provider/서비스를 읽었다.
- 구현 전 완료 조건: 서버가 관리하는 실험 권한·허용 기한/환경·목록 확인, 요청 전에 전체 일/사용자 일/세션의 호출·토큰·비용 예약과 동시성 확인을 원자 적용, 실패/취소/저장소 오류에서 한도를 우회하지 않음. 실 API·계정/키·고객 UI/인증·DB·후속 WBS는 구현하지 않는다.
- 정상/오류/경계 테스트 선작성: 세 범위의 정확한 상한/초과·정수 단가, 환경/권한/기한/본문 위조 차단, 전역·사용자 동시성, 남은 예산의 경쟁 요청, 시각 미상 등 기존 provider 회귀, 실패 후 예약 유지, 취소 후 미종료 공급자 잠금, UTC 날짜 경계·시계 역행·원장 실패. 첫 실행은 새 서비스 모듈 부재로 종료 1을 확인한 후 구현했다.

### 구현과 검증 결과

- 순수 Zod 정책/권한 계약과 고정 오류, 요청 예약 산정을 추가했다. 활성화·development 환경·서버 resolver의 principal/session·허용 목록·만료 전 조건을 모두 요구한다. 환경/resolver 미설정과 예외는 기본 거절이다. 비동기 권한 확인 이후 예약 직전 환경/기한을 다시 확인한다. 클라이언트 userId/role/예산/세션 ID는 받지 않으며 코어의 추가 필드도 기존 검증으로 거절한다. 실제 OAuth resolver나 HTTP 실행 경로는 추가하지 않았다.
- 전체 요청(지시·입력·출력 스키마와 서버 max_output_tokens)의 UTF-8 바이트 한도를 확인한다. utf8-envelope-plus-output-v1은 입력 바이트+256 및 서버 출력 상한을 토큰 예산 단위로 예약하고 명시적 양의 정수 단가에서 microUSD를 BigInt로 올림 계산한다. 가정의 무료 토큰/0단가·자동 유료 전환을 사용하지 않는다. 이는 mock 예약 추정이며 실제 토크나이저·청구/가격표·모델 출력 상한 준수 검증이 아니다.
- MemoryExperimentBudgetStore는 전체/사용자 일/세션 예산을 모두 확인한 후 동기적으로 함께 반영하며 검사·반영 사이 await가 없다. 글로벌 동시 실행 상한과 principal별 1개 잠금을 함께 예약한다. 한 범위라도 실패하면 어떤 예산도 쓰지 않고 공급자를 호출하지 않는다. 세션 변경으로 사용자 일/전체 일 한도를 우회하지 못한다.
- 입장한 시도의 호출·예약량은 성공/거절/잘림/손상/공급자 실패/취소 후에도 유지한다. release는 활성 잠금만 해제하고 중복 실행에 안전하다. 호출자가 취소해도 실제 공급자 Promise가 끝날 때까지 잠금을 유지한다. 자정에도 활성 잠금과 세션 누적을 보존하며 일 예산만 UTC 날짜로 나눈다. 시계 역행·원장 장애·기록 한도 초과는 차단한다. 저장소/설정/권한 예외 전문은 고정 오류로 바꾼다.
- 기존 narrateCore에 직접 연결되는 guarded provider가 예약 이후 mock을 한 번 호출한다. 기존 sourceStatus·제한·근거 ID/출력 검증을 유지한다. NarrationRequest의 선택적 max_output_tokens 타입만 확장했고 공급자 호출 전 서버 상한으로 덮어쓴다. 기존 LIVE_DISABLED는 유지하며 실제 OpenAI 호출·키/SDK 설정·재시도·fallback은 없다.
- 초기 신규 27건/타입 검사가 통과한 뒤 기본 차단·서버 예외 비식별화·인증 후 만료/시작 전 취소·새 세션 우회·자정 잠금·원장 메모리 한도/해제 중복·정책 스냅샷·분수 단가 올림·무네트워크/로그·10건 동시 경쟁을 보강했다. 0단가 거절과 전체 요청 정확한 바이트 경계도 확인했다.
- 최종 `npm.cmd test -- tests/experiment-guard.test.ts tests/narration.test.ts`: 종료 0, 관련 2파일/66건 통과(신규 36 + 기존 provider 30). 동시에 들어온 서로 다른 principal의 요청 10건 중 남은 예산 3건만 허용되고 7건은 차단되며 호출/원장도 정확히 3건임을 확인했다. 각 예산 차원의 정확한 상한·1단위 부족 및 변경 없는 거절도 확인했다.
- `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 모두 종료 0, 린트 경고 0개. 변경 문서 로컬 링크 16개와 Git 공백 검사도 통과했다. 새 HTTP 라우트/Next 설정/의존성 변경이 없어 빌드/E2E/전체 회귀·설치를 반복하지 않았다. 테스트는 합성 입력만 사용하고 개인 cli-input.json을 실행 자료로 사용하거나 값을 로그에 출력하지 않았다.
- OpenAI Docs 스킬로 [공식 Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)를 검색 후 실제 페이지를 읽어 조직/프로젝트 제한과 별도 사용자 상한·재시도 누적을 확인했다. 애플리케이션의 UTC 예약 예산을 실제 계정 한도/무료 혜택/청구액과 동일하다고 표시하지 않는다.

### 변경 파일과 제약

- `src/domain/experiment/index.ts`, `README.md`: 정책·서버 principal/session·예산 예약·고정 오류/저장소 계약 및 mock/실연동 경계.
- `src/infrastructure/llm/experiment-budget.ts`, `src/application/narration/experiment.ts`: 단일 프로세스 원자 원장·잠금·메모리 상한·서버 접근/예약/실제 종료 연동.
- `src/domain/narration/index.ts`, `README.md`: 선택적 서버 출력 상한 타입과 guarded 실험 진입 문서.
- `tests/experiment-guard.test.ts`, 루트 `README.md`, `docs/worklog.md`: 예산·동시성·보안/경계·회귀와 결과/제약. 총 9개 작업 파일만 커밋한다.
- 메모리 원장은 프로세스 재시작/새 인스턴스/다중 프로세스 간 공유되지 않는다. 요청마다 새로 만들면 안 된다. 기존 기록을 버려 예산을 되살리지 않으며 기본 10,000개 기록 한도 도달 시 차단한다. production과 실 API를 계속 닫고 로컬 mock 용도로만 제공한다. 공유 영속 원장·실 SDK 토큰/과금·실험 계정/동의/환경·실 OAuth 검증은 **BLOCKED**이며 이번 테스트로 완료를 주장하지 않는다.
- 서버 resolver는 신뢰할 수 있는 인증 어댑터의 포트다. 클라이언트 객체를 그대로 돌려주는 구현을 인증으로 간주하지 않는다. 소셜로그인·실서비스 API 게이트·분산 잠금은 해당 후속 WBS에서 별도 구현/검증한다. DB 커밋/report.completed 판정이나 R01/P06/R02/R03 계약은 변경하지 않는다.
- 사용자 수정 AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json의 SHA-256 동일을 확인하고 보존·커밋 제외한다. WBS.csv 상태·명리 규칙/11개 기능·키/PG/CI/배포 및 다음 WBS는 변경하지 않는다. develop 대상 PR 한 건 생성 뒤 즉시 중지한다.

## 2026-10-23 — WBS-23: LLM provider·프롬프트·mock

### 선행 확인과 구현 전 완료 조건

- 직전 PR #17(WBS-22)의 GitHub 실제 상태 MERGED, 대상 develop, 병합 시각 2026-10-23 14:19:44 KST 및 merge commit `94e3480b78750df0523bbf08424a3e5a4556fd22`를 확인했다. origin/develop 원격 hash 일치, fetch 후 ancestor 확인. 직접 선행 WBS-13(PR #14)도 develop MERGED 및 ancestor 확인. WBS.csv 실행순서 19의 WBS-23 한 건만 진행했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-22-openai-consent-environment-checklist` 안전 삭제 성공. 최신 develop에서 `feature/WBS-23-llm-provider-prompt-mock` 한 개를 생성했다. AGENTS/WBS/02/05/06/08, 관련 11/12/20·비스트리밍 참고 예제 및 기존 core-export 계약을 읽었다. 11의 캐릭터 승인과 20의 실제 SSE는 이번 범위로 구현하지 않는다.
- 완료 조건: 기존 코어에서 확정·채택 판단만 추출하는 provider 포트, 버전 있는 상위 지시/하위 데이터와 내부 JSON 스키마, 결정적 mock, 구조/근거 연결 및 오류 검증. 실제 OpenAI 호출·키/환경 설정 변경·P06/SSE/DB·예산 가드는 제외하며 실연동은 BLOCKED로 기록한다.
- 정상/오류/경계 테스트를 먼저 작성했다: 기존 복사 투영/원국 불변성, 지시/데이터 분리·JSON 전용 내부 모드·고정 모델, 결정적 mock/무네트워크·로그, 시각 미상(midnight/zi-start)·unavailable, 거절·중단·실패, 손상/과대/버전/추가 필드/알 수 없는·중복·누락 ID, 원본 검증 전 호출 차단, 공급자 예외·취소. 첫 실행은 서비스 모듈 부재로 종료 1을 확인했다.

### 구현과 검증 결과

- 기존 buildManualPrompt의 투영만 `buildManualPromptData`로 추출했다. 기존 CoreExport 전체 의미 검증과 중재에서 채택된 confirmed 선별을 공유하며 수동 프롬프트 문구/형식/버전은 유지한다. 이름·원본 날짜/시각/좌표를 새로 전달하지 않는다. 부분/억제/보류 판단은 제외하고 원래 입력·계산·중재 제한을 보존한다.
- 순수 도메인의 NarrationProvider와 고정 gpt-4o-mini/store:false/stream:false 요청 조립을 추가했다. docs/12의 공통 명리·안전·한국어 정책을 바탕으로 별도 내부 JSON 출력 지시를 사용한다. 사용자 역할 JSON은 지시와 분리하고 markup/줄 구분자를 이스케이프한다. R01 PersonaProfile 예시·R02/R03 지시를 조립하지 않는다. 프롬프트/서술 스키마 버전은 각각 1.0.0이다.
- 공급자 응답 completed/refused/incomplete/failed를 strict하게 구분한다. completed의 JSON은 버전/필드/0~20섹션/공백 제거 후 1~1500자/실제 UTF-8 128 KiB 한도를 확인하고 모든 허용 findingId가 정확히 한 번 존재해야 한다. 위조·중복·누락을 거절하고 원래 근거 순서로 정렬한다. sourceStatus·limitations·mock/모델/버전 메타는 서버 스냅샷에서 붙인다. 공급자 completed는 DB report.completed 의미가 아니다.
- 실제 동작은 명시적으로 주입한 mock만 허용하며 kind=openai는 generate 이전 LIVE_DISABLED로 거절한다. 환경변수나 키로 자동 전환하지 않고 SDK/HTTP 구현을 추가하지 않았다. Mock은 확정 assertion에 검증용 접두어만 붙이며 결정적이다. 토큰/청구량·모델 품질을 만들어 기록하지 않는다. 거절/중단/실패 모드를 제공하고 자동 재시도·성공 fallback은 없다.
- 시작 전/대기 중/늦게 완료한 공급자의 취소를 처리한다. signal을 전달하고 취소 뒤 결과를 채택하지 않으며 이벤트 리스너를 정리한다. 내부 공급자 작업을 강제로 종료한다고 보장하지 않는다. 공급자 예외 전문/원문을 외부 오류나 일반 로그로 노출하지 않는다.
- 초기 신규 25건과 타입 검사가 통과한 뒤 실호출 차단·UTF-8 정확한 한도/1바이트 초과·문장/섹션 상한·요청별 스키마 독립·끝나지 않는 공급자 대기 중 취소를 보강했다. 최종 `npm.cmd test -- tests/narration.test.ts tests/developer-analysis-api.test.ts`: 종료 0, 관련 2파일/40건 통과(신규 30건 + 기존 API 10건). 기존 P17의 코어/해시/수동 프롬프트 응답과 미상 계약을 회귀 확인했다.
- `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 모두 종료 0, 린트 경고 0개. 변경 문서의 로컬 링크 16개와 Git 공백 검사도 통과했다. 새 라우트/의존성/Next 설정 변경이 없어 전체 빌드/E2E/설치·전체 회귀는 반복하지 않았다. 테스트는 별도 합성 입력만 사용하며 사용자 개인 cli-input.json을 가져오거나 값을 로그에 출력하지 않았다.
- OpenAI Docs 스킬로 공식 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)를 검색 후 열어 형식·거절/불완전 처리·지시 우선순위를 확인했다. 최신 예시의 다른 모델로 치환하지 않았다. 모델 가용성/지원 종료와 조직 혜택/동의/환경 분리는 WBS-22의 실제 수동 확인이 남아 있다.

### 변경 파일과 제약

- `src/domain/core-export/index.ts`, `README.md`: 기존 수동 프롬프트의 데이터 투영 재사용과 사용법. 실제 코어 계산·판단·버전·해시 정책은 변경하지 않는다.
- `src/domain/narration/index.ts`, `prompt.ts`, `README.md`: provider/응답·JSON 스키마, 근거 연결/한도/고정 오류, 지시/데이터·버전과 내부 개발 범위.
- `src/application/narration/index.ts`, `src/infrastructure/llm/mock.ts`: mock 전용 조합·취소/오류 검증과 결정적 테스트 공급자.
- `tests/narration.test.ts`, 루트 `README.md`, `docs/worklog.md`: 정상/오류/경계·회귀, 사용법/결과. 총 10개 작업 파일만 커밋한다.
- 구조/근거 ID 일치 검사는 문장의 의미·환각/안전·자연스러운 한국어 품질을 보장하지 않는다. 결과는 개발자 내부 평가용이며 UI/API/저장에는 연결하지 않는다. 승인형 캐릭터는 WBS-47, 예산·실험 접근제어는 WBS-24, 실제 SSE/대화/DB 완료는 해당 후속 WBS 범위다. 실연동은 계정/동의·환경과 실 API 승인 미확인 및 어댑터 미구현으로 **BLOCKED**다. Mock/계약 구현 완료를 실 API·과금/무료 토큰·LLM 품질 검증 성공으로 표시하지 않는다.
- 기존 사용자 수정 AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json의 SHA-256 동일을 확인하고 커밋에서 제외한다. WBS.csv 상태·의존성·만세력/고전/11개 기능·P06/report.completed/OAuth/DB/PG/키/배포/CI 및 다음 WBS는 변경하지 않는다. develop 대상 PR 한 건 생성 후 즉시 중지한다.

## 2026-10-23 — WBS-22: OpenAI 혜택·동의·환경 분리 체크

### 선행 확인과 완료 조건

- 직전 PR #16(WBS-20)의 실제 GitHub 상태 MERGED, 대상 develop, 병합 시각 2026-10-23 14:07:49 KST와 merge commit `0787cddf5d9f876f6932bbfeb1afdbddc448f494`를 확인했다. origin/develop 원격 hash 일치, fetch 후 ancestor 확인. 직접 선행 WBS-18(PR #1)도 develop MERGED 및 ancestor를 확인했다. 실행순서 18의 WBS-22 한 건만 진행했다.
- `git checkout develop`, `git pull --ff-only origin develop` 성공 후 `git branch -d feature/WBS-20-developer-analysis-ui-api` 안전 삭제 성공. 최신 develop에서 `feature/WBS-22-openai-consent-environment-checklist` 하나를 생성했다. AGENTS/WBS/02/05/06/08 및 관련 07·환경 예제를 읽었다.
- 구현 전 정한 완료 조건: 조직 설정 수동 확인 체크리스트와 증빙/판정 양식. 혜택 자격·동의·환경 분리의 실제 적용은 별도 확인으로 남기며 무료 토큰 수나 실호출 승인을 추정하지 않는다. 코드/키/계정 설정·SDK/예산 구현은 변경하지 않는다.
- 먼저 정의한 검증: 정상은 개발 전용 프로젝트·혜택 조건·합성 자료·동의/예산 증빙을 갖춘 판정 흐름, 오류는 계정 접근/혜택/동의 미확인·환경 혼용·고객 자료 전송 거절, 경계는 혜택 소진/초기화 미확인·동의 철회·모델 종료·store:false의 보관 정책 구분. 문서 시나리오를 검토하고 로컬 링크/변경 범위와 기존 최소 npm 테스트를 확인한다. 실제 API 호출로 이 사례를 검증하지 않는다.

### 결과와 제약

- 조직/혜택 7개, 동의/전송/보관 6개, 환경 분리 6개 항목과 비식별 기록 양식, 정상/오류/경계 시나리오를 작성했다. NOT_CHECKED/PASS/FAIL/NOT_APPLICABLE을 구분하고 미확인 혜택 인정량은 0으로 두며 자동 유료 전환을 허용하지 않는다. Mock/CI·수동 개발·스테이징·운영 프로젝트/키와 자료/공유 범위의 요구사항을 구분했다. 이는 적용 완료 증빙이 아닌 수동 점검 기준이다.
- OpenAI Docs 스킬을 적용해 공식 [Data controls](https://developers.openai.com/api/docs/guides/your-data), [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini), [Deprecations](https://developers.openai.com/api/docs/deprecations)를 검색한 뒤 실제 페이지를 읽었다. API 학습 공유와 보관 정책의 차이, 환경 분리 및 지정 모델의 지원 종료 재확인 근거를 체크리스트에 링크했다. 확인일 기준 공식 종료 안내에 gpt-4o-mini-2024-07-18의 2027-01-14 종료가 기재돼 있으며 지정 모델을 임의 교체하지 않았다.
- 공개 문서나 로그인 전 설정 페이지 열람으로는 사용자 조직의 혜택·공유 동의·프로젝트/키 분리를 확인하지 못했다. 19개 실제 확인 항목과 조직 점검은 전부 NOT_CHECKED, 실호출 승인은 미승인이다. 계정 확인 완료/실연동 성공으로 표시하지 않는다. 체크리스트라는 WBS 산출물과 외부 조직 점검을 구분해 후속 관리자가 확인할 수 있도록 했다.
- `npm.cmd test -- tests/bootstrap.test.tsx`: 종료 0, 기존 기본 검증 1파일/2건 통과. 문서만 변경해 새 구현을 그대로 반복하는 테스트는 만들지 않았다. 문서의 정상/오류/경계 처리 기준을 수동 검토했으며 이것을 API 실행 테스트로 표시하지 않는다. 타입/린트/빌드·전체 회귀는 실행 코드/설정/의존성 변경이 없어 반복하지 않았다.
- 변경 문서 4개의 로컬 Markdown 링크 대상 14개가 모두 존재함을 확인했고 `git diff --cached --check`도 통과했다. 최초 링크 검사 명령은 PowerShell stdin의 한글 경로 인코딩으로 실패했으며 파일명 검색 방식으로 수정한 검사가 종료 0으로 통과했다. 기존 사용자 수정 AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json의 SHA-256은 이전 작업 종료 시와 동일하며 커밋에서 제외한다. 개인 입력 예제 값은 읽거나 테스트/로그로 사용하지 않았다.
- 변경 파일: `docs/checklists/WBS-22-openai-account-review.md`(절차/시나리오/기록), `docs/08_OpenAI_실험_비용_및_보안.md`(점검 진입·현재 상태), `README.md`(진입 링크), `docs/worklog.md`(선행·검증·제약). 이 4개 문서만 커밋한다.
- 실제 조직 설정 점검/변경·키 발급/교체·API 호출·비용 발생·SDK/캐시·예산 게이트·P06/SSE/DB/PG/CI/배포는 수행하지 않았다. WBS.csv의 TODO와 미확인 항목을 임의로 완료 처리하지 않는다. 실호출/설정 변경이 필요하면 환경·자료·기간·비용 범위를 정한 별도 승인이 필요하며 이번 작업에서 그 승인을 요청하거나 실행하지 않았다. develop 대상 PR 한 건 생성 뒤 즉시 중지한다.

## 2026-10-23 — WBS-20: 개발자 검증 UI 및 서버 API

### 선행 확인과 구현 전 완료 조건

- 직전 PR #15(WBS-14)가 develop에 MERGED(2026-10-23 00:55:28 KST)임을 GitHub에서 확인했다. merge commit `280034e6f05239056bc2dd14571d799be8565cb0`와 origin/develop 원격 hash 일치 및 fetch 후 ancestor 확인. WBS.csv 실행순서 17, 직접 선행 WBS-09(PR #10)/13(PR #14)/18(PR #1)의 develop 병합도 확인했다. 작업 재개 후에도 PR #15 MERGED와 열린 PR 0건을 재확인했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-14-deterministic-versioned-hash` 안전 삭제 성공. 해당 develop에서 만든 `feature/WBS-20-developer-analysis-ui-api` 한 개에서 중단 지점부터 계속했다. AGENTS/WBS/02/05/06/08, 관련 명리·UI·P17/API 상세(10/13/14/18)와 기존 계산/내보내기/해시 계약을 읽었다.
- 구현 전 완료 조건: 개발환경 전용 P17 `/dev/validation`, 서버 Zod 입력 검증을 거치는 `POST /api/analysis`, 기존 계산 한 번으로 원국·기초 판단/근거·정책/실제 버전·미상·해시·복사 JSON/프롬프트 제공. production에서는 화면과 API 모두 404. 사용자 원본 입력·예제·개발 서버·생성 타입을 보존한다.
- 먼저 정의한 정상 검증: 실제 어댑터로 입력→POST→JSON/원국/근거/해시 표시 및 클립보드 왕복. 오류: 스키마/UTF-8/JSON/본문 한도·콘텐츠 타입/메서드/Origin·공급자 실패, 잘못된 응답과 이전 결과 잔류 방지. 경계: 시각 미상/자시 정책, 경도 미상의 진태양시, 320~1440px, 환경/호스트 차단과 실제 프로덕션 빌드/기동. API 테스트는 미구현 모듈 실패를 확인한 뒤 연결했다. 검토 중 발견한 음력 말일·윤달 E2E도 보강했다.

### 구현과 검증 결과

- AnalysisInput을 검증한 개발용 서비스가 기존 calculateHashedCoreExport를 한 번 호출하고 같은 document의 WBS-13 수동 프롬프트를 반환한다. DeveloperAnalysisResponseSchema로 코어/해시 형식·프롬프트 연결을 검증한다. 원래 complete/partial/unavailable과 판단·중재·버전 계약을 보존한다. 해시를 DB 완료나 출처 인증으로 사용하지 않는다.
- 서버 게이트는 development + 로컬 Host + 같은 Origin(프로토콜/호스트/포트)이며 입력을 읽기 전에 환경/호스트를 거절한다. JSON만 허용하고 선언 길이와 실제 스트림 수신 바이트를 64 KiB로 제한한다. 고정 오류와 no-store/noindex 헤더를 반환하며 원본 입력·공급자 예외를 반사하거나 일반 로그에 출력하지 않는다. production에서 GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD 모두 404다.
- 모바일 P17은 양음력·윤달·시각 미상·명시적 시간대/좌표/순역 기준·계산 정책 입력, 원국/기초 판단 근거/미상/충돌/버전·체크섬과 JSON/프롬프트 복사를 제공한다. 입력 변경/재요청/실패 시 오래된 결과를 지우고 계산 중 입력을 잠근다. 원본 입력은 POST 본문으로만 전송하고 브라우저 저장소·DB에는 저장하지 않는다. 고객 루트/P06·일러스트·제품명을 추가하지 않았다.
- 실제 Next 실행에서 Temporal 패키지 버전 파일 조회가 번들러에 의해 잘못 변환되는 문제를 발견했다. native createRequire.resolve와 경로 기반 파일 조회, serverExternalPackages로 실제 manifest를 보존했다. 시간대 계산·골든·정책은 변경하지 않았으며 관련 역사 DST/오류 테스트를 함께 확인했다. Next가 URL을 localhost로 정규화하는 경우에는 검증된 Host를 기준으로 Origin을 비교하도록 수정하고 회귀 테스트를 추가했다.
- 브라우저 검사 중 접근성 레이블의 select 옵션 포함/Next 자체 alert 중복을 확인해 명시적 label과 오류 이름을 사용했다. Windows 클립보드 CRLF와 textarea LF의 차이만 정규화해 전체 복사 문자열이 같은지 검사한다. 합성 자료 외의 출생정보를 테스트나 오류 로그에 사용하지 않았다. 양력 date 입력기가 음력 2월 30일을 차단하는 문제는 달력별 Zod 검증을 적용하는 문자열 날짜 입력으로 수정했다.
- 최종 `npm.cmd test -- tests/developer-analysis-api.test.ts tests/bootstrap.test.tsx tests/timezone.test.ts tests/timezone-errors.test.ts`: 종료 0, 관련 4파일/56건 통과(API 신규 10건). `npm.cmd run lint`: 종료 0, 경고 0개.
- 최종 `npm.cmd run test:e2e`: 종료 0. 설치된 Chrome에서 실제 기본 Turbopack 개발 서버의 13건 통과(정상, 시각 미상, 경도 미상, 음력 말일·윤달, 입력/서버 오류·손상 응답, 실제 JSON/프롬프트 클립보드, 320/390/768/1440px 가로 넘침). 정상/미상 계산은 mock 없이 실제 로컬 어댑터를 호출했다. 320px 전체 화면 스크린샷도 확인했다.
- 같은 E2E 명령이 격리 작업공간에서 기본 `next build`(Turbopack), `next typegen`, `tsc --noEmit`를 모두 종료 0으로 실행했다. 실제 `next start`에서 P17 404/본문 부재 및 API 7개 메서드의 404·no-store를 확인하는 프로덕션 E2E 1건도 통과했다. 합계 브라우저 14건이다. 진단 단계 Webpack 검사 후 최종 검증은 기본 Turbopack으로 수행했고 root dev/build 스크립트는 유지했다.
- E2E 실행기는 임시 폴더에 소스/의존성을 실제 복사한다(Turbopack 프로젝트 경계 보존). 환경파일·개인 cli-input·사용자 AGENTS/next-env는 복사하지 않는다. 임의 포트의 검증 서버만 기동/종료하고 경로 확인 후 자체 임시 폴더만 정리한다. 기존 개발 서버/.next는 사용하거나 종료하지 않았다. CI/실패 무시/skip은 추가하지 않았다.
- `@playwright/test@1.64.1`을 정확한 개발 의존성으로 추가했다. npm 설치는 종료 0이며 잠금 파일에 테스트 런타임을 기록했다. npm이 제거한 기존 선택 플랫폼 peer 메타데이터 2개는 원래 값으로 보존했으며 기존 의존성 버전 변경은 없다. 설치가 보고한 기존 개발 의존성 high 5건은 해결 완료로 표시하지 않았으며 감사 강제 수정은 하지 않았다. 전체 릴리스 회귀/공급자 실연동 검증은 이번 범위가 아니다.

### 변경 파일과 제약

- `src/server/developer-analysis.ts`, `src/app/api/analysis/route.ts`: 개발환경/로컬/Origin·입력 게이트, 고정 오류·캐시 금지, 실제 계산 어댑터 연결.
- `src/domain/developer-analysis/index.ts`, `src/application/developer-analysis/index.ts`: 기존 분석/해시와 수동 프롬프트를 묶은 응답 계약·단일 계산.
- `src/app/dev/validation/page.tsx`, `validation-form.tsx`, `validation.module.css`, `README.md`: P17 접근 차단, 반응형 검증·복사와 사용법/제약.
- `next.config.ts`, `src/infrastructure/timezone/index.ts`: Node 전용 계산 패키지와 실제 Temporal 버전 조회의 번들링 호환.
- `tests/developer-analysis-api.test.ts`, `tests/e2e/developer-analysis.spec.ts`, `developer-production.spec.ts`: API 계약·실제 브라우저·프로덕션 차단 검증.
- `playwright.config.ts`, `scripts/developer-e2e.mjs`, `package.json`, `package-lock.json`, `.gitignore`: 고정 테스트 도구·격리 실행·산출물 제외. 루트 `README.md`, `docs/worklog.md`: 경로/검증/범위 기록.
- Host/Origin 제한은 원격 계정 인증이 아니다. 개발 서버는 `--hostname 127.0.0.1`로 로컬에만 바인딩한다. production 화면/API는 차단하며 OAuth/소유권/DB·저장 조회 API는 후속 WBS 범위다. 원본 날짜를 제거해도 원국·파생 분석은 민감할 수 있다. E2E는 설치된 Chrome(또는 환경변수로 지정한 Edge)과 의존성 복사 공간이 필요하다.
- WBS.csv 상태는 임의로 완료 처리하지 않았다. 기존 사용자 수정 AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json의 SHA-256 동일을 확인하고 커밋에서 제외한다. 명리 규칙/11개 기능·R01/P06/SSE/report.completed/OAuth/DB/PG/OpenAI 호출·키/배포/CI 및 이후 WBS는 변경하지 않았다. develop 대상 PR 한 건을 생성하고 즉시 중지한다.

## 2026-10-23 — WBS-14: 결정성·버전·해시

### 선행 확인과 구현 전 완료 조건

- PR #14(WBS-13)이 develop에 MERGED(2026-10-23 00:40:14 KST)임을 GitHub에서 확인했다. merge commit `df6c7c6e4d3243f21d907d6c87639892f9104187`와 origin/develop 원격 hash 일치, fetch 후 ancestor 확인. WBS.csv 실행순서 16/선행 WBS-13을 충족하며 TODO 상태만으로 실제 완료를 판단하지 않았다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-13-json-manual-prompt` 안전 삭제 성공. 최신 develop에서 `feature/WBS-14-deterministic-versioned-hash` 하나를 생성했다. AGENTS/WBS/02/05/06/08 및 관련 10의 결정성·버전/캐시 경계, 기존 JSON·판단/중재/시간 정책·CLI를 읽었다.
- 완료 조건: 검증된 코어 JSON을 변경하지 않는 결정적 정규화와 SHA-256 체크섬, 실제 계산/정규화/facts/판단/중재 버전 manifest 및 버전이 명시된 해시 정책. 같은 합성 입력의 전체 계산을 100회 실행해 같은 해시를 확인하고 내용·정책·실행 버전 변경/변조를 구분한다. 원본 출생 입력이나 모델/프롬프트를 코어 해시 입력에 넣지 않는다.
- 정상 테스트 선작성: 객체/정수형 키 순서 독립, 배열·한국어/Unicode·null 보존, SHA-256 독립 기대값, 원본 JSON·버전 보존, 실제 100회 계산/각 공급자 100회 호출, CLI 호스트 시간대 독립. 오류: 비 JSON 값·접근자/순환/성긴 배열·잘못된 문서/버전/manifest/해시·공급자 오류. 경계: -0·중복 객체 참조·깊이 64/65, partial/unavailable 각 100회 해시, 버전/정책 변경, 기존 내보내기와 종료 코드/비식별 오류.

### 구현과 검증 결과

- `canonicalizeJson`의 sorted-json-v1은 객체 키를 UTF-16 순서로 직접 직렬화하고 배열 순서를 유지한다. 문자열/숫자의 JSON 표현을 사용하며 Unicode 정규화를 하지 않는다. 정수처럼 보이는 키의 삽입 순서에 의존하지 않고 비유한 수·undefined/BigInt·함수·심볼·접근자/비열거 속성·비평범 객체·순환·성긴/추가 속성 배열과 64단계 초과를 고정 오류로 거절한다. 프로젝트 정책이며 RFC 8785 전체 구현으로 표시하지 않는다.
- `fingerprintCoreExport`는 기존 CoreExport를 검증하고 `{ policy, versions, document }` 전체의 정규화 UTF-8을 SHA-256으로 계산한다. fingerprint.core-export/1.0.0, sorted-json-v1 및 실제 SDK/기둥 규칙·Temporal/ICU/tzdb·파생 facts/출처·판단 규칙집/카탈로그·중재 provenance를 기록한다. 수행하지 않은 단계는 null이며 원래 문서와 complete/partial/unavailable을 보존한다.
- 도메인은 SHA-256 포트만 사용하고 Node 내장 crypto 어댑터를 infrastructure에 추가했다. 키/환경변수·파일·네트워크·시계·난수를 사용하지 않는다. 해시 공급자의 잘못된 값이나 예외 전문은 고정 FingerprintError로 바꾼다.
- HashedCoreExportSchema는 strict/readonly 문서·상태·정책/버전/manifest·해시 형식을 확인하고, verifyCoreFingerprint는 실제 바이트 체크섬을 다시 계산한다. 형식 검증과 실제 체크섬 일치 여부를 구분한다. 정책/실제 tzdb 버전/계산 내용이 바뀌면 해시가 바뀌고, manifest/정책/다이제스트나 문서를 변조하면 검증에 실패한다.
- calculateHashedCoreExport와 hash-json CLI를 추가해 기존 계산을 한 번 호출하고 `{ status, document, fingerprint }`를 반환한다. 기존 JSON/수동 프롬프트/구조 스키마는 유지한다. complete/partial/unavailable 종료 0/2/2, 입력 2·구성/공급자 실패 1과 비식별 오류를 확인했다. 내용은 원래 기초 판단 범위이며 해시를 계산 완료·DB 커밋·권한 판정으로 사용하지 않는다.
- 도메인/서비스 테스트는 각각 모듈 부재의 실패를 먼저 확인했다. 구현 후 도메인 9건은 통과했으나 테스트의 BigInt 리터럴이 기존 ES2017 target에 맞지 않아 타입 검사가 실패했다. 설정은 유지하고 BigInt 생성자로 수정했다. 이후 실제 전체 계산 100회(심볼 카탈로그/기둥 공급자 각각 100회), partial/unavailable 문서의 체크섬 각 100회 및 실제 CLI UTC/Pacific-Honolulu의 동일 해시를 확인했다.
- 최종 `npm.cmd test -- tests/core-fingerprint.test.ts tests/core-fingerprint-service.test.ts tests/arbitration.test.ts`: 종료 0, 관련 3파일/32건 통과(신규 15건). `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`도 종료 0. 깊이 한계·미지원 정규화 정책 거절을 보강한 뒤 재검증했다. SHA-256 빈 문자열/abc 및 수기 정규화 문자열의 독립 기대값도 통과했다.
- 이전에 확인된 격리 환경의 tsx Windows 사용자 조회 오류 때문에 실제 CLI를 포함한 최종 검사는 일반 실행 권한으로 수행했다. skip/실패 무시 옵션은 없다. AGENTS에 따라 관련 검사만 수행했다. 사용자가 수정한 cli-input.json은 읽어 골든으로 사용하거나 값을 로그에 출력하지 않고 별도 합성 입력을 사용했다. 기존 내보내기 CLI 회귀도 합성 입력으로 검증했다.
- 의존성·Next 설정/라우트 변경이 없어 전체 테스트/설치/빌드는 반복하지 않았다. 기존 생성 타입과 개발 서버를 보존했다.

### 변경 파일과 제약

- `src/domain/core-fingerprint/index.ts`, `README.md`: 정규화·버전 manifest·해시/검증 계약 및 범위.
- `src/infrastructure/hashing/index.ts`, `src/application/core-fingerprint/index.ts`: Node SHA-256 포트 구현과 기존 계산 재사용.
- `src/cli/run.ts`, `main.ts`, `README.md`: hash-json 연결·종료 코드·사용법.
- `tests/core-fingerprint.test.ts`, `tests/core-fingerprint-service.test.ts`, `tests/helpers/fingerprint-input.ts`: 결정성 100회·독립 해시 기대값·변조/버전/미상·실제 CLI·개인정보 없는 합성 입력.
- 루트 `README.md`, `src/domain/core-export/README.md`, `docs/worklog.md`: 구현 경로·범위·검증 결과. 총 13개 작업 파일만 커밋한다.
- 이 값은 내보낸 결과의 체크섬이며 원본 입력의 보호된 캐시 키·사용자 식별자·서명/MAC/출처 인증이 아니다. 다른 출생 입력이 동일한 내보내기 결과를 만들면 같은 해시가 된다. 문서와 해시를 함께 바꿀 수 있으므로 인증/권한/DB 완료 판정에 사용하지 않는다. 분석과 그 해시는 민감할 수 있으며 익명화 보장이나 공개 로그용 ID가 아니다. 입력·서술 캐시/DB 저장은 구현하지 않았다.
- 같은 내용·정책·실제 버전에서의 재현성이다. ICU/tzdb 등 런타임 데이터가 바뀌면 원국 또는 버전 자체가 달라져 해시가 바뀔 수 있다. 모델/프롬프트 버전은 코어 해시와 분리하며 실제 서술 캐시는 해당 후속 WBS에서 구성한다.
- AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json의 기존 사용자 수정은 보존·커밋 제외한다. WBS.csv 상태·기존 JSON/판단/중재·고전 카탈로그·역법/파생 계산·의존성·UI/DB/OAuth/PG/OpenAI/키/CI와 이후 WBS는 변경하지 않는다. develop 대상 PR 한 건 생성 후 중지한다.

## 2026-10-23 — WBS-13: JSON·수동 ChatGPT 프롬프트

### 선행 확인과 구현 전 완료 조건

- PR #13(WBS-12)이 develop에 MERGED(2026-10-23 00:15:13 KST)임을 GitHub에서 확인했다. merge commit `84b01940a7e84734b31539f85fd1c51d37a87192`와 origin/develop 원격 hash 일치, fetch 후 ancestor 확인. WBS.csv 실행순서 15/선행 WBS-12를 충족하며 CSV의 TODO만으로 완료를 판단하지 않았다.
- develop checkout/ff-only pull과 `git branch -d feature/WBS-12-conflict-uncertainty-arbitration` 안전 삭제 성공. 최신 develop에서 `feature/WBS-13-json-manual-prompt` 하나를 생성했다. AGENTS/WBS/02/05/06/08, 관련 10/12 문서 및 기존 중재·계산/입출력 계약을 읽었다.
- 완료 조건: 기존 계산/확정 facts·판단/출처·중재/미상 trace를 보존하는 명시적 JSON 계약과 직렬화/가져오기, 구조용 JSON Schema, 확정·채택 finding만 설명 대상으로 전달하는 수동 ChatGPT 복사 프롬프트. 원본 생년월일/출생시각·좌표·시각 후보와 임의 사용자 지시문은 내보내지 않는다. partial/unavailable을 유지하며 P06/실 API와 연결하지 않는다.
- 정상 테스트 선작성: 한국어 facts/판단/근거·정책/버전 JSON 왕복과 보존, 명시적 개인정보 제외, 확정 finding 선별, 단일 계산, 실제 CLI. 오류: 미지원 버전/추가 필드/손상·잘림·초과 JSON, 잘못된 facts·판단·상태·중재 연결과 부분 finding 승격. 경계: BOM/CRLF, midnight/zi-start 미상, DST fold·경도 미상, 설명 가능한 확정 판단 부재, provider 없는 schema 모드와 종료 0/2/1.

### 구현과 검증 결과

- `CoreExportSchema`(1.0.0/base-structural-observations)와 calculateCoreExport를 추가했다. 기존 중재 계산을 한 번 수행한 뒤 원래 facts/evaluation/resolution을 옮기고 계산 상태·정책·누락/실패 사유·실제 SDK/정규화 버전을 보존한다. 생년월일·시각·지역 ID·좌표·성별 기준값·UTC/정책 시계·분 단위 후보는 명시적 필드 선별로 제외했다.
- 결과의 확정 facts에 기존 판단 규칙을 다시 적용해 evaluation과 대조하고 resolution/미상 trace를 재연결한다. 달력이나 facts를 재계산/수정하지 않는다. strict/readonly 문서를 검증한 뒤 들여쓰기 2칸+마지막 LF로 직렬화한다. 가져오기는 1 MiB 한도, BOM/CRLF/공백을 지원하고 고정 오류로 거절한다.
- `export-schema`는 Zod에서 draft 2020-12 구조 JSON Schema를 생성하며 stdin/계산 공급자를 요청하지 않는다. 구조 스키마가 사용자 정의 교차 검증 전체를 표현하지 못하므로 실제 가져오기는 CoreExportSchema/parseCoreExport를 사용해야 함을 문서에 명시했다. 문서 일관성 검사는 원본 사실의 서명/출처 인증이나 실제 역법 정확도 검증을 대체하지 않는다.
- manual-prompt는 고정 한국어 범위/안전/문체 지시와 analysis_data JSON 하나로 구성한다. accepted+confirmed finding만 verifiedFindings에 넣고 부분/억제/보류 문장은 제외한다. 제외 ID·예외/coverage·입력/계산/중재 제한과 원래 출처/규칙/중재 및 별도 promptVersion을 유지한다. 데이터 내부 지시문을 따르지 않고 새로운 계산·판단·미래 사건 단정을 하지 않도록 명시했다.
- OpenAI Docs 스킬을 적용하고 [공식 prompt engineering 문서](https://developers.openai.com/api/docs/guides/prompt-engineering)의 코드 내 지시 관리·지시/문맥 구분·대표 테스트 지침을 확인했다. 태그 경계를 JSON 유니코드로 이스케이프하지만 주입/근거 이탈 방지를 보증하지 않는다. 수동 복사본은 서버 상위 역할이나 ChatGPT 모델·계정 설정을 제어하지 않으며 실제 전송/응답 품질은 검증하지 않았다. gpt-4o-mini API 선택과 R01/R02/R03 계약을 변경하지 않는다.
- export-json/manual-prompt/export-schema CLI를 추가했다. 출력은 의도한 개발자용 결과이며 별도 로그나 네트워크/클립보드 I/O가 없다. complete/partial/unavailable 종료 0/2/2, 입력 오류 2·공급자 실패 1을 유지하고 공급자 메시지/원문을 반사하지 않는다. 복사 검증은 실제 CLI stdout과 JSON/문자열 왕복이며 OS 클립보드 조작 검증은 아니다.
- 선작성 도메인 테스트는 모듈 부재로 실패했다. 구현 후 잘못된 facts의 중첩 의미 검증에서 예외가 빠져나오는 사례를 발견했고 외부에 고정 스키마 실패로 반환하도록 수정해 10건 통과했다. 서비스/CLI 선작성은 명령 미연결 등 4건 실패를 확인한 뒤 연결했다. 이후 관련 45건/타입/린트 통과, DST 거절 분이 포함되어 모든 공통 기둥이 미상인 사례와 내부 trace는 맞지만 목 근거를 화 matched로 조작한 문서의 거절을 보강했다.
- 최종 `npm.cmd test -- tests/core-export.test.ts tests/core-export-service.test.ts tests/arbitration-service.test.ts tests/cli.test.ts`: 종료 0, 관련 4파일/46건 통과(신규 계약/복사 11건+서비스/CLI 5건). `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`도 종료 0. 실제 npm CLI의 known/unknown과 schema-only, 호스트 TZ=Pacific/Honolulu, 한국어/BOM/CRLF 왕복·개인정보 제외/종료 코드를 확인했다.
- 이전 WBS에서 격리 환경의 tsx Windows 사용자 조회(uv_os_get_passwd ENOMEM) 오류가 확인되어 실제 CLI를 포함한 최종 검사는 일반 실행 권한으로 수행했다. 테스트/코드 우회·skip·실패 무시 옵션은 없다. AGENTS에 따라 관련 검사만 실행하고 의존성/Next 설정·라우트 변경이 없어 전체 테스트/설치/빌드는 반복하지 않았다. 사용자 생성 타입과 개발 서버를 보존했다.

### 변경 파일과 제약

- `src/domain/core-export/index.ts`, `README.md`: 코어 JSON·가져오기/직렬화·구조 스키마, 확정 서술 데이터와 복사 프롬프트, 사용법/범위.
- `src/application/core-export/index.ts`: 기존 중재 계산 단일 실행과 명시적 필드 투영/검증.
- `src/cli/run.ts`, `main.ts`, `README.md`: 내보내기 3개 명령·입출력/종료 코드와 사용법.
- `tests/core-export.test.ts`, `tests/core-export-service.test.ts`: 스키마·판단/중재 무결성·복사·미상/미지원·실제 CLI·원본 보존/개인정보 제외.
- 루트 `README.md`, `docs/worklog.md`: 구현 경로·완료 기준·결과/제약. 총 10개 작업 파일만 커밋한다.
- 원국/파생 분석 자체는 민감할 수 있어 익명화된 자료라고 보장하지 않는다. 수동 모델 응답을 검증된 facts나 저장 결과로 가져오지 않는다. complete는 기초 관찰 내보내기 범위이며 11개 기능·DB 완료/스트리밍·LLM 품질을 뜻하지 않는다.
- AGENTS.md/작업지시 문서/next-env.d.ts의 기존 사용자 수정은 보존·커밋 제외한다. WBS.csv 상태·기존 판단/중재 정책·고전 카탈로그·역법/파생 계산·의존성·UI/DB/OAuth/PG/OpenAI/키/CI, WBS-14 해시/캐시 및 이후 기능은 변경하지 않는다. develop 대상 PR 한 건 생성 후 중지한다.

## 2026-10-23 — WBS-12: 충돌·불확실성 중재

### 선행 확인과 구현 전 완료 조건

- 직전 PR #12(WBS-11)가 develop에 MERGED(2026-10-23 00:02:35 KST)임을 GitHub에서 확인했다. merge commit `7c0de0ee5cdb139f9da05d9cb75e6c91c12b3f8b`와 origin/develop 원격 hash 일치, fetch 후 ancestor 확인. WBS.csv 실행순서 14/선행 WBS-11을 충족한다. CSV의 TODO만으로 완료를 판단하지 않았다.
- develop checkout 및 `git pull --ff-only origin develop` 성공 후 `git branch -d feature/WBS-11-classical-evidence-rules` 안전 삭제 성공. 최신 develop에서 `feature/WBS-12-conflict-uncertainty-arbitration` 하나를 생성했다. AGENTS/WBS/02/05/06/08 및 관련 10 상세설계, 기존 기초 판단·서비스·CLI를 읽었다.
- 완료 조건: 원래 사실·판단·출처/규칙 버전·예외/근거를 변경하지 않는 순수 중재, 동일 항목의 명시적 대안만 충돌 처리, 우선순위에 따른 채택/억제와 동률·관법 차이·부분 근거의 보류, 대칭 충돌 링크와 미상 trace 보존. upstream partial/unavailable 또는 개별 precision을 확정으로 승격하지 않는다.
- 정상 테스트 선작성: 서로 다른 확정 우선순위, 같은 value의 여러 근거, 관법별 동의, 독립 관찰 보존, 실제 기초 관찰/십성 공존에서 충돌을 조작하지 않음. 오류: 중복 ID, 출처/근거 누락, priority 범위·정수/후보 개수/claim 키, precision·상태 모순, 결과/출처 평가 연결·중재 기록 변조. 경계: 동률/세 대안/0·100, 부분 근거가 높은/낮은 우선순위, 혼합 충돌 그룹, 미상·전체 미상·빈 평가, 순서/불변성, midnight/zi-start와 실제 CLI 종료 코드.

### 구현과 검증 결과

- `arbitrateJudgments`는 검증된 내부 후보의 원래 finding과 명시적인 claim key/value/method를 받는다. 같은 key의 다른 value만 충돌이다. 관법 차이·부분 근거·최상위 동률은 보류하며, 동일 관법의 전부 확정된 근거에서 최상위가 지지하는 value가 하나인 경우에만 그 value의 지지 후보들을 채택한다. 다른 value는 억제하되 모든 원문과 근거를 candidates에 보존한다.
- 후보별 accepted/suppressed/deferred, 대칭 conflictingWith, 그룹별 사유/상태·후보/지지 ID, 원문 findings, limitations와 `arbitration.explicit-claims` 1.0.0을 반환한다. 미해결 충돌은 complete를 partial로 낮추며, 서로 다른 그룹이나 이미 알려진 일부 관찰을 지우지 않는다. sourceRefs나 기호 동시 존재만으로 충돌을 추측하지 않는다.
- strict/readonly Zod 입력·출력 검증, 최대 100개 후보·ID/precision/예외 검증, 입력에서 중재 결정을 다시 구성하는 결과 일관성 검사와 로캘 비의존 정렬을 추가했다. 원래 finding/result 스키마는 동작 변경 없이 이름을 붙여 재사용했다.
- `arbitrateBaseJudgments`는 기존 20개 평가의 matched만 후보화하고 coverage가 complete가 아닌 원래 결과 전부를 uncertainties에 남긴다. 일간/사계 대안만 각각 같은 key를 공유하고 다른 존재 관찰은 독립 key를 쓴다. 현재 유효한 기초 규칙은 서로 배타적인 관찰을 동시에 만들지 않으므로 실제 conflicts는 비어 있는 것이 정상이다. 가상 충돌 fixture는 중재 정책 검증용이며 새 고전/명리 규칙으로 등록하지 않았다.
- `calculateArbitratedJudgments`와 `arbitrate-facts` CLI를 추가했다. 기존 계산·평가를 한 번 수행해 judgment에 보존하고 resolution을 원래 evaluation에 대조한다. 미지원/거절로 evaluation이 null이면 resolution도 null이며, 미상 후보의 일간·시주를 확정 근거로 사용하지 않는다. 기존 judge-facts/derive-facts 계약과 입력·개인정보 오류 처리를 유지했다.
- 선작성 도메인 테스트는 모듈 부재로 종료 1, 구현 후 16건 통과. 타입 검사에서 중재 사유의 string 추론 오류를 확인해 enum 타입을 명시했다. 서비스/CLI 선작성 6건도 미구현 상태에서 실패를 확인한 뒤 연결했다.
- 첫 관련 검사에서 격리 환경의 tsx가 `uv_os_get_passwd` ENOMEM으로 실제 CLI 7건을 실패시켰다(112건 통과). `--help` 단독으로 같은 OS 오류를 재현했다. 테스트나 tsx를 우회/수정하지 않고 일반 실행 권한으로 동일 CLI/관련 검사를 실행해 119건 통과를 확인했다. 혼합 충돌 그룹과 입력/출력 변조 경계를 보강한 후 최종 검사했다.
- 최종 `npm.cmd test -- tests/arbitration.test.ts tests/arbitration-service.test.ts tests/judgment.test.ts tests/judgment-service.test.ts tests/cli.test.ts`: 일반 실행 환경에서 종료 0, 관련 5파일/120건 통과(신규 도메인 17건 + 서비스/CLI 6건). `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`도 종료 0. 실제 CLI known/unknown은 호스트 TZ=Pacific/Honolulu에서도 단일 JSON/종료 0·2를 확인했다. skip/실패 무시 옵션은 없다.
- AGENTS에 따라 관련 검사만 실행했다. 의존성·잠금 파일·Next 라우트/설정 변경이 없어 전체 테스트/설치/빌드는 반복하지 않았다. 기존 생성 타입을 사용해 사용자 next-env.d.ts와 개발 서버를 보존했다.

### 변경 파일과 제약

- `src/domain/judgment/arbitration.ts`, `schemas.ts`, `ARBITRATION.md`, `README.md`: 중재/불확실성 계약·정책·순수 엔진과 기존 평가 연결, 범위 문서.
- `src/application/judgment/index.ts`: 기존 판단 재사용, 평가와 중재/미상 trace의 연결·상태 검증.
- `src/cli/run.ts`, `main.ts`, `README.md`: arbitrate-facts 명령·종료 코드·사용법.
- `tests/arbitration.test.ts`, `tests/arbitration-service.test.ts`: 충돌·미상·입출력 무결성·기존 결과 보존·실제 CLI.
- 루트 `README.md`, `docs/worklog.md`: 구현 경로·완료 기준·검증 결과와 제약. 총 12개 작업 파일만 커밋한다.
- 중재 우선순위는 채택 정책이며 고전 간 보편적 진리/과학적 검증/전문가 승인을 뜻하지 않는다. 후보의 형태 검증이 출처·근거의 진실성을 증명하지 않으므로 내부 호출자는 먼저 계산/규칙/출처를 검증해야 한다. 사용자/LLM 후보를 받는 API는 추가하지 않았다. partial finding은 원래 precision을 유지하며 이후 서술에서 확정 판단으로 승격하면 안 된다.
- AGENTS.md/작업지시 문서/next-env.d.ts의 기존 사용자 수정은 보존·커밋 제외한다. WBS.csv 상태·역법/facts/고전 카탈로그 내용·의존성·UI/DB/OAuth/PG/OpenAI/키/CI·WBS-13 이후 구현은 변경하지 않는다. develop 대상 PR 한 건 생성 뒤 중지한다.

## 2026-10-22 — WBS-11: 고전 출처 카탈로그와 기초 판단 규칙

### 선행 확인과 구현 전 완료 조건

- PR #11 MERGED(2026-10-22 23:25:30 KST), merge commit `3f3fb9e4cbcf5aaae345716eea79a2fd3655e6a6` 및 origin/develop 일치/ancestor 확인. 선행 WBS-10 충족, 실행순서 13.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-10-ten-gods-hidden-stems-elements` 성공. 최신 develop에서 `feature/WBS-11-classical-evidence-rules` 한 개 생성. AGENTS/WBS/02/05/06/08, 관련 10 상세설계와 기존 파생 facts/CLI 계약을 읽었다.
- 완료 조건: 적천수·궁통보감·자평진전·삼명통회의 확인 가능한 원문 구절/전사본·절 위치·확인일·판본 한계와 적용 범위를 기록하는 카탈로그, 검토 기록이 있는 기초 규칙 20개 및 순수 평가기. 검토는 구현자의 원문 대조/조건·예외·fixture 검사이며 명리 전문가나 사용자 승인으로 표시하지 않는다.
- 20개 범위: 일간 오행 5개, 전통 월지 사계 4개, 일간과 장간 동일 글자 1개, 월지 본기/기타 장간의 천간 노출 2개, 비겁/식상/재성/관성/인성의 표면 존재 5개, 정관·편관/식신·편인/상관·정인 동시 존재 3개. 전통 논의에서 재현 가능한 최소 구조 조건만 채택하며 통근 전체/격국 성립/제화/강약/길흉을 단정하지 않는다.
- 각 결과는 규칙/버전/우선순위·출처 참조·입력 경로·관찰 근거·선언/적용 예외·coverage를 보존한다. matched/not-matched/unavailable를 구분하고 matched만 assertion finding을 생성한다. 미상 범위에서 관찰되지 않았음을 부재로 바꾸지 않는다. 우선순위는 추적/정렬만 하며 WBS-12 충돌 중재를 구현하지 않는다.
- 테스트 선작성: 20개 각각 수기 양성/음성/전체 미상, 부분 입력의 양성/미확정 음성, 동일 장간/본기·기타 투출 범위, 출처·중복/누락/검토·버전 오류, 근거 경로/출처 무결성, 순서·결정성/불변성, 실제 judge-facts CLI와 기존 파생 CLI 회귀. 관련 검사·타입·린트와 결과/제약을 기록하고 사용자 변경 파일은 제외해 develop PR 한 건 생성 후 중지한다.

### 구현과 검증 결과

- 고전 4종의 출처 항목 6개와 기초 규칙 20개를 strict/readonly 카탈로그에 기록했다. 각 항목의 전사/영인 판본·절/URL/원문 일부/확인일/대조 방법/한계를 보존한다. 출처 누락·중복·미검증 참조, 규칙 중복/누락·미검토·버전 오류를 차단한다. 검토된 1.0.0의 데이터 내용은 같고 순서만 다른 카탈로그만 허용한다.
- 적천수 천간론/궁통보감 삼춘·삼하·삼추·삼동/삼명통회 인식관재 명의는 원문 페이지를 확인했다. 자평진전 근 논의는 국가도서관 영인 PDF의 색인 원문, 투출/상관 논의는 색인에 수록된 고전 전사 원문을 대조했다. 일부 직접 페이지 요청은 시간 초과였다. AI/현대 해설을 실행 근거로 사용하지 않았고 영인 전체 교감·전문가 승인으로 표시하지 않았다.
- 평가기는 기존 facts만 읽으며 5 일간오행 + 4 월지사계 + 1 동일 장간글자 + 2 월지 본기/기타 노출 + 5 표면 십성군 + 3 기호 동시 존재를 검사한다. 각 규칙은 원문 논의에서 채택한 최소 조건과 제외 범위를 명시했다. 동일 글자 불일치를 통근 전체 부재로, 노출/동시 존재를 성립·제화·길흉으로 바꾸지 않는다.
- matched/not-matched/unavailable, coverage와 선언/적용 예외를 분리한다. 일부 확인된 존재는 보존하고 미상 검색 영역 때문에 판정할 수 없는 부재는 unavailable다. matched만 안정된 ID/단정 범위가 제한된 assertion과 실제 근거 finding을 생성한다. 우선순위는 결정적 정렬만 하며 관찰을 삭제하거나 충돌을 중재하지 않는다.
- 결과에 원래 확정 기둥과 규칙/출처/사실/공급자 버전을 보존하고 모든 evidence 경로/값을 실제 facts에 대조한다. 출력 검증은 잘못된 출처·중복/누락·순서·예외/coverage·상태·finding 문구/근거 연결도 차단한다. 원본 facts와 카탈로그는 변경하지 않는다.
- 새 calculateJudgments 서비스와 judge-facts CLI는 기존 facts 계산을 한 번 실행하고 확정된 facts에만 적용한다. 기존 분석/후보/facts를 analysis에 보존하며 입력 거절/미지원에는 evaluation null이다. 미상 후보의 일주/시주를 확정 근거로 사용하지 않는다. 실제 npm CLI의 known/unknown과 기존 derive-facts·입력/출력 회귀를 확인했다.
- 테스트 선작성 judgment는 모듈 부재로 종료 1, 구현 후 65건/타입 검사 통과. 서비스 선작성도 모듈 부재로 종료 1이었다. 이후 신규 71건/타입 검사가 통과했으나 린트가 evidence 배열 선언의 prefer-const를 지적했다. const로 수정하고 원문 확인 범위를 실제 확인한 영인/전사 색인에 맞춰 기록했다. 단일 장간 월지·관찰 공존/우선순위 경계와 근거 변조 회귀를 보강했다.
- 최종 `npm.cmd test -- tests/judgment.test.ts tests/judgment-service.test.ts tests/natal-facts-service.test.ts tests/cli.test.ts`: 종료 0, 관련 4파일/104건(신규 73건) 통과. 20개 각각의 수기 양성/음성/전체 미상 60건 포함. `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 각각 종료 0. 실패 무시/skip은 사용하지 않았다.
- 최신 AGENTS에 따라 관련 검사만 실행했다. 의존성/잠금 파일·Next 라우트/설정 변경이 없어 설치·빌드·전체 릴리스 검사는 반복하지 않았다. 기존 생성 타입을 사용해 사용자 next-env.d.ts와 개발 서버를 보존했다.

### 변경 파일과 제약

- `src/domain/judgment/schemas.ts`, `catalog.ts`, `index.ts`, `README.md`: 출처/검토·규칙/근거 계약과 카탈로그, 순수 평가/관찰 범위·실제 근거 검증, 검토 범위/20개 규칙 표.
- `src/application/judgment/index.ts`: 기존 facts 분석을 재사용하고 평가 결과/근거를 연결하며 원래 계산/미상 상태 보존.
- `src/cli/run.ts`, `main.ts`, `README.md`: judge-facts 명령/종료 코드/의존성 재사용/사용법.
- `tests/judgment.test.ts`, `judgment-service.test.ts`, `fixtures/base-judgment-golden.json`: 규칙별 독립 조건 fixture·검토/출처·미상/근거·범위·결정성/불변성·실제 CLI.
- 루트 `README.md`, `src/domain/natal-facts/README.md`, `docs/worklog.md`: 구현 위치·검증 결과/제약 기록.
- 이 검토는 구현자의 원문/조건/fixture 대조이며 전문가나 사용자 리뷰를 대체하지 않는다. 확인 구절이 고전의 전체 해석이나 비평 정본 검증을 뜻하지 않는다. complete는 기초 facts/관찰 범위이며 강약·용신·길흉/성격, WBS-12 중재나 확장 M01/F01~F11·최종 NatalCore/리포트 완료를 보증하지 않는다.
- AGENTS/작업지시 문서/next-env.d.ts의 SHA-256이 시작과 동일함을 확인했다. 사용자 변경은 보존/커밋 제외한다. WBS.csv 상태·기존 역법/facts 계산·의존성·UI/API/DB/LLM/OAuth/PG/키/CI·이후 WBS 변경은 없다. 관련 14개 파일만 명시적으로 스테이징해 develop PR 한 건 생성 후 중지한다.

## 2026-10-22 — WBS-10: 십성·지장간·오행 기초 계산

### 선행 확인과 구현 전 완료 조건

- PR #10 MERGED(2026-10-22 23:06:15 KST), merge commit `b8fbf5ecc09198822844d1031e263d15ccdc9962`와 원격 develop 일치/ancestor 확인. 선행 WBS-05 PR #6(`c252a2630cf2b256e345a90f4740597ff3fc64e6`)/WBS-06 PR #7도 MERGED 및 ancestor 확인. 실행순서 12.
- develop checkout/ff-only pull과 `git branch -d feature/WBS-09-hour-day-boundary` 성공. 최신 develop에서 `feature/WBS-10-ten-gods-hidden-stems-elements` 한 개 생성. AGENTS/WBS/02/05/06/08 및 관련 10 상세설계, 기존 계산 계약과 설치된 manseryeok 2.0.0의 공개 오행/음양/십신 API를 읽었다.
- 완료 조건: 공급자 타입 없는 검증된 기호 카탈로그를 통해 SDK 공개 음양·오행·십신 함수를 재사용하고 순수 도메인에서 기둥별 천간/지지 본기/전체 지장간의 기초 사실을 조합한다. 지장간은 연해자평의 지지장둔가 집합(子癸/卯乙/酉辛/亥壬甲, 총 28개)을 명시적으로 채택한다. 본기 우선 표시이며 나머지 순서는 세력/월령 가중치가 아니다.
- 드러난 천간·지지의 오행 개수와 지장간 출현 개수는 별도 단위 합계로 반환한다. 강약/용신/길흉/월령 가중치나 WBS-11 판단 룰·확장 M01을 구현하지 않는다. 각 계산 규칙·출처·공급자 버전을 기록한다.
- 미상 기둥은 null을 유지하며 알려진 기둥만 계산한다. 일간 미상이면 상대 십성은 null, 오행/지장간은 알려진 범위만 제공한다. 일간 자신은 '일간'으로 구분한다. WBS-09의 confirmedPillars만 파생 계산에 사용하고 후보 시주를 확정값으로 합치지 않는다. derive-facts 개발 CLI로 AnalysisInput 연결을 검증한다.
- 정상/경계 테스트: 천간 10개×10개의 십성 대응과 음양/오행, 12지지/28지장간, 본기·지장간의 상대 십성, 반복 기둥/0개 원소/합계·분리 집계, day/hour/null 및 전체 미상, 원본 불변성·결정성·정책 계산 연결.
- 오류 테스트: 잘못된 간지/필수 nullable 슬롯 누락·추가 필드, 손상/누락/중복 카탈로그·고정 버전 불일치, SDK 오류 비식별화, 잘못된 출력 합계/미상 전파. 이번 관련 테스트와 영향받는 CLI, 타입·린트만 실행한다. 사용자 AGENTS/작업지시 문서/next-env.d.ts 수정은 보존/커밋 제외하고 develop PR 한 건 생성 후 중지한다.

### 구현과 검증 결과

- `SymbolCatalogAdapter`와 고정 SDK 구현이 공개 음양/오행 함수 및 getTenGod를 사용해 10천간·12지지·100십신 대응을 제공한다. 개수·유일성·고정 버전과 반환값을 검증하며 도메인으로 SDK 타입을 전달하지 않는다. 원국 간지나 생극 알고리즘을 복제하지 않았다.
- 순수 `deriveNatalFacts`는 유효한 60갑자/null 기둥을 받고 천간·지지 본기·28지장간의 오행/음양/일간 기준 십성을 조합한다. 일간 자신은 '일간', 일간 미상이면 상대 십성은 null이다. 표면 8개 기호와 장간 출현은 각각 단위 개수로 세며 반복을 유지하고 합치거나 세력 점수로 바꾸지 않는다.
- 출력은 원래 확정 기둥과 각 위치의 facts, 확인/미상 기호 수, 완전/부분/불가와 한계, SDK 및 4개 계산 규칙/관법/출처 버전을 포함한다. strict/readonly DTO가 본기·장간 집합, 합계·원래 기둥 대응·미상 전파도 검사한다.
- `calculateNatalFacts`는 WBS-09 계산을 한 번 실행하고 확정된 snapshot/confirmedPillars만 파생한다. 후보 시주·불확정 일주를 합치지 않고 카탈로그도 한 번만 읽는다. 거절/미지원에는 facts null 및 카탈로그 호출 0회다. 실제 `derive-facts` CLI가 known/unknown에 대해 단일 JSON과 종료 0/2를 반환하고 오류는 종료 1의 비식별 메시지다.
- 독립 fixture는 [연해자평 전사본](https://zh.wikisource.org/zh-hant/淵海子平大全)의 갑·을 일간 예시와 지지장둔가를 확인한 뒤 나머지 십성 표를 생극/음양 관례로 별도 산출했다. SDK 출력에서 기대값을 생성하지 않았다. 전사본의 출처 미확인/미완성 고지를 기록했고 비평 정본/과학 검증으로 표시하지 않는다. 장둔가 집합과 월령별 사령 일수를 혼합하지 않았다.
- 테스트 선작성 `npm.cmd test -- tests/natal-facts.test.ts`: 구현 모듈 부재로 종료 1. 구현 후 123건과 타입 검사가 통과했다. 서비스 선작성도 모듈 부재로 종료 1, SDK 오류 테스트 2건은 통과했다. 서비스/CLI 연결 후 신규 132건 및 타입·린트가 통과했다. 이후 불가능한 간지 짝 거절과 10천간/12지지 전체 음양·오행 표 회귀를 보강했다.
- 최종 `npm.cmd test -- tests/natal-facts.test.ts tests/natal-facts-errors.test.ts tests/natal-facts-service.test.ts tests/cli.test.ts tests/policy-cli.test.ts`: 종료 0, 관련 5파일/160건(신규 134건). 실제 npm CLI, 기존 입력/출력·정책 CLI 회귀 포함. 최종 `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 각각 종료 0. skip/실패 무시 옵션은 사용하지 않았다.
- 최신 AGENTS에 따라 관련 검사만 실행했다. 의존성/잠금 파일·Next 라우트/설정 변경이 없어 설치·빌드·전체 릴리스 검사는 반복하지 않았다. 타입 검사는 기존 생성 타입으로 수행해 사용자 next-env.d.ts와 실행 중인 개발 서버를 보존했다.

### 변경 파일과 제약

- `src/domain/natal-facts/index.ts`, `README.md`: 기호 카탈로그·확정 기둥/파생 facts 계약, 순수 조합/분리 집계/미상·버전 검증, 채택 관법/근거/사용법.
- `src/infrastructure/manseryeok/symbol-catalog.ts`, `index.ts`, `README.md`: 고정 공개 SDK 기호 조회 구현/export·오류 정규화.
- `src/application/natal-facts/index.ts`: 기존 정책 계산의 확정 기둥만 파생하고 원래 계산/미상/거절 상태 보존.
- `src/cli/run.ts`, `main.ts`, `README.md`: derive-facts 명령·의존성 조립·종료 코드·사용법.
- `tests/natal-facts.test.ts`, `natal-facts-errors.test.ts`, `natal-facts-service.test.ts`, `fixtures/natal-facts-golden.json`: 독립 100십성/12지장간 표·음양오행/미상/합계·오류·실제 CLI.
- 루트 `README.md`, `docs/worklog.md`: 구현 위치·검증 결과/범위 기록.
- 이 complete는 4기둥의 기초 facts가 알려졌다는 뜻이다. 오행 0회는 알려진 자료에서의 출현 0회이며 미상 기둥의 부재를 보증하지 않는다. 강약/용신·성격·길흉 해석, WBS-11 고전 출처 카탈로그/판단 룰과 확장 M01/F01~F11은 구현하지 않았다.
- AGENTS/작업지시 문서/next-env.d.ts의 SHA-256이 시작과 같음을 확인했다. 이 사용자 변경은 보존/커밋 제외한다. WBS.csv 상태·기존 역법 계산·의존성·UI/API/DB/LLM/OAuth/PG/키/CI·이후 WBS 변경은 없다. WBS-10 관련 15개 파일만 명시적으로 스테이징해 develop PR 한 건 생성 후 중지한다.

## 2026-10-22 — WBS-09: 자시·시주와 미상 시각 후보

### 선행 확인과 구현 전 완료 조건

- 직전 PR #9 MERGED(2026-10-22 22:33:04 KST), merge commit `79bd3ba6d745294170f4da52e1b36e216913e682`와 원격 develop 일치/ancestor 확인. 선행 WBS-06 PR #7도 MERGED 및 ancestor 확인. WBS-09 실행순서 11, 선행 WBS-06/08 충족.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-08-solar-time-policy` 성공. 최신 develop에서 `feature/WBS-09-hour-day-boundary` 한 개 생성. AGENTS/WBS/02/05/06/08, 관련 코어 및 설치 SDK의 공개 API·일 경계 구현을 읽었다.
- 완료 조건: WBS-07/08 결과를 고정 공급자의 공개 API에 연결해 연·월주는 실제 UTC, 일·시주는 정책 시계로 계산한다. midnight/zi-start를 명시적으로 midnight/jasi에 매핑하고 splitJasi는 도입하지 않는다. 두 계산 시계와 분 내림 해상도/규칙·공급자 버전을 기록한다.
- 시각 미상은 단일 시각/확정 시주를 만들지 않는다. 가능한 입력 분 0~1439 전체를 명시적 가설로 평가해 같은 결과의 인접 구간을 합친다. 전체 상태는 partial, 확정 hour는 항상 null이며 모든 분이 해석/계산 가능하고 같은 경우에만 연·월·일주를 공통값으로 남긴다. 거절/미지원 구간도 후보 범위에 보존한다. 확률이나 대표 시각은 부여하지 않는다.
- 정상/경계 테스트: 12시진의 시작 포함 경계, 22:59/23:00/23:59/00:00의 두 일 경계 정책, 갑진/계해→갑자/연말 일진 앵커, 태양시 날짜 넘김, 절입은 UTC 기준 유지, 역사 초 오프셋·DST fold/gap·음력 윤달·범위 끝 검증. 미상 표준/태양시/절입일의 후보와 입력 불변성을 확인한다.
- 오류 테스트: 잘못된 날짜/정책/범위와 손상된 공급자 응답/버전/요청 불일치, SDK 예외 비식별화, 경도 미상·시각 미상에 확정 snapshot 없음. 공개 SDK가 분 입력만 받으므로 초/밀리초는 두 시계 각각 분 내림하고 천문 정밀도 보증으로 표시하지 않는다. 실제 UTC+9 투영 또는 정책 시계 연도가 SDK 1800~2300 밖이면 명시적 unavailable다.
- `calculate-policy` CLI로 새 정책 계산/후보 서비스를 실행한다. 기존 고정 UTC+9 calculate와 normalize-time 계약은 보존한다. 이번 관련 테스트와 영향받은 CLI/시각 경계 검증, 타입·린트를 실행하고 결과/제약/파일을 기록한다. 전체 이전 테스트/설치/빌드를 매번 반복하지 않는 최신 AGENTS 지침을 따른다. 사용자 AGENTS/작업지시 문서/next-env.d.ts 수정은 보존/커밋 제외한다. PR 한 건 생성 후 중지한다.

### 구현과 검증 결과

- 공급자 타입 없는 `PolicyCalendarAdapter`와 strict/readonly 요청·스냅샷을 추가했다. 공개 calculateFourPillars를 두 번 호출해 실제 UTC+9 투영의 연·월주와 정책 시계의 일·시주만 조합한다. SDK private import, 별도 간지 계산식, 경도/DST/EoT 중복 보정은 없다. 원래 두 시계, 요청 정책과 실제 2.0.0/규칙/분 내림 전제를 보존한다.
- `calculatePolicySaju`가 기존 음양력/IANA/태양시 서비스에 이 포트를 연결한다. 잘못된 입력·요청과 다른 응답·버전·손상 결과를 차단한다. 두 투영 연도 중 하나가 SDK 범위 밖이면 호출 없이 PILLAR_RANGE_UNSUPPORTED다. 거절된 fold/gap에는 기둥을 만들지 않는다.
- unknown은 1,440개 입력 분을 평가한 후 같은 결과의 인접 구간을 합친다. 전체 범위 0~1440의 연속 분할과 공통 기둥의 일관성을 검증한다. partial에는 snapshot/단일 UTC/단일 태양시가 없고 확정 hour는 항상 null이다. 모든 분이 계산 가능하고 같은 경우에만 공통 연·월·일주를 남긴다. 원래 달력·윤달/시각 미상/한계와 SDK·IANA 버전을 기록하며 음력 변환은 한 번만 한다.
- 검토 중 분별 INPUT_REJECTED를 하루 전체 미지원으로 조기 종료할 수 있는 처리를 발견해 제거했다. 한 분만 거절되고 이후 분은 유효한 회귀를 추가했다. 거절/미지원 구간은 보존하며 전체가 미지원이면 원인을, 하루 전체가 gap 등으로 거절되면 NO_RESOLVED_CANDIDATES를 반환한다. 예상 밖 공급자 실패를 partial로 덮지 않는다.
- 새 `calculate-policy` CLI는 known 계산 종료 0, partial/rejected/unavailable 종료 2, 비식별 공급자/설정 실패 종료 1이다. 실제 npm 자식 프로세스에서 known/unknown과 호스트 Pacific/Honolulu를 검증했다. 기존 CLI의 입력 제한/오류·고정 시계 calculate/normalize-time 회귀도 확인했다.
- 시주 독립 기준은 [HKO 표 3·5](https://www.hko.gov.hk/tc/gts/time/stemsandbranches.htm)의 시진/갑·기일 시간 대응표와 WBS-06의 KASI 공식 갑진일 앵커다. fixture에 출처·확인일·산출법을 기록했다. 23시/다음날/갑자 회귀는 앵커와 채택 정책에서 수기 산출했고 공급자 결과로 기대값을 만들지 않았다. 천문대가 자시 관법을 인증했다고 표시하지 않는다.
- 테스트 선작성: policy-calendar/policy-saju는 구현 모듈 부재로 각각 종료 1, policy-cli는 미연결 명령으로 2건 실패했다. 구현 후 어댑터 31건, 초기 서비스 13건, 신규 전체 53건이 통과했다. tsc가 테스트 정책 문자열의 넓은 타입을 지적해 명시적 literal 타입으로 수정했다. 이후 미상 경계/불변성/음력 재사용/분별 거절 테스트를 보강했다.
- 최종 `npm.cmd test -- tests/policy-calendar.test.ts tests/policy-calendar-errors.test.ts tests/policy-saju.test.ts tests/policy-cli.test.ts tests/cli.test.ts tests/normalize-time-cli.test.ts tests/solar-time-application.test.ts`: 종료 0, 관련 7파일/101건(신규 58건) 통과. 최종 소스의 `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 각각 종료 0. skip/실패 무시 옵션은 사용하지 않았다.
- 최신 AGENTS의 관련 테스트 중심 지침을 따라 이번 변경이 있는 정책/CLI와 그 연결에 영향받은 기존 테스트만 실행했다. 패키지/잠금 파일·Next 라우트/설정이 바뀌지 않아 설치·빌드·전체 릴리스 검사는 반복하지 않았다. 타입 검사는 사용 중인 개발 서버와 사용자 next-env.d.ts를 보존하도록 기존 생성 타입을 사용하는 tsc로 수행했다.

### 변경 파일과 제약

- `src/domain/policy-calendar/index.ts`, `README.md`: 두 시계의 SDK 포트/정책·해상도/범위 계약과 근거·사용법·후보 의미.
- `src/infrastructure/manseryeok/policy-calendar.ts`, `index.ts`, `README.md`: 고정 공개 API 구현, 오류 정규화/export/설명.
- `src/application/policy-saju/index.ts`: known 계산과 미상 분 전수 후보·공통 기둥/범위 검증. `src/application/saju/index.ts`는 별도 정책 서비스 안내 주석만 변경.
- `src/cli/run.ts`, `main.ts`, `README.md`: calculate-policy 명령/의존성 조립/종료 코드와 사용법.
- `tests/policy-calendar.test.ts`, `policy-calendar-errors.test.ts`, `policy-saju.test.ts`, `policy-cli.test.ts`, `fixtures/hour-policy-golden.json`: 독립 대응표·자시/날짜/절입·SDK 오류·시각 미상·실제 CLI 검증.
- 루트 `README.md`, `src/domain/input/README.md`, `src/domain/solar-time/README.md`, `src/domain/timezone/README.md`, `docs/worklog.md`: 현재 구현 위치와 지원 범위·결과.
- 미상 후보는 분 단위 입력 라벨의 가능성이지 실제 출생시각/확률/연속 초 범위가 아니다. 천문/역사 전 구간 정확도나 다른 자시 관법·최종 NatalCore/F01~F11 완료를 보증하지 않는다. 두 SDK 시계의 1800~2300 범위와 기존 태양시 근사/절입 분 해상도 한계를 유지한다.
- AGENTS.md/작업지시 문서/next-env.d.ts의 SHA-256이 시작과 같음을 확인했다. 이 사용자 변경은 보존하고 커밋에서 제외한다. WBS.csv 상태·의존성·UI/API/DB/LLM/OAuth/PG/키/CI·이후 WBS 변경은 없다. 관련 20개 파일만 명시적으로 스테이징해 develop 대상 PR 한 건을 생성하고 중지한다.

## 2026-10-22 — WBS-08: 평태양시·진태양시 정책

### 선행 확인과 구현 전 완료 조건

- PR #8 GitHub MERGED(2026-10-22 20:43:42 KST), merge commit `ae0b94e67171b1dfb946d2878f412c8d2df3d777` 및 origin/develop ancestor 확인. 선행 WBS-07 충족, 실행순서 10, 열린 develop PR 없음.
- develop checkout/ff-only pull 및 `git branch -d feature/WBS-07-iana-timezone-dst` 성공. 최신 develop에서 `feature/WBS-08-solar-time-policy` 한 개 생성. AGENTS/WBS/02/05/06/08, 기존 입력/IANA/계산 경계와 설치된 manseryeok 2.0.0의 공개 equationOfTimeMinutes 타입·구현을 읽었다.
- 완료 조건: 명시적 standard/mean-solar/true-solar 정책을 검증된 WBS-07 시각에 적용하는 순수 도메인, 공급자 독립 EoT 포트와 고정 manseryeok 공개 API 어댑터, AnalysisInput 연결 및 normalize-time CLI의 정책 결과 노출. 각 보정량·실제 UTC·민간 시각·정책 시각과 규칙/공급자 버전을 반환한다.
- 채택 정책: standard는 IANA에서 해결한 법정 현지 시각을 추가 보정 없이 보존한다(DST 포함). mean-solar는 UTC + 동경 양수 경도×240초, true-solar는 여기에 EoT(겉보기−평균)를 더한다. 경도는 명시값만 사용하며 null이면 unavailable, 0은 유효하다. 경도·EoT 적용으로 실제 UTC 자체를 변경하지 않는다. DST는 WBS-07에서 UTC 해석 후 다시 빼지 않는다.
- 정상/경계: 동/서경·0·±180·소수 경도, IANA 역사/DST/날짜 경계, 동일 UTC의 서로 다른 법정 시간대에서 같은 태양시, 진태양시에서만 실제 UTC로 EoT 호출 1회, 보정 후 날짜 넘김과 최근접 밀리초 반올림을 검증한다. 계산 해상도와 천문 정확도를 구분한다.
- 독립 EoT 기준은 NOAA General Solar Position Calculations의 별도 연주기 근사식으로 2024년 네 UTC 정오 값을 계산해 고정한다. 이 근사식과 공급자 Meeus 모델 비교의 사전 허용차는 30초이며 전 연도 정확도 보증이 아니다. 부호/경도 배율은 NOAA 및 USNO 정의로 확인한다.
- 오류: 경도/시각 누락과 범위, 잘못된 EoT·버전·반환 시점·공급자 예외와 손상 응답을 검증하고 원문/cause를 노출하지 않는다. 전체 사주·시주/자시·미상 시각 후보는 WBS-09 범위로 남긴다. 공급자의 한국 DST/default longitude 옵션은 켜지 않는다.
- npm test, 경도/EoT 전용·실제 CLI, 타입/린트/빌드를 실행하고 결과·제약·변경 파일을 기록한다. 기존 사용자 지시 문서/next-env.d.ts 변경을 보존/커밋 제외한다. PR 한 건 생성 후 중지한다.

### 구현과 검증 결과

- `domain/solar-time`에 순수 정책 함수와 strict/readonly 요청·결과·EoT 포트를 추가했다. UTC/민간 시각과 정책 시계를 분리하고 동경 양수 경도, 분 단위 EoT, 초 단위 보정량과 최근접 밀리초 시계 출력을 명시한다. 부호·산술·UTC 시점·고정 모델/버전 일관성을 검증한다.
- `manseryeokEquationOfTimeAdapter`는 기존 고정 2.0.0의 공개 EoT 함수만 호출하며 실제 패키지 버전을 기록한다. 새 의존성/잠금 파일 변경 없이 기존 공급자를 유지한다. 손상 응답과 공급자 예외는 고정 SolarTimeError로 정규화한다.
- `prepareBirthTime`은 기존 음양력 변환/IANA 정규화를 재사용하고 이후에만 태양시를 적용한다. 경도/시각 미상에는 포트 호출 없이 unavailable, 거절된 fold/gap에는 태양시 없음, 명시적 earlier/later에는 해결된 시점에 한 번 적용한다. 기존 민간시 전용 normalizeBirthTime 계약은 유지한다.
- 기존 `normalize-time` CLI에 정책 시계/보정량/EoT를 추가했다. 실제 UTC는 그대로이며 전체 사주/일주/시주를 호출하지 않는다. `calculate`의 고정 UTC+9 및 정책 제한은 유지한다. 경도 누락 종료 2와 비식별 오류 종료 1을 확인했다.
- 테스트 선작성 `npm.cmd test -- tests/solar-time.test.ts`: 구현 모듈 부재로 종료 1. 구현 중 readonly 스키마 접근과 기존 필드명 오류를 실행/타입 검사로 찾아 수정했다. 이후 도메인 34건, 서비스/오류/실제 CLI 포함 57건이 통과했고 부호/표준시 회귀 4건을 더해 최종 신규 테스트는 61건이다. 실패 무시/skip 옵션은 사용하지 않았다.
- 독립 EoT 네 건은 [NOAA 원문](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)의 연주기 근사식으로 고정하고 [USNO 정의](https://aa.usno.navy.mil/faq/eqtime)로 부호를 확인했다. 사전 허용차 30초를 변경하지 않았다. 동/서경·0·±180·소수 경도와 날짜 넘김, 서울 LMT/반시차/DST, gap 선택, 같은 UTC의 서로 다른 시간대, 민간시 범위 끝의 UTC 1799/2301년 이동을 검증했다.
- 원래 폴더 `npm.cmd test`: 종료 0, 18파일/530건. `npm.cmd run lint`와 `node node_modules/typescript/bin/tsc --noEmit`: 각각 종료 0. 이후 추가 회귀와 최종 오류 전달 변경은 아래 동일 소스 임시 복사본의 전체 검사로 검증했다.
- `%TEMP%/saju-wbs08-validation-208829cdbec14cec81acf519c491b7d6`에 src/tests·설정·잠금 파일 62개를 복사하고 SHA-256 일치를 확인했다. 최종 변경 세 파일도 다시 복사/해시 확인했다. `npm.cmd ci --no-fund`: 종료 0, 378개 설치. 사용 중인 원래 개발 서버/node_modules/.next는 변경하지 않았다.
- 최종 동일 소스 임시 복사본 `npm.cmd test`: 종료 0, 18파일/534건. `npm.cmd run typecheck`(Next typegen 포함), `npm.cmd run lint`, `npm.cmd run build`: 각각 종료 0. NEXT_TELEMETRY_DISABLED=1에서 기존 루트/404 정적 빌드 성공.
- `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. npm ci는 기존 개발 의존성 high 5건과 ESLint 9 지원 종료 경고를 보고했다. 기존 eslint-config-next의 전이 의존성 문제이며 전체 감사 통과로 표시하거나 강제 수정하지 않았다.
- 기존 사용자 지시 문서와 next-env.d.ts의 SHA-256이 작업 시작과 동일함을 확인했다. 재개 중 사용자가 수정한 AGENTS.md의 관련 테스트 중심 지침도 읽었으며 추가 재실행 없이 기존 검증 결과를 사용한다. AGENTS.md 수정도 보존/커밋 제외한다. WBS-08 관련 17개 파일만 명시적으로 스테이징하고 diff 검토 후 develop 대상 PR 한 건을 생성한다.

### 변경 파일과 제약

- `src/domain/solar-time/index.ts`, `README.md`: 순수 경도/EoT 정책, 포트·검증·근거·정밀도/정확도 한계.
- `src/application/solar-time/index.ts`: AnalysisInput부터 정책 시계까지의 순수 서비스와 미상/거절 상태.
- `src/infrastructure/manseryeok/equation-of-time.ts`, `index.ts`, `README.md`: 고정 공개 SDK EoT 구현과 export/지원 범위.
- `src/cli/main.ts`, `run.ts`, `README.md`: 의존성 조립·기존 normalize-time 명령 연결·사용법.
- `tests/solar-time.test.ts`, `solar-time-errors.test.ts`, `solar-time-application.test.ts`, `fixtures/equation-of-time-golden.json`: 실제 공급자·독립 근사·오류·실제 CLI 검증.
- 루트 `README.md`, `src/domain/input/README.md`, `src/domain/timezone/README.md`, `docs/worklog.md`: 정책 연결과 현재 지원 범위/결과 기록.
- 계산용 policyClock은 시간대 없는 라벨이며 새로운 UTC가 아니다. 밀리초는 출력 해상도다. UTC 기반 SDK 근사에 별도 UT1/DUT1 보정은 없으며 NOAA 비교는 2024년 네 시점만 포함한다. 전 지원 연도의 천문/지역 법정시 정확도 보증으로 표시하지 않는다.
- 시주/자시/미상 시각 후보·일반 지역의 전체 사주 계산 연결은 WBS-09 범위다. WBS.csv 상태를 임의 완료로 바꾸지 않는다. UI/API/DB/LLM/OAuth/PG/비밀키/CI 및 이후 WBS 변경은 없다. 기존 사용자 지시 문서/next-env.d.ts 변경은 보존하고 커밋에서 제외한다.

## 2026-10-22 — WBS-07: IANA 시간대와 역사 DST

### 선행 확인과 구현 전 완료 조건

- PR #7 GitHub MERGED(2026-10-22 20:20:55 KST), merge commit `9b822c1c337030031314670a3082588ac8b7a9cd` 및 origin/develop 반영 확인. 선행 WBS-02 PR #2도 MERGED 및 merge commit ancestor 확인. 열린 develop PR 없음. 실행순서 09.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-06-day-pillar-golden` 성공. 최신 develop에서 `feature/WBS-07-iana-timezone-dst` 한 개 생성. AGENTS/WBS/02/05/06/08 및 기존 입력/CLI/계산 경계를 확인했다.
- 완료 조건: IANA 현지 시각 → UTC 정규화 포트, unique/fold/gap 분류와 명시적 reject/earlier/later 정책, 원래 요청·해결된 현지 시각·초 단위 오프셋·UTC·공급자/ICU/tzdb/규칙 버전을 strict/readonly DTO로 반환. 날짜 범위는 기존 코어와 맞춘 양력 1800~2300이다.
- Node 24.12.0에 native Temporal이 없어 npm 실제 버전/타입·공식 문서를 확인하고 `@js-temporal/polyfill@0.5.1`을 정확히 고정했다. 런타임 Intl의 IANA 데이터(현재 ICU 77.1/tzdb 2025b)를 사용한다. 기존 manseryeok 공급자는 그대로이며 수작업 DST/상수 오프셋 테이블을 제품 코드에 추가하지 않는다.
- 정상/경계: IANA 2025b 원문에서 수기 계산한 서울 LMT·1954~1961 반시간대·1988 DST, New York fold/gap, Lord Howe 30분 전환, Apia 하루 생략을 독립 고정값으로 검증한다. reject는 fold/gap에서 UTC를 생성하지 않고, earlier/later가 gap의 현지 시각을 바꾸는 사실을 반환한다. 시간대 별칭/UTC·초 오프셋·날짜 넘김·버전·불변/JSON 왕복도 확인한다.
- 오류: 잘못된 IANA/오프셋 문자열·날짜·시각·정책·범위, 누락 시각, 공급자 실패와 손상 응답을 검증한다. 공급자 원문/cause는 보관·노출하지 않는다. 서버 호스트 시간대나 현재 날짜를 기본값으로 사용하지 않는다.
- AnalysisInput을 받는 순수 정규화 서비스와 `normalize-time` CLI를 연결한다. 음력은 기존 날짜 변환 포트로 양력화한 후 시간대를 적용하고, 미상 시각은 unavailable/호출 0회로 유지한다. 사주 calculate의 fixed UTC+9 계약을 자동 확대하지 않는다. 일반 지역의 일주/태양시·자시 연결은 WBS-08/09의 정책을 거쳐야 한다.
- npm test, 전용 fold/gap·실제 CLI, 타입/린트/빌드 및 잠금 파일 재현 검증을 실행한다. 기존 사용자 문서/next-env.d.ts 변경은 보존/커밋 제외. PR 한 건 생성 후 중지한다.

### 구현과 검증 결과

- `domain/timezone`에 strict/readonly 요청·resolved/rejected DTO와 TimeZoneAdapter 포트를 추가했다. unique/fold/gap 및 UTC/현지 시각/초 오프셋·정책 일관성을 검증한다. 기존 TimezoneIdSchema를 공개 재사용해 입력 시간대 계약을 바꾸지 않았다.
- Node 전용 인프라가 실제 설치된 Temporal polyfill의 이름/버전, 런타임 ICU/tzdb 및 규칙 버전을 반환한다. 공개 PlainDateTime/ZonedDateTime API로 두 선택지를 분류하며 원본 요청과 gap 이동 시각을 보존한다. 분 미만 오프셋 손실을 피하도록 offsetSeconds를 사용하고 Temporal/BigInt/Date 객체는 DTO 밖으로 내보내지 않는다.
- `normalizeBirthTime`은 AnalysisInput 검증 → 필요한 경우 기존 음양력 변환 → IANA 시각 정규화를 수행한다. 미상 시각의 포트 호출 0회, 거절과 미지원 상태, 손상/요청 불일치 응답 및 오류 비식별화를 검증했다. 태양시/일 경계 정책의 적용 완료로 표시하지 않고 기존 미상/한계 메타데이터를 유지한다.
- `normalize-time`을 기존 CLI에 연결했다. normalized는 종료 0, rejected/unavailable는 2, 손상/의존성 오류는 고정 메시지로 종료 1이다. 기존 UTF-8/64 KiB/stdout·stderr 계약을 재사용한다. 기존 calculate의 동작은 유지하고 서비스 주석만 현재 단계에 맞췄다.
- `npm.cmd install --save-exact @js-temporal/polyfill@0.5.1 --no-fund`: 종료 0, 2개 패키지 추가. npm이 제거한 기존 선택 플랫폼 peer 항목 @emnapi/core 및 @emnapi/runtime을 HEAD 잠금 파일에서 보존했고 모든 기존 패키지 버전 불변을 비교 확인했다. 새로운 시간대 보조 의존성이며 만세력 공급자는 변경하지 않았다.
- 테스트 선작성: `npm.cmd test -- tests/timezone.test.ts` 및 `tests/time-normalization.test.ts`는 구현 전 모듈 부재로 각각 스위트 실패(종료 1)했다. CLI 전용 선작성은 5건 중 4건 실패했다. 구현 후 시간대 41건, 서비스 12건, 오류 경계 3건, CLI 5건이 통과했다.
- 전용 테스트 61건 통과 뒤 tsc가 테스트의 BigInt 리터럴에 TS2737을 보고했다. 기존 ES2017 target을 변경하지 않고 `BigInt(0)`으로 수정했다. 이후 원래 폴더 `npm.cmd test`: 종료 0, 15개 파일/473건. `npm.cmd run lint` 및 `node node_modules/typescript/bin/tsc --noEmit`: 각각 종료 0. 실패 무시/skip 없음.
- 독립 기준 14건은 IANA 2025b Asia/US/Lord Howe/Apia 규칙과 Temporal 정책에서 수기 계산한 UTC·오프셋·이동 시각이다. fixture 출처/방법/한계를 기록했고 패키지 출력으로 생성하지 않았다. 미국 fold/gap의 정확한 구간 끝값 및 UTC/호놀룰루 호스트 환경의 실제 npm CLI 결과 일치도 확인했다.
- 동일 소스 임시 사본 `%TEMP%/saju-wbs07-validation-51801c0d52a84e0b8d1d391f1b6e25fa`에서 src/tests·설정·잠금 파일 SHA-256 일치를 확인했다. 원래 개발 서버/node_modules/.next는 검증용 ci/빌드로 변경하지 않았다(루트에는 위 보조 패키지 설치만 수행).
- 임시 사본 `npm.cmd ci --no-fund`: 종료 0, 378개 재현 설치. 이후 `npm.cmd test`: 종료 0, 15개 파일/473건. `npm.cmd run typecheck`(Next typegen 포함), `npm.cmd run lint`, `npm.cmd run build`: 각각 종료 0. NEXT_TELEMETRY_DISABLED=1로 기존 루트/404 빌드 성공.
- 임시 사본 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 설치에서 기존 개발 의존성 high 5건과 ESLint 9 지원 종료 경고는 재확인되었다. 기존 eslint-config-next → fast-glob → micromatch → braces 제약이며 강제 수정/전체 감사 통과로 표시하지 않는다.
- 기존 사용자 지시 문서와 next-env.d.ts의 SHA-256이 시작과 동일함을 확인했다. 아래 기능 관련 21개 파일만 명시적으로 스테이징하며 staged diff 검사 후 develop 대상 PR 한 건을 생성하고 중지한다.

### 변경 파일과 제약

- `src/domain/timezone/index.ts`, `README.md`: 시간대 포트·계약·정책·지원 범위·출처와 재현 한계.
- `src/infrastructure/timezone/index.ts`: 지정 Temporal/Intl 구현과 실제 엔진/데이터 버전 metadata.
- `src/application/time-normalization/index.ts`: 순수 입력/음양력 변환/시각 정규화 연결 및 응답 검증. `src/application/saju/index.ts`는 분리된 단계 설명 주석만 수정.
- `src/domain/input/schemas.ts`, `index.ts`, `README.md`: 기존 시간대 validator의 공개 재사용 및 DST 문서 갱신.
- `src/cli/run.ts`, `main.ts`, `README.md`: normalize-time 명령·의존성 조립·종료 코드/사용법.
- `tests/timezone.test.ts`, `timezone-errors.test.ts`, `time-normalization.test.ts`, `normalize-time-cli.test.ts`, `fixtures/timezone-golden.json`: 독립/경계·오류/포트·실제 CLI 검증.
- `package.json`, `package-lock.json`, 루트 `README.md`, `src/infrastructure/manseryeok/README.md`, `docs/worklog.md`: 정확한 의존성/잠금 및 기능 경계·결과 기록.
- 요청의 양력 날짜는 1800~2300이며 음력은 기존 변환 범위 내에서 양력화 후 검사한다. 원본 AnalysisInput을 변경하지 않고 time.request는 변환된 양력 벽시계를 담는다. 미상 시각·태양시·자시·일반 지역 일주/시주 연결은 구현하지 않았다.
- ICU/tzdb 데이터는 런타임에서 오며 package-lock만으로 고정되지 않는다. 응답의 해당 버전도 재현/저장·캐시 조건에 포함해야 한다. IANA 원문도 오래된 역사 자료의 불확실성을 고지한다. 이 검증은 IANA 규칙 호환성으로, 모든 역사적 실제 민간시·미래 법령 변화의 보증이 아니다. 필요한 버전 정보가 없는 런타임은 유효한 응답 없이 실패한다.
- 기존 사용자 지시 문서/next-env.d.ts 변경은 보존한다. UI/API/DB/LLM/OAuth/PG/비밀키/CI 변경은 없다. 이후 WBS는 시작하지 않는다.

## 2026-10-22 — WBS-06: 일주 계산과 독립 대조

### 선행 확인과 구현 전 완료 조건

- PR #6 GitHub MERGED(2026-10-22 19:54:01 KST), base develop, merge commit `c252a2630cf2b256e345a90f4740597ff3fc64e6` 및 origin/develop 반영 확인. 열린 develop PR 없음. WBS 실행순서 08, 선행 WBS-04 merge commit도 ancestor 확인.
- `git checkout develop`, `git pull --ff-only origin develop` 후 `git branch -d feature/WBS-05-solar-terms-year-month` 성공. 최신 develop에서 `feature/WBS-06-day-pillar-golden` 한 개 생성.
- AGENTS, WBS, 02/05/06/08 및 기존 도메인/입력/포트/패키지 일주 구현을 확인했다. 고정 공급자 공개 사주 계산을 재사용하며 별도 일주 엔진은 추가하지 않는다. 사용자 지시 문서와 next-env.d.ts의 기존 변경은 보존/커밋 제외.
- 완료 조건: 공급자 타입 없는 DayCalendarAdapter와 일주만 반환하는 strict/readonly DTO, fixed UTC+09:00·midnight 정책/규칙/공급자 버전 기록, 실제 패키지의 일주 계산 및 독립 골든 통과.
- 정상: KASI 공식 2024 월력요항 첨부의 음력 월초 12개 양력 날짜/일진을 고정해 양력/음력 입력을 각각 대조한다. 원문의 날짜·일진만 사용하고 음력 월건을 사주 월주로 해석하지 않는다. 기대값을 패키지 출력으로 생성하지 않는다.
- 경계: 공식 앵커에서 수기 산출한 윤일·60갑자 회귀·연말/새해 6건, 00:00/22:59/23:00/23:59·자정 전후, 1900/2000/2100 세기년과 1800/2300 범위 회귀. 직접 인용 골든/독립 앵커 파생/공급자 회귀를 구분한다.
- 오류: 누락/틀린 타입/실재하지 않는 날짜·없는 윤달·지원 범위·미지원 정책 거절, 손상된 일주/버전 응답 차단 및 공급자 오류 원문·cause 미노출. 시각 미상/일반 IANA·DST·태양시·자시 후보는 후속 WBS 범위로 남긴다.
- npm test, 일주 전용 검증, 타입/린트/빌드를 실행하고 명령·결과·제약·변경 파일을 기록한다. 개발 서버 충돌을 피한 임시 동일 소스 재현 검증은 위치를 구분한다. PR 한 건 생성 후 중지한다.

### 구현과 검증 결과

- `DayCalendarAdapter`와 DaySnapshotSchema를 추가하고 인프라에서 기존 실제 manseryeok 포트를 재사용해 일주만 투영한다. 날짜/시각/정책 거절 및 공급자 오류 정규화는 기존 계약을 유지한다. 일주 계산식·공급자 대체·시각 추정은 추가하지 않았다.
- 공식 2024 월력요항 HWP 4쪽의 12개 양력 날짜·음력 날짜·일진을 [KASI 공식 HTML 미리보기](https://www.kasi.re.kr/file/htmlconverter_preview/1687408104839_1.hwp.files/4.html)에서 표 열별로 확인했다. 출처 보도자료·첨부·확인일·구간과 수기 산출 앵커를 fixture에 고정했다. 원문 직접 독립 기준 12건, 공식 앵커에서 수기 산출한 경계 6건, 별도 공급자 회귀를 구분한다.
- 구현 전 `npm.cmd test -- tests/day-calendar.test.ts`: 예상한 종료 1, 없는 export로 63건 실패. 구현 후 같은 명령 종료 0, 실제 패키지 63건 통과. 이후 출력 스키마 검사 1건과 명시적 공급자 오류 Mock 6건을 추가했다. 실패 무시/skip 없음.
- 원래 폴더 `npm.cmd test`: 종료 0, 11개 파일/412건 통과(신규 실제 패키지 64건 + 명시적 SDK 오류 Mock 6건). `npm.cmd run lint`, `node node_modules/typescript/bin/tsc --noEmit`도 각각 종료 0.
- 동일 소스 임시 사본 `%TEMP%/saju-wbs06-validation-20839cbd3135469d8a78a0c48cf2e5cd`을 만들고 src/tests·설정·잠금 파일의 SHA-256 일치를 확인했다. 원래 개발 서버/node_modules/.next는 검증용 설치·빌드로 변경하지 않았다.
- 임시 사본 `npm.cmd ci --no-fund`: 종료 0, 376개 재현 설치. 이후 `npm.cmd test`: 종료 0, 11개 파일/412건. `npm.cmd run typecheck`(Next typegen 포함), `npm.cmd run lint`, `npm.cmd run build`: 각각 종료 0. NEXT_TELEMETRY_DISABLED=1로 빌드했고 기존 루트/404 생성 성공.
- 임시 사본 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 설치에서 기존 개발 의존성 high 5건과 ESLint 9 지원 종료 경고는 재확인되었다. 이전 worklog의 eslint-config-next → fast-glob → micromatch → braces 경로 제약을 유지하고 강제 수정/의존성 변경 또는 전체 감사 통과로 표시하지 않는다.
- 사용자 지시 문서와 next-env.d.ts의 SHA-256이 시작과 동일함을 확인했다. 아래 기능 관련 9개 파일만 명시적으로 스테이징하며 staged diff 검사 후 develop 대상 PR 한 건을 생성하고 중지한다.
- 공식 일진 12건의 양력/음력 입력과 00:00/22:59/23:00/23:59, 윤일·계해→갑자·연말/새해 자정 전후를 검증했다. 00:00 고정 UTC+9가 전날 UTC에 해당해도 당일 일주를 유지한다. 윤달 동치·2000년 윤일/60일 순환·세기년 오류·API 범위 끝값은 독립 인용이 아닌 회귀로 표시했다.

### 변경 파일과 제약

- `src/domain/calendar/index.ts`: 일주 전용 포트·strict/readonly 응답 및 정책/규칙/공급자 버전.
- `src/infrastructure/manseryeok/day-calendar.ts`, `index.ts`: 기존 실제 계산 포트에서 검증된 일주 투영과 export.
- `tests/day-calendar.test.ts`, `day-calendar-errors.test.ts`, `fixtures/day-pillar-golden.json`: 공식/앵커 파생 골든·경계·오류/버전 계약 및 명시적 SDK 오류 Mock.
- `README.md`, `src/infrastructure/manseryeok/README.md`, `docs/worklog.md`: 사용법·독립 근거·지원 범위·검증 기록.
- 이번 독립 기준은 공식 2024년 자료 및 파생된 2025-01-01 경계다. 역사 DST/일반 IANA 시간대·태양시·다른 자시 관법·전 지원 연도 정확도나 시각 미상 후보를 검증 완료로 표시하지 않는다. 명시적 known 시각, fixed UTC+9·midnight와 기존 API 지원 범위를 유지한다.
- WBS-05의 소설 시각 1분 차이 등 기존 공급자 제약은 유지한다. 의존성/잠금 파일, 기존 전체 사주/CLI 계약, UI/API/DB/LLM/OAuth/PG/키/CI 변경은 없다. 사용자 지시 문서와 next-env.d.ts의 기존 변경은 보존한다.

## 2026-10-22 — WBS-05: 절기·연주·월주 계산

### 선행 확인과 구현 전 완료 조건

- PR #5 GitHub MERGED(2026-10-22 19:27:01 KST), base develop, merge commit `66215b2e223cb32d34c259acc72ce19a94289802` 및 origin/develop 반영 확인. 열린 develop PR 없음. WBS 실행순서 07, 선행 WBS-04 충족.
- develop checkout/ff-only pull, 위 커밋 ancestor 확인 후 `git branch -d feature/WBS-04-calendar-conversion` 성공. 최신 develop에서 `feature/WBS-05-solar-terms-year-month` 한 개 생성.
- AGENTS, WBS, 02/05/06/08 및 10의 절입 경계 원칙, 기존 코드와 설치된 manseryeok 2.0.0의 공개 API/타입/구현을 확인했다. 사용자 지시 문서와 next-env.d.ts의 기존 편집은 보존/커밋 제외.
- 완료 조건: 공개 getSolarTermsOfYear로 24절기를 UTC ISO 문자열의 readonly DTO로 제공하고, 기존 실제 계산 포트에서 연주/월주만 투영하는 별도 SolarCalendarAdapter를 제공한다. 입춘 연 경계, 12절 월 경계, 시작 포함, 분 단위 해상도와 규칙/공급자 버전을 기록한다. 비공개 SDK 경로나 별도 천문·간지 엔진은 추가하지 않는다.
- 정상/경계: KASI 독립 2024 절입 12개 각각 1분 전/당시/1분 후 연주·월주 검증, 중기 12개에서 월주 불변, 양력 새해/설날/윤달을 월·연 경계로 오인하지 않는지 확인. 24절기 순서/명칭/시간·불변/JSON 왕복 및 1800/2300 범위를 검증한다.
- 오류: 범위 밖 근사 폴백 차단, 누락/잘못된 타입/정책/실재하지 않는 날짜, 공급자 실패 및 손상된 절기 응답/버전 정규화. 원본 날짜나 공급자 cause를 외부로 보내지 않는다.
- 독립 자료 확인 중 KASI 예비 웹 페이지 간 청명 시각 차이를 발견했다. 공식 보도자료 첨부 월력요항(2023-06-23 관보 게재)은 절기의 날짜만 제공한다. 공식 날짜와 KASI 기본 경로의 분 단위 절입을 구분해 사용한다. 비공식 예비 자료/공급자 정확도 차이는 결과에 남기고 성공으로 숨기지 않는다.
- npm test, 전용 경계 테스트, 타입/린트/빌드를 실행한다. 실행 중인 개발 서버 충돌을 피한 동일 소스 임시 사본 검증은 위치를 구분한다. WBS-06 이후, CI, 실 OpenAI/PG, 비밀키 변경은 진행하지 않는다.

### 구현과 검증 결과

- `SolarCalendarAdapter`와 조회 요청/24절기 응답/연월주 응답의 엄격한 Zod 계약을 추가했다. 조회 결과는 UTC ISO 문자열, 중첩 readonly, 24개 수량·인덱스/명칭 대응·순서·요청 연도·분 해상도를 검증한다. 근사 폴백 연도는 입력에서 차단한다.
- `manseryeokSolarCalendarAdapter`는 공개 getSolarTermsOfYear와 기존 실제 사주 포트만 사용한다. 연월주를 별도 재계산하지 않고 투영하며, 입춘/12절/시작 포함/고정 UTC+9 정책과 공급자/규칙 버전을 반환한다. SDK Date/hanja/메서드는 노출하지 않는다.
- 구현 전 `npm.cmd test -- tests/solar-calendar.test.ts`: 종료 1, 없는 export로 예상한 53건 실패. 첫 구현에서 readonly Zod 스키마의 shape 접근 오류를 발견해 공용 연도 스키마를 분리했다. 이후 같은 전용 명령 종료 0, 실제 패키지 53건 통과. 실패 무시/skip은 사용하지 않았다.
- 원래 폴더 `npm.cmd test`: 종료 0, 9개 파일/342건 통과. 신규 66건은 실제 패키지·독립 경계 53건 및 명시적 SDK 오류 Mock 13건이다. 12절 1분 전/당시/후의 연주·월주를 모두 대조했고 중기 불변·양력 연말/새해·설날·윤달·지원 범위·손상 응답·오류 비식별화를 검증했다.
- 초기 린트는 통과했으나 root tsc 및 재현 사본의 Next typecheck에서 오류 응답 테스트의 이종 튜플 함수 추론 오류 TS7024가 발생했다. 테스트 팩토리에 명시적 `() => unknown` 타입을 부여해 수정했다. 이후 원래 폴더 `npm.cmd test -- tests/solar-calendar.test.ts tests/solar-calendar-errors.test.ts` 66건, `npm.cmd run lint`, `node node_modules/typescript/bin/tsc --noEmit` 모두 종료 0. 검사 강도를 낮추거나 실패를 무시하지 않았다.
- 동일 소스 임시 사본 `%TEMP%/saju-wbs05-validation-5817c99611824037ac216e2187dbb6af`에서 src/tests·설정·잠금 파일의 SHA-256 일치를 확인했다. 위 타입 수정 파일도 반영 후 해시를 대조했다. 원래 개발 서버/node_modules/.next는 검증용 설치·빌드로 변경하지 않았다.
- 임시 사본 `npm.cmd ci --no-fund`: 종료 0, 376개 재현 설치. 최종 소스로 `npm.cmd test`: 종료 0, 9개 파일/342건. 이어 `npm.cmd run typecheck`(Next typegen 포함), `npm.cmd run lint`, `npm.cmd run build`: 각각 종료 0. 빌드는 NEXT_TELEMETRY_DISABLED=1, 기존 루트/404 생성 성공.
- 임시 사본 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 설치에서 기존 개발 의존성 high 5건과 ESLint 9 지원 종료 경고가 재확인되었다. 기존 eslint-config-next → fast-glob → micromatch → braces 경로의 제약을 유지하고 의존성 변경/강제 audit fix 또는 전체 감사 통과로 표시하지 않는다.
- 사용자 지시 문서와 next-env.d.ts의 SHA-256이 작업 시작과 동일함을 확인했다. 아래 기능 관련 9개 파일만 명시적으로 스테이징하며 staged diff 검사 후 develop 대상 PR 한 건을 생성하고 중지한다.
- 독립 근거: [공식 보도자료](https://www.kasi.re.kr/kor/publication/post/newsMaterial/29633?cPage=7)의 HWP 첨부(1687408104839_1.hwp) 4쪽을 KASI 공식 HTML 미리보기로 확인했다. 공식 24절기 날짜와 [KASI 기본 경로 예비 달력자료](https://astro.kasi.re.kr/life/post/calendardata)의 2024년 시각을 fixture에 구분해 고정했다. 연월주 예상값은 입춘/12절·오호둔 정책의 수기 표이며 KASI의 음력 월건을 가져온 값이 아니다.
- 12절 시각은 허용오차 없이 독립 자료와 일치한다. **소설(중기)은 KASI 웹 04:56 / 공급자 04:57로 1분 차이가 남는다.** 별도 known-difference 회귀에서 차이를 확인하며 전체 24개 시각의 독립 일치로 표시하지 않는다. 월 경계인 절이 아니므로 이 차이는 연월주에 영향을 주지 않는다. 범위 밖 정밀도를 약속하거나 패키지를 임의 교체/보정하지 않았다.

### 변경 파일과 제약

- `src/domain/calendar/index.ts`: SolarCalendarAdapter, 요청/절기·연월주 DTO 및 정책·버전 스키마.
- `src/infrastructure/manseryeok/solar-calendar.ts`, `index.ts`: 지정 공개 API 호출·기존 포트 투영·오류 정규화·export.
- `tests/solar-calendar.test.ts`, `solar-calendar-errors.test.ts`, `fixtures/solar-terms-golden.json`: 독립 경계/회귀 및 명시적 공급자 오류 Mock.
- `README.md`, `src/infrastructure/manseryeok/README.md`, `docs/worklog.md`: 사용 예제·근거·정확도 차이·명령/결과 기록.
- `precision=minute`는 해상도다. 공급자 보정표는 주석상 6tail 천문 계산에서 생성했고 이번 독립 분 대조는 2024년 12절이다. 공식 첨부는 날짜만 제공하며 예비 웹 자료는 비공식이고 경로별 청명 시각도 다르다. 전 지원 연도/초 단위 천문 정확도 검증은 완료로 표시하지 않는다.
- 기존 고정 UTC+9·known 시각 요청 계약을 유지한다. IANA/DST/태양시/자시/미상 시각·일주 독립 대조·시기별 운세 기간 모델은 각 후속 WBS이며 구현하지 않았다. 의존성/잠금 파일·기존 CLI·UI/API/DB·LLM/OAuth/PG/키/CI 변경은 없다. 사용자 지시 문서와 next-env.d.ts의 기존 편집은 보존한다.

## 2026-10-22 — WBS-04: 양력·음력·윤달 변환

### 선행 병합과 구현 전 완료 조건

- 직전 PR #4는 GitHub `MERGED`(2026-10-22 18:56:05 KST), base develop이다. merge commit `870a39f4442b858de596af3ac36cf90fd386ad52`와 선행 WBS-01 PR #3의 merge commit이 origin/develop ancestor임을 확인했다. 열린 develop PR 없음.
- `git checkout develop`, `git pull --ff-only origin develop` 후 `git branch -d feature/WBS-03-cli-adapter-interface` 성공. 최신 develop에서 `feature/WBS-04-calendar-conversion` 한 개를 생성했다. WBS 실행순서 06, 선행 WBS-01/03 충족.
- AGENTS, WBS, 02/05/06/08 및 기존 입력·CLI·어댑터 계약과 설치된 manseryeok 2.0.0의 공개 변환 타입/구현을 확인했다. 사용자 지시 문서 및 next-env.d.ts의 기존 로컬 변경은 보존하고 커밋에서 제외한다.
- 완료 조건: 시각/시간대/성별 없이 날짜만 받는 엄격한 변환 계약과 공급자 독립 포트, 지정 패키지의 공개 solarToLunar/lunarToSolar API 연결, 평달·윤달을 명시한 양/음력 날짜 쌍과 출처 버전 반환. 기존 사주 계산 범위와 별도로 문서화한다.
- 정상: KASI 2023 달력자료의 평달·윤2월 시작/끝·다음 달·해 넘김을 독립 고정값으로 양방향 대조하고 왕복 보존, readonly/JSON 직렬화를 검증한다. 웹 달력자료의 비공식 고지를 함께 기록한다.
- 오류: 누락/잘못된 타입/추가 필드, 존재하지 않는 양력·음력 날짜, 없는 윤달, 윤달 플래그 누락·양력 true, 공급자 거절의 정규화 및 원문/stack/cause 미노출을 검증한다.
- 경계: 변환 API의 음력 1391~2100 및 실제 대응 양력 시작/끝과 그 직전/직후, 그레고리 윤년/세기년, 29/30일·평달/윤달 전환을 확인한다. 지원 경계 회귀와 독립 골든을 구별한다. 기존 사주 API의 1800~2300 범위를 확대하지 않는다.
- npm test 및 변환 전용 검사, 타입/린트/빌드를 실행한다. 개발 서버 산출물 충돌을 피하기 위한 임시 동일 소스 검증은 위치와 결과를 구분해 기록한다. 다음 WBS와 CI/외부 API/키 변경은 하지 않는다.

### 구현과 검증 결과

- `domain/calendar/conversion.ts`에 날짜 전용 요청/양력·음력 쌍/출처 버전 Zod 스키마 및 공급자 독립 CalendarConversionAdapter를 추가했다. 입력은 엄격하고 윤달 플래그 필수, 출력은 중첩 readonly다.
- 인프라 `conversion.ts`가 설치된 공개 solarToLunar/lunarToSolar만 호출한다. 없는 윤달·실제 음력 월 길이·정확한 변환 범위는 고정 공급자가 검사한다. 입력 거절/예상 밖 공급자 오류/손상된 결과를 공통 CalendarAdapterError의 고정 문구로 반환하며 원문 cause나 Zod issues를 보관하지 않는다.
- 양력 1391-02-13 ~ 2101-01-28, 음력 평달 1391-01-01 ~ 2100-12-29 양끝을 실제 설치 패키지로 확인했다. 지원 구간 끝값은 공급자 회귀이며 독립 검증으로 표시하지 않는다. 사주/CLI calculate 범위는 바꾸지 않았다.
- [KASI 2023](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2023), [2024 달력자료](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2024)의 음력 월초와 대/소에서 독립 날짜 10건을 고정했다. 2023 평2월 30일 → 윤2월 1일 → 윤2월 29일 → 3월 1일, 해 넘김 및 2024 그레고리 윤일을 양방향 대조한다. 월말/윤일은 표의 시작일과 일수에서 산출한 값임을 fixture에 명시했다.
- 구현 전 `npm.cmd test -- tests/calendar-conversion.test.ts`: 예상한 종료 1, 아직 없는 변환 export로 63건 실패. 구현 후 같은 명령 종료 0, 실제 패키지 63건 통과. 실패를 무시하거나 skip하지 않았다.
- 원래 작업 폴더 `npm.cmd test`: 종료 0, 7개 파일/276건 통과. 추가 70건은 실제 공급자 테스트 63건과 명시적 SDK 오류 Mock 7건이며 기존 입력/사주/실제 npm CLI 회귀를 포함한다.
- 원래 폴더 `npm.cmd run lint`: 종료 0, 경고 0개. `node node_modules/typescript/bin/tsc --noEmit`: 종료 0. Next typegen을 포함한 검사는 개발 서버 산출물과 충돌하지 않도록 아래 임시 사본에서 별도 수행한다.
- 동일 소스 임시 사본 `%TEMP%/saju-wbs04-validation-2db48a91740645099ea4acf7df40b947`을 만들고 src/tests 및 설정/잠금 파일의 SHA-256 일치를 확인했다. 원래 폴더 node_modules와 개발 서버는 건드리지 않았다.
- 임시 사본 `npm.cmd ci --no-fund`: 종료 0, 376개 패키지 재현 설치. 이후 `npm.cmd test`: 종료 0, 7개 파일/276건 재확인. `npm.cmd run typecheck`(Next typegen 포함), `npm.cmd run lint`, `npm.cmd run build`: 각각 종료 0. 빌드는 NEXT_TELEMETRY_DISABLED=1로 실행했으며 기존 루트/404를 생성했다.
- 임시 사본 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 설치에서 표시된 기존 개발 의존성 high 5건과 ESLint 9 지원 종료 경고는 미해결 제약이다. 기존 worklog의 eslint-config-next → fast-glob → micromatch → braces 경로 관련 사항이며 강제 수정/의존성 변경 또는 전체 감사 통과로 표시하지 않는다.
- 사용자 지시 문서와 next-env.d.ts의 SHA-256이 시작 시점과 동일함을 확인했다. 기능 관련 10개 파일만 명시적으로 스테이징하며 `git diff --cached --check` 및 범위 검토 후 develop 대상 PR 한 건을 생성하고 중지한다.

### 변경 파일과 제약

- `src/domain/calendar/conversion.ts`, `index.ts`: 날짜 전용 계약/스키마/타입/포트와 공개 export.
- `src/infrastructure/manseryeok/conversion.ts`, `index.ts`: 실제 고정 공급자의 양방향 변환, 오류·응답 경계와 export.
- `tests/calendar-conversion.test.ts`, `calendar-conversion-errors.test.ts`, `fixtures/calendar-conversion-golden.json`: 독립 골든·왕복·윤달·지원 경계·오류 검증.
- `README.md`, `src/infrastructure/manseryeok/README.md`, `docs/worklog.md`: 사용 예제, 지원 범위, 근거 및 검증 기록.
- KASI 웹 달력자료는 공식 발표 자료가 아니라는 자체 고지를 포함한다. 이번 독립 골든 범위는 2023~2024년이다. 패키지 테이블 주석의 2050~2100년은 천문 계산 기반이며 해당 구간 및 전체 역사적 날짜의 독립 정확도를 보증하지 않는다. 역사 시간대/절입/명리 판단과 30건 종합 골든은 후속 WBS다.
- 사용자 지시 문서와 next-env.d.ts의 기존 로컬 편집은 보존/커밋 제외한다. 의존성/잠금 파일, 기존 CLI/사주 계산, UI/API/DB/LLM/OAuth/PG/시크릿/CI 변경은 없다.

## 2026-10-22 — WBS-03: CLI와 어댑터 인터페이스

### 선행 병합과 구현 전 완료 조건

- PR #3 `MERGED`(2026-10-22 18:26:00 KST), merge commit `bf96d8f9df74cb1bc1d0826a815b664dd60ec159`의 origin/develop 반영과 선행 PR #2 merge commit의 ancestor를 확인했다. 열린 develop PR 없음.
- develop checkout/fast-forward pull 후 이전 로컬 `feature/WBS-01-manseryeok-adapter`를 `git branch -d`로 안전 정리하고 `feature/WBS-03-cli-adapter-interface` 한 개를 생성했다.
- AGENTS, WBS 및 02/05/06/08, 10의 어댑터 경계, 기존 입력/패키지 어댑터 문서를 읽었다. 기존 사용자 지시 문서와 Next dev 생성 타입 변경은 보존하며 커밋에서 제외한다.
- 완료 조건: 공급자 SDK 타입과 분리된 CalendarAdapter 포트, 기존 AnalysisInput → 제한된 실제 패키지 호출 연결, 표준입력 JSON의 validate/calculate CLI와 npm 실행 명령, 결과·오류·종료 코드 계약 및 실제 CLI 스모크.
- 현재 계산은 `Etc/GMT-9`(명시적 고정 UTC+9), known 시각, standard/midnight/reject 정책만 지원한다. 일반 지역 시간대·DST·태양시·자시 및 미상 시각 알고리즘을 구현/추정하지 않고 unavailable 사유와 기존 미상 메타데이터를 반환한다. validate는 기존 입력 계약 전체를 검증한다.
- 정상 검증: 공급자 비의존 포트/가짜 포트로 순수 연결 검증, 실제 어댑터/CLI의 성공 JSON과 고정 UTC+9 예제, validate/도움말.
- 오류 검증: 잘못된 JSON/필수 필드/CLI 인자/라이브러리 거절/손상된 어댑터 응답/입출력 오류, 민감 원문 없는 stderr 및 0/1/2 종료 코드.
- 경계 검증: 미상 시각/좌표/순역 기준, 미지원 정책·시간대의 공급자 호출 0회, 입력 최대 64 KiB와 UTF-8/BOM/청크 분할, 실제 자정·23:59, stdout/stderr 구분.
- npm test 및 CLI/포트 전용 테스트, typecheck/lint/build를 실행한다. 개발 서버의 SWC 잠금·.next 충돌을 피하는 재현 설치/빌드는 필요 시 동일 소스 임시 사본에서 검증하고 원래 폴더 성공과 구분한다. 다음 WBS/CI/실 API/시크릿 변경은 없다.

### 결과

- 공급자 SDK 타입 없는 `domain/calendar`의 CalendarAdapter 포트와 공용 요청/응답 Zod 계약을 추가했다. WBS-01의 동일 계약을 옮기고 기존 Manseryeok export는 호환 별칭으로 유지했다. SDK import는 기존 adapter.ts 내부에만 남아 있다.
- `manseryeokCalendarAdapter`가 포트를 구현하며 `application/saju`는 AnalysisInput 검증 → 현재 지원 조건 확인 → 포트 요청/응답 검증을 수행한다. 미상/미지원이면 snapshot 없이 unavailable/reasons/information을 반환하고 공급자를 호출하지 않는다. 실제 달력 입력 거절은 정규화된 포트 오류로 구분한다.
- `npm run --silent saju -- validate|calculate|--help`를 추가했다. UTF-8 stdin 한 문서만 받고 stdout 결과와 stderr 오류, 0/1/2 종료 코드를 분리한다. 64 KiB 상한·BOM·UTF-8 청크 분할·손상/읽기 오류를 처리하고 원문 입력/공급자 예외/stack/cause는 출력하지 않는다.
- `npm.cmd install --save-dev --save-exact tsx@4.23.15 --no-fund`: 종료 0. 실제 npm 버전/engine 및 [tsx 공식 Node CLI 문서](https://tsx.hirok.io/dev-api/node-cli)의 `node --import tsx` 방식을 확인했다. 기존 패키지 버전은 모두 유지했고 npm이 제거한 기존 선택 플랫폼 메타데이터 2개도 보존했다.
- 테스트 선작성 초기 실행은 미구현 모듈 collection 실패(종료 1)였다. 구현 뒤 제한 실행 환경의 실제 프로세스 테스트 4건은 tsx가 OS 사용자 정보 조회 시 `uv_os_get_passwd ENOMEM`을 반환해 실패했다. 테스트를 생략/약화하지 않고 동일 명령을 일반 실행 권한에서 다시 실행해 41건 통과했다. 타입 검사에서 드러난 mock 호출 인자 타입도 수정했다.
- BOM/도움말과 실제 오류 종료 코드 검증을 보강한 뒤 원래 작업 폴더 `npm.cmd test`(일반 실행 권한): 종료 0, 5개 파일/206건 통과. 기존 164건과 신규 42건(포트·CLI·입력/실제 npm 자식 프로세스) 포함. 예제는 합성 입력이며 외부 API 호출은 없다.
- 원래 폴더 `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 종료 0. Next dev 생성 타입/사용자 편집을 유지하기 위해 전체 npm typecheck/build는 아래 동일 소스 사본에서 검증했다.
- 기존 SWC 잠금/개발 서버 .next 충돌이 알려져 원래 폴더의 npm ci를 재시도하지 않았다. `%TEMP%/saju-wbs03-validation-a9e6c7234c5f433f885c70435340ded9`에 32개 소스/설정 파일의 SHA-256 일치를 확인한 임시 검증 사본을 만들었다. 별도 브랜치나 다른 WBS는 만들지 않았다.
- 동일 사본 `npm.cmd ci --no-fund`: 종료 0, 376개 패키지 재현 설치 성공.
- 동일 사본 `npm.cmd test`(일반 실행 권한): 종료 0, 5개 파일/206건 통과. 실제 npm CLI의 계산/검증/도움말, invalid JSON, unknown 시각, 65,537바이트/손상 UTF-8의 종료 코드와 stdout/stderr를 검증했다.
- 동일 사본 `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: 모두 종료 0. 빌드는 NEXT_TELEMETRY_DISABLED=1, 기존 루트/404 유지.
- 동일 사본 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 기존 개발 의존성 high 5건 및 ESLint 9 지원 종료 경고는 남아 있으며 전체 감사 통과로 표시하지 않는다.
- 최종 소스/설정 31개 파일(Next 생성 관리 파일 제외)의 SHA-256이 검증 사본과 일치함을 재확인했다. 사용자 지시 문서와 next-env.d.ts는 시작 전 SHA-256과 같고 커밋에서 제외한다.
- `git diff --cached --check`: 통과. 스테이징은 아래 WBS-03 관련 17개 파일만 포함한다.
- 기능 구현/로컬 검증 완료. develop 대상 PR 한 건 생성 후 중지하고 사용자 리뷰/병합 전 WBS-04 이후에 착수하지 않는다.

### 변경 파일과 제약

- `src/domain/calendar/index.ts`: 공용 요청/응답 스키마, CalendarAdapter 및 값 없는 오류 계약. SDK/Node I/O/Next/인프라 import 없음.
- `src/infrastructure/manseryeok/schemas.ts`, `index.ts`, `port.ts`: 기존 export 호환 유지와 포트 구현 연결. 기존 실제 SDK 호출 알고리즘은 유지.
- `src/application/saju/index.ts`: 기존 AnalysisInput과 제한된 계산 포트의 순수 연결 및 검증된 결과 계약.
- `src/cli/main.ts`, `run.ts`, `input.ts`, `README.md`: 실제 입출력, 순수 실행/오류·종료 코드, 제한 UTF-8 reader 및 사용법.
- `tests/calendar-service.test.ts`, `tests/cli.test.ts`, `tests/fixtures/cli-input.json`: 순수 포트/실제 패키지·npm CLI, 미지원 공급자 호출 0회, 오류/개인정보/입력 경계 검증.
- `package.json`, `package-lock.json`: npm saju 명령 및 정확한 tsx 개발 의존성.
- `README.md`, `src/infrastructure/manseryeok/README.md`, `docs/worklog.md`: 실행 계약/현재 한계/검증/변경 기록.
- 계산은 정확한 Etc/GMT-9(고정 UTC+09:00), known 시각, standard/midnight/reject만 연결한다. Asia/Seoul을 포함한 일반 지역 시간대를 성공시키려고 이름만 바꾸거나 UTC+9로 간주하지 않는다. 정상 범위 밖에서는 unavailable을 반환한다. 이 상태는 CLI 개발용 스냅샷의 상태이며 F01~F11 complete 또는 최종 NatalCore가 아니다.
- 일반 IANA/역사 DST, 평·진태양시, 자시·미상 후보, 음양력 종합 골든/순수 판단 규칙은 후속 WBS 범위다. 현재 명시적 불가 사유와 기존 미상 메타데이터를 유지하며 허구의 시각/정책/순역 기준을 만들지 않는다.
- tsx와 실제 npm 자식 프로세스 테스트는 OS 사용자 정보 조회를 허용하는 일반 실행 환경에서 검증했다. 제한 실행 환경의 실패를 통과로 표시하지 않는다. CI 구성/필수 상태 검사, 실제 OpenAI/DB/OAuth/PG, P06/UI, 시크릿 및 기존 BirthInput 계약 변경은 없다.

## 2026-10-22 — WBS-01: 지정 manseryeok 설치와 패키지 어댑터

### 선행 병합과 구현 전 완료 조건

- PR #2 `MERGED`(2026-10-22 17:55:30 KST), merge commit `14d2c9cc6c7314bf196690b8aa5e68a9359c6b53`가 원격 develop tip임을 확인했다. 선행 WBS-18의 PR #1도 이 이력에 포함된다. 열린 develop PR 없음.
- develop checkout/fast-forward pull 및 PR #2 merge commit ancestor 확인 후 이전 로컬 `feature/WBS-02-birth-input-schema`를 `git branch -d`로 안전 삭제했다.
- 최신 develop에서 기능 브랜치 `feature/WBS-01-manseryeok-adapter` 한 개 생성.
- 기존 사용자 지시 문서 편집과 Next 개발 서버가 생성한 `next-env.d.ts` dev 타입 경로 변경을 감지했다. 이번 기능 PR에는 포함하지 않는다.
- AGENTS, WBS, 02/05/06/08 및 10의 코어 경계, 기존 WBS-02 입력 계약을 확인했다.
- npm 메타데이터의 저장소 URL과 설치 패키지의 package.json/dist/index.d.ts/dist/types.d.ts/dist/index.js 및 시간 해석 구현을 확인했다. 확정 공급자는 `yhj1024/manseryeok`, npm 버전은 2.0.0이며 다른 라이브러리 선정/비교는 하지 않는다.
- 완료 조건: `manseryeok@2.0.0` 정확한 버전/잠금 파일 고정, 어댑터 내부에서만 실제 calculateFourPillars 호출, 공급자 타입을 외부로 내보내지 않는 Zod/JSON DTO, 실제 패키지 스모크 및 경계/오류/독립 근거 테스트 통과.
- 어댑터는 설치 패키지의 기본 동작인 **UTC+09:00 고정 표준시·midnight**를 명시하는 저수준 호출 경계다. BirthInput/CalculationPolicy의 일반 변환 인터페이스·CLI는 WBS-03, 역법/시간대/정책 확장은 후속 WBS에서 구현한다. 일반 IANA 시간대 또는 미상 시각을 KST/자정으로 보충하지 않는다.
- 정상 테스트: 실제 양력 호출과 상수 기대값, 음력·윤달 플래그 전달, 패키지 버전/출력 스키마·JSON 직렬화·불변성.
- 오류 테스트: 필수 시각/기준 누락, 잘못된 타입/날짜/윤달, 지원하지 않는 시간대/정책 혼입, 라이브러리 오류의 출생 값 없는 정규화.
- 경계 테스트: 공급자 지원 연도 범위와 00:00/23:59. 한국천문연구원 2024 달력자료에서 직접 확인한 일진 3건을 고정 픽스처로 대조하고 호스트 TZ를 바꿔 동일함을 확인한다. 일진을 제외한 전 기둥·절기 경계/30건 골든의 종합 검증을 완료했다고 주장하지 않는다.
- `npm test`, 어댑터 전용 테스트, typecheck/lint/build 및 잠금 파일 재현 설치를 수행하고 PR 한 건 생성 뒤 중지한다.

### 결과

- `npm.cmd install --save-exact manseryeok@2.0.0 --no-fund`: 종료 0. package.json/lockfile에 버전·무결성 고정. 패키지 실제 저장소/exports/타입을 확인했고 공급자 import는 `src/infrastructure/manseryeok/adapter.ts` 두 곳(함수/타입, package.json)에만 있다.
- `ManseryeokRequestSchema`는 명시적 날짜/시각/달력/윤달 및 `fixed-utc+09:00`/`midnight` 전제를 검증한다. actual `calculateFourPillars(BirthInfo)` 반환값에서 4개 기둥만 추출하고 `ManseryeokSnapshotSchema`로 실제 패키지 이름/버전과 함께 검증해 readonly JSON DTO로 반환한다.
- 공급자 RangeError는 고정 코드 `LIBRARY_REJECTED_INPUT`, 그 외 계산 실패/출력 이상도 고정 코드로 정규화한다. 원문 오류 메시지·cause·출생정보를 노출하거나 일반 로그에 남기지 않는다. 생략 시각/추가 시간대·보정·gender 옵션은 허용하지 않는다.
- 테스트 선작성 초기 실행은 모듈 미구현으로 collection 실패(종료 1)했고 구현 후 통과했다. 테스트는 실제 설치 패키지를 호출하며 mock/skip/실패 무시 옵션을 쓰지 않았다.
- `npm.cmd test -- tests/manseryeok-adapter.test.ts`: 종료 0, 어댑터 41건 통과. 양력/음력/윤달 옵션 전달, 지원 연도/시각 경계, 오류 정규화, 메타데이터/직렬화·불변성 및 독립 일진 3건 확인.
- 독립 픽스처는 [KASI 2024년 달력자료](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2024)의 2월 10일 갑진/3월 10일 계유/4월 9일 계묘 일진을 직접 확인해 고정했다. 이 웹 자료는 공식 발표 자료가 아니라고 고지하며, 일진 외 전 기둥의 독립 검증이나 30건 골든 완료를 의미하지 않는다. 공급자 예제/동일 공급자 양음력 대응은 연결 스모크로 별도 취급한다.
- 원래 작업 폴더 `npm.cmd ci --no-fund`는 종료 1: 실행 중인 Next 프로세스가 사용하는 SWC 네이티브 파일의 Windows `EPERM` 잠금으로 실패했다. 사용자 프로세스를 중지/강제 삭제하지 않고 `npm.cmd install --no-fund`로 의존성을 복구했다(종료 0). 잠긴 이전 SWC 디렉터리의 cleanup 경고는 남아 있으며 강제로 제거하지 않았다.
- 복구 후 원래 작업 폴더 `npm.cmd test`: 종료 0, 전체 3개 파일/164건 통과. `npm.cmd ls manseryeok`: 2.0.0 확인.
- 잠금 충돌 및 개발 서버의 `.next` 충돌을 피하려고 `%TEMP%/saju-wbs01-validation-a7c4f0dbf10043a5b2ba45baa638e56a`에 소스/설정만 복사했다. 시작 전 22개 파일 SHA-256 일치, 검사 후 생성 관리 파일 next-env를 제외한 최종 소스·설정 21개 파일 SHA-256 일치를 확인했다. 검증 폴더용 브랜치/추가 WBS는 만들지 않았다.
- 동일 소스 임시 사본 `npm.cmd ci --no-fund`: 종료 0, 373개 패키지 재현 설치. npm 갱신이 제거한 기존 선택 플랫폼 메타데이터 2개는 원래 고정 항목을 보존했으며 최종 잠금 파일은 검증 사본과 일치한다.
- 동일 소스 임시 사본 `npm.cmd test`: 종료 0, 3개 파일/164건 통과.
- 동일 사본에서 `$env:TZ='UTC'`, `$env:TZ='America/New_York'` 각각 `npm.cmd test -- tests/manseryeok-adapter.test.ts`: 각 종료 0/41건 통과. 두 호스트 시간대에서도 고정 UTC+9 어댑터 결과 동일.
- 동일 사본 `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: 모두 종료 0. 빌드에 `NEXT_TELEMETRY_DISABLED=1` 적용, 기존 루트/404 페이지 유지.
- 동일 사본 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 기존 개발 의존성 high 5건 및 ESLint 9 지원 종료 경고는 남아 있고 전체 감사 통과로 표시하지 않는다.
- 사용자 지시 문서 및 Next dev 타입 경로 편집의 SHA-256은 작업 전과 동일하며 커밋에서 제외한다. 기능 PR 한 건 생성 후 중지하고 리뷰/병합 전 다음 WBS에 착수하지 않는다.
- `git diff --cached --check`: 통과. 스테이징은 아래 WBS-01 관련 10개 파일이며 기존 입력/앱 및 사용자 편집 파일은 포함하지 않는다.

### 변경 파일과 제약

- `package.json`, `package-lock.json`: 지정 라이브러리 2.0.0 추가/버전·무결성 고정. 기존 패키지 버전 유지.
- `src/infrastructure/manseryeok/adapter.ts`, `schemas.ts`, `index.ts`: 실제 공급자 호출과 타입 격리, 요청/응답 검증 및 안전한 오류/출처 메타데이터.
- `src/infrastructure/manseryeok/README.md`, `README.md`: 명시적 저수준 시간 전제·지원 범위 및 실행 안내.
- `tests/manseryeok-adapter.test.ts`, `tests/fixtures/manseryeok-day-golden.json`: 실제 패키지 스모크/오류/경계 및 출처 포함 독립 일진 3건.
- `docs/worklog.md`: 선행 병합/안전 정리·테스트·실패와 복구·제약 기록.
- 실제 날짜/윤달 판정은 공급자 API를 호출하되 종합 양음력 변환·절입 경계·일주/시주·역사 TZ/DST·태양시·대운 정확도 QA는 해당 후속 WBS 범위다. 현재 스냅샷을 최종 NatalCore/전체 정책 지원으로 표시하지 않는다.
- 고정 UTC+09:00은 역사적 Asia/Seoul 민간시 전체와 다르다. 일반 BirthInput/CalculationPolicy/미상 시각을 어댑터로 연결하는 변환·CLI는 이번 작업에 포함하지 않는다. 이 제한을 없애려고 시각·경도·정책을 임의 보충하지 않는다.
- 원래 작업 폴더의 npm ci는 파일 잠금으로 실패했다. 재현 설치/빌드 성공은 동일 소스 임시 사본에서 얻은 결과이며 원래 폴더의 ci 통과로 보고하지 않는다.
- OpenAI/API/DB/OAuth/PG/UI/CI/배포/시크릿 및 WBS-02 입력 계약 변경 없음. WBS-03 및 이후 기능은 미착수다.

## 2026-10-22 — WBS-02: 출생 입력 스키마와 미상 정보 모델

### 선행 조건과 구현 전 완료 조건

- PR #1은 GitHub에서 `MERGED`(2026-10-22 17:36:03 KST)이며 merge commit `191eb52810db112d5d1dfa153eb3ac19c555aad2`가 원격 `develop`에 반영됨을 확인했다. 열린 develop PR 없음.
- `git checkout develop`, `git pull --ff-only origin develop` 후 merge commit의 ancestor 확인 성공. 이전 로컬 `feature/WBS-18-project-bootstrap`은 `git branch -d`로 삭제했다.
- 최신 develop에서 `feature/WBS-02-birth-input-schema` 한 개 생성. 작업 중 감지한 사용자 편집 `docs/05_Codex_작업지시_프롬프트.md`는 유지하고 스테이징/커밋 대상에서 제외한다.
- 읽은 기준: AGENTS, WBS, 02/05/06/08 및 01/10/14/18의 입력·부분 결과 계약, 0001의 기존 출생정보 제약. 범위는 `src/domain/input`의 Zod/TypeScript 계약과 순수 입력 한계 모델이다.
- 완료 조건: 양/음력·윤달·날짜·시각(명시적 미상)·IANA 시간대·좌표·대운 순역 기준을 검증하고 계산 정책과 분리한다. 누락 값의 묵시적 기본값/형변환/출생시각 생성 금지.
- 정상 테스트: 양력 및 음력 입력, 알려진 시각/명시적 미상, 정책 조합, 입력 한계 메타데이터, 입력 불변성, 타입 추론.
- 오류 테스트: 잘못된 날짜/시각/시간대·좌표, 양력 윤달, 필수 필드 누락, 잘못된 enum/타입, 미상 분기에 시각 혼입, 알 수 없는 필드.
- 경계 테스트: 00:00/23:59, Gregorian 윤년/세기, 음력 30일과 31일, 좌표 양 끝과 0, 명시적 null·unspecified, 보정에 필요한 시각/경도 미상. 실제 음력 변환·윤달 실재·라이브러리 지원 연도·DST fold/gap 해석·태양시·자시 계산은 후속 WBS에서 검증한다.
- `npm test` 및 입력 전용 테스트, typecheck/lint/build로 기존 초기화 회귀까지 검증한다. 실제 외부 공급자 호출·UI/API/DB 구현·CI·시크릿 변경은 없다.

### 결과

- Zod 4.6.7을 직접 런타임 의존성으로 고정했다(기존에는 린트 도구의 간접 개발 의존성이었다). 버전과 API는 npm 레지스트리 및 [Zod 공식 문서](https://zod.dev/api)에서 확인했다. 기존 의존성 버전은 변경하지 않았다.
- `BirthInputSchema`/`BirthTimeSchema`와 `CalculationPolicySchema`를 분리하고 `AnalysisInputSchema`에서 조합했다. 엄격한 필드 검증과 명시적 unknown/null/unspecified만 허용하며 파싱 결과는 readonly다.
- `getInputInformation`/`InputInformationSchema`는 원본 출생 값 없이 미상 필드와 시각/순역/보정 한계의 코드·입력 경로를 반환한다. 보정의 묵시적 대체, 허구의 시주/순역, 기능별 complete 판정은 하지 않는다.
- 테스트를 먼저 작성한 초기 실행은 구현 모듈이 없어 collection 실패(종료 1)했다. 구현 후 전체 테스트를 통과시켰으며 실패 무시/skip 옵션은 쓰지 않았다.
- 코드 검토에서 날짜·시각 정규식의 마지막 개행 허용 가능성도 확인해 정확한 길이 제약과 공백/LF/CRLF 오류 테스트 6건을 추가했다.
- `npm.cmd install --save-exact zod@4.6.7 --no-fund`: 종료 0. npm이 기존 선택 플랫폼 peer 메타데이터 2개를 잠금 파일에서 제거해 원래 고정된 항목을 보존했다. 버전 변경/override는 없으며 이후 재현 설치를 검증했다.
- `npm.cmd ci --no-fund`: 종료 0, 최종 잠금 파일 재현 설치 성공(372개 패키지).
- 재현 설치 후 `npm.cmd test -- tests/birth-input.test.ts`: 종료 0, 입력 전용 121건 통과.
- 재현 설치 후 `npm.cmd test`: 종료 0, 2개 파일/123건 통과(기존 초기화 2건 포함).
- 재현 설치 후 `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: 모두 종료 0. 빌드 시 `NEXT_TELEMETRY_DISABLED=1` 사용. 기존 `/` 및 404 페이지 빌드 유지.
- 재현 설치 후 `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 설치 감사의 개발 의존성 high 5건 및 ESLint 9 지원 종료 경고는 WBS-18에서 기록한 기존 제약으로 남아 있다. 전체 감사 통과로 표시하거나 강제 수정하지 않았다.
- `git diff --cached --check`: 통과. 스테이징은 아래 WBS-02 관련 9개 파일만 포함하며 사용자 지시 문서의 SHA-256 동일 및 커밋 제외를 확인했다.
- 기능 구현/로컬 검증 완료, develop 대상 PR 한 건을 생성한 뒤 리뷰·병합을 기다린다. WBS-01 및 이후 WBS는 시작하지 않는다.

### 변경 파일과 제약

- `src/domain/input/schemas.ts`: 출생 입력·시각·정책·분리된 envelope Zod 계약 및 추론 타입.
- `src/domain/input/information.ts`, `index.ts`: 값 없는 미상/한계 메타데이터와 공개 export.
- `src/domain/input/README.md`, `README.md`: 필드·정책·부분 정보 처리·독립 실행 계약.
- `tests/birth-input.test.ts`: 정상/오류/경계·불변성·JSON 왕복·타입 추론·메타데이터 검증.
- `package.json`, `package-lock.json`: Zod 정확한 직접 의존성 추가.
- `docs/worklog.md`: 선행 병합·검증·변경·제약 기록.
- 날짜 0001~9999 및 음력 1~30일은 입력 형식의 구조적 범위다. 실제 만세력 지원 연도·음력 월 길이·윤달 실재·양음력 변환은 이 PR에서 보증하지 않는다. 시각은 분 단위이며 범위/부분 시각은 현재 계약에 없다.
- 시간대는 area/location 형식 또는 UTC를 명시해야 하며 런타임 Intl 지원 확인만 수행한다. IANA 별칭은 원문 보존, 역사 DST fold/gap 판정과 시점 변환은 후속 WBS-07 범위다. 호스트 시간대로 자동 보충하지 않는다.
- 정책 enum은 선택 계약이며 태양시/자시 적용 또는 관법 검증 완료를 의미하지 않는다. 음력 원본과 양력 변환일의 저장 계약은 후속 DB 작업에서 별도 확인한다.
- API/UI/DB/만세력/LLM/PG/CI/배포/시크릿 및 기존 초기화 코드는 변경하지 않았다. 사용자의 지시 문서 로컬 편집은 이번 변경에 포함하지 않는다.

## 2026-10-22 — WBS-18: npm 프로젝트 초기화

### 선행 조건과 범위

- WBS-00은 읽기 전용 점검 및 이 대화의 사용자 승인으로 완료했다. 해당 WBS는 기능 PR 예외다.
- 승인 범위: `C:\Users\Lee\Desktop\projects\saju` 내부에 npm 기반 Next.js/TypeScript/Vitest 프로젝트 파일 추가. 기존 `AGENTS.md`, `docs`, `.git` 유지. 삭제 대상 없음.
- GitHub PR 전체 조회 결과 0건, 미병합 기능 PR 없음. `git pull --ff-only origin develop` 결과 최신 상태이며 기준 커밋은 `c719f99`다.
- 정리할 로컬 기능 브랜치 없음. 생성 브랜치는 `feature/WBS-18-project-bootstrap` 한 개다.
- WBS-18 초기화만 진행한다. 입력 스키마·역법·LLM·제품 UI·인증·DB·PG 기능은 구현하지 않는다.

### 구현 전 정의한 완료 조건과 검증

- npm 단일 패키지 관리자, 정확한 직접 의존성 버전 및 `package-lock.json` 커밋. `npm ci`로 재현 설치.
- Next.js App Router + strict TypeScript, Vitest의 비감시 `npm test`와 타입/린트/빌드 명령 구성.
- 정상: TypeScript/TSX와 경로 별칭을 사용하는 실제 루트 페이지를 Vitest에서 서버 렌더링하고, 프로덕션 서버의 `/`가 200을 반환하는지 확인.
- 오류: 존재하지 않는 경로는 404를 반환. 테스트가 없는 실행은 성공으로 처리하지 않는지 확인.
- 경계: 외부 공급자 키와 원격 폰트 없이 빌드·기동, 한국어 문서 언어 및 viewport 메타 확인. 일반 테스트는 Node 환경에서 웹 프레임워크 구동 없이 실행.
- 기존 문서와 예제 보존, 비밀 환경파일/산출물 제외, pnpm 잠금 파일 및 GitHub Actions 미추가 확인.

### 결과

- 초기화 구현 완료. 기능 PR은 `develop` 대상 1건만 생성하고 사용자 리뷰·머지를 기다린다. WBS-18의 `develop` 병합 완료로 간주하지 않으며 다음 WBS는 시작하지 않는다.
- 검증 환경: Windows PowerShell, Node.js 24.12.0, npm 11.6.2. PowerShell이 `npm.ps1`을 실행 정책으로 차단해 정책 변경 없이 동일 npm CLI인 `npm.cmd`로 실행했다.
- 직접 의존성: Next.js 16.4.2, React/React DOM 19.3.1, TypeScript 5.9.3, Vitest 5.0.5, ESLint 9.39.5 및 Next ESLint 설정 16.4.2. npm 레지스트리의 실제 버전·engine·peer 범위를 확인했다.
- `npm.cmd install --no-fund`: 종료 0, `package-lock.json`(lockfileVersion 3) 생성.
- `npm.cmd ci --no-fund`: 종료 0, 잠금 파일로 372개 패키지 재현 설치. 아래 감사·지원 종료 경고는 별도 제약으로 기록한다.
- 재현 설치 후 `npm.cmd test`: 종료 0, 1개 파일 / 2개 테스트 통과. TSX·별칭·실제 앱/레이아웃의 서버 렌더링 확인.
- 재현 설치 후 `npm.cmd run typecheck`: 종료 0, 라우트 타입 생성 및 strict 타입 검사 통과.
- 재현 설치 후 `npm.cmd run lint`: 종료 0, 경고 0개. 설계 예제(`docs/**`)와 생성 파일만 린트 대상에서 제외했다.
- 재현 설치 후 `npm.cmd run build`: 종료 0, Turbopack 프로덕션 빌드 및 정적 루트/404 생성 성공. `NEXT_TELEMETRY_DISABLED=1` 사용, 외부 키/원격 폰트 불필요.
- 음성 검증 `npm.cmd test -- --exclude '**/*'`: 예상한 종료 1, `No test files found`. 빈 실행을 통과로 처리하지 않음을 확인한 것이며 정상 테스트의 실패를 무시한 결과가 아니다.
- 프로덕션 HTTP 스모크: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 31818`을 자식 프로세스로 시작하고 Node `fetch`/`assert`로 `/` 200, 한국어 HTML, main/제목, `width=device-width, initial-scale=1` viewport, `/__wbs18_missing__` 404 확인. 종료 0, 검증 후 해당 서버 프로세스 종료.
- `git diff --check`: 통과. 기준 커밋 대비 `AGENTS.md` 및 기존 `docs`의 변경 없음(새 작업로그 제외). 환경 예제는 Git 추적 유지, 환경파일·node_modules·.next·coverage 제외, 다른 패키지 관리자 잠금 파일/CI workflow 미추가 확인.

### 제약과 외부 연동

- `npm.cmd audit --json`: 종료 1, 개발 의존성 경로 high 5건. `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`에서 전파되며 근본 권고는 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)이다. 확인 시점 공식 권고에 수정 버전이 없다. 미해결 상태를 유지해 보고하며 `audit fix --force`/취약점 숨김/무근거 override는 하지 않았다.
- `npm.cmd audit --omit=dev --json`: 종료 0, 런타임 취약점 0건. 위 개발 도구 경고를 전체 감사 통과로 표시하지 않는다.
- npm은 ESLint 9.39.5의 지원 종료 경고도 출력했다. Next 설정이 포함하는 `eslint-plugin-react@7.37.5`와 `eslint-plugin-jsx-a11y@6.10.2`의 peer 범위가 ESLint 9까지여서 npm peer 강제 우회 없이 설치 가능한 9.x를 사용했다. 린트 도구 갱신이 필요하며 이 제약은 PR에도 알린다.
- HTTP 응답 및 viewport 메타까지만 확인했다. 실브라우저 모바일/접근성 QA와 외부 OAuth/DB/SSE/PG 검증은 수행하지 않았고 해당 후속 WBS 범위다.
- 만세력/출생 스키마/명리 기능/캐릭터/P06/LLM/OAuth/DB/PG는 구현·호출하지 않았다. 비밀키·기존 문서·기존 예제·Git 이력 변경 및 CI·배포 설정 추가 없음.

### 변경 파일

- `.gitignore`: 의존성/산출물/비밀 환경파일 제외 및 `.env.example` 보존.
- `package.json`, `package-lock.json`: npm 스크립트, Node/npm 범위, 고정 의존성 및 재현 설치.
- `tsconfig.json`, `next-env.d.ts`, `next.config.ts`: strict TypeScript/별칭/Next 생성 타입 및 최소 설정.
- `eslint.config.mjs`, `vitest.config.mts`: Next 권장 린트 및 Node 기반 비감시 테스트 설정.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`: 한국어 루트 레이아웃과 제품명이 없는 최소 준비 화면.
- `tests/bootstrap.test.tsx`: TSX/경로 별칭/루트 레이아웃 서버 렌더링 스모크 2건.
- `README.md`: 설치/개발/로컬 검증 절차 및 공식 문서 링크.
- `docs/worklog.md`: 선행 승인·범위·검증·제약·변경 파일 기록.
