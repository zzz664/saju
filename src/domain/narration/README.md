# WBS-23 — LLM provider·프롬프트·mock

기존 코어의 확정·채택 기초 관찰을 설명하는 **개발자 내부 비스트리밍 JSON 평가 경로**다.
P06이나 `/api/analysis`에 연결하지 않는다. 사용자 풀이의 R02/R03 자연어 스트리밍,
R01 승인 캐릭터, F01~F11 전체 기능을 구현한 것으로 간주하지 않는다.

```ts
import { narrateCore } from "@/application/narration";
import { createMockNarrationProvider } from "@/infrastructure/llm/mock";

// core는 기존 calculateCoreExport의 검증된 결과. 원본 입력을 직접 보내지 않는다.
const draft = await narrateCore(core, createMockNarrationProvider(), { signal });
// draft.mode === "developer-json", draft.meta.providerKind === "mock"
```

## 입력과 프롬프트

`buildManualPromptData`는 WBS-13의 기존 투영을 공유하는 순수 함수다. CoreExport를
먼저 검증하고 중재에서 채택된 confirmed finding만 선택한다. 부분·억제·보류된 판단은
서술 근거에 넣지 않는다. 미상·계산 실패·중재 제한과 제외 ID는 보존한다.
기존 `buildManualPrompt`의 문자열과 복사 출력 계약은 유지한다.

`createNarrationRequest(core)`는 고정된 지시와 별도의 user 역할 JSON 데이터를 조립한다.
새 계산/판단, 확정 사건 예측, 실제 상담사 사칭, 상투적 표현과 데이터 속 지시 실행을 금지한다.
기존 공통 정책(`docs/12`)을 바탕으로 하며, 이 개발용 경로의 JSON 출력 지시만 추가한다.
R02/R03 지시나 PersonaProfile 예시를 함께 조립하지 않는다. `<>&`와 Unicode 줄 구분자를
이스케이프하지만 프롬프트만으로 주입 방지나 사실 준수를 보장하지 않는다.

요청은 Responses 형식을 참고해 model=gpt-4o-mini, store=false, stream=false,
text.format=json_schema/strict를 명시한다. SDK나 실 API 어댑터가 연결된 요청은 아니다.
`NarrationProvider.generate(request, { signal })`가 공급자 포트이며 응답은 unknown으로 받는다.
현재는 mock만 실행 가능하다. kind=openai는 generate 호출 전에 LIVE_DISABLED로 거절한다.
환경변수·키가 있어도 자동 전환하지 않는다. NARRATION_META의 model은 대상 모델 식별자이며
실제 모델이 실행됐다는 증빙이 아니다.

프롬프트/서술 스키마 버전은 각각 1.0.0이다. 원래 코어·수동 프롬프트 버전과 별도 관리한다.
원본 출생일시·시간대·좌표·이름은 투영에 없지만 분석 자체도 민감할 수 있다.
프롬프트·원국·질문 원문을 일반 로그로 남기지 않는다.

## 응답 검증과 실패

공급자 경계의 상태는 completed(outputText), refused, incomplete, failed다.
이 completed는 공급자 응답 분류이며 **DB의 report.completed가 아니다**.
유효한 JSON 구조는 아래와 같다.

```json
{
  "schemaVersion": "1.0.0",
  "sections": [
    { "findingId": "finding:base.day-wood", "paragraph": "해당 확정 관찰을 설명한 문장" }
  ]
}
```

이 ID와 문장은 구조 예시다. 실제 응답에는 해당 입력의 verifiedFindings를 모두 정확히
한 번씩 참조해야 한다. 알 수 없는 ID·중복·누락은 거절하고 순서는 원래 근거 순서로 맞춘다.
sections 0~20개, paragraph는 공백 제거 후 1~1500자, outputText는 실제 UTF-8 128 KiB 이하다.
버전·추가 필드·잘림·비 JSON·과대 응답은 거절한다. 확정 근거가 없으면 빈 sections만 허용한다.
`narrationJsonSchema()`는 구조 제약용이며 원래 근거와의 관계 검사는 서버 함수가 수행한다.

반환값은 mode, sourceStatus, sections, 원래 limitations, 서버가 붙인 meta다.
공급자가 제한·원본 상태·버전을 지우거나 바꿀 수 없게 별도 보존한다. partial/unavailable도
승격하지 않는다. 이 검사는 문장의 의미·환각·안전성·한국어 품질을 입증하지 않는다.
실제 서술의 의미 평가와 캐릭터/스트리밍 검증은 후속 작업이 필요하다.

| 상황                               | 고정 오류 코드                         |
| ---------------------------------- | -------------------------------------- |
| 코어 입력 검증 실패                | INPUT_REJECTED                         |
| 라이브 provider 선택               | LIVE_DISABLED                          |
| 거절/잘림·중단/실패 응답           | REFUSED / INCOMPLETE / PROVIDER_FAILED |
| 응답 구조·바이트·근거 ID 검증 실패 | OUTPUT_REJECTED                        |
| 외부 예외                          | PROVIDER_FAILED, 원문 미노출           |
| 시작 전·대기 중·종료 후 취소       | CANCELLED                              |

자동 재시도나 성공 fallback은 없다. signal은 공급자에 전달하며 대기 중 취소 시 기다림을
끝내고 늦은 결과를 채택하지 않는다. 실제 공급자의 내부 작업 중지는 그 어댑터의 책임이다.
로컬 mock 실험은 WBS-24의 [서버 접근·예산·동시성 가드](../experiment/README.md)를 통해 실행한다.
이 모듈의 narrateCore는 내부 구성요소이며 HTTP에 직접 노출하지 않는다. 실제 SSE/DB 완료는 후속 WBS의 별도 경계다.

## Mock과 검증

Mock은 각 허용 finding의 assertion에 검증용 접두어를 붙인다. 자연스러운 모델 풀이를
흉내 내거나 새 주장을 만들지 않는다. 같은 입력/설정이면 동일 결과이며 키·시계·네트워크·
환경변수·토큰/청구량 추정을 사용하지 않는다. 테스트용 refused/incomplete/failed 모드를 제공한다.

```sh
npm test -- tests/narration.test.ts tests/developer-analysis-api.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run lint
```

모든 테스트는 별도의 합성 입력을 사용한다. 실제 계정 혜택·공유 동의·환경 분리 및 실 API
호출 승인은 WBS-22 기록에서 미확인 상태다. **실연동은 BLOCKED**이며 Mock 성공을
OpenAI 실연동·모델 품질·무료 과금 검증 성공으로 표시하지 않는다. SDK 설치나 외부 호출은 없다.

공식 참고(2026-10-23 확인): [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)는
구조화 형식과 별도의 거절/불완전 응답 처리를 설명한다.
[Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)의
상위 지시와 입력 문맥 분리를 참고했다. 지정 모델 가용성/종료 일정은
[GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)와 WBS-22 체크리스트에서 실험 전 재확인한다.
