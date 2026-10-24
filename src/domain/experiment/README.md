# 개발자 Mock 접근·동시성 제어

`createExperimentRunner`는 서버가 제공한 실행 전략(`execute`)으로 서술 계획 경로를 호출한다.
Mock에는 호출 횟수·토큰·금액 예산, 사용량 견적, 출력 토큰 상한, 일/사용자/세션 예약 장부가 없다.
개발자 인증·환경·승인 기한·요청 바이트 크기·동시 실행 제어는 유지한다.

## 서버 조합

```ts
import { createFeatureNarrationExperiment } from "@/application/narration/feature";
import { MemoryExperimentConcurrencyGate } from "@/infrastructure/llm/experiment-concurrency";

// 여러 실행기가 같은 프로세스의 활성 호출을 공유한다. 사용량을 누적하지 않는다.
const gate = new MemoryExperimentConcurrencyGate();
const runner = createFeatureNarrationExperiment({
  ...narrationOptions,
  provider: mockProvider,
  gate,
  policy: {
    enabled: true,
    expiresAt: approvedUntil,
    allowedPrincipalIds: ["local-developer"],
    maxRequestBytes: 131072,
    maxConcurrent: 1,
  },
  environment: () => "development",
  resolveAccess: async () => trustedAccess,
});
await runner.run(featureResult, { signal });
```

`policy/provider/gate/environment/now/resolveAccess`는 서버 코드에서만 주입한다.
허용된 principalId/sessionId, development 환경, 유효한 승인 기한을 매 실행마다 확인한다.
비동기 인증 뒤 공급자를 호출하기 직전에도 기한과 환경을 다시 확인한다.
권한이 없거나 공급자가 Mock이 아니면 호출하지 않는다.

동시성 게이트는 현재 실행 중인 principal만 기억한다. 같은 사용자의 새 세션도 활성 실행을
우회하지 못하고, 서로 다른 사용자도 전체 동시성 상한을 지킨다. 취소 응답 이후에도 실제
공급자 작업이 끝날 때까지 잠금을 유지한다. release는 중복 호출해도 한 번만 반영한다.
실행이 끝나면 활성 기록을 지우며 다음 실행의 횟수·토큰·비용을 제한하지 않는다.

## Live 예산과의 경계

`estimateNarrationTokens`는 **Live 예약에만** 사용하는 보수적인 UTF-8 envelope+출력 상한 견적이다.
실제 tokenizer 사용량이나 청구액이 아니다. `FileLiveBudget`은 기존 호출/토큰 한도·독점 잠금·
영속 기록·usage 정산을 유지한다. usage가 불명확하면 예약을 유지하며 자동 환불하지 않는다.
Mock 게이트는 Live 장부를 예약·정산·초기화하지 않는다.

```sh
npm test -- tests/experiment-guard.test.ts tests/api-test.test.ts tests/live-narration.test.ts
```

테스트는 예산 없이 반복 실행, 접근 차단, 요청 크기 경계, 세션 간 동시성, 취소 후 잠금 유지,
공급자 실패 후 해제와 Live 예산 초과/재시작/정산을 검사한다. 외부 OpenAI 호출은 하지 않는다.
