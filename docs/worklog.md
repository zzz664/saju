# 작업 기록

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
