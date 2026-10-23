# 개발 환경

현재 코어는 출생 입력·역법/시간 정책·기초 판단/중재·JSON/해시·개발자 검증 UI와 R01 개발자 Mock/Live 서술을 포함한다. 제품명은 미정이다. 전체 제품 구조는 설계 문서의 향후 기능과 구분한다.
WBS-03의 CLI·어댑터 포트 사용법과 현재 지원 범위는 [CLI 문서](src/cli/README.md)를 참고한다.
기능 개발 순서는 `docs/WBS.csv`의 `실행순서`와 실제 `develop` 병합 상태를 따른다.
OpenAI 실험 전 수동 점검은 [WBS-22 조직 설정 체크리스트](docs/checklists/WBS-22-openai-account-review.md)를 따른다. 계정/무료 혜택 점검과 실호출 증빙은 별도 상태로 관리한다.
WBS-23의 [LLM provider·프롬프트·mock](src/domain/narration/README.md)은 기존 확정 판단의 내부 JSON 검증용이다. 오프라인 진입점은 Mock 전용이며, 실제 호출은 WBS-65/66의 보호된 서버 경로에서만 허용한다. P06 스트리밍 경로와 구분한다.
WBS-24의 [실험 접근·예산·동시성 가드](src/domain/experiment/README.md)는 서버가 허용한 로컬 Mock에 일/사용자/세션 예약 한도를 적용한다. WBS-66 Live는 별도의 파일 영속 예산 장부를 사용한다.
WBS-47의 [승인형 R01 페르소나](src/domain/persona/README.md)는 세 계층 프롬프트·내부 서술 JSON·문체/근거·캐시 키를 mock으로 검증한다. 제품 캐릭터나 P06 스트리밍에 연결하지 않는다.
WBS-25의 [반복 품질 평가](docs/evaluations/WBS-25-persona-quality.md)는 `npm run eval:persona`로 30사례 × 합성 문체 2종 × 3회 Mock 결과와 읽기용 샘플을 생성한다. 사람 점수와 실 모델 평가는 별도다.
WBS-65/66의 [개발자 API 테스트 설정](src/app/dev/api-test/README.md)은 `npm run dev:api-test`로 시작한 로컬 서버의 `/dev/api-test`에서 잠금해제 후 공통 R01 Mock/Live를 실행한다. 기본 Mock이며 Live는 서버 키/플래그·비용 동의·명시 실행·예산 예약이 필요하다. 모델은 서버 `OPENAI_MODEL` 공통 설정(기본 `gpt-4o-mini`)을 사용한다.
WBS-17의 [코어 QA 기록](docs/evaluations/WBS-17-core-qa.md)은 계산/Mock/화면·문서 검증 범위, 발견 사항과 Live/사람 평가 잔여 항목을 구분한다.
WBS-26의 [운영·개인정보·비용 QA](docs/evaluations/WBS-26-security-cost-qa.md)는 공통 로컬 접근 게이트, 운영 차단, 재시작 예산과 비노출 검증을 기록한다. `npm run test:e2e:security`는 실제 키 없이 합성 키/Live=true의 격리 production 빌드와 브라우저 검사를 수행한다. Next의 개발용 버전 조회는 오프라인 503으로 대체하며, 그 외 외부 fetch 시도는 차단하고 실패로 처리한다.

입력 계약과 범위는 [src/domain/input/README.md](src/domain/input/README.md)를 참고한다.
Zod 검증과 입력 한계 판정은 Next.js/외부 서비스 없이 실행할 수 있다.
지정 패키지 `manseryeok@2.0.0`의 저수준 호출 범위와 시간 전제는
[어댑터 문서](src/infrastructure/manseryeok/README.md)를 참고한다.
WBS-04의 별도 날짜 변환 포트는 시각 없이 양력·음력·윤달을 변환하고 양쪽 날짜와 출처 버전을 보존한다.
변환 지원 구간과 사주 계산 지원 구간은 어댑터 문서에 구분해 기록한다.
WBS-05의 절기·연월주 포트는 24절기 UTC 시각과 입춘/12절 기준 연주·월주를 제공한다.
분 단위 해상도와 독립 검증 범위·공급자 시각 차이는 어댑터 문서에 명시한다.
WBS-06의 일주 전용 포트는 고정 UTC+9·자정 정책을 명시하며 공식 월력요항 일진과 독립 대조한다.
WBS-07의 [IANA 시간대 정규화](src/domain/timezone/README.md)는 역사 오프셋과 fold/gap을 해석한다.
`npm run --silent saju -- normalize-time`으로 실행하며 전체 사주 계산 연결과 구분한다.
WBS-08의 [태양시 정책](src/domain/solar-time/README.md)은 같은 명령에서 명시적 경도와 EoT를
적용하고 보정량·정책 시계를 반환한다.
WBS-09의 [자시·시주와 미상 후보](src/domain/policy-calendar/README.md)는
`calculate-policy` 명령으로 실행한다. 시각 미상은 확정 시주 없이 구간별 가능성을 반환한다.
WBS-10의 [십성·지장간·오행 기초 계산](src/domain/natal-facts/README.md)은 `derive-facts`로 실행한다.
확정된 기둥만 사용하며 오행 출현 개수와 강약 판단을 구분한다.
WBS-11의 [고전 출처·기초 판단 20개](src/domain/judgment/README.md)는 `judge-facts`로 실행한다.
각 결과에 출처·입력 근거·버전·예외와 미상 범위를 보존한다.
WBS-12의 [충돌·불확실성 중재](src/domain/judgment/ARBITRATION.md)는 `arbitrate-facts`로 실행한다.
원래 판단을 보존하고 명시된 충돌의 채택·억제·보류 및 미상 trace를 반환한다.
WBS-13의 [JSON·수동 ChatGPT 내보내기](src/domain/core-export/README.md)는
`export-json`, `manual-prompt`, `export-schema`로 실행한다. 확정·채택 판단만 설명 대상으로 전달한다.
WBS-14의 [결정성·버전·해시](src/domain/core-fingerprint/README.md)는 `hash-json`으로 실행한다.
검증된 코어 문서에 실제 버전 manifest와 정규화된 SHA-256 체크섬을 붙인다.
WBS-27의 [M01 원국 구조 진단](src/domain/judgment/structure/README.md)은 `diagnose-structure`로 검토한다.
월령·통근·투출과 조건부 강약/격국/용신 후보를 별도 반환하며 미해결 관법 차이·미상·미평가 범위를 보존한다.
WBS-28의 [M02 천간·지지 관계](src/domain/judgment/relations/README.md)는 `diagnose-relations`로 검토한다.
출처·정책에 따른 관계 존재와 미평가 강도/합화를 분리하고 미상·동시 관계와 복수 합 상대를 보존한다.
WBS-29의 [M03 주제별 판단](src/domain/judgment/topics/README.md)은 `diagnose-topic <topic>`로 검토한다.
6개 주제의 복합 조건·맥락 보류를 추적하며 기존 원국/M01/M02와 코어 해시는 유지한다.
WBS-30의 [M09 기능 조합·공통 계약](src/application/saju/features/README.md)은 `feature-json`으로 검토한다.
F01~F11 요청을 라우팅하고 필요한 모듈을 공유하며 후속 실행기·모듈의 미구현 상태를 명시한다.
WBS-31의 [F03 강점·약점](src/domain/features/README.md)은 관측 사실과 조건부 점검 방향을 제공한다.
`feature-json` 또는 보호된 `/dev/api-test`의 F03 선택에서 검토하며 Mock/명시 Live 서술 경로를 공유한다.
WBS-16의 [독립 골든 30건 검토표](docs/checklists/WBS-16-independent-golden-review.md)는 날짜·간지·DST·태양시·미상 경계를 통합 계산/JSON 경로에서 대조한다. 자동 검증 통과와 사용자 승인을 구분한다.
WBS-20의 [개발자 검증 화면과 API](src/app/dev/validation/README.md)는
로컬 개발 서버의 `/dev/validation`에서 입력·미상·원국·근거·JSON/프롬프트 복사를 확인한다.

- Node.js 24.x, npm 11.x (초기 검증: Node 24.12.0 / npm 11.6.2).
- Next.js App Router / TypeScript / Vitest. 직접 의존성과 잠금 파일을 함께 고정한다.
- 기존 `docs/examples`는 설계 참고 자료이며 앱이나 테스트에서 실행하지 않는다.
- 현재 초기화와 검증에는 환경변수 또는 외부 공급자 키가 필요하지 않다.

```sh
npm ci
npm run dev
```

개발 서버는 기본적으로 <http://localhost:3000>에서 열린다.
PowerShell에서 `npm.ps1` 실행이 제한되면 실행 정책을 변경하지 말고 `npm.cmd`를 사용한다.

```sh
npm test
npm run check:docs
npm run --silent saju -- --help
npm run typecheck
npm run lint
npm run build
npm start
```

`npm test`는 감시 모드 없이 실행하고 테스트가 없거나 실패하면 오류로 종료한다.
`npm run typecheck`는 먼저 Next.js 라우트 타입을 생성하므로 새 체크아웃에서도 실행할 수 있다.
Vitest는 기본 Node 환경에서 실행하며 이후 순수 도메인 코어도 웹 서버 없이 검증한다.
테스트는 입력 계약, 실제 만세력 패키지 호출/독립 일진 대조,
루트 TSX/한국어 레이아웃의 서버 렌더링을 확인한다.
회귀 테스트는 [고정 입력](tests/fixtures/core-reference-input.json)을 사용한다. 개인 수동 입력인 `tests/fixtures/cli-input.json`을 편집해도 자동 테스트의 기대값은 바뀌지 않는다. [fixture 구분](tests/fixtures/README.md)을 참고한다.
`npm run check:docs`는 README/AGENTS/docs/src 문서의 로컬 인라인 링크 파일 존재와 저장소 밖 경로를 검사하며 외부 URL/앵커 내용은 검증하지 않는다.
프로덕션 기동 확인은 빌드 후 `npm start`에서 `/`의 200 응답과 없는 경로의 404 응답으로 수행한다.

환경파일·빌드 산출물·의존성 폴더는 Git에서 제외한다. `docs/examples/.env.example`은 보존한다.
외부 연동과 P06을 포함한 제품 기능, 배포 설정 및 CI는 이 초기화에 포함하지 않는다.

설정 참고: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation),
[Next.js의 Vitest 가이드](https://nextjs.org/docs/app/guides/testing/vitest),
[Vitest 설정](https://vitest.dev/config/).

## 코드리뷰 리팩터링

[A~F 단계별 범위와 검증](docs/evaluations/core-review-refactor.md)을 참고한다. `npm run format:check`로 포맷을 검사하고 `npm run benchmark:core`로 외부 호출 없이 미상시각 계산의 전수/최적화 경로를 비교할 수 있다.
