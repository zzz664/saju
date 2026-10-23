> developer-json/narrateCore는 기존 Mock 비교 계약입니다. 현재 서버 실행 경로는 narratePersona와 승인형 페르소나 카탈로그를 사용합니다. 신규 제품 기능에 기존 비교 경로를 연결하지 않습니다.

# WBS-24 — 예산 가드·실험 접근제어

WBS-23의 **로컬 단일 프로세스 mock 평가**를 위한 서버 진입점이다. 원래 원국·판단과
내부 JSON 출력 계약을 유지하고, 호출 전에 접근·예산·동시성을 확인한다.
실 API/OpenAI 계정·OAuth·P06·SSE·DB 완료와 연결하지 않는다.

## 서버 조합과 접근

`createExperimentRunner`는 서버가 관리하는 policy/provider/store/environment/now/resolveAccess를
받고 `run(core, { signal })`을 제공한다. 호출 본문에는 userId·권한·예산·단가·세션 ID를 받지 않는다.
`resolveAccess`는 신뢰할 수 있는 서버 인증 어댑터가 현재 principalId와 sessionId를 반환할 포트다.
없거나 예외/잘못된 형식이면 거절한다. 클라이언트 객체를 그대로 반환하는 resolver로 연결하면 안 된다.
실제 OAuth resolver는 후속 인증 WBS 범위이며 현재 HTTP 실행 경로는 없다.

```ts
import { createExperimentRunner } from "@/application/narration/experiment";
import { MemoryExperimentBudgetStore } from "@/infrastructure/llm/experiment-budget";
import { createMockNarrationProvider } from "@/infrastructure/llm/mock";

// 서버 시작 시 한 번 생성해 같은 원장을 공유한다. 요청마다 새로 만들지 않는다.
const store = new MemoryExperimentBudgetStore();
const runner = createExperimentRunner({
  policy: serverOwnedMockPolicy,
  provider: createMockNarrationProvider(),
  store,
  environment: () => process.env.NODE_ENV,
  resolveAccess: resolveTrustedServerExperimentSession,
});
const draft = await runner.run(validatedCore, { signal });
```

위 policy/resolver 변수는 서버 조합 예시이며 실제 승인·계정 설정이 적용됐다는 의미가 아니다.
environment 기본값은 미지정, resolveAccess 기본값은 null로 **기본 차단**한다.
명시적 enabled, development 환경, 허용 기한 이전, 서버 allowlist의 principal이 모두 필요하다.
production/test/preview는 거절하며 환경과 기한은 비동기 인증 이후 예약 직전에도 재확인한다.
allowlist와 정책은 Zod로 검증한 독립 readonly 스냅샷이다. local mock의 허용은 실 API 승인과 별개다.
kind=openai는 기존 LIVE_DISABLED로 계속 차단한다. 키·무료 혜택·동의 상태를 추정하지 않는다.

## 정책과 예약 계산

모든 설정은 필수이며 암묵적인 무료 토큰·단가·무제한 기본값은 없다.

| 필드                                      | 의미                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| enabled / expiresAt / allowedPrincipalIds | mock 실험 활성 여부·만료 epoch ms·허용 서버 principal(최대 50명)                |
| maxRequestBytes                           | 실제 조립된 요청 JSON UTF-8 한도, 1~1 MiB                                       |
| maxOutputTokens                           | 서버가 요청에 덮어쓰는 max_output_tokens, 1~16,384                              |
| rates                                     | 입력/출력 각각 100만 예산 토큰당 microUSD 양의 정수 단가. 자동 실가격 조회 없음 |
| daily / perPrincipalDaily / perSession    | 각 범위의 calls·tokens·microUsd 상한, 0이면 해당 예산 차단                      |
| maxConcurrent                             | 원장 전체 동시 공급자 실행 수, 1~32. principal별 동시 실행은 항상 1개           |

예산 수치는 0~10^12의 정수다. 단가는 1~10^12이며 무료 단가를 추정해 0으로 넣지 않는다.
음수/소수/NaN/Infinity·추가 필드·중복 principal을 거절한다.
UTC 날짜를 앱의 일 예산 경계로 사용한다. OpenAI 혜택의 초기화 시간대와 동일하다고 가정하지 않는다.
세션 예산은 principal+서버 sessionId의 수명 동안 누적하며 UTC 자정에도 초기화하지 않는다.
새 세션을 만들어도 사용자 일 예산과 전체 일 예산을 우회할 수 없다.

예약 정책 `utf8-envelope-plus-output-v1`은 다음과 같다.

1. 서버 출력 상한을 포함한 요청 전체(상위 지시·데이터·출력 스키마)를 직렬화해 바이트를 센다.
2. 입력 예약량 = UTF-8 바이트 + 봉투 여유 256, 전체 토큰 예약량 = 입력 예약량 + maxOutputTokens.
3. microUSD 예약량 = 입력 예약량×입력 단가/10^6의 올림 + 출력 상한×출력 단가/10^6의 올림.
4. BigInt 정수 연산 후 허용 수치 범위를 검증한다. 호출자가 작은 추정량을 전달할 경로는 없다.

이는 **mock admission을 위한 추정 예산 단위**다. 실제 토크나이저 사용량·청구액·가격표나
모델 문맥 한도의 검증이 아니다. 테스트 단가는 합성 값이다. Mock은 실제 토큰을 생성/측정하지 않으며
max_output_tokens 전달도 실 모델의 상한 준수 검증이 아니다. 실연동에는 모델/SDK별 실제 토큰·과금/재시도
산정과 공유 영속 원장 검증이 선행돼야 하며 이번 구현을 그대로 실결제 한도로 사용하면 안 된다.

## 원자성·동시성·취소

원장의 reserve는 세 범위 상한과 전체/사용자 동시성을 모두 확인한 다음 동기적으로 함께 예약한다.
확인/반영 사이 await가 없다. 어떤 범위라도 실패하면 어떤 예산도 쓰거나 공급자를 호출하지 않는다.
예약된 시도는 성공·거절·중단·손상 응답·공급자 예외·취소와 관계없이 누적하며 자동 환급하지 않는다.
이는 실제 청구 기록이 아니라 재시도로 예산을 다시 쓰는 것을 막는 보수적인 로컬 기록이다.

release는 예산을 환급하지 않고 활성 잠금만 해제한다. 호출자가 취소해도 공급자가 종료되지 않았다면
잠금이 남는다. 공급자의 실제 Promise 종료 시에만 해제하고 늦은 결과는 기존 서비스가 채택하지 않는다.
자정을 지나도 활성 잠금을 유지한다. 무응답 공급자가 있으면 차단을 유지하며 임의 TTL로 다시 열지 않는다.
release는 여러 번 실행돼도 한 번만 반영한다. 자동 재시도나 우회 공급자/유료 전환은 없다.

MemoryExperimentBudgetStore는 한 프로세스 안에서 공유해야 한다. 일/사용자/세션 기록의 기본 합계
한도는 10,000개이며 초과 시 기존 예산을 지워 통과시키지 않고 차단한다. 시계 역행도 차단한다.
재시작·새 원장 생성·다중 프로세스 간에는 상태를 공유하지 못한다. 따라서 production과 실 API는 닫혀 있다.
실서비스 원장은 DB 트랜잭션 등 공유 저장소에서 별도 구현/검증해야 한다.
inspect는 로컬 내부 검사 전용으로 합계만 반환하며 HTTP·일반 로그에 공개하지 않는다.

| 상황                                 | 고정 오류         |
| ------------------------------------ | ----------------- |
| 정책 형식 오류                       | POLICY_REJECTED   |
| 환경·허용 목록·인증·기한 불충족      | ACCESS_DENIED     |
| 요청 크기/예약 산정 범위 초과        | REQUEST_TOO_LARGE |
| 어느 범위든 호출/토큰/금액 상한 초과 | BUDGET_EXCEEDED   |
| 전체 또는 사용자 동시성 초과         | CONCURRENCY_LIMIT |
| 잘못된 시각·시계 역행                | CLOCK_INVALID     |
| 저장소 오류·메모리 기록 한도         | STORE_UNAVAILABLE |

설정/인증/저장소 예외의 비밀 메시지는 노출하지 않는다. 다른 공급자 오류·취소는
기존 NarrationError를 유지한다. 권한 확인 실패·invalid core·시작 전 취소는 예약 없이 끝난다.

## 검증과 남은 범위

```sh
npm test -- tests/experiment-guard.test.ts tests/narration.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run lint
```

합성 입력으로 접근 차단, 세 범위의 정확한 상한/초과·올림, 동시 요청 10건 중 예산 3건만 허용,
취소 후 잠금 유지, UTC 자정/시계 역행, 저장소 실패/한도와 기존 provider 계약을 검증한다.
실제 OAuth/계정 설정·OpenAI/공유 원장/과금 검증은 **BLOCKED**이며 완료로 표시하지 않는다.
R01·P06·R02/R03·report.completed·DB/OAuth/PG·CI·실키는 변경하지 않았다.

공식 참고: [OpenAI Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)는
조직/프로젝트 제한 외에 사용자별 사용량 상한과 재시도의 누적을 설명한다. 여기의 로컬 원장 한도는
그 공급자 한도나 무료 혜택과 별도다. (2026-10-23 확인)
