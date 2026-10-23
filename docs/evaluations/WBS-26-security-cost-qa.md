# WBS-26 운영 차단·개인정보·비용 QA

## 착수 기준과 완료 조건

- 기준 develop: PR #25 MERGED, `43aae3e08cbb132b52dee9b476e7be3a7db9667d`(2026-10-23T12:33:07Z). 최종 리뷰 커밋 102346a 및 선행 WBS-25/#22가 origin/develop ancestor임을 확인했다. develop ff-only 갱신/직전 기능 브랜치 안전 삭제 후 WBS-26만 시작했다.
- WBS 실행순서 27, 선행 WBS-17/25. 현재 코어의 운영 개발자 기능 차단, 개인정보 최소화, 비용 가드를 검증한다. 미래 Auth/RLS/PG/P06/스트리밍/실제 배포 검증을 포함하지 않는다.
- 정상: 로컬 개발에서 기존 계산/Mock 동작, 합성 입력의 가짜 HTTP Live 계약, 정확한 사용량 정산/버전/근거 유지.
- 오류: production/CI/배포 환경, 외부 호스트/프록시 헤더, 무인증/위조/동의 누락/예산 소진은 본문·계산·공급자 호출 전에 거절. HTTP/출력 오류의 원문·키가 응답/일반 로그/장부에 남지 않아야 한다.
- 경계: 허용 플래그/합성 키/유효 쿠키가 있어도 운영 차단, 프로세스/세션 재시작의 중복 지출 차단, usage 미상 예약 유지, 기존 취소/동시성/초과 usage/손상 장부 회귀.
- production 빌드에 합성 키/Live=true를 주입해도 개발 화면/API는 404여야 하고 공개 정적 파일에는 합성 키/잠금해제 비밀이 없어야 한다. 외부 fetch는 전용 QA preload로 차단·기록하며 발생 시 검증 실패 처리한다. 실제 키/장부를 읽거나 바꾸지 않고 실제 외부 API 요청은 0회다.

Next 개발 서버의 npm 버전 확인은 정확한 주소의 헤더/본문 없는 GET에만 오프라인 503을 돌려준다. 실제 조회/최신 버전 인증이 아니며 별도 합성 marker로 집계한다. OpenAI 및 그 밖의 외부 목적지는 항상 차단하고 예상치 않은 시도로 실패 처리한다.
Next 기본 보안 업그레이드 조회(`experimental.agentUpgrade=security`)도 외부 통신이므로, 새 QA 사본에서만 false로 설정한다. 원본 next.config.ts/잠금 파일은 유지하고 실제 Next 설정 로더에서 계산 패키지 설정 보존을 검사한다. 원본 설정 형식이 바뀌면 QA helper도 명시적으로 검토해야 하며 조용히 설정을 생략하지 않는다.

## 검증 계획

`npm test -- --maxWorkers=1`, 관련 운영/개인정보/비용 회귀, 타입/lint, 문서 링크, 격리 개발 E2E 및 합성 운영 환경 빌드/E2E를 실행한다. 실패 무시·무근거 skip·CI 구축은 하지 않는다. 관측 결과와 제약을 아래 및 worklog에 기록한다.

## 발견 사항과 수정

|ID|발견|수정/판정|
|---|---|---|
|SEC-01|계산 검증 API/페이지는 NODE_ENV만 확인해 API 테스트 도구의 CI/배포 차단과 불일치|공통 `developer-access` 게이트로 통일. NODE_ENV=development여도 CI/VERCEL/VERCEL_ENV 표시가 있으면 거절|
|SEC-02|계산 API의 원격 프록시 헤더를 거절하지 않음|API 테스트 도구와 같은 Host/원격 forwarded chain/real-ip/forwarded-host/Forwarded 차단을 계산 API와 페이지에도 적용. 본문/계산 전 거절|
|SEC-03|기존 production E2E는 키 빈 값/Live=false여서 활성 설정의 운영 차단을 직접 증명하지 못함|새 security 모드에서 빌드/운영 서버에 합성 키/Live=true, 유효 서명 쿠키·CSRF·동의를 주고 404 및 정적 파일 비노출 검사. 실제 키 사용 없음|
|SEC-04|재시작 후 실제 HTTP 흐름의 중복 지출/사용량 미상 보존 증빙 보강 필요|가짜 transport + 전용 임시 장부로 유효한 기존 쿠키의 재요청과 신규 세션 한도 공유를 검증. 이미 시도한 요청은 환불/자동 재시도하지 않음|
|SEC-05|실패한 생성 결과의 원문/키 비노출과 사용량 정산을 함께 검증|known usage=220+80인 출력 거절은 300토큰 기록. 응답/console 5종/장부에 비밀·출력 원문이 없고 전송 payload에 출생 원문이 없음을 합성 sentinel로 검사|

## 자동 검사 결과

- 첫 접근 회귀: 신규 9건 중 기존 production 차단 1건은 통과, CI/배포 3건과 프록시 5건은 예상한 200→404 불일치로 실패. 공통 게이트 수정 후 관련 3개 파일 74건 통과.
- 운영/개인정보/비용·QA preload 관련 3개 파일 **27/27 PASS**. 외부 fetch 차단 장치는 별도 Node 자식 프로세스에서 실제 localhost HTTP 허용 및 외부/잘못된 URL 차단을 검증한다. 외부 URL의 내용은 기록하지 않는다.
- 전체 원래 작업 트리 `npm.cmd test -- --maxWorkers=1`: **47개 파일/1101건 PASS**, 종료 0(104.48초). 기존 예산 동시성/취소/초과 usage/손상 장부, 30건 독립 골든, Mock 180건 및 문체/계산 불변 회귀 포함.
- TypeScript의 테스트 행 union/Record 타입 오류를 수정했고, QA preload의 require 린트 오류는 동적 import로 수정했다. 검사 기준을 끄지 않았다. 첫 보안 E2E는 Windows NODE_OPTIONS 역슬래시 경로 해석 오류로 서버 시작 전에 실패했다. 경로 구분자를 정규화하고 공백 있는 preload 경로의 Node 환경 옵션 테스트를 추가해 재검증했다.
- 후속 E2E들은 개발 22건 통과 후 차단 marker로 실패했다. URL/원문 없는 종류 분류에서 npm 조회로 확인했고, 설치된 Next의 `getVersionInfo()` 고정 dist-tags 조회와 별도 기본 보안 업그레이드 조회를 확인했다. 전자는 정확한 GET에만 오프라인 503, 후자는 임시 사본의 agentUpgrade=false로 처리한다. 원본 보안 설정을 끄거나 네트워크를 열지 않는다. 쿼리/인증 헤더가 붙은 요청과 OpenAI URL은 여전히 차단됨을 별도 음성 검사한다.
- QA 임시 설정의 최초 import wrapper는 Next 설정 로더가 확장자 없는 TS 파일을 찾지 못해 실패했다. 원본을 보존하고 검토된 named export 앞에 QA 전용 옵션만 넣도록 수정한 뒤 실제 로더 검사에 통과했다. TypeScript/lint도 다시 통과했다.

## 최종 결과

|검사|결과|
|---|---|
|전체 회귀|47개 파일 / 1101건 PASS. 초기 104.48초 및 재검증 97.87초|
|마지막 QA helper 계약|PASS. 공백 포함 Windows preload, 로컬 HTTP, 외부 차단/오프라인 응답, 실제 Next 설정 로더/원본 설정 보존 검사|
|`npm.cmd run test:e2e:security`|종료 0, 개발 22/22 + production 4/4 PASS|
|격리 production build / route typegen / tsc|PASS. 합성 키·Live=true 사용|
|유효 개발자 쿠키/CSRF/동의로 운영 요청|개발자 페이지 2개 및 API 모든 메서드 404, no-store|
|공개 production HTML·정적 JS/CSS/JSON/map|합성 서버 키·잠금해제 비밀 비노출 PASS|
|QA 네트워크 결과|예상치 않은 외부 fetch 시도 0회. Next 버전 조회 오프라인 503 대체 1회|
|원래 작업 트리 TypeScript / lint|PASS, lint 경고 0|
|로컬 문서 링크|48개 문서 / 76개 링크 / 문제 0건|

현재 구현 범위의 운영 차단·원문/키 비노출·예약 가드 검증은 통과했다. 실제 비밀값/계정·실청구 및 미래 서비스 연동 검증과 구분한다. 사용자 수정 next-env.d.ts/수동 CLI 입력의 시작·최종 SHA256은 동일하다. 작업 중 AGENTS.md의 관련 테스트 우선 지침 변경을 확인해 보존하고 PR에서 제외한다. 이후 추가 전체 회귀는 수행하지 않고 마지막 변경 helper의 관련 계약과 격리 E2E로 확인했다.

## 경계와 잔여 검증

- 이번 실행은 추가 실제 OpenAI 호출 **0회 / LIVE_NOT_RUN**이다. 가짜 transport의 completed/LIVE_PASS와 합성 usage는 실제 계정·자연스러움·비용 증빙이 아니다. 과거 사용자 보고 LIVE_FAILED도 변경하지 않는다.
- `.env`, `.env.local`, 실제 `.local/api-test`는 읽기/수정 대상에서 제외한다. Git 추적 목록과 ignore 규칙만 확인했으며, 실제 키 값/계정 권한/콘솔 설정을 검증했다고 주장하지 않는다. 사용자 개발 환경의 Live 플래그를 강제로 변경하지 않는다.
- Live 비용 가드는 로컬 한 호스트/프로젝트의 호출·토큰 예약 정책이며 실제 금액/무료 혜택 보증이 아니다. usage 미상은 예약을 유지하고 실제 초과 usage는 정산해 후속 요청을 막는다. 분산 장부/계정 전체 한도는 별도 설계 범위다.
- 외부 차단 preload는 이번 QA 하위 Node 프로세스의 fetch를 제한한다. 일반 배포의 네트워크 방화벽이나 모든 네트워크 라이브러리를 대체하지 않는다. 제품 코드에 preload를 연결하지 않는다.
- Next의 최신 버전/외부 보안 권고 조회는 이번 오프라인 QA 결과가 아니다. 실제 프로젝트의 업그레이드 기본 정책과 의존성 버전은 변경하지 않는다.
- OAuth/RLS/테스트 PG/DB/SSE/실배포 검증과 사람 의미·자연스러움 평가는 향후 해당 WBS에서 수행한다. 현재 코어 QA만으로 전 제품 출시를 승인하지 않는다.
