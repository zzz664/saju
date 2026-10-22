# API 계약 및 구현 인수 기준 — v2.4

> 원국·LLM·DB·PG에 걸친 API 경계를 **이 표로 통합**한다. URL은 v2.4 권장 계약이며 PR에서 변경할 경우 호출부·테스트·문서도 함께 갱신한다.

## 1. 서버 라우트

|메서드|경로|대상|검증 게이트|
|---|---|---|---|
|GET|`/api/features`|F01~F11 상태|활성 기능만 공개|
|POST|`/api/analysis`|원국/기능 판단 실행|BirthInput Zod, 계산 정책·권한|
|GET|`/api/analysis/[analysisId]`|명리 판단 근거 조회(개발자/본인)|사용자 소유권/비식별 응답|
|GET|`/auth/callback`|OAuth code 교환|Supabase SSR/PKCE, 허용 next 경로|
|GET/POST|`/api/birth-profiles`|출생정보 목록/추가|본인 세션·스키마|
|PATCH/DELETE|`/api/birth-profiles/[id]`|출생정보 수정/삭제|본인 소유·연관 데이터 정책|
|GET|`/api/library`|보관함|본인 분석·대화만, 권한 확인|
|POST|`/api/analysis/[analysisId]/reading`|대화 생성/멱등 조회|분석 완료·소유·기능 접근권|
|POST|`/api/readings/[conversationId]/report/stream`|R02 **POST SSE** 최초 리포트|서버 섹션 계획·단일 인플라이트·예산|
|GET|`/api/readings/[conversationId]`|대화 상태·검증된 메시지|소유권·한정된 응답 필드|
|POST|`/api/readings/[conversationId]/messages/stream`|R03 **POST SSE** 후속 질문|**report completed**·소유권·권한·멱등/한도|
|POST|`/api/orders`|테스트 주문|offerId/requestId, 서버 금액 스냅샷|
|POST|`/api/payments/confirm`|테스트 PG 서버 승인|주문 소유·금액·환경 검증 후 승인|
|GET|`/api/orders/[id]`|주문 상세|소유권, 결제키 노출 금지|
|POST|`/api/payments/webhooks/toss`|PG 테스트 이벤트|서명/서버 조회·중복 대사|
|POST|`/api/account/delete-request`|계정 데이터 삭제 요청|재인증·삭제 범위 정책|

**주의:** P06 기본 렌더링은 `/api/analysis/[id]`의 정적 R01 JSON 본문이 아니라 위 `/readings` 스트리밍 API를 사용한다. `GET /api/analysis/[id]`는 원국/근거 데이터 용도 또는 개발자 검증용이다.

## 2. 대화형 핵심 응답 계약

|서버 이벤트|의미|상태 전이|
|---|---|---|
|`report.started`|서버가 승인한 최초 리포트 시작|pending → streaming|
|`bubble.started`, `bubble.delta`|새 캐릭터 말풍선·자연어 청크|부분 텍스트 임시 노출|
|`bubble.completed`|단일 섹션 검증·저장 완료|완료 섹션 수 증가|
|`report.completed`|모든 섹션 검증·DB 커밋 후 발행|completed·질문 가능|
|`reply.started`, `reply.delta`, `reply.completed`|후속 질문 응답 스트림|완료 응답 저장|
|`report.failed/interrupted`, `reply.failed`|일시/영구 실패|오류 메시지/재시도 안내|

- 클라이언트는 POST `fetch()` + `ReadableStream` SSE parser로 수신하며 OpenAI 원시 이벤트를 직접 받지 않는다.
- **질문 선요청**은 HTTP `409 REPORT_NOT_COMPLETE`, LLM 실제 호출 0회.
- `report.completed` 수신 후 클라이언트는 `GET /api/readings/[conversationId]`로 DB 최종 상태를 확인한 뒤 composer를 활성화한다.
- 재시도 요청은 동일 멱등 키와 DB 소유권·잠금을 재확인하며 기존 완료 메시지를 중복 저장하지 않는다.

## 3. 주문 결제 계약(테스트 전용)

```ts
type NewOrderRequest = { offerId: string; requestId: string };
type NewOrderResponse = {
  orderId: string; amountKRW: number; currency: 'KRW';
  environment: 'test'; offerId: string;
};
type ConfirmPaymentRequest = {
  orderId: string; paymentKey: string; amount: number; // 표시값 검증용일 뿐 권한 원천 아님
};
```

서버 주문 금액으로 PG 승인 금액을 대조하고, 승인된 TEST 환경 결제만 TEST 권한을 생성한다. 성공 URL·웹훅만으로 권한 지급 금지.

## 4. 완료 기준

- **계산/LLM**: F01~F11 근거·버전·불확실성, GPT Mock, 캐릭터 판단 불변, R02/R03 텍스트 스트림.
- **인증/DB**: Google/Kakao OAuth PKCE, RLS A/B 테스트, 본인 대화/주문만 조회 가능, service-role 서버 소유권 재검증.
- **스트리밍**: UTF-8 분할·SSE 프레임·끊김/이어생성·동시성·질문 잠금 409·섹션 커밋 상태.
- **UI**: 320~1440px 반응형, 모바일 메신저 말풍선, 키보드·스크롤·시각/스크린리더 접근성.
- **PG**: 테스트 승인/오류/중복/웹훅/환불 상태 처리, 실 청구 없는 설정.
- **프로세스**: `npm test`, `docs/worklog.md`, 1브랜치/1PR, `develop` 머지 확인 후 다음 WBS.

## 5. 미확정 항목

서비스/상품/캐릭터 이름, 운영 PG/실 가격, 비회원 저장형 대화, 데이터 보관 기간, 유료 질문 정책, 상용 출시 승인은 사용자 별도 의사결정이 필요하다.
