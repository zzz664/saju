/** v2.3 테스트 PG 추상화용 인터페이스. 특정 SDK/상점 설정에 종속되지 않는다. */
export type PaymentEnvironment = 'test';

export type ConfirmInput = {
  orderId: string;
  paymentKey: string;
  amountKRW: number; // 반드시 서버 DB에서 읽은 주문 금액 사용
  idempotencyKey: string;
};

export type ConfirmResult = {
  orderId: string;
  paymentKey: string;
  approvedAmountKRW: number;
  status: 'DONE' | 'CANCELED' | 'ABORTED' | 'OTHER';
  merchantId?: string;
  approvedAt?: string;
};

export interface PaymentGateway {
  readonly providerId: string;
  readonly environment: PaymentEnvironment;
  confirm(input: ConfirmInput): Promise<ConfirmResult>;
  lookup(paymentKey: string): Promise<ConfirmResult>;
}

/** PG 가입/외부 호출 없이 테스트하기 위한 fake 예시. 실제 결제 완료 기능과 혼동 금지. */
export class FakePaymentGateway implements PaymentGateway {
  readonly providerId = 'fake_test';
  readonly environment = 'test' as const;
  async confirm(input: ConfirmInput): Promise<ConfirmResult> {
    return {
      orderId: input.orderId,
      paymentKey: input.paymentKey,
      approvedAmountKRW: input.amountKRW,
      status: 'DONE',
    };
  }
  async lookup(_paymentKey: string): Promise<ConfirmResult> {
    throw new Error('test fake lookup must be configured per test');
  }
}
