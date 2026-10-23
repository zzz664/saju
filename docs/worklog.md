# 작업 기록

## 2026-10-23 — WBS-65: v2.5 문서 선행 커밋·로컬 개발자 API 테스트 설정/가드

### 병합 확인과 문서 우선 반영

- 직전 PR #22(WBS-25)의 GitHub MERGED, 대상 develop, 병합 시각 2026-10-23 17:52:19 KST, merge commit `eb5f78917ab80286f63e72034e830b52a4d46782`를 확인했다. `git ls-remote` 원격 develop 동일 해시, fetch 후 ancestor 확인. 새 WBS-65의 직접 선행 WBS-24(PR #19, `b03d3803b8d16e21d0e9d5afc79d580cdc401600`), WBS-47(PR #20, `537b73d489870fe4e79dcedfc5fdcfe0ab15e9d4`)도 GitHub develop MERGED 및 ancestor 확인했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-25-persona-quality-evaluation` 안전 삭제 성공. 최신 develop에서 `feature/WBS-65-developer-api-test-settings` 한 개를 생성했다. 이전에 병합한 WBS-16/25를 재구현하지 않고, 새 실행순서 22의 WBS-65만 진행했다.
- 사용자의 **이번 작업 한정 v2.5 문서 선행 커밋** 지시에 따라 AGENTS.md와 개정 문서/CSV/환경 예시·신규 21 설계/설정 예시 **19개 파일**을 구현 전에 `cad4b2b`로 커밋했다. 69개 WBS(필수 68+선택 19)의 ID 고유·선행 존재·실행순서 정합성과 Git 공백 검사 통과. 사용자 next-env.d.ts와 개인 cli-input.json은 제외했다. 문서 커밋은 실제 API 실행 승인으로 간주하지 않았다.
- AGENTS/WBS/02/05와 필수 08/11/12/18/21, 기존 R01/예산·개발 UI/검증 계약을 읽었다. 65는 설정/권한/Mock·가드, 66은 실제 비스트리밍 공급자 호출, 67/68은 스트림/질문 검증으로 범위를 나눴다. 아직 없는 F01~F11 대신 기존 내부 core-base만 명시적으로 연결하며 21 설계에 이 과도기 범위를 설명했다.

### 구현 전 테스트와 구현 범위

- 구현 전 README에 정상/오류/경계 완료 조건을 정의하고 API 테스트를 선작성했다. 최초 실행은 새 server/api-test 모듈 부재로 종료 1을 확인한 뒤 구현했다. 정상은 잠금해제·설정·명시 Mock·원래 R01/근거/제한·버전·동일 세션 조회/내보내기다. 실패는 비밀/서명/만료·권한·Origin/CSRF·ID/본문 위조·환경/Live·JSON/크기·예산 차단, 경계는 시도/호출/예약 토큰/동시성·멱등 경쟁·취소와 모바일/운영 404다.
- 전용 `npm run dev:api-test` 실행기는 loopback 127.0.0.1에 바인딩하고 전용 서버 마커를 설정한다. 일반 dev·production·CI·Preview는 페이지/API를 숨긴다. 이 마커만으로 인증되지 않으며 서버 비밀(32~256자), 30분 HMAC 서명 HttpOnly/SameSite=Strict 세션, Origin/CSRF 및 원격 전달 헤더 검증을 모두 적용한다. 잠금해제 실패 1분 5회, 세션 비밀/서명·CSRF는 결과/내보내기에 포함하지 않는다. 실제 서버 비밀/키를 생성·변경하지 않았다.
- `/dev/api-test`와 unlock/config/runs/소유 runId 조회 API를 구현했다. 기본 모드는 Mock이며 새로고침마다 Mock으로 시작한다. 화면 조회·모드 변경·체크만으로 실행하지 않는다. Live 선택/비용 확인 UI는 있지만 기존 실 Provider가 없는 65에서는 실행 불가 및 LIVE_BLOCKED다. 키 존재 상태는 ready/missing만 표시하며 유효성/실연동 성공을 뜻하지 않는다.
- 서버 승인 합성 입력 3종(시각 있음/미상/경도 누락)과 문체 2종을 기존 계산·승인형 registry·R01 공통 프롬프트/Mock에 전달한다. 개인 입력·임의 prompt/profile/API 키/userId/role을 받지 않는다. core-base 외 F01~F11·report_stream/follow_up은 UI 비활성화/서버 409다. 계산기·축약 프롬프트·P06 정적 결과를 새로 만들지 않았다.
- 기존 WBS-24의 원자적 세 범위 예산/동시성 가드를 재사용한다. 로컬 개발자 principal은 새 세션에도 같아 새 잠금해제로 일 한도를 초기화할 수 없다. 기본 15회/30,000 예약 토큰/출력 1,200/동시 1이며 잘못된 환경 한도는 거절한다. 같은 session/requestId는 같은 결과를 반환하고 다른 본문/진행 중 중복은 409다. 취소/오류에도 예약을 되돌리지 않으며 미종료 공급자의 잠금을 유지한다.
- 실행/장부는 프로세스 메모리에만 존재하고 최대 실행 1,000개에서 거절한다. 재시작·다중 인스턴스·영속 Live 예산을 보장하지 않는다. 현재 token 값은 기존 UTF-8 기반 보수적 예약 추정량이며 실제 usage/billing이 아니다. 실제 input/output 토큰은 null이다. 증빙은 모델·페르소나/프롬프트/스키마 버전·상태/시간/고정 오류 등 메타만 내보내고 문장 원문·원본 출생 입력·키/세션/CSRF는 제외한다.

### 실제 검증 결과와 제약

- 최종 `npm.cmd test -- tests/api-test.test.ts tests/persona.test.ts tests/experiment-guard.test.ts`: 종료 0, **3파일/74개 통과**(신규 15 + R01 23 + 예산 36). 무권한/Live 조건 미충족 0콜, 합성 키/Live 플래그/동의가 있어도 실 Provider 0콜, 토큰·일 상한과 경쟁/취소·예약 유지·소유권·멱등·주입/키 미노출을 확인했다.
- 첫 E2E는 시각 있음 Mock 실행 후 미상 사례가 누적된 기본 예약 토큰 30,000 상한에 걸려 429였다. 차단이 정상 작동한 것으로 확인했고 **실제 기본값은 유지**한 채 격리 테스트 서버만 200,000 토큰을 사용해 독립 사례들을 검사했다. 실패를 skip하지 않았다. React effect 내 설정 함수 호출 린트 오류도 fetch 결과 콜백에서 상태를 갱신하고 unmount를 확인하도록 수정했다.
- 최종 `npm.cmd run test:e2e:api-test`: 종료 0. 개발 **7개 통과**(초기 잠금/자동 호출 0/Live disabled·새로고침 Mock·HttpOnly/Strict, 실제 UI Mock·다른 route의 결과 조회·메타 다운로드/버전, 미상 partial/합쇼체, 320·390·768·1440px 가로 넘침/키보드 포커스). 390px 실제 스크린샷도 확인했다. production **1개 통과**, 페이지와 API 4경로×7메서드 전부 404. 전용 마커·합성 비밀이 있어도 production에서 차단했다.
- 동일 E2E의 격리 사본에서 Next production 빌드·route typegen·TypeScript 검증도 통과했다. 루트 `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint` 최종 종료 0, 경고 0. 원본 .next·next-env.d.ts·개인 fixture를 건드리지 않도록 기존 임시 사본 검증기를 재사용했다. 사본은 해석된 temp 경로와 생성 prefix를 검증한 뒤 안전 정리한다.
- OpenAI Docs 스킬의 공식 [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)를 검색 후 실제 페이지를 읽어 서버 키/개발환경 분리 원칙을 확인했다. 실제 OpenAI 네트워크 호출·키/시크릿 발급·설정 변경은 수행하지 않았다. 의존성/lockfile·OAuth/PG/DB·CI는 변경하지 않았다.
- 상태: **MOCK_PASS / LIVE_BLOCKED**, 실제 OpenAI 호출 0회. 사용자 실행 허용과 실제 공급자/영속 장부·usage 정산 연결은 WBS-66에서 구현/검증한다. 이후 OAuth 테스터 allowlist·실 스트림/후속 질문은 WBS-67/68이며 이번에 착수하지 않았다. 단일 프로세스 Mock 통과를 운영 인증/영속 예산·실제 모델 품질·LIVE_PASS로 표시하지 않는다.
- 변경: 별도 선행 커밋의 v2.5 문서 19개 외에 `src/application/dev-api-test`, `src/server/api-test*`, `src/app/dev/api-test`, `src/app/api/dev/api-test`의 DTO/로컬 인증/Mock/API/UI, 전용 실행기·기존 격리 E2E 설정, API/E2E 테스트·README/21 보충·worklog. next-env.d.ts와 개인 cli-input.json은 SHA-256 동일 확인 후 커밋 제외한다. develop 대상 PR 한 건 생성 후 즉시 중지한다.

## 2026-10-23 — WBS-25: R01 Mock 반복 품질 평가·샘플/사람 평가 기준

### 선행 확인과 구현 전 완료 조건

- 직전 PR #21(WBS-16)의 GitHub MERGED, 대상 develop, 병합 시각 2026-10-23 16:58:17 KST, merge commit `2606c19f806beab01cf79a56cd474531c0a4eb14`를 확인했다. 원격 develop 해시 일치 및 fetch 후 ancestor 확인. 직접 선행 WBS-24(PR #19, `b03d3803b8d16e21d0e9d5afc79d580cdc401600`), WBS-47(PR #20, `537b73d489870fe4e79dcedfc5fdcfe0ab15e9d4`)도 GitHub develop MERGED 및 ancestor 확인했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-16-independent-golden-qa` 안전 삭제 성공. 최신 develop에서 `feature/WBS-25-persona-quality-evaluation` 한 개를 생성했다. 실행순서 23의 WBS-25만 진행했다. AGENTS/WBS/02/05/06/08과 관련 03/11/12·기존 R01/예산/Mock·독립 골든 계약을 읽었다. 직전 30건 승인은 역법 기대값 승인으로 유지하고 문장 품질 승인으로 전용하지 않았다.
- 먼저 평가 문서에 완료 조건/정상·오류·경계를 정의하고 테스트를 작성했다. 고정 합성 사례 30개 × 합성 해요체/합쇼체 2종 × 3회 = 180회, JSON/근거·원문 인용·제한/상태·분석 키/버전·입력 불변을 검증하며 반복 문장과 휴리스틱은 별도 지표다. 자연스러움/가독성 5점 척도·평균 4점 목표와 사람 2명 권장 기준을 명시하고 미평가 점수를 만들지 않는다.
- 오류/경계는 2~3회 반복 범위, 중복/위조 데이터·주입 필드·미승인 버전·공급자 거절/불완전/오류·JSON/근거 이탈·유효 ID를 재사용한 주장 변경·실 공급자/production/예산 차단, 부분/불가 입력, 동일/상이한 반복 출력을 검사한다. 최초 테스트 실행은 evaluation 모듈 부재로 종료 1을 확인했다.

### 구현과 검증 결과

- 고정 manifest는 승인된 WBS-16 입력 20개(윤달/윤일/일진·절기·DST·태양시)와 미상 4개, 불가 6개(경도·fold/gap reject·실재하지 않는 윤달·지원 범위)다. 입력에서 코어를 한 번씩 계산하며 사용자 편집 cli-input.json은 사용하지 않는다. 결과 상태는 complete 20 / partial 4 / unavailable 6이다. 코어·원래 명리 규칙과 persona Mock 문구는 변경하지 않았다.
- evaluatePersonaMatrix는 평가 입력/설정·승인 목록/모든 코어·스펙을 호출 전 검증하고 기존 createPersonaExperiment의 접근·기한·가격 예약·동시성 경로를 재사용한다. 실 공급자를 호출 전에 거절하고, 최대 30사례/3프로필/3회로 제한한다. 매 시도를 결과 분모에 포함하고 실패는 고정 코드와 null 샘플로 기록하며 재시도하지 않는다. 예외 원문을 내보내지 않는다.
- 출력 스키마와 허용 근거 ID는 기존 R01에서 검증한다. 추가로 Mock의 인용 assertion이 해당 근거 원문과 일치하는지 확인한다. 유효 ID에 새로운 주장을 붙인 오류는 ASSERTION_MISMATCH다. 인용 밖 문장의 모든 의미/안전/환각을 판정하는 검사는 아니다. 기존 휴리스틱 지적은 구조 실패와 구분한다.
- 결과에는 평가/프롬프트/문체 정책·실제 코어 버전, 승인형 합성 프로필/spec, 사례별 원래 확정 판단/제한, 분석/서술 키·출력 digest, 180회 결과·반복 동일성·집계를 남긴다. raw 출생 입력과 공급자 요청 원문·키는 포함하지 않는다. 새 HTTP/P06 경로에 연결하지 않는다.
- `npm.cmd run eval:persona`: 최종 종료 0, **180/180 계약 대조**, 실패 0, 기존 문체 휴리스틱 지적 0. 두 문체 모두 분석 키·근거가 같고 문장/서술 키가 다르다. 60개 사례·문체 조합의 세 반복은 모두 동일했다. 문체별 전체 출력은 각 90회 중 9종, 도입은 2종(첫 발생 제외 중복 88회); 반복을 빼고 30사례당 하나만 보면 도입 2종·중복 28건이다. 높은 템플릿 반복성을 그대로 기록했다.
- 결과 JSON과 사람이 읽는 샘플 Markdown을 고정 경로에 생성한다. 같은 사례·문체에서 같은 반복은 하나로 묶고 다른 출력은 모두 표시한다. 원래 관찰과 입력/계산/중재 제한을 같이 읽도록 했다. 재생성 파일에는 사람 점수를 쓰지 않고 별도 평가 기록을 안내한다. 계약 실패/휴리스틱 지적 시 도구 종료 1, stdout은 집계만 출력한다.
- 첫 도구 실행은 샌드박스에서 tsx가 Windows 사용자 정보를 조회하다 `uv_os_get_passwd / ENOMEM`으로 실패했다. 자동 승인된 샌드박스 밖에서 **동일한 로컬 Mock 명령**을 실행해 성공했다. production·`--live` 미지원 인수는 종료 1/고정 오류이며 산출물 바이트 불변도 subprocess로 확인했다. 실제 API/키를 읽거나 호출하지 않았다.
- `npm.cmd test -- tests/persona-evaluation.test.ts tests/persona.test.ts tests/narration.test.ts tests/experiment-guard.test.ts`: 관련 4파일/105개 통과(신규 16 + 기존 89). 이후 서로 다른 반복 출력을 모두 검토 문서에 남기는 검사와 제한 표시를 보강하고 `npm.cmd test -- tests/persona-evaluation.test.ts` 최종 **17개 통과** 및 평가 도구를 재실행했다. 실패를 숨기거나 기존 테스트를 skip하지 않았다.
- `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 최종 모두 종료 0, 경고 0. 문서 로컬 링크 22개·180개 고유 실행 조합·결과 원본 입력 키 부재·사용자 수정 4파일 SHA-256 동일 확인. Node 24.12.0 / ICU 77.1 / tzdb 2025b. 라우트/Next 설정·의존성 변경이 없어 빌드/Next 타입 생성·무관한 전체 회귀는 반복하지 않았다. package.json에는 평가 script만 추가했고 lockfile 의존성은 동일하다.
- OpenAI Docs 스킬로 공식 [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)를 검색 후 실제 페이지를 읽어 과업별 목표·정상/경계/적대 사례와 사람 평가 병행 원칙을 참고했다. API 기반 평가 플랫폼이나 자동 LLM 채점기를 도입하지 않았으며 지정 gpt-4o-mini를 다른 모델로 치환하지 않았다.

### 변경 파일과 한계

- `src/application/narration/evaluation.ts`: 제한된 Mock 평가 실행기, Zod 결과 계약·인용/불변성·집계·읽기용 샘플 렌더러.
- `tests/persona-evaluation.test.ts`, `tests/evaluation/persona-fixtures.ts`, `tests/evaluation/run-persona-evaluation.ts`, `tests/fixtures/persona-evaluation-cases.json`: 고정 사례/합성 승인 목록·기존 예산 조합, 평가 CLI와 정상/오류/경계 테스트.
- `docs/evaluations/WBS-25-persona-quality.md`, `WBS-25-persona-quality-results.json`, `WBS-25-persona-quality-samples.md`: 수용 기준·사람 채점 기준, 실제 180회 결과와 읽기용 60개 사례·문체 샘플.
- `package.json`, `README.md`, `src/domain/persona/README.md`, `docs/worklog.md`: 재현 명령·평가 범위와 결과. 총 12개 작업 파일만 포함한다.
- **사람 자연스러움/가독성·의미 평가 0/60, 점수 null**, 평가자 미지정이다. Mock은 원문 인용/합성 높임말만 바꾸므로 실제 모델의 표현력·성격 반영·생성 변동성·주입 내성을 입증하지 않는다. 휴리스틱 0건을 사람 품질 합격으로 바꾸지 않는다. 평균 4점 목표 달성·의미 변경 0건(사람 포함)은 미검증이다.
- 실 OpenAI API·계정 동의/혜택·과금 평가는 별도 승인 전 미실시다. F02/F05/F09 등 미구현 11개 기능의 문체 일관성·R02/R03 SSE/P06·DB 완료·OAuth·PG·CI/배포·후속 WBS는 수행하지 않는다. 결과는 내부 Mock 평가 기록이며 고객 풀이 품질/운영 승인과 다르다. WBS.csv 상태와 기존 사용자 수정 4개 파일은 변경하지 않는다. develop 대상 PR 한 건 생성 후 즉시 중지한다.

## 2026-10-23 — WBS-16: 독립 골든 30건 통합 대조·승인 검토 자료

### 사용자 승인 반영 — 2026-10-23 16:55 KST

- 사용자가 “근데 니가 돌린 테스트에서 모두 기대값이 나왔다면 다 승인처리해도 될 듯”이라고 지시했다. 앞서 확인한 자동 대조 30/30 통과를 근거로 G01~G30 전체 사용자 승인을 기록했다. 검토표 30행을 승인으로 바꾸고 승인자·기록일·대화 근거·범위를 명시했다.
- 사용자가 별도 출처 원문을 직접 대조했다거나 전체 역법 범위를 승인했다는 의미로 기록하지 않는다. 기존 근사 허용차·검증 한계는 유지한다.
- 기존 PR #21이 OPEN이며 같은 WBS-16 브랜치임을 확인했다. 변경 파일은 검토표와 worklog 두 문서뿐이며, 동일 PR의 승인 대기 설명을 갱신한다. 입력·기대값·코드 변경이 없어 기존 관련 테스트 38개·타입·린트 통과 결과를 사용하고 재실행하지 않았다. 승인 행 30개/대기 행 0개와 Git 공백 검사를 확인한다.
- 새 브랜치·새 PR·병합·후속 WBS 작업은 하지 않는다. 아래 승인 대기 기록은 최초 PR 생성 당시 상태다.

### 선행 확인과 구현 전 완료 조건

- 직전 PR #20(WBS-47)이 GitHub MERGED, 대상 develop, 병합 시각 2026-10-23 15:32:24 KST, merge commit `537b73d489870fe4e79dcedfc5fdcfe0ab15e9d4`인 것을 확인했다. `git ls-remote` 원격 develop 해시 일치 및 fetch 후 ancestor 확인. 직접 선행 WBS-14(PR #15, `280034e6f05239056bc2dd14571d799be8565cb0`)도 GitHub develop MERGED 및 ancestor 확인했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-47-approved-persona-narration` 안전 삭제 성공. 최신 develop에서 `feature/WBS-16-independent-golden-qa` 한 개를 생성했다. WBS.csv 실행순서 22의 WBS-16만 진행했다. AGENTS/WBS/02/05/06/08/03, 기존 독립 fixture와 어댑터/정책/코어 출력 문서를 읽었다.
- 먼저 검토 문서에 수용 기준·정상/오류/경계 테스트를 정의하고 테스트를 작성한 뒤 정적 기대값 fixture를 추가했다. SDK 출력에서 기대값을 생성하거나 허용차를 조정하지 않는다. 날짜/간지/UTC/평균태양시는 정확 일치, 서로 다른 균시차 근사 모델만 사전 허용차 30초를 사용한다.
- 정상은 독립 날짜/간지와 JSON·해시 경로의 전달, 오류는 날짜/시각·존재하지 않는 윤달·범위·경도 누락·DST reject와 계산/사실 호출 차단, 경계는 윤달/윤일/연말·입춘/경칩·DST earlier/later·태양시 날짜 이동·23시·미상 partial 전파를 검증한다. WBS의 30건 사용자 승인은 자동 테스트와 구분한다.

### 구현과 검증 결과

- `tests/fixtures/independent-core-golden.json`에 명시적 기본 입력/정책과 G01~G30 override·출처 위치·수기 유도 근거·대조 필드를 고정했다. 음력/윤달 8건, 일진 6건, 절기 4건, 1988 서울 DST 4건, 태양시 4건, 자시/미상 4건이다. 양력/음력/윤달 왕복 대조도 포함한다. 사용자 편집 cli-input.json은 읽거나 실행하지 않았다.
- KASI 2023/2024 웹 월초/대소/일진·절기 표, HKO 간지/시간 표, IANA tzdb-2025b ROK/Asia/Seoul 규칙, NOAA 1쪽 근사식을 2026-10-23 다시 읽었다. KASI 웹의 비공식/예비 자료 고지를 유지했고 월건을 절기 월주로 사용하지 않았다. 기존 공식 월력요항 전사 기록은 2026-10-22 확인 자료이며 공식 HWP HTML 미리보기의 이번 접근 실패도 기록했다. SDK나 대체 만세력 엔진을 독립 기대값으로 사용하지 않았다.
- 실제 어댑터로 calculatePolicySaju를 실행해 독립 기대 필드를 대조하고, 별도 공개 calculateHashedCoreExport 경로에서 동일 확정 기둥의 기초 사실/판단/중재·정책/실제 버전·미상 제한 전달, JSON round-trip, 체크섬 검증과 입력 불변을 확인한다. 시각 미상은 1440분 가능 구간 전체를 다루며 갑진/을사 후보만 남고 일간·일주·시주는 확정하지 않는다.
- 첫 실행은 refinement가 있는 Zod 객체에 `.partial()`을 적용해 수집 실패, 다음 실행은 음력 2월 30일을 양력 ISO date로 검사해 수집 실패했다. override 스키마는 shape에서 재구성하고 음력 날짜 형식 검사를 분리한 뒤 실제 테스트를 실행했다. SDK 결과에 맞춘 기대값 변경·실패 무시·skip·CI 우회는 없다.
- 최종 `npm.cmd test -- tests/independent-core-golden.test.ts`: 종료 0, **1파일/38개 통과**. 독립 기대값 사례 **30/30**, fixture 출처/ID/경계 커버리지 검사 1개, 추가 오류/불가 검사 7개다. G25/G26은 사전 30초 허용차 내 균시차 근사 비교이며 관측 골든이 아니다. JSON/해시 부가 검사는 역법 독립 기대값 개수에 가산하지 않는다.
- `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 종료 0, lint 경고 0. 소스/라우트/설정·의존성 변경이 없는 QA 작업이므로 기존 .next/Next 생성 타입을 건드리지 않고 빌드/E2E/무관한 전체 테스트는 반복하지 않았다. 실 OpenAI/PG/외부 공급자 API·키 변경은 없다.
- JSON의 원본 출생 입력 키 부재와 잘못된 입력 시 모든 어댑터/해시 호출 0회 검사를 보강한 뒤 최종 관련 테스트 38개·타입·린트를 재실행해 통과했다. Node 24.12.0 / ICU 77.1 / tzdb 2025b에서 검증했으며 README·검토 문서의 로컬 링크 19개도 통과했다.

### 변경 파일과 승인 한계

- `tests/independent-core-golden.test.ts`: 고정 사례 검증 및 실제 계산/JSON/해시 통합·정상/오류/경계 검사.
- `tests/fixtures/independent-core-golden.json`: 30개 합성 입력과 SDK와 독립된 기대 필드·출처·유도 근거.
- `docs/checklists/WBS-16-independent-golden-review.md`: 사전 검증 계획, 출처의 정밀도/독립성 범위, 30개 ID별 사용자 검토표와 실행 결과.
- `README.md`, `docs/worklog.md`: 검증 재현/검토 문서 연결 및 결과. 작업 파일 총 5개.
- 자동 대조 **30/30 통과**, 사용자 승인 **0/30 대기**다. 사용자 검토 전 WBS-16의 `30건 승인` 완료를 주장하거나 WBS.csv 상태를 변경하지 않는다. 승인 칸에는 사용자/승인일/근거가 있어야 한다. 이번 구현 요청은 각 기대값 승인과 다르다.
- 독립 fixture의 통합 재검증이며 모든 사례의 네 기둥 전체나 역법 전 지원 연도·12절 전부를 새 외부 엔진과 교차검증한 것이 아니다. IANA는 런타임과 같은 계열의 규칙 적합성, NOAA는 서로 다른 근사 모델 비교이며 역사/관측 정확도를 보증하지 않는다. 11개 기능·대운·LLM 품질 평가와 후속 WBS는 수행하지 않는다.
- 사용자 수정 AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json 4개의 SHA-256이 작업 시작 전과 동일한 것을 확인하고 커밋 제외한다. 코어/페르소나/P06·OAuth·DB·테스트 결제·CI/배포는 변경하지 않았다. develop 대상 PR 한 건 생성 뒤 즉시 중지한다.

## 2026-10-23 — WBS-47: R01 승인형 페르소나·문체·내부 JSON 검증

### 선행 확인과 구현 전 완료 조건

- 직전/직접 선행 PR #19(WBS-24)의 GitHub MERGED, 대상 develop, 병합 시각 2026-10-23 15:04:33 KST 및 merge commit `b03d3803b8d16e21d0e9d5afc79d580cdc401600`를 확인했다. 원격 origin/develop hash 일치, fetch 후 ancestor 확인. 다른 직접 선행 WBS-23(PR #18)도 develop MERGED 및 ancestor 확인. WBS.csv 실행순서 21의 WBS-47 한 건만 진행했다.
- develop checkout/ff-only pull 후 `git branch -d feature/WBS-24-experiment-budget-access-guard` 안전 삭제 성공. 최신 develop에서 `feature/WBS-47-approved-persona-narration` 한 개를 생성했다. AGENTS/WBS/02/05, 필수 11/12/20과 관련 08·기존 provider/예산/해시 계약을 읽었다. 11의 내부 JSON 예외와 20의 R02/R03 텍스트 전용 경계를 구분했다.
- 구현 전 완료 조건: strict PersonaProfile/Zod와 서버 승인형 JSON 목록/정확한 버전 선택, 공통·승인 스타일/목차·판단 데이터 3계층, mock 서술 JSON/근거·제한 검증, 문체 평가와 코어/서술 캐시 분리. 제품명/캐릭터명·실 API/키·P06/SSE·명리 판단은 변경하지 않는다.
- 먼저 정의한 정상/오류/경계 테스트: 승인 JSON/프로필 강도·표현/범위·버전·중복/미승인/크기, 공통 원문과 세 역할·개인정보 최소화, 두 문체의 동일 근거/코어 키와 서로 다른 서술 키, 미상·계산 불가, 기능/섹션/근거 위조·누락/중복·길이, 상투어·과장·유행어·문체, 기존 예산/접근·실호출 차단. 첫 실행은 새 서비스 모듈 부재로 종료 1을 확인했다.

### 구현과 검증 결과

- PersonaProfile은 docs/11의 가상 서술자 공개·성격/강도·한국어 목소리·표현/회피/유행어·문단/문장 범위·비교 예시를 strict/readonly 스키마로 검증한다. 서버 manifest에 명시적으로 등록된 approved JSON만 ID+버전으로 조회한다. 기본 목록은 비어 있고 UTF-8 32 KiB/개수·길이·범위/본문 ID 불일치·중복/잘못된 JSON을 거절한다. 사용자 프로필/프롬프트 업로드·경로 선택·자동 승인은 없다.
- docs/12의 text 블록을 코드펜스/설명 없이 그대로 상위 instructions에 넣고 원문 동기화 테스트를 추가했다. 별도 developer에는 R01 내부 JSON 계약과 승인형 PersonaProfile/FeatureNarrationSpec만, user에는 기존 확정·채택 판단/근거·제한을 전달한다. docs/20 전용 텍스트 스트림 지시를 조립하지 않는다. 공통 정책은 표현보다 우선하며 문체 예시를 분석 대상의 사실로 쓰지 않도록 명시한다.
- 현재 코어를 내부 featureId=core-base로 명시했다. 아직 구현되지 않은 F01~F11 결과를 만들거나 기존 코어를 해당 기능이라고 표시하지 않는다. 서버 spec의 고유 섹션/목적·최소 근거·길이·일반 독자/제한 포함·점수 금지를 검증한다. 공급자는 schemaVersion/featureId/sections만 생성하며 서버가 sourceStatus·원래 limitations·버전/모델·persona/spec 메타를 붙인다.
- 출력의 기능·섹션/제목·길이·중복/누락·알 수 없는/빈 근거 ID, 현재 코어에 없는 날짜 삽입·추가 meta/limitations·손상/과대 JSON을 거절한다. 섹션 순서는 서버 spec에 맞춘다. 확정 근거가 없는 unavailable은 빈 근거와 한계 설명으로 처리하고, partial도 원래 제한/확정 근거만 사용한다. 문장의 모든 의미나 환각을 입증하는 검증이라고 표시하지 않는다.
- 코어 체크섬은 기존 fingerprintCoreExport로 계산하며 페르소나와 무관하다. 별도 narration.persona-cache/1.0.0 키에는 코어 키·기능·persona/프롬프트/모델/spec/출력 스키마 버전과 프로필/spec/프롬프트 내용 digest를 넣는다. 같은 버전 내용이 바뀌어도 키가 달라지며 실제 캐시 저장/조회는 구현하지 않는다. 기존 명리 계산·판단·해시 정책은 변경하지 않았다.
- 공통 provider 포트는 developer/user 역할과 독립 출력 JSON Schema 타입을 지원하도록 정리하고, 거절/오류·취소 처리를 receiveNarrationText로 공유했다. 예산 가드는 서버가 고정한 execute 전략을 지원해 R01 전체 요청을 같은 권한·기한·예약·동시성 경로로 실행한다. 실행 전략은 사용자 본문에서 받지 않는다. 기존 코어 provider/예산 결과는 유지하고 실 API/production 차단도 유지한다.
- Mock은 실제 assertion을 그대로 인용하고 승인 register에 따른 합성 도입/한계 문장만 바꾼다. styleEvaluation은 상투어·중복·확정 표현·이모지·높임법·유행어 횟수·문단/문장 수·내부 ID를 휴리스틱으로 평가한다. 해요체/합쇼체/반말 합성 대조는 통과했지만 모든 성격 특성을 재현하거나 실제 모델의 자연스러움을 검증한 것은 아니다. 평가 실패 초안도 내부 진단 결과로 반환하며 고객 게시에 연결하지 않는다.
- 최초 구현 검사에서 mock이 여러 줄의 developer 계약을 첫 줄 뒤 JSON으로 오해해 6건 실패했다. 고정 계약 prefix 뒤의 JSON만 읽도록 수정했다. 이후 79건 통과 후 타입 검사에서 literal widening 및 Zod JSON 스키마가 기존 출력 타입에 묶인 오류를 발견해 포트를 일반 JSON Schema 타입으로 수정했다. 실패를 무시하거나 테스트/CI를 우회하지 않았다.
- 추가로 반말 대조·미승인/위조 본문 예산 0·환경/예산/실호출 차단·거절/중단/실패·공급자/해시 예외·취소·여러 섹션 재정렬·UTF-8 크기·내부 ID/문장 경계를 보강했다. 최종 `npm.cmd test -- tests/persona.test.ts tests/narration.test.ts tests/experiment-guard.test.ts`: 종료 0, 관련 3파일/89건 통과(신규 23 + provider 30 + 예산/보안 36). 코어/원래 근거·분석 키 불변과 스타일/버전·내용 변경 시 서술 키 변경을 확인했다.
- `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: 모두 종료 0, 린트 경고 0개. 변경 문서 로컬 링크 16개와 Git 공백 검사도 통과했다. HTTP 라우트/Next 설정·의존성 변경이 없어 빌드/E2E/설치·전체 회귀는 반복하지 않았다. 개인 cli-input.json 대신 별도 합성 출생 입력과 제품이 아닌 합성 persona fixture만 사용했다.
- OpenAI Docs 스킬로 공식 [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)를 검색 후 실제 페이지를 읽어 역할 우선순위와 구조/거절 경계를 확인했다. 문서 예시의 다른 모델로 치환하지 않았다.

### 변경 파일과 제약

- `src/domain/persona/index.ts`, `prompt.ts`, `narration.ts`, `README.md`: 승인 목록/프로필·서버 목차 계약, 3계층·출력/근거·문체·캐시 키와 범위.
- `src/application/narration/persona.ts`, `src/infrastructure/llm/persona-mock.ts`: 기존 실험 가드 조합, 메타 부착·문체 평가 및 합성 mock.
- `src/application/narration/index.ts`, `experiment.ts`, `src/domain/narration/index.ts`: 기존 공급자 응답/취소 공통화와 독립 스키마·서버 실행 전략 지원.
- `tests/persona.test.ts`, `tests/fixtures/persona-style.json`, 루트 `README.md`, `docs/worklog.md`: 정상/오류/경계·문체/근거/버전·회귀 및 사용법/결과. 총 13개 작업 파일만 커밋한다.
- 승인 manifest는 신뢰할 수 있는 서버 설정이며 스키마 통과/approved 문자열이 실제 콘텐츠 승인 자체를 증명하지 않는다. 테스트용 synthetic-style 등은 제품 캐릭터가 아니고 실제 승인 프로필/상품명은 미정이다. 문서의 character-a와 서비스명·이미지를 런타임 제품으로 채택하지 않았다.
- 사람 평가 평균 4점·30개 케이스 반복·실 모델 자연스러움/가독성 평가는 미실시이며 WBS-25 범위다. 의미·안전·환각은 휴리스틱으로 보장하지 않는다. 실 OpenAI/계정 혜택·동의/과금·실 OAuth/공유 원장·R02/R03/P06·DB 완료 연동은 **BLOCKED/미구현**이며 Mock 성공을 실연동 성공으로 표시하지 않는다.
- 사용자 수정 AGENTS.md/작업지시 문서/next-env.d.ts/cli-input.json의 SHA-256 동일을 확인하고 커밋 제외한다. WBS.csv 상태·명리 규칙/11개 기능·키/PG/CI/배포 및 후속 WBS는 변경하지 않는다. develop 대상 PR 한 건 생성 후 즉시 중지한다.

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

# WBS-66 — 착수 및 완료 기준

- PR #23: GitHub MERGED (2026-10-23T10:09:23Z), merge `e9c1664e961de8ecdd0f38e0512c6ab5fe97f25a`가 최신 origin/develop에 포함됨. WBS-47 선행 커밋도 ancestor 확인. develop ff-only 갱신 및 WBS-65 로컬 브랜치 안전 삭제 후 `feature/WBS-66-live-narration` 생성.
- 완료 조건: 동일 R01 코어/승인 페르소나/프롬프트/검증기를 공유하는 Responses API Provider; 보호된 로컬 설정의 명시 Live 동의/실행; 영속 예산 예약과 usage 정산; 비식별 실행 증빙 및 오류 처리. R02/R03/F01~F11 확장 제외.
- 정상 테스트: 가짜 Responses HTTP transport로 요청 계약, 동일 Mock/Live 입력, 모델·usage·근거·문체·버전·멱등성 검증. 실제 외부 호출 아님.
- 오류/경계 테스트: 키/플래그/인증/동의/CSRF/운영 차단 0콜, 예산·동시성·재시작·장부 오류, 429/5xx/네트워크/timeout/abort/refusal/incomplete, 잘못된 모델·JSON·근거·문체, usage 누락 시 예약 유지, 비밀/출생 원문 비노출.
- 검증 계획: npm test, 타입/린트, 격리된 API 설정 E2E와 프로덕션 빌드. 실제 Live는 사용자 UI 실행 승인 전 `LIVE_NOT_RUN`이며 환경 비활성 시 `LIVE_BLOCKED`.
- 사용자 수정 `next-env.d.ts`, `tests/fixtures/cli-input.json` 및 .env는 보존하고 커밋하지 않는다.

## 구현 및 검증 결과

- 구현: `src/infrastructure/openai/narration.ts`는 고정 Responses endpoint, 서버 키, store:false/stream:false, Strict JSON, 최대 출력/응답 크기, timeout/abort, 재시도 0회, completed/refusal/incomplete/HTTP 오류·모델/usage 검사를 담당한다. 원문·키·외부 오류를 로깅하지 않는다.
- `src/infrastructure/openai/live-budget.ts`: Git 제외 로컬 파일 장부, 독점 파일 잠금/atomic rename/fsync, UTC 일 공유 예산, 호출/입출력 사전 예약·usage 정산, unknown usage 예약 유지, 재시작/다른 세션/동시 프로세스의 중복 지출 방지. crash/persist 실패는 잠금/pending을 유지한다. Live는 최대 1건이며 분산 보장을 주장하지 않는다.
- `src/application/narration/{index,persona}.ts`는 기존 R01 실행/검증을 공통화하고, 기존 Mock 전용 실험/CLI 가드는 유지한다. `src/server/api-test-live.ts`, `api-test.ts`, `api-test-runtime.ts`가 인증/Origin/CSRF/비용 동의/환경/승인 fixture 이후에만 Live를 연결한다.
- `src/application/dev-api-test/index.ts`, `src/app/dev/api-test/test-form.tsx`: 서버 판단 Live 준비/차단 상태, 별도 Live 예산, usage·소요 시간·검사 결과, 입력 잠금/중단, 원문 없는 증빙 내보내기. 페이지 진입·모드/동의 변경·새로고침 시 호출하지 않으며 기본 Mock이다.
- 변경 문서/설정: `.gitignore`, `src/app/dev/api-test/README.md`, `docs/21_실제_OpenAI_API_테스트_설계.md`, 본 worklog. 테스트: `tests/live-narration.test.ts`, `tests/e2e/api-test.spec.ts`.
- 관련 `npm.cmd test -- tests/live-narration.test.ts tests/api-test.test.ts tests/narration.test.ts tests/persona.test.ts tests/experiment-guard.test.ts tests/persona-evaluation.test.ts`: **155/155 PASS**, 신규 Live HTTP/파일 계약 34건 포함. 실제 HTTP는 주입한 가짜 transport이며 Live 실행 증빙이 아니다.
- 전체 `npm.cmd test` 첫 실행: **1028 PASS/21 FAIL**. 사용자 수정 CLI 입력과 고정 기대값 불일치 및 제한 환경 tsx `uv_os_get_passwd/ENOMEM` 실패를 확인했다. 사용자 fixture는 복원/수정하지 않았다. 첫 임시 검증은 docs 누락/CLI 제한/부하 timeout 때문에 실패했으며 이를 통과로 취급하지 않았다.
- 재검증: `.env`와 개인 fixture를 제외한 임시 사본에 `git show HEAD:tests/fixtures/cli-input.json`의 커밋 fixture와 docs를 넣고 제한 밖에서 `npm test -- --maxWorkers=1` 실행: **41개 파일, 1056/1056 PASS (90.48초)**. 실패 무시/skip 옵션은 사용하지 않았다. 원본 작업 트리의 개인 fixture 상태에서는 전체 테스트 통과를 주장하지 않는다.
- `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: **PASS**, lint 경고 0. 최종 E2E/빌드 결과는 아래 기록한다.
- 제한 환경 첫 E2E는 개발 7건 통과 후 종료가 지연되어, 명령/PID를 확인한 해당 격리 테스트 트리만 종료하고 생성한 임시 사본을 경로 검증 후 정리했다. 키 없음/Live false 상태에서 제한 밖 재검증 진행.
- 실제 OpenAI 요청: **0회 / LIVE_NOT_RUN**. 가짜 응답의 LIVE_PASS/실패 값은 계약 테스트일 뿐 실제 계정/청구/품질 증빙이 아니다. 실제 Live는 사용자가 서버 환경을 설정하고 화면에서 비용 동의 후 실행해야 하며 의미상 품질 수동 검토도 남는다. 키/비밀 변경, CI/PG/SSE/DB 구현은 수행하지 않았다.
- 최종 `npm.cmd run test:e2e:api-test`: **exit 0**, 개발 E2E **8/8 PASS**(Live 동의/명시 버튼/진행 중 입력 잠금/usage/증빙을 브라우저 응답으로 시뮬레이션), production 404 E2E **1/1 PASS**, 격리 production 빌드·route typegen·tsc **PASS**. 서버 OPENAI_API_KEY는 빈 값, ENABLE_LIVE_API_TESTS=false로 고정했다. 320/390/768/1440px·키보드·Mock 기본 복귀·무자동호출도 확인했다.
- 보존 확인: 작업 전후 `next-env.d.ts`, `tests/fixtures/cli-input.json`의 SHA256 동일. 두 파일 및 .env는 PR에서 제외한다. 구현과 자동 검증 완료 후 develop 대상 PR 1건을 생성하며 다음 WBS는 시작하지 않는다.

## WBS-66 PR #24 사용자 Live 결과에 따른 수정

- PR #24는 GitHub OPEN, 동일 `feature/WBS-66-live-narration`에서 리뷰 수정. 새 브랜치/PR/다음 WBS는 생성하지 않는다.
- 사용자 정정: 대시보드에서 호출 기록 확인됨. 사용자 보고 실행은 `completed`, 입력 3856/출력 277, 종합 `LIVE_FAILED`(문체 검사 실패). 이 기록은 사용자 제공 메타이며 응답 원문은 worklog에 복사하지 않는다. 대시보드 누락 문제는 현재 이슈가 아니다.
- 진단: 공급자의 completed와 앱의 품질 검사는 별도다. 제시된 합쇼체 문장이 해요체 설정에서 REGISTER로 실패하는 경우를 가짜 HTTP로 재현했다. 당시 선택된 persona를 확인하지 않았으므로 실제 실행의 상세 코드가 REGISTER였다고 단정하지 않는다. UI가 구체적인 실패 항목을 숨긴 점을 수정한다.
- 변경: `src/application/dev-api-test/index.ts`, `src/server/api-test.ts`, `src/application/narration/persona.ts`에 검사 사유/선택 종결 문체 메타를 추가하고 `test-form.tsx`에 API 호출 완료·문체 미통과 구분과 한국어 상세 목록을 표시한다. `LIVE_FAILED`, 실제 usage와 검사 기준을 유지한다. 비식별 내보내기에도 상세 메타가 포함되며 결과 원문은 제외한다.
- R01 `src/domain/persona/prompt.ts`를 1.0.1로 버전업하여 해요체/합쇼체/반말의 문단 종결과 문장 수를 명시했다. 동일 Mock/Live 공통 경로와 캐시 버전 추적을 유지한다. 코어/명리 사실·페르소나 설정·문체 검사기를 완화하지 않는다. 실제 모델 준수 개선은 추가 Live 없이 보장하지 않는다.
- 회귀: 관련 6파일 `npm.cmd test -- tests/live-narration.test.ts tests/api-test.test.ts tests/persona.test.ts tests/persona-evaluation.test.ts tests/experiment-guard.test.ts tests/narration.test.ts` **156/156 PASS**. 합쇼체 응답의 해요체 실패/합쇼체 통과, API completed/usage 유지, 실패 상세, 무자동재호출, 새 프롬프트 포함을 가짜 HTTP로 확인했다. 최초 실행에서 프롬프트 버전 고정 기대값 1건 실패 후 새 버전으로 기대값을 갱신해 재검증했다. 과거 평가 산출물의 1.0.0 기록은 변경하지 않는다.
- `tsc --noEmit`, `npm.cmd run lint`: **PASS**. 추가 실 API 요청 **0회**. 서버/장부/키/환경변수 및 사용자 fixture는 수정하지 않는다. 수정 프롬프트의 Live 재검증은 사용자 화면에서 별도 실행할 때만 가능하다.
- 최종 `npm.cmd run test:e2e:api-test`: **exit 0**, 개발 E2E **9/9**, production 차단 **1/1**, 격리 production 빌드·typegen·tsc **PASS**. API completed와 문체 실패 표시/상세를 브라우저 가짜 응답으로 검증했다. E2E 서버는 키 없음/Live false다. 사용자 파일 두 건은 작업 시작 전과 같은 SHA256 상태로 보존했다. 같은 PR #24를 업데이트하고 대기한다.

## WBS-66 PR #24 — 사용자 요청 OPENAI_MODEL 공통화

- GitHub PR #24 OPEN 확인 후 같은 브랜치에서 수정. 사용자가 `.env`의 OPENAI_MODEL을 공통 참조하도록 명시 요청했으므로 기존 gpt-4o-mini 고정 정책을 기본값+서버 설정으로 변경했다. AGENTS/05/14/21 및 환경 예시의 정책을 함께 갱신하며 새 WBS/PR은 만들지 않는다.
- 완료 조건/정상 검증: 서버 모델 설정이 요청·설정 화면·Mock/Live 메타·캐시·응답 모델 검증·오프라인 평가에 일치해야 한다. 미설정/빈 값은 기본값, 비기본값과 날짜 snapshot 정상, 모델 변경 시 analysisKey는 유지하고 narrationKey는 변경한다.
- 오류/경계: 잘못된 식별자 503 MODEL_CONFIG_INVALID, 클라이언트 model 위조 422, 다른 응답 모델 MODEL_MISMATCH, 정규식 특수문자/스냅샷 오인식 방지, 기존 인증/동의/예산/무자동호출 유지. 실제 공급자 호환성 확인용 호출은 금지한다.
- 구현 파일: `src/domain/narration/model.ts`(유일한 기본 모델값·공통 ID schema·응답 alias/snapshot 검사), `src/server/openai-model.ts`(서버 환경 해석), `src/domain/narration/index.ts`, `src/domain/persona/narration.ts`, `src/application/narration/{index,experiment,persona,evaluation}.ts`, `src/application/dev-api-test/index.ts`, `src/server/{api-test,api-test-live}.ts`, `src/infrastructure/openai/{narration,live-budget}.ts`, `test-form.tsx`. 순수 계층은 model 주입만 받고 process.env를 읽지 않는다.
- 기존 장부와 일 한도는 모델 간 공유한다. 새 예약에 modelId를 기록하고, modelId 없는 과거 장부도 읽는다. 추론 metadata는 응답 본문에서 제외하고 assistant output_text만 기존 JSON/근거/문체 검사에 전달한다. 새 모델로 자동 대체하지 않는다.
- `package.json`과 `tests/evaluation/run-persona-evaluation.ts`: 명시 Mock CLI도 Node의 .env/.env.local 로딩 및 같은 설정 해석기를 사용한다. model만 소비하며 키는 읽거나 출력하지 않고 live provider도 선택하지 않는다. 과거 평가 기록은 원래 모델/버전 그대로 유지한다.
- 테스트/문서: `tests/model-config.test.ts`, `tests/live-narration.test.ts`, `tests/persona-evaluation.test.ts`, `tests/e2e/api-test.spec.ts`, `playwright.config.ts`, `AGENTS.md`, `docs/{05,14,21}`, `docs/examples/.env.example`, `src/app/dev/api-test/README.md`, `src/domain/persona/README.md`, 본 worklog.
- TDD 최초 모델 설정 모듈 부재로 FAIL 확인. 구현 중 기존 모델 고정 차단 기대값 1건 FAIL은 요청된 동작 변경에 맞춰 서버 설정/위조 차단 검사로 대체했다. 최종 관련 7파일 `npm.cmd test -- tests/model-config.test.ts tests/live-narration.test.ts tests/api-test.test.ts tests/persona.test.ts tests/narration.test.ts tests/experiment-guard.test.ts tests/persona-evaluation.test.ts`: **167/167 PASS**. `tsc --noEmit`, `npm.cmd run lint`: **PASS**.
- `npm.cmd run test:e2e:api-test`: **개발 9/9, production 1/1, 격리 production build/typegen/tsc PASS (exit 0)**. 테스트 서버에 비기본 모델 gpt-4.1-mini를 주입해 실제 로컬 설정/Mock 실행/화면 반영을 검증했다. 키 빈 값, Live false 고정. 이후 추가한 영속 장부 modelId/Mock CLI 설정은 최종 관련 단위검사와 전체 격리 검증에서 확인한다.
- 사용자 .env/키/비밀값, `next-env.d.ts`, 개인 CLI fixture는 변경/커밋하지 않는다. 실제 모델 선택·접근 권한·Responses/구조화 출력 호환성·추론 토큰 상한의 적합성은 사용자가 확인한다. 추가 실 API 요청 **0회**, 이번 설정 변경의 실제 Live 회귀는 **LIVE_NOT_RUN**.
- 최종 격리 검증: 개인 .env/fixture 제외, 커밋 fixture를 사용하는 임시 사본에서 `npm test -- --maxWorkers=1`: **42개 파일 1068/1068 PASS (91.21초)**. 이어 임시 .env=기본 모델, .env.local=비기본 모델을 만들어 실제 `npm run eval:persona`: **Mock 180/180 완료, 실패/문체 플래그 0**, 생성한 임시 보고서 modelId가 .env.local 값인지 확인했다. 원본 과거 평가 산출물은 수정하지 않았다. 임시 node_modules junction을 먼저 해제하고 검증한 임시 디렉터리만 정리했다.
- 최종 사용자 두 수정 파일 SHA256 동일, 코드의 gpt-4o-mini 리터럴은 공통 DEFAULT_OPENAI_MODEL 한 곳에만 남음. 같은 PR #24에 커밋·푸시 후 대기한다.

# WBS-17 — 명리 계산/LLM 품질 QA 및 코어 문서 검증

## 선행 확인과 완료 조건

- 직전 PR #24는 GitHub **MERGED**, 대상 develop, merge `b5293423c0d149b3176acc84e2a78768a3b711bb`(2026-10-23T11:29:45Z). 선행 WBS-16/#21, WBS-25/#22도 MERGED이며 세 merge commit이 origin/develop ancestor임을 확인했다.
- develop 체크아웃 및 `git pull --ff-only origin develop` 후 병합된 `feature/WBS-66-live-narration`을 `git branch -d`로 안전 삭제했다. 최신 develop에서 `feature/WBS-17-core-quality-qa` 한 개만 생성했다.
- AGENTS/WBS/05/02/06/08, 독립 골든 검토표와 WBS-25 품질 기록을 읽었다. WBS-17은 실행순서 26, 선행 WBS-16/25, 완료 기준 P0 결함 0건/평가기록이다. 정상·오류·경계 및 P0 판정 범위를 구현 전에 [QA 계획](evaluations/WBS-17-core-qa.md)에 정의했다.

## 변경 파일과 조치

- `tests/fixtures/core-reference-input.json`, `tests/fixtures/README.md`, 기존 13개 테스트(`arbitration-service`, `calendar-service`, `cli`, `core-export-service`, `core-export`, `judgment-service`, `natal-facts-service`, `normalize-time-cli`, `policy-calendar-errors`, `policy-cli`, `policy-saju`, `solar-time-application`, `time-normalization`): 자동 회귀가 개인 편집용 CLI 입력을 읽던 문제를 수정했다. 고정 입력은 develop에 이미 커밋된 예시에서 복사했으며 기존 계산 기대값/독립 골든은 변경하지 않았다. 수동 입력 파일은 읽거나 복원하지 않았다.
- `scripts/check-doc-links.mjs`, `scripts/check-doc-links.d.mts`, `tests/document-links.test.ts`, `package.json`: 네트워크 없이 로컬 Markdown 대상 존재 여부/저장소 경계/잘못된 인코딩을 확인하는 명령과 6개 검증 추가. 외부 URL·앵커 내용·참조형 링크는 대상이 아니다. 최초 타입 검사에서 JS 모듈 선언/Mock 인자 타입 오류를 발견해 선언 파일과 타입을 수정한 뒤 재검증했다.
- `scripts/developer-e2e.mjs`, `playwright.config.ts`, `package.json`: 기존 계산/테스트 화면을 같은 격리 사본에서 검증하는 `test:e2e:core-qa` 추가. 모든 하위 검사/빌드 프로세스에 키 빈 값/Live false를 고정하며 기존 사용자 서버와 생성 파일은 건드리지 않는다.
- `README.md`, `docs/02_기술설계서.md`, `docs/06_검증_체크리스트.md`, `docs/08_OpenAI_실험_비용_및_보안.md`, `docs/문서_정합성_검증.md`, `docs/evaluations/WBS-25-persona-quality.md`: 현재 코어와 미래 설계, 공통 OPENAI_MODEL 설정, Mock 전용 CLI와 보호된 수동 Live, 과거 평가와 현재 검증의 범위를 구분했다.
- `docs/evaluations/WBS-17-core-qa.md`, `docs/evaluations/WBS-17-mock-quality-summary.json`, 본 worklog: 실제 자동 검사 결과와 미평가/잔여 문제를 기록했다. 기존 WBS-25 JSON/샘플/사람 평가 및 WBS-16 승인 기록은 변경하지 않았다.

## 실제 검증 결과

- 환경: Windows PowerShell, Node 24.12.0/npm 11.6.2/ICU 77.1/tzdb 2025b. 실행 정책을 변경하지 않고 `npm.cmd` 사용.
- 원래 작업 트리 `npm.cmd test -- --maxWorkers=1`: **43개 파일, 1074/1074 PASS**, 종료 0(114.34초). 개인 CLI 파일이 수정된 상태에서도 고정 회귀 입력 분리 후 통과한다. 중간 전체 검사 1068/1068, 새 문서 검사 6/6, 골든/해시/페르소나 관련 91/91도 통과했다. 실패 무시/skip은 사용하지 않았다.
- 독립 골든 **30/30**(역법 8/일주 6/절입 4/타임존 4/태양시 4/시주 4), 20개 판단 규칙/중재/불확실성 및 100회 동일 해시 검사를 포함한다. 기존 출처/오차/사용자 승인 범위를 유지하며 새 수동 검토를 주장하지 않는다.
- `npm.cmd run test:e2e:core-qa`: **exit 0, 개발 22/22 + production 차단 2/2 PASS**, 격리 production build/route typegen/tsc PASS. 320/390/768/1440px, 실제 로컬 POST, 오류/복사/인증/기본 Mock 및 명시 실행 UI를 검사했다. Live 응답/usage 화면은 가짜 브라우저 응답으로 확인하며 실제 OpenAI 요청 증빙이 아니다.
- `npm.cmd run check:docs`, `node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run lint`: **PASS**, lint 경고 0. 문서 링크는 이번 보고서 포함 **46개 문서/64개 링크/문제 0건**이며 로컬 파일만 검사한다.
- WBS CSV 재검사: ID 고유/선행 존재/필수 선행 순서 **PASS**, 필수 68건 + 별도 승인 선택 CI 1건(WBS-19). 읽기 전용 보조 명령의 최초 숫자 변환에서 `선택` 값 오류가 나와 선택 행을 분리한 후 재검사했다. CSV 자체는 변경하지 않았다.
- 개인 .env/입력을 제외한 임시 사본에서 실제 `npm run eval:persona` 실행: 현재 prompt 1.0.1, Mock **180/180 완료, 실패/문체 플래그 0**, 60/60 반복 그룹 동일. 비식별 집계만 새 WBS-17 산출물로 저장했다. 임시 의존성 junction을 먼저 해제하고 경로 검증 후 해당 사본만 정리했다.

## 판정과 제약

- 검사한 현재 구현 코어의 **관측된 P0 0건**. Mock 성공은 의미/자연스러움이나 실제 모델 품질 인증이 아니다. 사람 평가 **0/60**, 평균 null, **NOT_PERFORMED**. 각 문체는 대표 30개 중 도입문 28개가 반복돼 Mock 템플릿 한계도 남는다.
- 합성 합쇼체 프로필이 해요체 예시/표현을 상속하는 지시 불일치 **P1 잔여**, OUTPUT_REJECTED의 상세 원인 구분 **P2 잔여**를 명시했다. 승인된 프로필의 불변 버전을 임의 수정하거나 검사 기준을 완화하지 않았다.
- 추가 실제 OpenAI 호출 **0회 / LIVE_NOT_RUN**. 과거 사용자 보고 completed/문체 실패는 LIVE_FAILED 유지. 새 프롬프트·모델 설정의 실제 서술 품질 회귀는 미실행이다.
- WBS-26 이후, 명리 11개 기능 확장, P06/R02/R03, OAuth/DB/RLS/PG/배포 QA는 이번 완료 범위가 아니다. CI 구축·키/실제 장부 변경·실 PG·DB 상태 변경·제품명 확정 없음. WBS.csv TODO를 임의 일괄 변경하지 않았다.
- 사용자 수정 `next-env.d.ts`, `tests/fixtures/cli-input.json` 및 .env는 보존하고 PR에서 제외한다. 두 수정 파일의 최종 SHA256이 시작 시 기록한 값과 동일함을 확인했다. 기존 WBS-25 JSON/샘플, 독립 골든 JSON/승인표도 diff 없음.
- develop 대상 PR 한 건을 생성한 직후 중지한다. 다음 WBS를 시작하거나 자동 병합하지 않는다.

## PR #25 리뷰 수정 — 합쇼체 프로필의 해요체 예시 상속 제거

- 사용자 지적에 따라 QA-05 잔여 문제를 이번 PR에서 수정한다. PR #25 OPEN/develop 대상 확인 후 같은 브랜치에서만 진행하며 새 WBS/브랜치/PR은 만들지 않는다.
- 완료 조건: 해요체/합쇼체 각각의 register·선호 표현·긍정 예시가 일치하고, API/평가 코드가 같은 수정 합쇼체 프로필을 사용해야 한다. 합쇼체는 불변 버전 1.0.0을 덮어쓰지 않고 1.0.1로 구분한다.
- 정상 검사: 실제 조립된 developer 메시지와 Mock/가짜 Live transport에 선택 프로필/버전 전달, 실행 증빙 버전 일치. 오류/경계: 미승인 ID/과거 합쇼체 버전 거절, 두 문체 선택 시 계산 근거/analysisKey 불변 및 narrationKey 분리. 기존 기대값·검사기를 완화하지 않는다.
- 검증 계획: 신규 회귀 및 관련 API/Live/페르소나 평가 테스트, 전체 npm test, 타입/린트/문서 검사, 변경된 합쇼체의 브라우저 Mock 경로. 실제 API 호출/키/실제 장부 변경은 하지 않는다.
- 구현: `src/domain/persona/synthetic-formal.ts`에 해요체에서 파생하지 않는 합쇼체 프로필 1.0.1을 독립 정의했다. `src/server/api-test-catalog.ts`, `tests/evaluation/persona-fixtures.ts`가 공유한다. `src/server/api-test.ts`, `api-test-live.ts`는 승인 카탈로그의 버전을 선택/전달/기록해 기존 1.0.0 하드코딩을 제거했다. 해요체 프로필 1.0.0, 프롬프트/문체 검사 기준 및 코어 계산은 유지한다.
- 회귀: `tests/api-test-catalog.test.ts` 4건 추가, `tests/api-test.test.ts`의 Mock 요청/증빙 검증 1건 추가, `tests/live-narration.test.ts`의 가짜 HTTP 본문/메타 검증 및 `tests/persona-evaluation.test.ts`, `tests/e2e/api-test.spec.ts`의 선택 버전 기대값을 정정했다. QA 보고서에서 QA-05는 수정으로 전환하고 수정 전 JSON 집계는 기준 기록으로 보존했다.
- 최초 신규 회귀 4건 FAIL(선택 버전 조회 미구현)을 확인한 뒤 구현했다. `npm.cmd test -- tests/api-test-catalog.test.ts tests/api-test.test.ts tests/live-narration.test.ts tests/persona-evaluation.test.ts`: **4파일/76건 PASS**, 현재 합쇼체 1.0.1로 Mock **180/180 완료/실패·문체 플래그 0** 행렬 검사 포함.
- 원래 작업 트리 전체 `npm.cmd test -- --maxWorkers=1`: **44개 파일/1079건 PASS**, exit 0(127.39초). 타입 검사/lint/로컬 문서 검사도 PASS, 경고 0. 사용자 두 수정 파일 SHA256 동일, 과거 평가 JSON/독립 골든 기대값 diff 없음. 실제 OpenAI 요청 **0회 / LIVE_NOT_RUN**.
- 최종 `npm.cmd run test:e2e:api-test`: **exit 0, 개발 9/9 + production 차단 1/1 PASS**, 격리 production build/route typegen/tsc PASS. 실제 로컬 합쇼체 Mock 실행/partial 상태/최상위 및 결과 내부 personaVersion=1.0.1을 확인했다. 서버 키 빈 값/Live false 유지. 같은 PR #25를 업데이트하고 대기한다.

## PR #25 추가 리뷰 — 다중 페르소나 JSON 구조 일관성

- 사용자 요청: 합쇼체만 TS 파일로 분리하고 해요체를 API에 남긴 비일관성을 수정하고 향후 여러 페르소나 추가 구조를 고려한다. PR #25 OPEN 확인, 같은 기능 브랜치에서 리뷰 수정만 진행한다.
- 문서 11의 서버 관리 JSON/Zod/불변 버전 및 05의 열린 PR 수정 규칙을 따른다. 정상: 두 프로필 원문/버전을 유지한 JSON 이동, API/평가의 완전 동일 프로필, 세 번째 페르소나를 데이터/활성 목록만으로 추가. 오류/경계: 미승인/누락 버전/중복 활성 ID/위조 경로 거절, 과거 승인 버전 유지 및 명시 활성 버전만 선택, 10개 초과 목록/무자동호출/분석 불변을 먼저 테스트로 정의했다.
- 최초 회귀는 공통 카탈로그 부재 및 API/평가 해요체 메타 차이로 FAIL을 확인했다. 과거 평가용 해요체 fixture는 그대로 보존하고 현재 품질 평가는 런타임 승인 JSON을 사용하도록 통합한다.
- 변경: `src/infrastructure/persona/profiles/*.json`에 두 프로필을 같은 방식으로 배치하고 `synthetic-catalog.ts`에서 서버 승인 manifest/활성 버전을 명시했다. `src/domain/persona/catalog.ts`는 기존 Zod 승인 로더와 정확한 버전 선택을 재사용하며 승인 버전 보존과 ID당 활성 버전 1개를 지원한다. API 카탈로그의 프로필 본문/선택 로직 및 별도 합쇼체 TS 파일을 제거하고, 평가도 같은 카탈로그로 통합했다.
- `src/application/dev-api-test/index.ts`의 persona 목록 상한을 공통 카탈로그와 같은 50으로 맞췄다. `tests/persona-catalog.test.ts` 4건 및 API 12개 목록/0콜 검사를 추가하고 기존 API/평가 일치 검사를 두 문체 전체 비교로 강화했다. 사용자 프로필 업로드나 자동 파일 스캔 승인은 추가하지 않았다.
- 관련 5개 파일 **81건 PASS**. 기존 커밋의 두 프로필 객체와 새 JSON을 필드 전체 deepEqual로 비교해 동일함을 확인했다. 실행 중 프로필 버전은 해요체 1.0.0/합쇼체 1.0.1 유지. 현재 평가의 해요체 표시명/설명도 런타임과 일치시키며 과거 JSON/단위 fixture는 보존한다.
- 문서 11, 도메인 README, 새 infrastructure README 및 QA 보고서에 JSON 추가 → 서버 승인 등록 → 활성 버전 지정 → 회귀 검증 절차와 제품용/합성 승인 분리를 기록했다. DB/관리 UI/제품 캐릭터 구현 및 실 API 호출은 하지 않는다.
- 전체 `npm.cmd test -- --maxWorkers=1`: **45개 파일/1084건 PASS**, exit 0(118.40초). 현재 공통 JSON 프로필로 180건 Mock 행렬도 통과했다. `tsc --noEmit`/lint PASS, 경고 0. 최종 로컬 링크 검사 **47개 문서/73개 링크/문제 0건**.
- `npm.cmd run test:e2e:api-test`: **개발 9/9 + production 차단 1/1 PASS**, 격리 production build/route typegen/tsc PASS(exit 0). 정적 JSON을 실제 Next 개발/운영 빌드에 포함해 두 문체 선택/실행과 운영 차단을 확인했다. 키 빈 값/Live false이며 추가 실제 호출 **0회 / LIVE_NOT_RUN**.
- 최종 사용자 두 수정 파일 SHA256 동일, .env/실제 장부/과거 평가 산출물/독립 골든 변경 없음. 새 PR 없이 기존 #25에 커밋·푸시하고 설명을 갱신한 뒤 중지한다.

# WBS-26 — 운영 차단·개인정보·비용 QA

- PR #25 MERGED/develop, merge `43aae3e08cbb132b52dee9b476e7be3a7db9667d`(2026-10-23T12:33:07Z) 및 최종 리뷰 102346a의 origin/develop 포함 확인. 선행 WBS-25/#22 MERGED 및 반영도 확인했다. develop ff-only 갱신 후 직전 `feature/WBS-17-core-quality-qa`를 `git branch -d`로 삭제하고 `feature/WBS-26-security-cost-qa` 생성.
- AGENTS/05/WBS/02/06/08/21과 기존 접근·개인정보·예산 테스트를 확인했다. WBS-26은 실행순서 27, 선행 17/25이며 단일 범위다. [완료 조건/정상·오류·경계 계획](evaluations/WBS-26-security-cost-qa.md)을 구현 전에 정의했다.
- 사용자 수정 next-env.d.ts/CLI 입력/.env 및 실제 장부는 보존한다. 운영/CI·프록시 접근 차단을 통일하고 합성 키/Live 활성 운영 조건에서 실제 빌드·정적 파일·차단 응답을 검증한다. 외부 fetch는 QA 차단 장치로 막으며 실제 OpenAI 호출은 하지 않는다. 나머지 미완료 WBS/CI/PG/DB/제품 캐릭터 구현 없음.
- 선행 TDD: 계산 API 신규 환경/프록시 9건 중 8건에서 200→404 기대 불일치를 재현했다. `src/server/developer-access.ts`에 환경/호스트/프록시 게이트를 공통화하고 `src/server/{developer-analysis,api-test}.ts`, 계산 API route 및 validation page에 적용했다. 수정 후 기존/신규 관련 3파일 **74건 PASS**.
- `tests/security-cost-qa.test.ts`: 운영/CI/배포 차단은 키·Live flag가 있어도 본문/계산/공급자/장부 사용 전 거절한다. 가짜 HTTP로 입력 위조 차단, 전송/오류 응답/console 5종/장부의 원문·키 비노출, 알려진 usage 정산, 유효 쿠키 재시작 replay/신규 세션의 공유 일 한도, 미상 usage 예약 유지·무재시도를 확인했다.
- `scripts/deny-external-fetch.cjs`, `tests/security-harness.test.ts`: QA 전용 자식 Node fetch 차단/메타 없는 marker, 실제 loopback 허용 및 외부/오류 URL 차단 검증. CommonJS require 린트 오류를 동적 import로 수정했다. 타입 검사에서 두 테스트 행 배열의 union/Record 불일치를 정정했다. 규칙 비활성/실패 무시 없음.
- `scripts/developer-e2e.mjs`, `playwright.config.ts`, `package.json`, `tests/e2e/security-production.spec.ts`: `test:e2e:security`를 추가했다. 합성 키/Live=true production 빌드·유효 서명 쿠키/CSRF/동의 차단·공개 JS/HTML 비노출을 검사하며 외부 fetch marker 발생 시 실패한다. 최초 E2E는 Windows NODE_OPTIONS 역슬래시 경로 해석으로 서버 시작 전 실패했고, 구분자 정규화 후 공백 포함 경로 테스트 PASS. 해당 임시 사본은 runner의 경로 검증 후 정리했다.
- 신규 QA 관련 **27/27 PASS**, 원래 작업 트리 전체 `npm.cmd test -- --maxWorkers=1` **47파일/1101건 PASS**(104.48초). TypeScript PASS, lint 경고 0. 실제 키/환경/장부를 읽는 대신 Git metadata에서 환경/실제 장부 비추적 및 ignore 확인. 사용자 두 파일 SHA256도 시작 값과 동일했다.
- 변경 문서: README/06 체크리스트/본 worklog/전용 WBS-26 평가 기록. 무료 혜택·실 금액·다중 서버 한도·실계정/배포/향후 OAuth/RLS/PG/SSE QA 및 사람 품질 평가를 이번 통과로 대체하지 않는다. 실제 OpenAI 호출은 0회/LIVE_NOT_RUN이다.
- 보안 E2E 두 번째 실행은 개발 22건 PASS 후 외부 fetch marker로 실패했다. 설치된 Next의 getVersionInfo 고정 npm 조회 코드를 확인하고, 헤더/본문 없는 해당 GET만 오프라인 503으로 대체했다. 버전 조회를 실제 실행/최신 판정으로 표시하지 않으며 별도 marker로 집계한다. OpenAI URL·추가 쿼리·인증 헤더 요청은 계속 차단하는 음성 검사를 추가했다. 네트워크 허용이나 실패 무시는 하지 않았다.
- 이후에도 marker가 있어 원문 없는 분류 코드를 추가해 npm 조회임을 확인했다. 설치된 Next의 기본 agentUpgrade=security 외부 조회가 별도로 있어 `scripts/security-next-config.mjs`가 임시 사본에만 false를 적용하도록 했다. 원본 next.config.ts/잠금 파일은 유지한다. 임시 import wrapper의 TS 경로 해석 오류는 검토된 named export 앞에 QA 옵션만 추가하는 방식으로 수정했고 실제 Next 설정 로더로 기존 계산 패키지 설정 보존/비활성화 및 타입/lint를 재검증했다. 원본 설정 형식이 달라지면 명시 오류로 중단한다.
- 오프라인 QA helper 정정 전 전체 재실행도 **47개 파일/1101건 PASS (97.87초)**였고, 마지막 변경 helper의 별도 Node 계약 검사도 PASS다. 외부 Next 보안 권고/최신 버전 검사는 이번 완료 범위로 주장하지 않는다. 최종 보안 E2E 결과는 아래 기록한다.
- 최종 `npm.cmd run test:e2e:security`: **exit 0, 개발 22/22 + production 4/4 PASS**, 격리 production build/route typegen/tsc PASS. 합성 키/Live=true/유효 서명 쿠키/CSRF/동의를 주어도 페이지 2개와 개발자 API 모든 메서드는 404/no-store였다. 실제 공개 HTML 및 정적 JS/CSS/JSON/map에서 합성 비밀이 없음을 확인했다. 예상치 않은 외부 fetch 시도 **0회**, Next 버전 조회 오프라인 503 **1회** 집계.
- 최종 타입/lint PASS, lint 경고 0, 문서 **48개/76개 링크/문제 0건**, diff --check PASS. 원본 next.config.ts/lockfile/계산·페르소나/기존 평가 데이터 변경 없음. 다음 WBS-27은 시작하지 않는다.
- 작업 도중 AGENTS.md의 관련 테스트 우선 지침 변경을 발견했다. 전체 회귀는 이 변경 전에 실행했으며 이후는 수정 helper의 관련 계약/정적 검사와 E2E만 실행했다. 해당 사용자 변경과 기존 next-env.d.ts/CLI 수정은 보존·PR 제외한다. 두 기존 파일 SHA256은 시작 시와 동일했다. 실제 .env/키/장부 변경 및 OpenAI 요청 0회/LIVE_NOT_RUN 유지.

# 코드 리뷰 — 계산 엔진 코어 전반 (WBS 외 문서 작업)

- 사용자 요청: develop(`d0f7379`)의 계산 엔진 코어에 대한 개발팀장 관점 코드 리뷰를 PR로 제출. 코드 변경 없이 리뷰 문서만 추가한다.
- 산출물: `docs/reviews/2026-10-23_계산엔진_코어_코드리뷰.md` (P1 4건 / P2 6건 / P3 다수, 제안 WBS 분할안 포함).
- 기준선: `npm test` **47파일/1101건 PASS**, `npm run typecheck` PASS, `npm run lint` 경고 0, `npm run check:docs` 문제 0건.
- 측정(로컬, 리뷰 근거): 개발자 분석 1건 — 시각 있음 약 44 ms, 시각 미상 약 1.8 s, 요청당 `JudgmentEvaluationSchema` 파싱 15회. 측정 스크립트는 저장소에 남기지 않았다.
- 미실행: build/E2E(코드 변경 없음), 실제 OpenAI 호출(`LIVE_NOT_RUN`). 리팩터링 착수는 사용자 리뷰·WBS 확정 후.

## 2026-10-24 코드리뷰 리팩터링 A — 포맷·import 규칙

- PR #26 MERGED 및 origin/develop 포함 확인 후 develop을 cafbf27까지 fast-forward. 이전 기능 브랜치는 git branch -d로 안전 삭제. 리뷰는 docs/reviews의 계산엔진 리뷰이며 사용자 지시로 A~F를 순차 커밋하고 최종 PR 한 건을 만든다.
- A: Prettier 3.9.10 고정/lockfile, format/format:check, src·scripts·TS 테스트 포맷. 소스 import를 @/로 통일하고 domain→application/infrastructure/server 및 상대 import를 ESLint로 제한. 출력 계약·계산 규칙 변경 없음.
- 검증: tsc --noEmit PASS, lint PASS, 관련 CLI/정책 CLI/내보내기/페르소나 카탈로그 4파일 35건 PASS. 첫 샌드박스 실행 7건은 Windows uv_os_get_passwd ENOMEM으로 실패했고 동일 명령을 승인된 정상 프로세스에서 재실행해 통과했다. 실패 무시·skip 없음.
- AGENTS.md, next-env.d.ts, tests/fixtures/cli-input.json 사용자 수정은 보존/커밋 제외. .env 열람·변경 및 실제 API 호출 없음(LIVE_NOT_RUN).

## 2026-10-24 코드리뷰 리팩터링 B — 공통 계약과 조립

- domain/contracts·provenance·utilities에 상태/십성/해시/단계별 사유/고정 라이브러리·공용 Gregorian/JSON escape/오류 팩토리를 분리했다. 사유는 하위 단계 enum에서 합성하며 각 규칙의 독립 버전은 임의로 묶지 않는다.
- server/core-dependencies를 CLI·분석 route·API 테스트가 공유한다. infrastructure/io/bounded-utf8로 CLI/서버 본문 읽기를 통합했고 바이트 상한·엄격 UTF-8·스트림 취소를 검증했다.
- 음력 변환 예외/잘못된 반환값은 CalendarAdapterError로 분류한다. 정상 시간대 오류는 기존 TimeZoneAdapterError를 유지하며 원문/cause를 보관하지 않는다.
- 검증: 관련 8파일 388건 중 오류 분류 변경에 대한 기존 기대 1건 실패→CalendarAdapterError 검증으로 갱신. 해당 파일+신규 스트림 테스트 재검증 15건 PASS(기타 376건 기존 실행 PASS). tsc PASS, lint PASS. 실제 API 0회.

## 2026-10-24 코드리뷰 리팩터링 C — 경계 테스트 자산·호환 경로 정리

- day/solar 전용 SDK 어댑터는 tests/support/manseryeok로 이동하고 제품 barrel에서 제거. 기존 골든·오류 검증은 같은 테스트를 유지한다. 계약 DTO는 호환성을 위해 보존하고 향후 WBS-39/40에서의 검토 의도를 명시했다.
- CLI 명령 목록을 commands.ts에서 공유. calculate는 공개 fixed-clock 호환 명령으로 명시적으로 deprecated하며 신규 경로는 calculate-policy다. 기존 CLI 응답/실패 계약을 깨는 삭제는 하지 않았다. developer-analysis의 테스트 편의 재export 및 항상 덮어쓰던 NARRATION_META.model 제거.
- parseCoreExport/verifyCoreFingerprint는 WBS-54 저장 재검증 용도로 유지한다. developer-json Mock은 비교·호환 검증 경로이며 제품/R01 진입점으로 안내하지 않는다.
- 검증: 타입/린트 PASS, 이동한 SDK 경계·CLI·분석 API 관련 6파일 179건 PASS. 실제 API 호출 0회.

## 2026-10-24 코드리뷰 리팩터링 D — 구조 계약/의미 불변식 경계

- natal/judgment/arbitration/core-export/fingerprint/developer-response의 엔진 없는 schemas 모듈을 분리했다. 외부 의미 검증은 parseDerivedNatalFacts/parseJudgmentEvaluation/parseArbitrationResult/validateCoreExport/parseHashedCoreExport로 명시한다. serialize/parse/fingerprint/prompt는 validateCoreExport 경계를 사용한다.
- 내부 judgment 결과는 이미 생성한 값을 전달하고 중재기 출력 스키마가 resolve를 재실행하지 않는다. 검증된 불변 CoreExport는 브랜드 타입+WeakSet으로 동일 객체를 재사용한다. 순환적 정답 검증을 늘리지 않으며 외부 JSON은 다시 검증한다.
- 클라이언트 validation form은 구조 스키마만 import. use client ESLint 가드와 두 UI의 전이적 런타임 의존 그래프 테스트로 엔진/카탈로그/전송 유입을 차단한다. JSON.stringify 동등 비교 13곳을 키 정렬 기반 공용 비교로 바꿨다. 평가기 규칙 수는 실제 카탈로그 길이에서 검증한다.
- 기존 변조 거절 테스트를 의미 검증 함수로 옮겨 유지했다. 골든·해시·내보내기·API 등 9파일 295건 PASS. 정규화 비교/경계/정책/파생 service 추가 재검증 5파일 107건 PASS. 타입/린트 PASS. 외부 API 0회.

## 2026-10-24 코드리뷰 리팩터링 E — 미상 시각 계산 재사용

- 모든 1440 입력 분/거절/불가 구간을 보존한다. 고정 어댑터가 제공하는 요청 단위 scope에서 Temporal 전환표의 선형 구간과 절입·정책 날짜·시지 경계 안의 동일 SDK 투영만 재사용한다. 다른 어댑터나 resolve/calculate 래퍼는 스스로 opt-in하지 않으면 기존 전수 호출로 돌아간다.
- 공개 입력 경계의 검증 후 내부 parsed-input 경로를 사용하고 후보 구간 중간 파싱을 제거해 최종 후보 결과를 한 번 검증한다. 원본 출생시각 미상을 대표 관측 시각으로 바꾸지 않는다.
- 신규 17건: 14개 날짜/시간대/DST·태양시·경계 조합 및 음력 윤달의 비최적화 전수 결과와 완전 일치, 일반 날짜 실제 timezone resolve 1회/SDK projection 13회, 구간 내부 00:37 오류를 놓치지 않는 래퍼 fallback을 검증했다.
- 검증: 초기 관련 3파일 73건 PASS. 내부 재파싱 최적화 후 5파일 99건 중 실제 CLI 1건이 Windows 샌드박스 프로세스 제한으로 실패→해당 파일 정상 환경 재실행 14건 PASS(나머지 85건 PASS). 타입/린트 PASS.
- benchmark:core(합성 입력, 동일 코드/호스트): 전수 어댑터 692ms, scope 478/422/397ms. 초기 scope 구현의 757~805ms보다 개선. 시간은 환경 의존이며 호출 횟수와 전수 동등성 테스트를 회귀 기준으로 삼는다. 외부 API 0회.

## 2026-10-24 코드리뷰 리팩터링 F — 공급자·예산 경계 및 최종 검증

- 도메인 요청을 modelId/instructions/messages/output/maxOutputTokens 및 구조화 data/style로 변경. infrastructure/openai/request만 Responses body의 model/input/text/store/stream/max_output_tokens를 조립한다. 같은 공통 프롬프트·출력 스키마를 그대로 전송하고 store:false/stream:false·토큰 상한을 강제한다. 날짜 접미사 모델 매칭은 OpenAI 인프라로 이동하고 domain은 일반 ModelIdSchema를 사용한다.
- Mock은 developer 문자열 접두사·user JSON을 재파싱하지 않고 승인된 구조화 data/style을 읽는다. BudgetLedger/BudgetLease의 reserve→settle를 Memory/File이 공유하며 기존 release/finish는 호환 별칭으로 유지했다. Live는 가짜 microUSD 정책 없이 공통 토큰 견적을 사용한다. 실제 usage 미확인 시 전체 예약 유지, 오류/재시작/멱등 안전 계약은 기존과 같다. 공급자 응답도 공통 bounded UTF-8 reader를 사용한다.
- 검증: 관련 11파일 187건 및 신규 공급자 경계 2건 PASS. 타입·린트(경고 0)·포맷 PASS. 문서 50파일/79링크/0오류. 격리 QA 개발 E2E 22/22, 운영 E2E 4/4, 프로덕션 빌드·typegen·tsc PASS. 예상 외 외부 fetch 시도 0건(Next 버전 확인 1건은 기존 오프라인 stub). 실제 OpenAI 호출 0회/LIVE_NOT_RUN.
- A→B→C→D→E를 검증 후 각각 커밋하고 F를 마지막으로 커밋한다. 전체 npm test를 일괄 실행하지 않고 단계별 관련 테스트만 실행했다. 전체 범위·유지한 호환 API·성능 수치는 docs/evaluations/core-review-refactor.md에 기록했다.
- AGENTS.md, next-env.d.ts, 개인 cli-input.json은 사용자 변경 그대로 커밋에서 제외. .env 및 실제 .local 예산 파일을 읽거나 수정하지 않았다. CI·미래 WBS·DB·PG·라이브 API 실행 없음.

## 2026-10-24 WBS-27 — M01 원국 구조 진단

- 직전 PR #28 MERGED(develop, `aeb34aa`)와 origin/develop 포함, 직접 선행 WBS-12 PR #13(`84b0194`) 및 실행순서 선행 WBS-26 PR #26(`d0f7379`)의 MERGED/조상 관계를 확인했다. develop checkout/pull --ff-only 후 이전 `refactor/core-review-a-f`를 `git branch -d`로 안전 삭제하고 `feature/WBS-27-natal-structure` 한 개를 만들었다. WBS 실행순서 28의 WBS-27만 수행했다.
- AGENTS/WBS/02/05 및 상세설계 10을 읽고 완료 조건·정상/음성/경계/오류 검사를 `docs/evaluations/WBS-27-structure.md`에 먼저 정의했다. 최초 신규 테스트는 모듈 부재로 RED를 확인했다.
- 순수 M01에서 월령 분류, 동일 글자/동일 오행 통근, 위치별 장간 투출, 월령·뿌리·천간/장간 인비·설극을 함께 보는 강약 후보를 추가했다. 월령 격국/용신과 조후 후보의 목적을 구분하고 규칙/출처/관법/버전/입력 근거/예외와 미해결 관법 충돌을 보존한다. 개수/점수 기반 강약·보편적 용신 확정 없음.
- 기존 확정 facts와 계산을 재사용하는 application/structure 및 검토용 `diagnose-structure` CLI를 추가했다. core JSON/해시·페르소나/LLM 계약은 유지한다. M01 v1은 후보/미평가 한계를 보존하여 partial(불가 시 unavailable), CLI 종료 2로 반환한다. 사용자 UI·API·M02/미래 WBS는 구현하지 않았다.
- 제약: 두 관법은 명시한 운영화 정책이며 전문가 승인이 아니다. 합충/합화·장간 강도/격국 성패는 미평가. 조후 v1은 갑·인월 병/계 후보만 채택하고 다른 119조합은 규칙 미채택으로 명시한다. 원전 전사/색인 확인 범위도 카탈로그에 기록했다.
- 검증: 신규 3파일 83건 포함, 관련 도메인/중재/내보내기/해시/독립 골든/CLI **14파일 389건 PASS**. npx tsc --noEmit, lint(경고 0), 문서 링크 52파일/83링크/0오류, 변경 파일 LF 포맷, diff --check PASS. 중간 CLI 파싱 순서 오류 2건을 수정했고 샌드박스 ENOMEM 1건은 정상 환경에서 재실행해 통과했다. 전체 테스트는 자동 실행하지 않았다.
- 기본 format:check는 기존 CRLF 체크아웃과 LF 설정 차이로 실패했다. 이번 문서 포맷은 수정했고 기존 파일은 보존했다. index LF/working CRLF 확인 및 전체 `format:check -- --end-of-line auto` PASS. 기본 검사 실패를 숨기거나 설정을 변경하지 않았다. UI/웹 route 변경 없음으로 build/E2E 미실행, 실제 API 호출 0회/LIVE_NOT_RUN.
- 변경 파일: README.md, docs/evaluations/WBS-27-structure.md, docs/worklog.md, src/application/structure/index.ts, src/domain/judgment/structure/{schemas.ts,catalog.ts,index.ts,README.md}, src/cli/{commands.ts,run.ts,README.md}, tests/{structure.test.ts,structure-policy.test.ts,structure-service.test.ts}.
- AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 수정은 그대로 보존하고 커밋에서 제외했다. .env/.local 실제 예산 파일 열람·변경 없음. develop 대상 PR 한 건 생성 후 중지하며 다음 WBS로 진행하지 않는다.

## 2026-10-24 WBS-28 — M02 천간·지지 관계

- 직전이자 직접 선행 WBS-27 PR #29의 실제 MERGED(develop, `4540093174233c915579689dd40a4241be3391dd`)와 origin/develop 조상 관계를 확인했다. develop checkout/pull --ff-only 후 `feature/WBS-27-natal-structure`를 git branch -d로 안전 삭제하고 `feature/WBS-28-ganji-relations`를 만들었다. WBS.csv 실행순서 29의 WBS-28 한 건만 진행했다. 문서의 기존 TODO를 실제 미병합 증거로 사용하지 않았다.
- AGENTS/WBS/02/05/10을 읽고 완료 조건·양성/음성/경계/오류 검사를 docs/evaluations/WBS-28-relations.md에 먼저 정의했다. 모듈 부재로 초기 RED를 확인한 뒤 구현했다.
- 순수 M02에서 천간 오합/사충, 지지 육합/삼합/방합/충/형/자형/파/해의 출처별 버전 대응표를 추가했다. 형 pairwise/full-group과 천간충 미채택 정책을 구분한다. 미상 기둥·누락된 세 번째 글자·동일 참조 재사용으로 관계를 만들지 않는다. 입력 순서 독립 ID/정렬과 중복 방지, 다른 위치의 같은 글자 보존, 합/대립 공존 및 복수 합 상대의 미해결 검토 항목을 추가했다.
- 관계 존재는 confirmed로 기록하고 강도·합화·위치 인접성·해석 효과는 미평가로 분리한다. 오행 연관값은 실제 변환이 아니다. 출처 전사/검색 색인의 확인 범위와 파 대응의 육임 원전 맥락을 명시했으며 전문가 승인이나 사건·길흉 예측으로 표시하지 않는다. 입력은 비식별 source/context/position을 포함한 1~32개 기둥 참조이며 기간 계산·소유권 검증은 담당하지 않는다.
- application/relations와 diagnose-relations CLI는 기존 코어/M01을 1회 계산한 뒤 확정 natal만 사용한다. 기존 코어 JSON/해시·M01 판단/한계를 유지한다. 정상 출력도 효과 미평가로 partial/종료 2, 계산 불가면 relations:null과 기존 사유를 유지한다. 일반 사용자 API/UI·M03/M09·후속 WBS는 구현하지 않았다.
- 검증: 신규 161건 포함 **관련 18파일 550건 PASS**. npx tsc --noEmit, lint(경고 0), 변경 TS/모듈·CLI 문서 LF 포맷, 문서 링크 54파일/86링크/0오류, diff --check PASS. 초기 타입 오류 2건은 리터럴/콜백 타입을 명시해 수정했다. 실제 CLI는 알려진 샌드박스 tsx/uv_os_get_passwd 제한을 피하는 정상 프로세스에서 검증했다. 명령과 표의 독립 출처는 평가 문서에 기록했다.
- 전체 npm test/전체 format:check/build/E2E는 미실행(관련 테스트만 실행, UI/웹 route 변경 없음). 기존 CRLF 체크아웃은 보존했다. 실제 API 0회/LIVE_NOT_RUN, .env/.local 실제 예산 파일 열람·변경 없음. DB/PG/시크릿/CI 변경 없음.
- 변경 파일: README.md, docs/evaluations/WBS-28-relations.md, docs/worklog.md, src/application/relations/index.ts, src/domain/judgment/relations/{schemas.ts,catalog.ts,index.ts,README.md}, src/cli/{commands.ts,run.ts,README.md}, tests/{relations.test.ts,relations-tables.test.ts,relations-contract.test.ts,relations-service.test.ts}, tests/helpers/relation-input.ts.
- AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 수정은 보존하고 커밋에서 제외한다. develop 대상 PR 한 건 생성 후 중지한다. 해당 PR은 [기능 브랜치 PR 조회](https://github.com/zzz664/saju/pulls?q=head%3Afeature%2FWBS-28-ganji-relations)와 최종 보고의 직접 URL로 확인한다.

## 2026-10-24 WBS-29 — M03 주제별 판단 규칙

- 직전/선행 WBS-28 PR #30 MERGED(develop, `e7deb19f16c0af3ff72d18142308b7b16728c0a8`)와 origin/develop 반영, 선행 WBS-27 PR #29(`4540093`) 포함을 확인했다. develop checkout/pull --ff-only 후 이전 기능 브랜치를 git branch -d로 안전 삭제하고 `feature/WBS-29-topic-judgments`를 만들었다. 실행순서 30의 WBS-29 한 건만 수행했다.
- AGENTS/WBS/02/05/10을 읽고 docs/evaluations/WBS-29-topics.md에 완료 조건·정상/음성/경계/오류 검사를 먼저 정의했다. 모듈 부재 RED를 확인한 뒤 구현했다.
- M03에 temperament/strengths/career/wealth/romance/social 6팩×3규칙을 추가했다. 서로 다른 십성군 또는 일지 관계+월지의 복합 관측으로 주제 검토 후보를 만들고, 구조 불확실성/관련 관계 공존을 우선 검토해 낮은 후보를 삭제하지 않고 보류한다. rule/source/version/priority·실제 근거 경로와 값·예외·상호 충돌 ID를 보존한다. 단일 십성·개수·성별별 고정관념으로 성향/능력/직업/재물/관계 결과를 확정하지 않는다.
- 주제 문구와 결합 조건은 제한적 운영 정책이다. 삼명통회 권5 분류/복합 맥락·권2 관계 표지의 원문 대조는 현대 심리·적성 예측이나 명리 전문가 승인이 아니다. 원전의 성별 역할·숙명적 사건 단정은 제외했다. 미성립은 반대 성향/능력 부족을 뜻하지 않는다.
- M03 경계에서 동일 원국/M01/네 natal 위치 M02를 검증한다. parseStructureDiagnosis/parseRelationAnalysis를 추가해 외부 JSON 변조를 거절하고 내부 불변 결과는 WeakMap/WeakSet으로 재사용한다. application/structure·relations의 기존 Zod 검증 후 자식 참조 동일성을 보존해 코어/모듈을 중복 산출하지 않는다. 기존 M01/M02 계산 규칙/버전·값은 유지했다.
- application/topics와 `diagnose-topic <topic>` CLI를 추가했다. 원국/M01/M02 1회 산출과 기존 코어 JSON/해시·불가 사유를 유지한다. 선택 주제만 평가하며 정상 후보/보류도 partial/종료 2다. 잘못된 주제는 stdin/어댑터 호출 전에 거절한다. M09/F01~F11·사용자 UI/API·서술·기간/궁합 계산은 구현하지 않았다.
- 검증: 신규 34건 포함 **관련 21파일 584건 PASS**. 타입(tsc --noEmit), lint(경고 0), 변경 파일 LF 포맷, 문서 링크 56파일/89링크/0오류, diff --check PASS. 중간 참조 순서 불일치 1건은 ID 정렬로 수정해 재검증했다. CLI는 알려진 Windows 샌드박스 tsx 제한을 피하는 정상 환경에서 검증했다. 상세 명령/한계는 평가 문서에 기록했다.
- 전체 테스트/전체 format:check/build/E2E는 미실행(관련 검사만 수행, UI/웹 route 변경 없음). 기존 CRLF 체크아웃 보존. 실제 API 0회/LIVE_NOT_RUN, .env/.local 실제 예산 파일 열람·변경 없음. DB/PG/시크릿/CI 변경 없음. 후보/보류와 전문가 미승인·M01/M02 미평가 한계를 완료 검증과 구분한다.
- 변경 파일: README.md, docs/evaluations/WBS-29-topics.md, docs/worklog.md, src/domain/judgment/topics/{schemas.ts,catalog.ts,context.ts,index.ts,README.md}, src/domain/judgment/{structure,relations}/index.ts, src/application/{topics,structure,relations}/index.ts, src/cli/{commands.ts,main.ts,run.ts,README.md}, tests/helpers/topic-context.ts, tests/{topics.test.ts,topics-policy.test.ts,topics-service.test.ts}.
- AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 수정은 보존·커밋 제외한다. develop PR 한 건 생성 후 중지한다. PR은 [기능 브랜치 PR 조회](https://github.com/zzz664/saju/pulls?q=head%3Afeature%2FWBS-29-topic-judgments)와 최종 보고의 직접 URL로 확인한다.

## 2026-10-24 WBS-30 — M09 기능 조합·공통 API 계약

- 직전/선행 WBS-29 PR #31 MERGED(develop, `66f1f4c4f289db6bc4cd95d637614e3eee4f0c26`) 및 직접 선행 WBS-13 PR #14(`df6c7c6e4d3243f21d907d6c87639892f9104187`)의 origin/develop 포함을 확인했다. develop checkout/pull --ff-only 후 이전 기능 브랜치를 git branch -d로 안전 삭제하고 `feature/WBS-30-feature-orchestration` 한 개를 만들었다. 실행순서 31의 WBS-30만 수행했다.
- AGENTS/WBS/02/05/10과 관련 API 계약을 읽고 docs/evaluations/WBS-30-features.md에 완료 조건·정상/오류/경계 검사를 먼저 정의했다. 신규 테스트의 모듈 부재 RED를 확인한 뒤 구현했다.
- 공통 FeatureRequest/FeatureResult/NarrationInput Zod DTO, F01~F11 프로파일/전이 의존성 레지스트리와 FeatureEngine 서비스 포트를 추가했다. F08~F10 대상/날짜·시간대, F10 monthly/daily/today, F11 상대 입력·독립 정책을 구분한다. 현재 시각을 추정하지 않는다.
- 코어 요청당 1회(F11 A/B 각 1회), 모듈/사람/주제별 재사용과 F01의 F02~F07 조합을 구현했다. 기존 M01~M03을 재사용하고 필요한 M04~M08·기능 실행기 미구현은 partial/unavailable로 보존한다. 후속 명리 규칙/11개 풀이를 구현 완료로 표시하지 않는다.
- 기능 실행기는 알려진 근거 ID만 선택한다. M01 관법 충돌과 M03 미확정 후보는 확정 서술에서 제외하며 검증된 불변 결과만 서술 투영에 사용한다. 기존 코어/해시는 유지하고 실제 버전·대상·상대·선택 근거를 반영한 결정적 비식별 캐시 키를 생성한다. `feature-json` CLI를 추가했으며 새 공개 HTTP/제품 P06 경로는 연결하지 않았다.
- 검증: 신규 4파일 53건 포함 **관련 25파일 637건 PASS**, 변수 정리 후 계약 16건 재검증 PASS. tsc --noEmit, lint(경고 0), 변경 TS/모듈·CLI 문서 LF 포맷, 문서 58파일/92링크/0오류 PASS. 타입 2개 매개변수와 미사용 테스트 변수/포맷 문제를 수정해 재검증했다. 실제 CLI는 기존 Windows 샌드박스 프로세스 제한을 피하는 정상 환경에서 실행했다. 상세 범위/제약은 평가 문서에 기록했다.
- 전체 테스트/전체 format:check/build/E2E 미실행(관련 검사만 실행, UI/웹 route 변경 없음). 기존 CRLF 체크아웃 보존. 실제 API 0회/LIVE_NOT_RUN. .env/.local 실제 예산 파일 열람·변경, DB/PG/시크릿/CI 변경 없음. Mock complete는 조합 검증이며 후속 기능 완료가 아니다.
- 변경 파일: README.md, docs/evaluations/WBS-30-features.md, docs/worklog.md, src/domain/features/schemas.ts, src/schemas/features.ts, src/application/saju/features/{index.ts,ports.ts,registry.ts,README.md}, src/cli/{commands.ts,run.ts,README.md}, tests/helpers/feature-input.ts, tests/{features.test.ts,features-contract.test.ts,features-orchestration.test.ts,features-cli.test.ts}.
- AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 변경은 그대로 보존·커밋 제외한다. develop 대상 PR 한 건 생성 후 즉시 중지한다. PR은 [기능 브랜치 PR 조회](https://github.com/zzz664/saju/pulls?q=head%3Afeature%2FWBS-30-feature-orchestration)와 최종 보고의 직접 URL로 확인한다.

## 2026-10-24 WBS-31 — F03 강점·약점과 개발자 GPT 풀이 경로

- 직전/직접 선행 WBS-30 PR #32의 develop MERGED(`72b231e93feb742f3d1a040ae0c19c1df3d97d2c`)와 origin/develop 조상 관계를 확인했다. develop checkout/pull --ff-only 후 `feature/WBS-30-feature-orchestration`을 git branch -d로 안전 삭제하고 `feature/WBS-31-strengths-narration` 한 개를 만들었다. 실행순서 32의 WBS-31 및 사용자가 명시한 GPT 테스트 경로 연결만 수행했다.
- AGENTS/WBS/02/05/10·11/12/21과 관련 비용/서버 인수 기준을 읽고 docs/evaluations/WBS-31-strengths.md에 완료 조건·정상/오류/경계 테스트를 먼저 정의했다. OpenAI Docs 스킬과 공식 Structured Outputs 문서를 확인했다. helper 호출 오류를 먼저 수정한 뒤 미등록 F03의 RED를 확인했고 구현했다.
- 기존 검증 facts·M01/M03을 재사용하는 F03 실행기를 등록했다. 겉글자/지장간 오행을 별도 집계하고 인성+식상, 관살+인성의 복합 관측으로 강점 활용·보완점 점검 질문을 제공한다. 출처/정책·규칙/프로파일·투영 버전·실제 evidence 경로/값·미상 예외/한계를 추적한다. 개수/단일 십성/성별로 실제 성향·능력·약점을 확정하지 않는다.
- 기존 M03 후보/보류와 M01의 충돌은 그대로 보존하며 확정 서술에서 제외한다. f03.observation의 confirmed는 관측 사실만 뜻한다. 기본 정상 F03도 상위 해석 한계로 partial, 원국 불가면 unavailable이다. 기존 M03 엔진/코어 JSON·해시는 유지하고 다른 Fxx를 활성화하지 않았다.
- 기존 R01을 공통 데이터 조립기로 확장해 검증된 불변 FeatureResult→비식별 관측→공통 프롬프트/승인형 페르소나→Mock/Live Provider→featureId/근거 ID/문체 검증을 공유한다. 기능/분석/모델/페르소나/목차별 캐시를 분리했다. 별도 축약 프롬프트·테스트 계산기·제품 P06/SSE·DB/PG/CI는 추가하지 않았다.
- `/dev/api-test`의 서버 제공 기능 선택지에 F03을 추가했다. 가상 사례/합성 문체 선택 후 명시 실행하며, 판단의 partial/unavailable 상태도 표시한다. 기존 잠금/로컬 환경/Origin/CSRF/비용 동의/예산/멱등/소유 세션 조회와 서버 OPENAI_MODEL을 유지한다. 미준비 Fxx/스트림/질문은 계속 차단한다. 사용법은 src/app/dev/api-test/README.md에 기록했다.
- 검증: 관련 **28파일 420건 PASS** 후 분포만 있는 Mock 문단 중복 경계를 추가해 **3파일 66건 재검증 PASS**(새 회귀 1건 포함). 결과적으로 관련 고유 검증은 421건이며 전체 테스트 일괄 실행은 하지 않았다. 실제 CLI는 기존 Windows 샌드박스 프로세스 제한을 피하는 정상 환경에서 실행했다. ID 타입 추론 오류는 리터럴 타입으로 수정했고 실패 무시/skip 없음.
- 격리 `npm run test:e2e:security`: 개발 브라우저 **23/23**, 운영 환경 차단 **4/4**, production build/typegen/tsc PASS. 외부 fetch 시도 0건, Next 버전 확인 1건은 오프라인 stub. 이후 Mock 문단 보강은 위 단위/서버 66건으로 재검증했다. 최종 tsc --noEmit, lint(경고 0), 변경 TS/README LF 포맷, 문서 링크 60파일/98링크/0오류 PASS. diff 공백 검사도 확인한다.
- 실제 API 호출 **0회/LIVE_NOT_RUN**. 가짜 Responses 전송의 모델/usage/동의/예산/멱등 검증은 실호출 증거가 아니다. 실제 GPT 문장·의미/자연스러움은 사용자가 Live를 명시 실행한 뒤 검토한다. .env/실제 .local 예산 장부는 열람·변경하지 않았다. 기존 CRLF 파일 전체 재포맷 없음.
- 변경 파일: README.md, docs/{21_실제_OpenAI_API_테스트_설계.md,evaluations/WBS-31-strengths.md,worklog.md}, src/domain/features/{strengths.ts,README.md}, src/domain/persona/{data.ts,index.ts,narration.ts}, src/domain/narration/index.ts, src/application/saju/features/{index.ts,registry.ts,profiles/strengths.ts,README.md}, src/application/{narration/persona.ts,dev-api-test/index.ts}, src/server/api-test{,-catalog,-live}.ts, src/infrastructure/llm/persona-mock.ts, src/app/dev/api-test/{test-form.tsx,README.md}, src/cli/README.md, tests/{strengths,strengths-narration,api-test,live-narration,features,features-orchestration,features-cli}.test.ts, tests/helpers/openai-wire.ts, tests/e2e/api-test.spec.ts.
- AGENTS.md/next-env.d.ts/개인 cli-input.json 사용자 수정은 보존·커밋 제외한다. next-env/입력 fixture 해시는 작업 전과 같다. develop PR 한 건 생성 후 즉시 중지한다. PR은 [기능 브랜치 PR 조회](https://github.com/zzz664/saju/pulls?q=head%3Afeature%2FWBS-31-strengths-narration)와 최종 보고의 직접 URL로 확인한다.

## 2026-10-24 WBS-32 — F02 성격·기질

- 직전/선행 WBS-31 PR #33의 실제 develop MERGED(`8675d23d99afaa8cce3d742f6e092872292d1405`)와 origin/develop 포함을 확인했다. develop checkout/pull --ff-only 후 이전 feature/WBS-31-strengths-narration을 git branch -d로 안전 삭제하고 feature/WBS-32-temperament 한 개를 만들었다. WBS.csv 실행순서 33의 WBS-32만 수행했다.
- AGENTS/WBS/02/05/10을 읽고 docs/evaluations/WBS-32-temperament.md에 완료 조건·정상/오류/경계 검사를 먼저 정의했다. F02 미등록 RED를 확인한 뒤 구현했다.
- 순수 F02에 일간·오행/월지·본기·십성 배경과 M03이 채택한 인성+식상, 비겁+관살의 복합 관측을 추가했다. 경험 대조용 기질 점검 방향과 실제 evidence·출처·정책·버전·미상 예외를 기록한다. 단일 기호/개수/성별로 성격·능력·정신건강을 확정하지 않는다. confirmed는 관측 사실만 뜻하며 M03 후보/보류와 M01/M02 불확실성은 보존한다.
- F02 실행기를 서버의 F02/F03 등록 표에 추가하고 F02 프로파일/M03 temperament 투영 v1.1.0, F02 규칙/실행기 v1.0.0을 추적한다. 정상 F02도 partial, 코어/필수 모듈 불가는 unavailable이다. F01에서 코어·M01/M02를 재사용하며 기존 F03 규칙·코어 JSON/해시를 유지한다. 다른 기능은 활성화하지 않았다.
- feature-json F02와 공통 FeatureResult→NarrationInput/Mock 소비자 계약을 검증했다. 후보/보류를 확정 서술에 넣지 않고 계산 변경·외부 JSON 복사본 투영을 차단한다. 신규 HTTP/UI/R01 Provider 연결은 포함하지 않는다. 기존 /dev/api-test는 core-base/F03을 유지하며 F02를 계속 거절한다.
- 검증: 신규 **3파일 19건** 포함 **관련 24파일 321건 PASS**. 타입(tsc --noEmit), lint(경고 0), 변경 TS/README LF 포맷, 문서 링크 62파일/102링크/0오류, diff 공백 검사 확인. 초기 월주 참조 타입/실행 오류와 테스트의 잘못된 계자 간지를 수정해 재검증했다. CLI는 기존 Windows 샌드박스 프로세스 제약을 피하는 정상 환경에서 실행했다. 상세 명령/독립 기대/제약은 평가 문서에 기록했다.
- 전체 테스트/전체 format:check/build/E2E는 미실행(관련 검사만 실행, UI/HTTP/전송 변경 없음). 실제 API 호출 0회/LIVE_NOT_RUN, .env/실제 .local 예산 장부 열람·변경 없음. P06/SSE·DB/PG·시크릿·CI 변경 없음. 기존 CRLF 파일은 전체 재포맷하지 않았다.
- 변경 파일: README.md, docs/{evaluations/WBS-32-temperament.md,worklog.md}, src/domain/features/{temperament.ts,temperament.md,README.md}, src/application/saju/features/{index.ts,registry.ts,profiles/temperament.ts,README.md}, src/cli/README.md, tests/{temperament,temperament-service,temperament-cli,features,features-orchestration,strengths}.test.ts. 사용자 수정 AGENTS.md/next-env.d.ts/개인 cli-input.json은 보존·커밋 제외한다.
- develop 대상 PR 한 건 생성 후 중지한다. PR은 [기능 브랜치 PR 조회](https://github.com/zzz664/saju/pulls?q=head%3Afeature%2FWBS-32-temperament)와 최종 보고의 직접 URL로 확인한다.

## 2026-10-24 WBS-33 — F04 직업 적성·업무 성향

- 직전/선행 WBS-32 PR #34의 develop MERGED(`43fe91f36fd7c9c8aa900836d5856dabb5de87b0`)와 origin/develop 포함을 확인했다. develop checkout/pull --ff-only 후 이전 feature/WBS-32-temperament를 git branch -d로 안전 삭제하고 feature/WBS-33-career 한 개를 만들었다. 실행순서 34의 WBS-33만 수행했다.
- AGENTS/WBS/02/05/10을 읽고 docs/evaluations/WBS-33-career.md에 완료 조건·정상/오류/경계 테스트를 먼저 정의했다. F04 미등록 RED를 확인한 뒤 구현했다.
- 순수 F04에서 일간·월지 배경과 기존 M03 career의 관살+인성/식상+재성 복합 관측을 재사용한다. 실제 경험·교육·업무 조건에 대조할 점검 방향과 evidence 경로/값·출처·정책·버전·미상 예외를 기록한다. 단일 기호/개수/성별로 특정 직업·적성·능력·채용/승진/소득을 확정하지 않으며 점수/추천 목록을 생성하지 않는다.
- F04 규칙/실행기 v1.0.0, 프로파일/M03 career 투영 v1.1.0을 등록했다. confirmed는 기호 관측에만 적용하고 M03 후보/보류·M01 관법 충돌·M02 검토는 보존한다. 정상 F04도 partial, 코어/필수 모듈 불가는 unavailable이다. F01에서 같은 코어·M01/M02를 재사용하며 기존 F02/F03·코어 JSON/해시는 유지한다. F05 이후 기능은 활성화하지 않았다.
- feature-json F04와 공통 FeatureResult→NarrationInput/Mock 소비자 계약을 검증했다. 실제 R01/Provider·새 HTTP/UI 연결은 추가하지 않았고 /dev/api-test의 core-base/F03 경로를 유지한다. 미확정 후보를 확정 서술에 전달하거나 외부 JSON·임의 점수로 신뢰 경계를 우회할 수 없다.
- 검증: 신규 **3파일 21건** 포함 **관련 27파일 342건 PASS**. tsc --noEmit, lint(경고 0), 변경 TS/README LF 포맷, 문서 링크 64파일/106링크/0오류, diff 공백 검사 확인. '의사표현'을 직업명으로 잘못 잡는 테스트 정규식을 수정해 재검증했다. CLI는 기존 Windows 샌드박스 프로세스 제약을 피하는 정상 환경에서 실행했다. 상세 명령·독립 기대값·제약은 평가 문서에 기록했다.
- 전체 테스트/전체 format:check/build/E2E 미실행(관련 검사만 수행, UI/HTTP/전송 변경 없음). 실제 API 0회/LIVE_NOT_RUN, .env/실제 .local 장부 열람·변경 없음. P06/SSE·DB/PG·시크릿·CI 변경 없음. 기존 CRLF 파일 전체 재포맷 없음.
- 변경 파일: README.md, docs/{evaluations/WBS-33-career.md,worklog.md}, src/domain/features/{career.ts,career.md,README.md}, src/application/saju/features/{index.ts,registry.ts,profiles/career.ts,README.md}, src/cli/README.md, tests/{career,career-service,career-cli,features,features-orchestration,strengths,temperament-service}.test.ts. 사용자 수정 AGENTS.md/next-env.d.ts/개인 cli-input.json은 보존·커밋 제외한다.
- develop 대상 PR 한 건 생성 후 즉시 중지한다. PR은 [기능 브랜치 PR 조회](https://github.com/zzz664/saju/pulls?q=head%3Afeature%2FWBS-33-career)와 최종 보고의 직접 URL로 확인한다.

# 2026-10-24 — 해석 층 재설계 (WBS-69·70 구현, WBS-71 정의) · 브랜치 `claude/fervent-newton-z75xzm`

## 배경과 결정

- develop `8675d23`(WBS-33 머지) 진단: M03 판정이 전부 `partial/deferred`로 LLM에 도달하지 않아 F03 이후 기능이 "오행 개수표 + 점검 질문"만 남았고, 서술 검증기는 Mock에 과적합되어 실제 호출 1회가 실패했으며 모든 거절이 `OUTPUT_REJECTED` 하나로 뭉개져 있었다. 사용자 승인으로 기존 R01 경로를 **교체**하고 해석 카탈로그·서술 계획 층을 신설했다. 결정 메모: `docs/decisions/2026-10-24_해석층_재설계_결정.md`.
- 목표 재정의: "환각 없음"이 아니라 **근거 추적(모든 해석 문장 → 원전 구절)·일관성(planKey)·금지 주장 차단(거절 사유 코드)·정직한 미감수 표시**를 공학적으로 보장한다.

## 변경

- 신규 `src/domain/interpretation/{schemas,index}.ts`: 조건 키(일간×월지·일간·십성군·십성군 쌍) → 퍼블릭 도메인 원전 구절 + AI 요약 조회. `usable`은 원문 수집·요약·함의 검사 PASS·digest 일치일 때만. `src/infrastructure/interpretation/{scaffold,catalog}.ts` + `data/{passages,summaries}.json`(141 슬롯, 현재 전부 `scaffold`).
- 신규 `scripts/interpretation/{lib,collect-passages,summarize-units}.mjs`: Wikisource 수집(LLM 없음)과 명시 Live 요약(요약 1회 + 독립 함의 검사 1회, `ENABLE_INTERPRETATION_SUMMARY=true`+키+`--confirm`+`--max`). 이 환경은 Wikisource가 프록시에서 차단되어 **수집을 실행하지 않았다**.
- 신규 `src/domain/narration/plan.ts`(캐릭터 무관 beat 계획, 별칭 E1…, 한계, `planKey`, `F03_PLAN_SPEC`), `render.ts`(페르소나 → 산문 스타일 가이드, R01 계약 2.0.0 + 예시 1건, 계획 고정 strict 스키마, 근거 검증 hard 9코드, 문체 soft 점수·문장 단위 높임법 70%), `codes.ts`(클라이언트 공유 enum), `prompt.ts`(공통 프롬프트 1.1.0, docs/12 동기화).
- 교체 `src/application/narration/{feature,experiment,index,evaluation}.ts`, `src/infrastructure/llm/plan-mock.ts`, `src/server/api-test{,-live,-catalog,-runtime}.ts`, `src/application/dev-api-test/index.ts`(F03만, verdict=`groundingPassed/styleScore`, `rejection{code,beatId}`, 기본 출력 상한 2,000), `src/app/dev/api-test/test-form.tsx`(말풍선 표시·거절 사유·문체 점수).
- 삭제 `domain/persona/{narration,data,prompt}.ts`, `application/narration/persona.ts`, `infrastructure/llm/{mock,persona-mock}.ts`, `FeatureNarrationSpec`, `core-base` 기능 ID, 관련 테스트 6개.
- 문서: `AGENTS.md`(원칙 수정), `02`·`10`(IK/NP 모듈·디렉터리·착수 순서)·`11`(v2.6 변경 고지)·`12`(v1.1.0)·`20`(beat 단위 R02 입력)·`05`(E-2 절), 신규 `22_Codex_해석층_작업지시.md`, `WBS.csv`(WBS-69/70 DONE, 71 TODO, 32~35 재정의), README·모듈 README 4개, `docs/evaluations/narration-plan-mock-*`.

## 검증

- `npm test`: **67개 파일 / 1,416건 PASS**(신규 interpretation 4·scripts 3·plan 4·render 6·feature-narration 6·evaluation 3, 수정 live-narration 39·api-test 16·security 7·experiment-guard 등). `npm run typecheck`·`npm run lint`(경고 0)·`npm run format:check`·`npm run check:docs`(64 문서/106 링크/문제 0) PASS. 클라이언트 경계 테스트: `test-form.tsx` import 그래프에 엔진/전송 없음.
- `npm run eval:persona`(Mock): 30 사례 × 2 문체 × 3회 = **180/180 근거 검증 통과, 거절 0, 문체 플래그 0**. 이는 배선 검증이며 품질 기준선이 아니다(Mock 도입문 반복 88회는 템플릿 한계로 기록).
- 실제 OpenAI 호출 **0회 / LIVE_NOT_RUN**. 해석 카탈로그 원문·요약 **미수집**. E2E(Playwright)·`npm run build`는 이 세션에서 실행하지 않았다(spec은 새 계약으로 갱신).

## 남은 것

- 사용자 환경: `collect-passages.mjs --dry-run`으로 locator 적중 확인 → 수집 → 승인 후 `summarize-units.mjs`. 절차는 `docs/22` D절.
- WBS-71 실측 보정 루프 18회 → 거절 코드 분포로 프롬프트/검증기 1회 조정. 그 전까지 Live 품질 주장 없음.
- F02·F04 서술 연결(spec 등록), F05·F06은 NP 패턴으로 재정의됨. 사람 품질 평가 미실시.

# 2026-10-24 — Wikisource 수집기 수정 (해석 카탈로그 채우기 후속) · 브랜치 `claude/fervent-newton-z75xzm`

## 배경

- 사용자 환경에서 `collect-passages.mjs --dry-run` 실행 시 141건 오류: 첫 건 `Wikisource response had no wikitext`, 나머지 `Wikisource 429`. 원인 두 가지. (1) `scaffold.ts`의 궁통보감 URL 제목 `窮通寶鑑`은 Wikisource에 없는 제목이라 `missingtitle` 응답을 받았다(실제 제목 `穷通宝鉴`, `src/domain/judgment/catalog.ts`의 기존 URL과 동일). (2) 수집기가 실패를 캐시하지 않아 141 슬롯마다 같은 페이지를 다시 요청해 rate limit에 걸렸다.

## 변경

- `scripts/interpretation/lib.mjs`: `createWikitextLoader`(페이지 제목당 요청 1회, 성공·실패 모두 캐시, 요청 사이 1.5초, 429는 `Retry-After` 따라 1회 재시도), `WikisourcePageError`(`MISSING_TITLE`·`RATE_LIMITED`·`NO_WIKITEXT`·`HTTP_<status>`), API URL에 `redirects=1`. `lib.d.mts` 선언 추가.
- `scripts/interpretation/collect-passages.mjs`: 로더 사용, 페이지 오류를 제목당 1줄로 출력하고 코드별 조치 힌트. 보고에 `httpRequests·pagesFailed·slotsWithoutPage` 추가, 페이지 오류가 있으면 exit 1.
- `src/infrastructure/interpretation/scaffold.ts`: 궁통보감 URL 제목 `穷通宝鉴`으로 수정. 조건 키·locator·ID는 변경 없음.
- `tests/interpretation-scripts.test.ts`: 로더 캐시·429 재시도·실패 코드 테스트 추가. `src/domain/interpretation/README.md`, `docs/22` D절에 오류 코드 대응 안내.

## 검증

- `npm test`: 73개 파일 / 1,457건 PASS. `npm run lint`(경고 0)·`npm run typecheck`·`npm run format:check`·`npm run check:docs` PASS.
- 이 환경은 Wikisource 접근이 차단되어 실수집은 실행하지 않았다. 사용자 환경에서 `--dry-run` 재실행이 필요하다.

### 후속 — 141건 전부 `missing` (페이지는 열림, locator 0건 매칭)

- 원인 후보: 궁통보감 본문은 "正月甲木，…"이 소제목이 아니라 단락 첫 구절이고, 적천수 `甲木`도 天干論 단락 첫 글자다. 삼명통회 권5는 하위 페이지/ProofreadPage 전사일 가능성이 있어 원시 wikitext에 본문이 없을 수 있다. 조합 locator `論印綬·論食神`은 애초에 어떤 소제목과도 일치할 수 없었다. 이 환경은 Wikisource 차단으로 실제 본문을 확인하지 못했다.
- 수정: API `prop=wikitext|text`, `variant=zh-hant`로 렌더링 본문도 받아 `htmlToText`로 정규화(소제목 `== ==`·단락 1줄). `extractFromPage`는 렌더링 본문 → wikitext 순, 각각 소제목(정확/접두 일치, `甲木`이 `三春甲木` 장 제목을 잡지 않도록 `includes` 제거) → locator로 시작하는 단락 순으로 찾는다. `·` locator는 부분을 모두 찾아 이어 붙인다. `--inspect`(페이지별 소제목 목록·본문 앞부분·전사 여부)·`--dump <dir>`(정규화 본문 저장, `tmp/` gitignore) 추가.
- 검증: `tests/interpretation-scripts.test.ts` 6건(단락 폴백·조합 locator·HTML 정규화 추가) PASS, lint·typecheck PASS. 실수집은 사용자 환경에서 `--dry-run --inspect` 재실행으로 확인한다.

### 후속 2 — `--inspect` 실측(111 수집 / 30 missing) 반영

- 실측: 궁통보감·적천수·삼명통회 권5 모두 열림. missing 30 = 궁통보감 월 20건(五月甲木, 十二月乙木, 丁火 5, 戊土 4, 己土 9)·삼명통회 10건(論印綬·論食神·論正財·論比肩과 조합 6). 권5의 소제목은 論正官·論偏官 계열만 있어 나머지 십성 논은 다른 권에 있다.
- 수정: (1) 월 locator는 "五六月甲木"·"十一、十二月戊土"·"四五六月己土"처럼 묶어 쓴 단락에도 맞도록 `monthLocator`/`monthsInPrefix` 추가. (2) 렌더링 본문의 `</p>`를 빈 줄로 바꾸고, 단락은 빈 줄·소제목·같은 일간의 다음 달 단락에서 끊는다(이전엔 다음 소제목까지 이어져 한 달 구절에 다른 달 본문이 섞일 수 있었다). (3) `三命通會/卷N`에서 locator가 없으면 이웃 권(六·四·七·三)을 차례로 찾고, `·` 조합은 부분마다 따로 찾는다. 다른 권에서 찾으면 `passages.json`에 `url`을 기록하고 `moved`로 알리며 카탈로그 합성이 그 url을 쓴다(`PassagesFileSchema.url` 선택 필드). (4) `--inspect`가 missing locator마다 `near` 후보 줄을 출력.
- 검증: `tests/interpretation-scripts.test.ts` 7건·`tests/interpretation.test.ts` 5건 PASS, lint·typecheck·check:docs PASS. 실수집은 사용자 환경에서 재실행한다.

### 후속 3 — 2차 실측(118 수집 / 23 missing / 5 moved) 반영

- 실측: 論印綬·論食神·論正財는 `三命通會/卷六`에서 발견(`moved`). 論比肩은 卷三~卷七 어디에도 소제목이 없다. 궁통보감 잔여 19건은 `near` 후보에 월 단락이 전혀 보이지 않아, 己土처럼 계절 단위("三夏己土，…")로만 쓴 장이거나 월 표기가 다른 경우다.
- 수정: (1) 월 단락이 없으면 계절 소제목 절(三春/三夏/三秋/三冬+일간)에서 다른 달 블록을 뺀 나머지를 쓰고 `passages.json`에 `locator`를 기록(`adjusted`). (2) 월 블록이 뒤따르는 "或…" 보충 단락을 포함하도록 빈 줄에서 끊지 않고 다음 달 단락·소제목에서 끊는다. (3) locator `|` 대안(`論比肩|論劫財|論比劫`), 맞은 대안을 기록. (4) scaffold: 십성군별 권 지정(印綬·食神·正財 卷六, 正官 卷五), 조합 locator는 가족 locator에서 파생, 조합 url은 첫 가족의 권. (5) `PassagesFileSchema.locator` 선택 필드와 합성 반영. (6) `--inspect` 소제목 전체 출력(40개 상한 제거).
- 검증: `tests/interpretation-scripts.test.ts` 8건·`tests/interpretation.test.ts` 5건 PASS, lint·typecheck PASS. 실수집은 사용자 환경에서 재실행한다.

### 후속 4 — 네트워크 허용 후 직접 수집 완료 (141/141)

- 사용자가 세션 네트워크를 전체 허용으로 바꿔 이 세션에서 Wikisource를 직접 읽었다(Node `fetch`가 프록시를 무시해 `NODE_USE_ENV_PROXY=1` 필요). 본문을 보고 확정한 것: 궁통보감은 계절 절 안에서 "六月之丁"(원소 생략)·"十一二月嚴寒冰凍"(주어 생략)·"冬月之木"(계절 전체)·"正二月甲木"(공유 단락)을 쓰고 명식 예시표(`時日月年`+간지 두 줄)가 끼어 있다. 삼명통회에는 論比肩 장이 없고 卷六 `論建祿`이 월지 비견을 다룬다.
- 수정: 월 locator는 계절 절 안에서 축약형까지 읽고, 그 달을 이름으로 부른 단락 전부를 순서대로 이어 붙인다(이름 부른 단락이 없을 때만 계절형 단락). 예시표 줄 제거. peer locator `論比肩|論建祿`. 수집 결과 `collected 141 / missing 0 / adjusted 13`(계절 절 9 + 建祿 4). `passages.json` 141건 커밋: 길이 최소 65·중앙값 215·최대 4,000(상한 3건), `url` 보정 0건, `locator` 기록 13건.
- 검증: `tests/interpretation-scripts.test.ts` 9건·`tests/interpretation.test.ts` 5건(수집 완료 상태·digest·locator 기록 검사로 갱신) PASS, lint·typecheck·format·check:docs PASS. 요약 생성(`summarize-units.mjs`)은 사용자 승인·키가 있을 때만 실행하므로 미실행(LIVE_NOT_RUN).
