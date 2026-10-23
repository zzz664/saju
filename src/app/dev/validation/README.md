# WBS-20 개발자 계산 검증

저장소 루트에서 `npm run dev -- --hostname 127.0.0.1`을 실행하고
<http://127.0.0.1:3000/dev/validation>을 연다. PowerShell 실행 정책이 npm.ps1을
막으면 `npm.cmd`를 사용한다. 별도 환경파일이나 공급자 키는 필요하지 않다.

생년월일은 선택한 양력/음력의 `YYYY-MM-DD`다. 음력 2월 30일을 포함하며,
윤달 실재와 실제 월 길이는 기존 만세력 어댑터가 판정한다. 시각 미상은
`birthTime: { status: "unknown" }`으로 전달하고 시주를 임의 확정하지 않는다.
시간대와 계산 정책을 명시하고, 좌표를 모르면 빈칸을 유지한다. 이름은 계산에 사용하지 않는다.

화면은 원국, 20개 기초 관찰의 판단·근거, 제한·충돌 수, 실제 버전과 SHA-256,
기존 WBS-13 수동 ChatGPT 프롬프트를 표시한다. JSON과 프롬프트를 각각 복사할 수 있다.
시각 미상은 partial, 경도 없는 진태양시처럼 계산 불가한 입력은 unavailable로 보존한다.
입력을 바꾸거나 요청이 실패하면 이전 결과를 지운다. 브라우저 저장소나 DB에 저장하지 않는다.

## 개발용 API 계약

`POST /api/analysis`는 기존 `AnalysisInput` JSON을 받아 아래 응답을 반환한다.

```ts
type DeveloperAnalysisResponse = {
  analysis: HashedCoreExport; // { status, document, fingerprint }
  manualPrompt: string; // 같은 document에서 만든 기존 복사 프롬프트
};
```

도메인 스키마는 두 필드를 검증하고 프롬프트가 같은 문서에서 생성됐는지도 확인한다.
서버는 기존 계산 서비스를 한 번 호출한다. complete/partial/unavailable 모두 유효한 계산 응답이면 200이다.
클라이언트는 검증된 응답만 표시한다. 체크섬 형식 검증은 출처 인증이나 DB 커밋 확인이 아니다.

| 조건                                          | 응답                             |
| --------------------------------------------- | -------------------------------- |
| development가 아니거나 로컬 Host가 아님       | 404, 입력을 읽거나 계산하지 않음 |
| POST 이외의 메서드                            | 405, Allow: POST                 |
| Origin 누락 또는 프로토콜·호스트·포트 불일치  | 403                              |
| application/json 아님                         | 415                              |
| 잘못된 UTF-8/JSON 또는 본문 없음              | 400                              |
| 선언 길이 또는 실제 수신 바이트가 64 KiB 초과 | 413                              |
| AnalysisInput 불일치                          | 422                              |
| 계산/체크섬 내부 오류                         | 500, 고정 오류                   |

모든 API 응답에 `Cache-Control: no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow`를 붙인다.
오류에 입력·공급자 메시지를 반사하거나 별도 로그에 기록하지 않는다. 응답 JSON에는 원본 생년월일·시각·좌표가
없지만 원국과 파생 분석도 민감할 수 있다. 사용자 클립보드로의 복사는 명시적 버튼 동작에만 수행한다.

로컬 Host는 localhost/127.0.0.1/[::1]과 유효한 선택 포트만 허용한다. Host/Origin 검사는
로컬 개발 범위 제한이며 원격 사용자 인증을 대체하지 않는다. 개발 서버를 루프백에 바인딩하고 외부에 공개하지 않는다.
프로덕션에서는 화면과 API를 모두 404로 닫는다. 소유권·OAuth·저장형 조회 API는 후속 WBS에서 구현한다.

## 검증 실행

```sh
npm test -- tests/developer-analysis-api.test.ts tests/bootstrap.test.tsx tests/timezone.test.ts tests/timezone-errors.test.ts
npm run lint
npm run test:e2e
```

E2E는 설치된 Chrome을 사용한다. Edge 사용 시 `SAJU_E2E_CHANNEL=msedge`를 설정한다.
Playwright 버전은 잠금 파일에 고정하며 자동 브라우저 다운로드를 요구하지 않는다.
임시 작업공간에 소스와 node_modules를 복사하므로 시간과 추가 디스크 공간이 필요하다.
환경파일·개인 입력 예제는 복사하지 않고 합성 입력만 사용한다. 기존 개발 서버와 `.next`,
사용자 `next-env.d.ts`를 보존하고 검증용 임시 디렉터리는 경로 확인 후 정리한다.

실제 기본 Turbopack 개발 서버에서 입력/미상/음력·윤달/오류/복사와 320·390·768·1440px을 검사한 뒤,
기본 프로덕션 빌드·라우트 타입 생성·tsc 및 실제 프로덕션 서버의 화면/API 차단을 검사한다.
오류 사례만 응답을 mock하며 정상 계산은 실제 로컬 어댑터를 사용한다. 결과 스크린샷은
Git 제외 경로 `test-results/developer-320.png`에 저장한다. CI 구성은 추가하지 않는다.

이 도구는 개발자용 기초 계산 검증 범위다. 고객 P06, R01/R02/R03, SSE,
`report.completed`, 실제 OpenAI 호출·응답 품질, 11개 기능 전체, 계정·DB·테스트 결제의 완료를 의미하지 않는다.

구현 참고: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[Playwright webServer](https://playwright.dev/docs/test-webserver).
