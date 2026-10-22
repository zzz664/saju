# 작업 기록

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
