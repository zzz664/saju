# JSON·수동 ChatGPT 프롬프트 — WBS-13

개발자용 내보내기다. `calculateCoreExport`는 기존 WBS-12 계산/판단/중재를 한 번 호출하고
명시적인 필드만 옮긴다. Next.js, DB, 외부 API, 클립보드 권한 없이 실행한다.

WBS-23의 `buildManualPromptData(core)`는 기존 수동 복사 프롬프트에 넣던 동일한
확정·채택 판단과 제한 데이터를 반환한다. `buildManualPrompt`의 출력은 유지하며,
[내부 provider·mock](../narration/README.md)에서 이 투영을 공유한다. 부분/제외 판단을 새 근거로 승격하지 않는다.

```sh
npm run --silent saju -- export-json < tests/fixtures/cli-input.json
npm run --silent saju -- manual-prompt < tests/fixtures/cli-input.json
npm run --silent saju -- export-schema
```

PowerShell에서는 입력을 UTF-8로 읽어 전달한다. 성공이면 출력 전체를 복사하거나 UTF-8 파일로
보관한다. partial/unavailable은 결과와 제한을 반환하면서 종료 코드 2를 사용한다.
입력/공급자 오류에서는 출력 문서 없이 stderr 오류 JSON만 반환하므로 복사 대상으로 사용하지 않는다.

```powershell
Get-Content -Raw -Encoding utf8 tests/fixtures/cli-input.json | npm.cmd run --silent saju -- export-json
$LASTEXITCODE
Get-Content -Raw -Encoding utf8 tests/fixtures/cli-input.json | npm.cmd run --silent saju -- manual-prompt
$LASTEXITCODE
npm.cmd run --silent saju -- export-schema
```

JSON 계약은 `schemaVersion: 1.0.0`, `scope: base-structural-observations`다.

| 필드        | 내용                                                                              |
| ----------- | --------------------------------------------------------------------------------- |
| status      | complete / partial / unavailable                                                  |
| calculation | 계산 상태, 선택 정책, 입력 누락 메타데이터, 제한 사유 코드, 실제 계산/정규화 버전 |
| facts       | 확정 기둥·십성·지장간·분리 오행 개수·근거, 또는 null                              |
| evaluation  | 기존 규칙 20개의 평가·원문 finding·출처/규칙 버전, 또는 null                      |
| resolution  | 채택/억제/보류·원래 후보 전체·충돌·미상 trace, 또는 null                          |

원본 생년월일·출생시각·시간대 ID·좌표·성별 기준값, UTC/현지/정책 시계와 1,440분 후보는
내보내지 않는다. 기둥과 파생 분석 자체도 민감할 수 있으므로 익명화된 데이터라고 보장하지 않는다.
의도한 CLI 출력 외에 출생정보를 일반 로그로 남기지 않는다.
미상 필드 이름과 정책/제약은 유지하며 실제 수행하지 않은 계산의 버전은 null이다.
일부 계산 후보가 거절되어 공통 기둥이 전혀 없으면 calculation은 partial이지만
facts/evaluation/resolution은 unavailable인 채로 보존된다. 계산 자체가 거절/미지원이면 셋 모두 null이다.

`CoreExportSchema`는 strict/readonly Zod 계약이다. facts에 기초 규칙을 다시 평가해 원래
evaluation과 일치하는지 확인하고 중재 결과·미상 trace를 재연결한다. 달력이나 파생 facts를
다시 계산하거나 변경하지 않는다. 이 검사는 문서 내부 일관성 검사이며 서명/출처 인증이 아니다.
원본 facts 자체가 실제 입력에서 생성됐는지는 신뢰할 수 있는 계산 경로에서 보장해야 한다.

`serializeCoreExport`는 검증한 문서를 들여쓰기 2칸 JSON과 마지막 LF로 반환한다.
`parseCoreExport`는 최대 1 MiB의 JSON 문자열을 읽고 BOM/CRLF/공백을 허용한다.
잘린 JSON·추가 필드·미지원 버전·상태/근거/중재 연결 오류는 고정 오류로 거절한다.
`export-schema`는 같은 Zod에서 생성한 draft 2020-12 구조 스키마를 반환하며 stdin/공급자를
사용하지 않는다. JSON Schema는 필드/형식 계약이고 Zod의 모든 사용자 정의 교차 검증을
표현하지 못한다. 가져온 문서의 의미 검증에는 반드시 `CoreExportSchema`/`parseCoreExport`를 사용한다.
이를 P06이나 R02/R03 서술 JSON 출력 스키마로 사용하지 않는다.

수동 프롬프트는 고정 한국어 지시문과 `<analysis_data>` JSON 블록 하나로 구성된다.
제목부터 닫는 태그까지 전체를 복사해 ChatGPT에 붙여 넣는다. 본문 JSON은
`ManualPromptDataSchema`로 검증하며 `<`, `>`, `&`, 줄 구분 문자를 JSON 유니코드로
이스케이프해 경계 문자가 값에서 튀어나오지 않게 한다. 값은 JSON 파싱 시 그대로 복원된다.
임의 질문·이름·페르소나·추가 지시문을 받지 않는다.

서술 대상은 중재 뒤 accepted이면서 precision=confirmed인 verifiedFindings뿐이다.
부분 finding·suppressed/deferred finding의 문장은 전달하지 않고 제외 ID와
미상/부분 규칙의 예외·coverage, 입력/계산/중재 제한을 전달한다. 근거가 없으면
부족한 이유만 설명하도록 지시한다. 제공되지 않은 명리 판단·성격/운세·사건 예측을
새로 만들거나 부분 근거를 확정으로 올리지 않도록 명시한다.
원래 판단·근거·출처/규칙/중재 버전은 유지하고 별도 promptVersion 1.0.0을 기록한다.

지시와 데이터의 구분, 명확한 작업 범위, 코드 내 프롬프트 관리와 대표 테스트는
[OpenAI Docs의 prompt engineering 지침](https://developers.openai.com/api/docs/guides/prompt-engineering)을 참고했다.
이 구분과 이스케이프만으로 프롬프트 주입이나 모델의 근거 이탈을 막는다고 보장하지 않는다.
수동 복사는 서버 상위 역할을 설정하지 않으며 ChatGPT의 모델·계정 설정을 제어하지 않는다.
실제 ChatGPT 전송/응답 품질이나 OS 클립보드는 자동 검증하지 않았다.
API provider/Mock·예산·페르소나/서술 검증은 각 후속 WBS이며 gpt-4o-mini API 정책을 변경하지 않는다.

complete는 기초 관찰 내보내기 범위다. 수동 응답을 검증된 계산·저장 결과로 가져오지 않는다.
P06·SSE·DB 완료 상태와 F01~F11 기능 조합은 이 내보내기에 포함하지 않는다.
WBS-14의 [별도 hash-json](../core-fingerprint/README.md)은 코어 문서를 보존하고 체크섬을 추가한다.
입력·서술 캐시와 실제 저장은 후속 기능이다.

```sh
npm test -- tests/core-export.test.ts tests/core-export-service.test.ts
```

한국어 JSON·BOM/CRLF 복사 왕복, 상태/근거/중재 변조, 미상·DST·미지원,
확정 finding 선별, 원본 계산 보존/단일 실행, 실제 npm CLI와 비식별 오류를 검증한다.
