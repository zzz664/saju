# 실제 OpenAI API 테스트 설정 및 단계별 검증 설계 — v2.5

> **상태:** 설계/구현 지침. 이 문서만으로 실제 OpenAI API 호출이 수행된 것은 아니다. 기본 모델 `gpt-4o-mini`, npm, 기존 M01~M09/F01~F11, R01·R02·R03, `develop` 대상 1기능·1PR을 유지한다. 서비스명·캐릭터명·상품명 미정.
>
> **목표:** 개발자가 설정 화면에서 테스트 방식(`mock` / `live`)을 선택하고, 본인이 승인한 테스트용 사주 데이터로 실제 API 호출·스트리밍·후속질문을 중간 단계별로 검증한다. **일반 고객의 설정/운영 API 모드와 혼합하지 않는다.**

## 1. 해결하려는 문제와 범위

- 기존 WBS-23~25 및 WBS-61~64는 Mock 기반 자동화에 집중되어 실제 API 호출이 빠진 채 완료 처리될 위험이 있다.
- `WBS-65`: 실제 API 테스트용 서버 가드와 **개발자 전용 설정 화면(P17 하위)** 구현.
- `WBS-66`: 최초 비스트리밍 서술 **live smoke test** 및 Mock 비교.
- `WBS-67`: R02 **실제 OpenAI stream → 서버 SSE → 모바일 말풍선** 실험.
- `WBS-68`: R03 **최초 풀이 DB 완료 확인 → 실제 후속 질문** 실험.
- CI/단위 테스트는 계속 Mock으로 실행. Live API 테스트는 사용자 명시 실행·인증·사용량 상한을 만족할 때만 실행. **라이브 성공을 시뮬레이션하지 않는다.**
- OAuth/PG는 기존 WBS-53·56·58·21의 별도 외부 콘솔 검증을 유지한다. 본 문서의 `live`는 **OpenAI API**를 뜻하며 PG 운영 결제를 활성화하지 않는다.

## 2. 권장 UX: 개발자 전용 API 테스트 설정(P17 내 탭)

URL: `/dev/api-test` (기존 P17 개발자 검증 화면의 하위 라우트). 기존 소비자용 `/account/settings`의 일반 설정과 **분리**한다. 일반 고객에게 메뉴 링크를 노출하지 않는다.

```text
┌────────────────────────────────┐
│ < 개발자 검증   OpenAI API 테스트 │
│ [개발 전용/운영 사용자 비노출]    │
│                                │
│ API 상태   준비됨 / 키 없음      │
│ 모델       gpt-4o-mini (고정)   │
│ 테스트 모드  (● Mock) (○ Live)  │
│ [테스트 데이터: 가상 사례 ▼]     │
│ [테스트 단계: 서술/말풍선/질문]  │
│ [기능 F01 ▼] [페르소나 A ▼]     │
│ 오늘 3회 / 12,450토큰 사용      │
│ 1회 예상 토큰·최대 출력 상한     │
│ ☐ 실제 API를 호출하고 비용이     │
│   발생할 수 있음을 확인합니다.   │
│ [ 테스트 실행 ] (명시적 클릭)    │
│                                │
│ 상태: running / completed ...  │
│ [서버 응답/말풍선 실시간 보기]   │
│ 지연/토큰/차단 사유/오류 코드     │
│ [비식별 테스트 결과 내보내기]    │
└────────────────────────────────┘
```

**동작 정책:**

1. 화면 진입 시 `mock` 기본. `live`는 페이지를 다시 열면 자동 실행하거나 전역 기본값으로 남기지 않는다. 브라우저 표시용 선택 상태는 세션 단위로만 보관 가능. 로그인된 사용자/다른 탭/다른 기기로 라이브 선택을 전파하지 않는다.
2. 라이브 모드를 선택해도 **실제 '테스트 실행' 클릭 + 체크박스 확인** 전 API 호출 0회. 사주 분석/설정 조회/화면 렌더에서 자동 API 호출 금지.
3. 테스트 데이터: 기본은 **고정 가상 사례/비식별 골든 데이터**. 본인 데이터는 별도 동의 후 허용. 제3자 데이터·운영 회원 데이터는 테스트 입력으로 선택 불가.
4. 테스트 단계: `narration`은 단계별 호출 1회, `report_stream`은 서버가 정한 섹션별 호출, `follow_up`은 검증 완료된 테스트 대화에만 허용. 선행 기능 미구현이면 disabled와 사유 표시.
5. API 키는 **항상 서버 환경변수** `OPENAI_API_KEY`. 키 문자열 또는 사용자 입력 필드는 프런트에 표시하지 않는다. 키 존재 여부도 상세 누출 없이 `ready` / `missing`만 알려준다.
6. 라이브 테스트 진행 중 모드 변경 금지. 중단은 명시 버튼과 서버 abort 신호 처리(이미 처리된 토큰이 청구될 수 있음). 최대 동시 요청 제한.
7. 일반 사용자용 말풍선 결과(P06)는 향후 실제 모델을 정상 사용하지만 **개발자 live/mock 전환 기능이 서비스 이용 권한·고객 응답을 변경해서는 안 된다.** 이 설정은 개발자 실험 전용이다.

## 3. 접근 통제 — 단순 토글만으로 API 호출 허용하지 않음

다음 **모든 조건**을 서버에서 검증한다.

- 서버 플래그 `ENABLE_LIVE_API_TESTS=true` (기본값 false). 서버 키 존재. 개발·테스트 환경만 허용. 운영 배포와 임의 공개 Preview에서는 원천 비활성화.
- **초기 로컬 단계(WBS-65):** 로컬 전용 개발 환경 + 별도의 개발자 잠금해제 세션(서버 비밀로 검증, HttpOnly 쿠키·CSRF/Origin 검증) 필요. 플래그나 `NODE_ENV=development` **단독으로 권한을 인정하지 않는다.** 로컬 실행 스크립트에서 서버 측 인증을 강제하고 포트 외부 공개를 금지한다.
- **OAuth 적용 이후(WBS-53):** Supabase 서버 세션 검증 + 서버에서 관리하는 승인된 테스터 allowlist/역할 검사. 브라우저가 보내는 `userId`/`role`/`mode`만으로 권한 부여 금지. `WBS-67`에서 이 경로로 전환·회귀 검증. 테스트/개발 배포 외 접근 `404` 또는 `403`.
- 개발자 테스트 API도 동일한 서버 예산 가드·프롬프트 정책을 적용한다. 운영 서비스의 정상 호출 정책/이용 권한을 우회하지 않는다.
- 성공 여부와 관계없이 라이브 호출은 사용자 단위/프로젝트 단위 할당량 확인 및 원자적 예약 후 실행해야 한다. 로컬 단일 프로세스는 파일 기반 예약 장부 사용 가능(버전관리 제외); 다중 인스턴스 테스트 배포에서는 DB의 원자적 예약 트랜잭션 필수. **메모리 카운터만으로 다중 인스턴스 예산을 보장했다고 주장하지 않는다.**
- 개발용 API를 Vercel Preview에 배포하는 경우에도 기본 금지이며, 별도 승인된 테스터 도메인/환경·서버 역할 검증·내부 rate limit을 준비하기 전에는 활성화하지 않는다.

## 4. 구성·권한·환경 변수 예시

```dotenv
# 실제 값을 git/PR/문서에 절대 기록하지 않는다.
OPENAI_API_KEY=                      # 서버 전용, .env.local 또는 Secret Manager
OPENAI_MODEL=gpt-4o-mini            # v2.5 기준 고정
ENABLE_LIVE_API_TESTS=false        # true는 승인된 개발 환경에서만
LIVE_API_TEST_MAX_REQUESTS_PER_DAY=15
LIVE_API_TEST_MAX_TOKENS_PER_DAY=30000
LIVE_API_TEST_MAX_OUTPUT_TOKENS=1200
LIVE_API_TEST_MAX_CONCURRENT=1
# 초기 로컬 단계: 독립 개발자 잠금해제용 서버 비밀(실값은 .env.local에만)
DEV_TEST_SESSION_SECRET=
```

위 15회·30,000토큰은 **개발자 테스트 전용 보수적 초깃값(예시)**이며 기존 제품 전체 일 200만 토큰 상한보다 낮아야 한다. 요청별 입출력 예산을 실행 전 예약하고, 완료 이벤트의 실제 `usage.input_tokens/output_tokens`로 정산한다. 이벤트가 누락될 경우 예약값을 함부로 0으로 되돌리지 않는다. 실 사용액은 OpenAI 대시보드와 대조해야 한다.

**무료 토큰:** 개발용 데이터 공유에 따른 일 250만 토큰은 계정·프로젝트의 실제 혜택 적용을 확인해야만 사용 가능하다. **무료 한도는 0원 보증이 아니며 초과·비적용 시 과금 가능**. 사용자는 라이브 체크박스에서 이를 확인한다. 운영 사용자 데이터는 무료 혜택 대상 실험으로 전송하지 않는다.

## 5. 설정 데이터 계약 및 API

```ts
export type ApiTestMode = 'mock' | 'live';
export type ApiTestScenario = 'narration' | 'report_stream' | 'follow_up';
export type ApiTestRunStatus =
  | 'not_run' | 'blocked' | 'running' | 'passed' | 'failed' | 'interrupted';

export type LiveTestRequest = {
  mode: ApiTestMode;
  scenario: ApiTestScenario;
  fixtureId: string; // 서버 승인 테스트 픽스처 식별자
  featureId: 'F01' | 'F02' | 'F03' | 'F04' | 'F05' | 'F06' |
    'F07' | 'F08' | 'F09' | 'F10' | 'F11';
  personaId: string; // 서버 승인 persona allowlist
  acknowledgedCost: boolean;
  requestId: string; // 멱등 제어
  conversationId?: string; // follow_up은 완료 상태의 테스트 세션만
  question?: string; // follow_up에서만
};

export type TestEvidence = {
  testRunId: string;
  scenario: ApiTestScenario;
  mode: ApiTestMode;
  status: ApiTestRunStatus;
  modelId: string;
  featureId: string;
  personaVersion: string;
  promptVersion: string;
  schemaVersion: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  providerRequestId?: string; // 민감한 공급자 메타: 서버 보관 중심
  errorCode?: string;
  verdict?: { evidenceFaithful: boolean; personaConsistent: boolean; streamValid?: boolean };
};
```

|메서드|경로|용도|핵심 접근통제|
|---|---|---|---|
|GET|`/api/dev/api-test/config`|허용된 모드·모델·예산 잔량·실행 가능한 시나리오|개발자 인증, 서버 플래그|
|POST|`/api/dev/api-test/unlock`|초기 로컬 단계의 개발자 세션 잠금해제|로컬 한정, 서버 비밀 확인, rate limit, CSRF|
|POST|`/api/dev/api-test/runs`|비스트리밍 `narration` 실행, 결과 ID 발급|개발자 권한·비용 확인·서버 예산 예약|
|POST|`/api/dev/api-test/runs/stream`|R02/R03에 **동일 프로덕션 실행 경로**를 통한 스트리밍 검사|세션·시나리오 준비·동시성·예산·POST SSE|
|GET|`/api/dev/api-test/runs/[runId]`|비식별 상태/토큰/결과 조회|실행한 개발자/테스터만|

**원칙:** 설정 화면 전용으로 다른 사주 계산기나 축약 프롬프트를 새로 만들지 않는다. 기존 `FeatureResult` → R01 → R02/R03의 **공통 코드 경로를 주입 가능한 Provider(`MockProvider`/`OpenAIProvider`)만 바꾸어 호출**한다. 서버 인증이 통과한 테스트 요청에서만 `mode=live`를 선택할 수 있다. 고객의 공개 API에 `mode` 임의 전환 입력을 추가하지 않는다.

## 6. 호출 흐름 및 실제 스트리밍 검증

```text
Tester P17 설정 -> (server) auth / flags / allowed fixture / budget
        |                                |
        | Mock -> MockProvider ---------+--> shared narrative service
        | Live -> OpenAIProvider -----------^         |
        |                                     output validation
        |                                           |
        +-- SSE: started / bubble.delta / completed / usage / test.summary
```

**WBS-66 (실제 비스트리밍 호출):** 고정된 정규화 판단 결과와 승인형 페르소나를 동일 프롬프트로 Mock/Live 호출. 모델 확인, HTTP 성공/실패, 토큰 사용량, 판단 근거 일치, 한국어 문체, 응답 지연을 기록한다. JSON 원문에 포함된 개인정보는 외부 전송하지 않는다.

**WBS-67 (실제 스트리밍):** `WBS-61~62`의 리포트 엔진을 이용해 GPT-4o mini Responses API `stream: true` 실행. 실제 `response.output_text.delta`를 서버에서 검증한 뒤 `bubble.delta`로 중계한다. `response.completed`/`response.failed`/`response.incomplete`를 구분하고, **최종 `report.completed`는 전체 섹션 검증·DB 커밋 뒤에만** 발행한다. 한글 UTF-8 청크, SSE 프레임, 끊김·중복·오류를 Mock 및 승인 Live로 검사한다.

**WBS-68 (실제 후속 질문):** 동일 개발 테스트 대화에서 `report.completed`와 DB 상태를 확인한 뒤 사용자 질문 1회 이상 전송. Fxx 근거 범위를 벗어난 새 단정을 하지 않는지, 페르소나가 유지되는지, 답변이 `reply.delta`로 수신/저장되는지 확인한다. 리포트 미완료 시 HTTP 409와 **API 호출 0회**도 별도로 Mock 검증한다.

### 테스트 증빙 기준

- 실제 테스트 완료(PASS)는 **실제 Provider 요청 증빙 + 종료 상태 + 사용량(가능 시) + 검증 결과**가 있어야 한다. Mock 패스는 `MOCK_PASS`, 미실행은 `LIVE_NOT_RUN`, 외부 키/권한 미설정은 `LIVE_BLOCKED`, 실패는 `LIVE_FAILED`로 **별도 표시**한다.
- 토큰 로그·request ID·에러 코드는 기록하되 API 키, 출생 원문, 질문 원문, 응답 원문은 일반 로그/PR에 넣지 않는다. 문체 품질 샘플은 **검증용 가상 입력**만 사용한다.
- 외부 계정/키가 없으면 **Mock 구현 완료와 실제 API 검증 미완료를 분리**해 보고한다. 승인 없이 live를 시도하지 않는다. PR 리뷰어가 미실행 상태를 알고 머지했다면 명시적 미검증 리스크로 남긴다.
- 실제 API 사용 결과가 명리 정확성을 보증하지 않는다. 계산 골든과 근거 충실도는 독립 검증한다.

## 7. 개발 단계별 게이트·회귀 체크

|개발 시점|WBS|자동 검사|사용자 설정에 따른 Live 실험|연동 완료 표시|
|---|---|---|---|---|
|Provider/페르소나 안정화|65→66 (47·24 이후)|권한/예산 Mock, JSON/서술 테스트|기본 서술 API 1회 이상|실 요청 증빙 시만 LIVE_PASS|
|R02/P06 완성|67 (61·62 이후)|SSE 단위/중단/중복/DB 테스트|실제 말풍선 여러 delta 검증|서버/클라이언트 수신 + 완료 로그|
|R03 완성|68 (63 이후)|409/근거/세션/멱등 테스트|실제 질문·답변 1회 이상|질문/답변 저장·근거 충실도 확인|
|배포 전|15·21|Mock/보안/전체 빌드|개발자 요청 시 회귀 실행|환경이 실제 연결된 경우에만 확인|

## 8. 테스트 케이스 최소 매트릭스

- 기본 설정 `mock`, 새 세션에서 live 자동 실행 없음.
- 키 없음·플래그 false·권한 없음·운영 환경 -> API 호출 **0회**/403(또는 404), 명확한 UI 메시지.
- 라이브 확인 미체크·요청 ID 누락·허용되지 않은 fixture/persona -> 4xx, 호출 0회.
- 인증된 테스트 권한에서 live 1회 -> 모델/상태/토큰 로그, API 키 비노출.
- 예산 소진/동시 요청 초과 -> 명확한 상태/429 또는 409, API 호출 0회.
- 네트워크 중단/429/서버 오류 -> 무제한 자동 재시도 없음; 실제 사용량/잔여 예약 정산 및 재시도 정책 준수.
- R02 delta 순서·UTF-8·부분 프레임·마지막 섹션 저장 확인, 질문은 report completed 이전 금지.
- R03 답변의 `evidenceIds`가 동결된 판단 근거만 참조하며 동일 persona version 유지.
- 테스트 데이터/로그에서 실제 사용자의 이름·출생 날짜·연락처가 노출되지 않음.
- 개발자 모드 선택이 일반 이용자 세션·설정에 영향을 주지 않음.

## 9. Codex 작업·문서 참조

- WBS 65~68도 **각 1기능 = 1브랜치 = 1PR**, `develop` 머지 게이트를 동일 적용한다.
- `02` 전체 아키텍처, `04_AGENTS.md` 정책, `05` 단일 실행표, `06` QA, `08` 비용, `11/12/20` 프롬프트, `14` UI, `17` DB, `18` API, `19` 스트리밍과 본 문서 `21`을 병행한다.
- 개인정보/모델 사용권/과금은 매번 실제 조직·계정 정책을 확인하며 **데이터 공유/무료 토큰을 보장하지 않는다**.

## 10. 참고 공식 문서

- OpenAI Responses API 스트리밍 이벤트: https://platform.openai.com/docs/api-reference/responses-streaming
- OpenAI Streaming 가이드: https://platform.openai.com/docs/guides/streaming-responses
- OpenAI API 보안/개발 운영: https://platform.openai.com/docs/guides/production-best-practices
