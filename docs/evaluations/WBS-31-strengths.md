# WBS-31 — F03 오행·십성 강점·약점과 개발자 서술 연결

## 구현 전 완료 조건과 테스트

- PR #32의 develop MERGED(`72b231e`)와 origin/develop 포함을 확인했다. develop fast-forward/이전 브랜치 안전 삭제 후 실행순서 32·선행 WBS-30을 충족한 WBS-31 한 건만 구현한다. 사용자가 추가 요청한 기존 GPT 테스트 경로 연결도 같은 PR에 포함한다.
- 기존 오행·십성·지장간 사실과 M01/M03 strengths 맥락을 재사용하는 F03 실행기를 등록한다. 분포/복합 관측을 강점 활용·주의점 점검과 연결하되 기호 개수로 강약/성격/능력을 확정하지 않는다. 근거·규칙/정책 버전·예외·한계를 보존한다.
- M03의 후보/보류를 확정으로 승격하지 않는다. 서술 가능한 근거는 관측 사실과 명시한 검토 범위뿐이다. 실제 강점·약점은 행동/경험 대조가 필요하다는 조건을 유지하며 M01/M03의 partial 한계를 숨기지 않는다.
- 정상/미상 시각/원국 불가, 패턴 있음/없음, 단일 십성/성별/개수 단정 차단, 근거 경로·원국 해시·결정성·변조/불변·F03 외 미활성화를 검사한다. 기존 M03 후보와 충돌은 계속 제외한다.
- 기존 R01 공통 프롬프트·승인 페르소나·출력 검증·Mock/Live Provider 경로를 F03으로 확장한다. 프롬프트에는 검증된 비식별 F03 관측만 전달한다. 기능별 캐시/출력 featureId와 근거 ID를 검증한다.
- 보호된 `/dev/api-test`에서 F03 선택과 가상 사례 실행/결과 조회를 지원한다. 잠금/Origin/CSRF/동의/환경/예산/멱등 게이트와 core-base 호환성을 검증한다. Live는 가짜 전송으로만 검사하고 실제 API 호출은 하지 않는다(LIVE_NOT_RUN).
- 신규/관련 단위·CLI·서버·브라우저 Mock 테스트, 타입/린트/변경 파일 포맷/문서 검사와 웹 빌드를 수행한다. 사용자 변경 AGENTS.md/next-env.d.ts/cli-input.json과 .env/.local 실제 장부를 보존한다. PR 한 건 생성 후 중지한다.

## 구현 결과와 한계

- 순수 observeStrengths는 겉글자/지장간 분포와 인성+식상·관살+인성의 복합 관측을 근거 경로/실제 값·출처·정책·버전으로 반환한다. 질문 정책은 학습·표현, 역할·지원 활용의 강점 점검과 준비/실행·역할 요구/학습 속도 조율의 보완점 점검이다. 단일 십성/개수/성별로 성향을 확정하지 않는다.
- 기존 M03 후보/보류를 그대로 보존하고 별도의 f03.observation만 확정 관측으로 서술한다. confirmed는 기호·개수 관측에만 적용하며 실제 능력/약점의 확정이 아니다. 기본 F03은 정상 원국도 M01/M03 한계 때문에 partial이다. 원국 불가면 unavailable이며 시주 미상은 추정하지 않는다. 개수/복합 기호가 없다는 것을 결함으로 해석하지 않는다.
- F03 실행기를 M09에 등록하고 F03 프로파일/M03 strengths 투영 v1.1.0과 F03 규칙/실행기 v1.0.0을 추적한다. 기존 M03 엔진 v1.0.0·코어 JSON/해시를 유지한다. F01의 일부 하위로 들어가도 다른 기능 미완료를 숨기지 않는다.
- 기존 R01 조립/승인형 JSON 페르소나·출력 검증·공급자를 공유한다. 검증된 FeatureResult 객체에서만 비식별 관측을 투영하고 대상 featureId·허용 ID·캐시를 분리한다. 외부 JSON/미확정 후보/임의 대상 기간·기능은 거절한다. 새 축약 프롬프트나 계산기를 만들지 않았다.
- 보호된 /dev/api-test의 F03 선택→가상 사례→Mock/명시 Live 실행→결과/상태 조회를 연결했다. Live는 기존 잠금·환경·Origin/CSRF·동의·예산·멱등을 유지한다. 서버 OPENAI_MODEL을 공통 사용하며 미구현 Fxx·SSE·질문은 계속 차단한다. 제품 P06/DB/PG/CI는 변경하지 않았다.
- 실제 API 호출은 **0회/LIVE_NOT_RUN**이다. 가짜 HTTP 테스트의 LIVE_PASS 필드 검사는 코드 경로 검증이며 실호출 성공 증거가 아니다. 실제 계정/키·모델 가용성·문장 의미/자연스러움 검토는 사용자가 설정 화면에서 실행한 뒤 확인한다.

## 검증

- 초기 테스트에서 fixture helper를 함수로 잘못 호출한 오류를 먼저 수정했다. 이후 F03 실행기 missing 기대 실패로 기능 부재 RED를 확인했다. API 선택지 ID의 타입 추론 오류도 리터럴로 수정했다. 실패 무시/skip은 사용하지 않았다.
- 관련 `npm test --` 대상 28파일 **420건 PASS**: strengths, strengths-narration, features, features-contract, features-orchestration, features-cli, topics, topics-policy, topics-service, structure, structure-policy, structure-service, relations, relations-service, core-export, core-export-service, core-fingerprint, independent-core-golden, cli, policy-cli, persona, persona-evaluation, persona-catalog, api-test, api-test-catalog, live-narration, narration, narration-boundary(각 `.test.ts`).
- 이후 관측이 분포 2개뿐일 때 Mock의 세 번째 섹션이 첫 문단과 중복되는 경계를 추가하고 섹션 목적을 앞에 표시하도록 보강했다. 해당 신규 1건을 포함한 strengths-narration/api-test/live-narration **3파일 66건 재검증 PASS**. 전체 테스트 일괄 실행은 하지 않았다. CLI 자식 프로세스는 기존 Windows 샌드박스 제약을 피하는 정상 환경에서 검증했다.
- `npm run test:e2e:security`: 격리된 개발 브라우저 **23/23 PASS**, 운영 **4/4 PASS**, production build/typegen/tsc PASS. .env/실제 장부를 복사하지 않고 합성 키·Live 차단/가짜 응답만 사용했다. 외부 fetch 시도 0건, Next 버전 확인 1건은 기존 오프라인 stub이다. 뒤이은 Mock 문단 보강은 위 단위·서버 테스트로 재검증했다.
- tsc --noEmit, lint(경고 0), 변경 TS/README LF Prettier, 문서 링크와 diff 공백 검사 결과를 worklog에 기록한다. 사용자 next-env.d.ts/cli-input.json의 SHA-256은 작업 전과 동일하게 유지한다. AGENTS.md 수정도 포함하지 않는다.
- 독립 기대값: 합성 기둥 임자/병인/갑진/경신에서 겉글자 목2·화1·토1·금2·수2, 장간 목2·화1·토3·금1·수3을 수동 열거했다. 인성/식상은 연간 편인·월간 식신, 관살은 시간 편관을 대조하며 모든 evidence 경로의 실제 값도 검증했다. 전문가 승인이나 성향 예측 정확도 검증으로 표시하지 않는다.
- API 구조 계약은 [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)를 확인했다. JSON 구조와 근거 ID 검사 통과는 의미상 충실도 보증이 아니며 수동 검토가 필요하다.
