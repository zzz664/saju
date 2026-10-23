# WBS-65/66 개발자 API 테스트 설정

## WBS-66 현재 사용법과 범위

WBS-65의 보호된 설정에 **비스트리밍 R01 Live Provider**를 추가했다. 아래 WBS-65 구현 전 계획/최종 결과는 당시 기록이다. 현재 Live 사용법은 이 절을 기준으로 한다. P06·R02/R03 및 F01~F11은 이번 범위에 포함되지 않는다.

1. 운영자가 서버 `.env.local`에 `DEV_TEST_SESSION_SECRET`(32~256자), `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`를 설정한다. Mock만 쓰려면 API 키가 필요 없다. 키/비밀값은 Git·로그에 넣지 않는다.
2. 실제 실행을 원할 때만 `ENABLE_LIVE_API_TESTS=true`로 설정하고 `npm run dev:api-test`로 loopback 서버를 시작한다. 일반 dev/production/CI/Preview에서는 경로를 활성화하지 않는다.
3. `http://127.0.0.1:3000/dev/api-test`에서 잠금해제한다. 초기 모드는 항상 Mock이다. Live를 고르고 비용 동의 후 **테스트 실행**을 눌러야 실제 요청이 1회 발생한다. 모드 변경·조회·새로고침·동의 체크만으로 호출하지 않는다.
4. 합성 사례 3개/합성 문체 2개만 선택할 수 있다. 실제 개인 입력을 받지 않는다. 기존 R01의 동일 코어·정규화 판단·승인 페르소나·전체 프롬프트·JSON Schema·근거/문체 검증기를 공유하고 Provider만 바꾼다.
5. HTTP 실패, refusal/incomplete, 모델 불일치, JSON/근거/문체 검증 실패는 성공으로 처리하지 않는다. 60초 timeout, 명시 abort, 자동 재시도 0회. 이미 처리된 토큰은 과금될 수 있다.

### 예산과 증빙

- 기본 일 호출 15회/입출력 합계 30,000토큰, 요청 출력 최대 1,200. Mock/Live 예산은 별도이며 공통 환경변수 한도를 적용한다. UTF-8 요청 바이트+envelope+출력 상한으로 보수적으로 예약하므로 15회 전에 차단될 수 있다. 이는 tokenizer나 실제 비용 계산이 아니다.
- Live는 `.local/api-test/live-budget.json`에 예약·usage·공급자 ID/종료 상태를 저장한다(Git 제외). 같은 로컬 프로젝트의 모든 잠금해제 세션/프로세스가 UTC 일 한도를 공유한다. 단일 호스트 전용이며 Live는 한 번에 1건만 허용한다. 환경변수의 동시성 상한을 높여도 Live는 1건으로 보수적으로 제한한다.
- 완료/거절/검증 실패 모두 유효한 usage가 있으면 실제 입력+출력으로 정산한다. usage가 없으면 예약량을 유지한다. 실제 usage가 추정치를 넘으면 더 큰 실제 수치를 반영한다. 호출 수는 환불하지 않는다.
- 장부는 atomic rename/fsync와 독점 파일 잠금을 사용한다. 서버 재시작으로 예산이 초기화되지 않는다. 비정상 종료/저장 실패 시 잠금 또는 pending 예약이 남아 추가 Live를 차단한다. **자동 잠금 삭제·예산 초기화 기능은 없다.** 운영자가 실행 프로세스 종료와 OpenAI 사용량을 대조한 뒤 별도 복구해야 한다. 잠금/장부를 지워 한도를 우회하지 않는다.
- 장부 손상/쓰기 실패는 fail closed. 장부 10,000건/파일 5MB 상한에 도달하면 실행을 멈추고 운영자 검토를 요구한다. 다중 서버/배포 예산 보장이나 대시보드 청구액 대조를 대체하지 않는다.
- 실행 결과와 멱등 캐시는 프로세스 메모리다. 같은 프로세스/세션에서 재요청은 기존 결과를 반환한다. 재시작 뒤 같은 세션+requestId는 영속 장부가 중복 지출을 차단하지만 과거 본문은 복구하지 않는다. 과거 세션의 결과를 다른 세션이 읽을 수 없다.
- 화면과 내보내기는 usage, 모델/페르소나/프롬프트/스키마 버전, 지연, 종료 상태, 고정 오류와 검사 결과를 제공한다. 원문 출력은 내보내기에서 제외하며 공급자 ID는 서버 장부에만 남긴다. API 키·원본 출생 입력·질문·응답 원문은 장부/일반 로그에 남기지 않는다.
- `LIVE_PASS`는 공급자의 completed 응답+usage+스키마/근거 ID/휴리스틱 문체 검사 통과를 뜻한다. **의미상 근거 충실도·한국어 자연스러움·명리 정확성 인증은 아니다.** 실제 실행 후 출력은 사람이 검토한다. 미호출은 `LIVE_NOT_RUN`, 게이트/예산 차단은 `LIVE_BLOCKED`, 실행 후 실패는 `LIVE_FAILED`다.

### WBS-66 검증

`npm test -- tests/live-narration.test.ts tests/api-test.test.ts tests/narration.test.ts tests/persona.test.ts tests/experiment-guard.test.ts tests/persona-evaluation.test.ts`와 `npm run test:e2e:api-test`를 사용한다. 자동 검증은 가짜 HTTP 응답/브라우저 route simulation 또는 Mock만 사용하며 실제 OpenAI 호출을 하지 않는다. E2E 서버는 키 없음/Live false로 고정한다.

공식 계약: [Responses Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). SDK 추가 없이 서버 REST transport로 같은 요청 계약을 전송한다. 실제 계정/키 가용성·청구액·사용량 대조와 사용자 Live 실행은 별도이며, 이번 구현 검증 상태는 **MOCK_PASS / LIVE_NOT_RUN**이다.

## 구현 전 완료 조건과 테스트 계획

- v2.5 문서 19개는 구현 전에 `cad4b2b`로 커밋했다. 이번 코드는 WBS-65 한 건이며 실제 OpenAI Provider/호출은 WBS-66이다.
- `/dev/api-test`는 전용 실행 명령의 loopback 개발 서버에서만 제공한다. 기본 Mock, 별도 서버 비밀로 잠금해제한 HttpOnly 세션과 CSRF/Origin 확인 후에만 설정/실행/결과 접근을 허용한다. 일반 개발 서버·production·CI·Preview는 차단한다.
- 기존 코어와 승인형 합성 페르소나·R01 프롬프트/Mock·WBS-24 예산을 그대로 사용한다. 현재 구현된 내부 `core-base`만 실행하고 아직 없는 F01~F11과 스트리밍/질문은 준비되지 않은 상태로 표시한다. 문서 예시 캐릭터를 제품으로 등록하지 않는다.
- Live 선택·비용 동의 UI 및 서버 플래그/키 존재/모델·예산 설정 검증을 제공하되 WBS-65에서는 항상 `LIVE_BLOCKED` 또는 `LIVE_NOT_RUN`이다. 공급자 실호출 경로를 새로 만들지 않는다.
- 정상: 잠금해제→설정 조회→명시 Mock 실행→같은 세션 결과 조회, 공통 R01 근거/문체/제한·버전 유지, 키/원본 입력 미노출, 재요청 멱등.
- 오류: 미인증·잘못된 비밀·서명 위조/만료·다른 세션 결과 접근, cross-origin/CSRF·JSON/크기·미허용 fixture/persona·본문 권한/키 위조, Live 조건 미충족·미구현 기능·production/Preview/CI 차단. 무권한 공급자 호출/예산 소모 0회.
- 경계: 잠금해제 시도 제한, 일 호출/예약 토큰·동시성 상한, 동일 requestId의 동시/다른 본문, 취소/공급자 오류와 예약 유지, 390px/키보드·새로고침 시 Mock 기본, 운영 경로 404.

## 로컬 실행

운영자가 `.env.local`에 **DEV_TEST_SESSION_SECRET을 32~256자의 긴 임의 값**으로 직접 설정한 뒤 실행한다. 이 값은 개발자 잠금해제용이며 OpenAI API 키와 다르다. 이번 작업은 기존 키/비밀값을 만들거나 바꾸지 않는다. 실제 값을 Git·PR·로그에 넣지 않는다.

```sh
npm run dev:api-test
# 다른 포트가 필요하면: npm run dev:api-test -- 3001
```

<http://127.0.0.1:3000/dev/api-test>에서 잠금해제 비밀을 입력하고 Mock 실행 버튼을 누른다. 세션은 30분, HttpOnly/SameSite=Strict 쿠키이며 실행 시 별도의 세션 CSRF 토큰과 Origin을 확인한다. 잠금해제 실패는 1분에 5회까지다. 새 세션에서도 프로젝트/로컬 개발자 일 한도는 공유된다. 일반 `npm run dev`는 이 화면을 활성화하지 않는다. 전용 실행기는 loopback에만 바인딩하고 CI/production/Preview에서는 거절한다.

- Mock에는 OPENAI_API_KEY가 필요 없다. 키 입력란·키 저장·키 발급 기능은 제공하지 않는다.
- 합성 입력 3종(시각 있음/미상/경도 누락), 합성 문체 2종만 서버 목록에서 선택한다. 사용자의 출생 파일이나 임의 프롬프트/프로필을 받지 않는다.
- Live를 골라도 WBS-65에서는 항상 차단된다. 키/플래그가 있어도 WBS-66의 실 공급자가 없으므로 실행 버튼은 비활성화된다. 페이지 진입/조회/모드 변경/체크박스/새로고침만으로 실행되지 않으며 새로고침 뒤 모드는 Mock이다.
- 기본 호출 15회/일, 예약 토큰 30,000/일, 출력 1,200/회, 동시 1회. 환경변수의 잘못된 한도는 거절한다. 예산은 WBS-24의 **UTF-8 바이트 기반 보수적 예약 추정량**이며 실제 API 토큰/비용이 아니다. 따라서 15회 전에 토큰 한도로 차단될 수 있다.
- 현재 장부와 실행 증빙은 단일 프로세스 메모리다. 프로세스 재시작 시 초기화되며 다중 인스턴스/영속 Live 예산 보장이 아니다. 실제 Provider와 영속 예약/usage 정산은 WBS-66에서 처리한다. 미완료 공급자의 잠금과 예약은 취소/오류 후에도 유지한다.
- 증빙 내보내기는 실행 ID·상태·모델·시간·고정 오류 등 메타만 포함한다. 원문 출력·CSRF·세션/잠금 비밀·API 키·원본 출생 입력은 제외한다. Mock의 실제 input/output 토큰은 null이며 측정한 것처럼 표시하지 않는다.

## 현재 엔드포인트

|메서드/경로|기능|
|---|---|
|POST `/api/dev/api-test/unlock`|로컬 잠금해제, Origin·시도 상한·서버 비밀 검증|
|GET `/api/dev/api-test/config`|잠금해제 후 모델/키 ready·missing/한도/CSRF/서버 목록|
|POST `/api/dev/api-test/runs`|기존 공통 R01 Mock 실행, 멱등·예산·취소 검증|
|GET `/api/dev/api-test/runs/[runId]`|같은 잠금해제 세션의 실행 결과만 조회|

현재 기존 R01이 지원하는 `core-base`를 명시적으로 사용한다. 아직 없는 F01~F11 결과나 R02/R03 스트리밍을 만들어 표시하지 않는다. 화면에서 후속 기능은 비활성화하고 서버도 409로 거절한다. 공통 프롬프트를 줄이거나 별도 명리 규칙을 만들지 않는다.

## 검증 재현

```sh
npm test -- tests/api-test.test.ts tests/persona.test.ts tests/experiment-guard.test.ts
npm run test:e2e:api-test
node node_modules/typescript/bin/tsc --noEmit
npm run lint
```

E2E는 원본 프로젝트의 `.next`/next-env.d.ts·개인 fixture를 건드리지 않는 임시 사본에서 수행한다. API 키는 빈 값, 잠금 비밀은 합성 테스트 상수, 예약 한도는 테스트 독립성을 위한 20만 토큰이다. 실제 설정 기본값을 변경하지 않는다. 실행 결과/제약은 docs/worklog.md에 기록한다.

최종 결과: 관련 단위/계약 **74개**, 개발 E2E **7개**, production 차단 E2E **1개**, TypeScript·lint·격리 production 빌드/타입 생성 통과. 320/390/768/1440px 가로 넘침·키보드 포커스와 390px 스크린샷을 확인했다. **MOCK_PASS / LIVE_BLOCKED**, 외부 OpenAI 호출 0회. Live 키·세션 비밀 설정/변경과 실 Provider 구현은 이번 작업에서 수행하지 않았다.
