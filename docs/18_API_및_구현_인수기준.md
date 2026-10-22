# v2.3 신규 API·화면·회원·결제 통합 계약

## 서버 라우트(개념 계약)

|메서드|경로|인증|주요 규칙|
|---|---|---|---|
|GET|`/api/features`|없음|F01~F11 지원 상태 조회|
|POST|`/api/analysis`|체험 제한/회원|BirthInput 검증, FeatureResult 생성, 저장 여부 정책|
|GET|`/api/analysis/[id]`|소유자|기본 결과 및 R01 서술 반환, 접근권 확인|
|GET/POST|`/auth/callback`|OAuth code|Supabase PKCE 교환, 내부 next만 허용|
|GET/POST|`/api/birth-profiles`|회원|본인 출생정보 목록/생성|
|PATCH/DELETE|`/api/birth-profiles/[id]`|회원|소유자 확인, 연결 분석 삭제 정책|
|GET|`/api/library`|회원|본인 저장 분석 결과 조회|
|POST|`/api/orders`|회원|`offerId`, `requestId`만 수신, 서버 가격 결정|
|POST|`/api/payments/confirm`|회원|주문 소유·금액 검증 후 PG 서버 승인|
|GET|`/api/orders/[id]`|회원|주문·PG 상태 조회, 결제 민감 데이터 제외|
|POST|`/api/payments/webhooks/toss`|서버/선택|외부 이벤트 검증+PG 조회, 멱등 처리|
|POST|`/api/account/delete-request`|회원|소유 데이터 삭제 범위·탈퇴 정책|

실제 라우트 이름은 구현 시 확정하되, URL/스키마의 계약 변경은 해당 PR에서 문서와 테스트를 동시에 수정한다.

## 응답 타입 계약 예시

```ts
type AppFeatureId =
  | 'F01'|'F02'|'F03'|'F04'|'F05'|'F06'
  | 'F07'|'F08'|'F09'|'F10'|'F11';

type PaymentEnvironment = 'test';

type NewOrderRequest = { offerId: string; requestId: string };
type NewOrderResponse = {
  orderId: string;
  amountKRW: number;
  currency: 'KRW';
  environment: PaymentEnvironment;
  offerId: string;
};

type ConfirmPaymentRequest = {
  orderId: string;
  paymentKey: string;
  amount: number; // 클라이언트 표시값; 서버 검증용으로만 사용
};

type OrderStatus =
  | 'created' | 'awaiting_payment' | 'confirming'
  | 'paid_test' | 'failed' | 'cancelled' | 'expired';
```

## 비기능 인수 기준

- 반응형: 320~1440px 범위, 최소 4개 모바일 폭 + 태블릿/데스크톱 시각 회귀 점검.
- 인증: 공급자별 로그인 및 세션 재개/만료, 서버 콜백 재시도, 로그인 없이 보호 API 접근 거부.
- DB: RLS A/B 격리 테스트, 공개/비공개 데이터 경계, 삭제/보관 정책 테스트.
- PG: 테스트 전용 키, 임의 금액 수정 거절, 승인 전 접근권 없음, 중복 confirm 멱등성.
- LLM: 기존 F01~F11과 R01 규칙·스키마 유지; API 호출 없이 Mock으로 UI/결제/인증 테스트 실행 가능.
- 개발규칙: **npm + `package-lock.json`**, 기능별 독립 1PR, `develop` 머지 확인 전 다음 WBS 시작 금지. 초기 CI 필수 아님; 단위/통합 테스트와 결과 로그 필수.

## 선택 유보 / 사용자 승인 필요

1. 서비스명 및 상품명: 미정 (개발 화면은 코드 Fxx만 사용)
2. PG 운영사: 미정 (토스페이먼츠 **테스트 예시 어댑터**만 제공)
3. 테스트 상품의 가상 가격: 실상품 정책과 무관하게 별도 결정
4. 비회원 무료 분석 허용 범위: 후속 승인 필요 (기본은 회원 저장, 비회원은 제한적 체험)
5. 개인정보 보관기간/계정 탈퇴 법적 정책: 상용화 전 확정


---

# v2.4 — 대화형 풀이 API 추가

|메서드|경로|의미|필수 서버 검증|
|---|---|---|---|
|POST|`/api/analysis/[id]/reading`|대화 생성/멱등 조회|소유자·기능 권한/분석 완료|
|POST|`/api/readings/[id]/report/stream`|캐릭터 풀이 말풍선 SSE|서버 계획/완료 전 질문 잠금/중복 스트림 방지|
|GET|`/api/readings/[id]`|상태·저장된 메시지|소유자, 제한 필드만 반환|
|POST|`/api/readings/[id]/messages/stream`|후속 질문 SSE|인증/권한/report completed/멱등·제한|

위 POST SSE는 `fetch`로 수신; 모델 이벤트를 브라우저에 직접 전달하지 않는다. `report.completed`는 서버 DB 완료 commit **이후**. 질문 API가 리포트 미완료 시 `409 REPORT_NOT_COMPLETE`를 반환하는 테스트가 필수다. JSON 기반 기존 R01 비스트리밍 결과 API는 개발용/별도 경로로 유지 가능하나 P06 기본 UI에서는 사용하지 않는다. `19_대화형_스트리밍_풀이_및_후속질문_설계.md`와 `20_스트리밍_서술_및_후속질문_프롬프트.md` 참고.
