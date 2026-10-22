# 작업 기록

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
