# CLI·어댑터 인터페이스 — WBS-03

개발 도구이며 P06이나 최종 명리 리포트가 아니다. Node 24.x/npm 11.x에서 `npm ci` 후
실행한다. `tsx@4.23.15`는 개발 의존성이므로 `--omit=dev` 설치에는 CLI가 포함되지 않는다.

```sh
npm run --silent saju -- --help
npm run --silent saju -- validate < tests/fixtures/cli-input.json
npm run --silent saju -- calculate < tests/fixtures/cli-input.json
```

PowerShell에서는 실행 정책 변경 없이 다음과 같이 파이프한다.

```powershell
Get-Content -Raw -Encoding utf8 tests/fixtures/cli-input.json | npm.cmd run --silent saju -- calculate
$LASTEXITCODE
```

인자는 `validate`, `calculate`, `--help` 중 하나다. 표준입력은 기존 `AnalysisInput` JSON
문서 한 개이며 인자에 생년월일을 넣지 않는다. `--silent`는 npm의 스크립트 안내만 숨겨
stdout을 JSON으로 유지하며 실패/종료 코드를 무시하지 않는다. stdout은 요청된 개발용
결과이고, 입력 원문을 그대로 반사하거나 일반 로그에 기록하지 않는다.

| 명령/상태 | stdout | stderr | 종료 코드 |
| --- | --- | --- | --- |
| `validate` 성공 | `status: valid`, 미상/한계 메타데이터 | 없음 | 0 |
| `calculate` 성공 | `status: calculated`, 4개 기둥 snapshot/출처/미상 정보 | 없음 | 0 |
| 계산 미지원/실제 달력 입력 거절 | `status: unavailable`, reasons/미상 정보. snapshot 없음 | 없음 | 2 |
| 잘못된 인자/JSON/입력/UTF-8/크기 초과 | 없음 | 고정 코드/메시지의 error JSON | 2 |
| 어댑터/입출력 실패 | 없음 | 고정 코드/메시지의 error JSON(출력 파이프 자체가 닫혔으면 출력 불가) | 1 |
| `--help` | 사용법 텍스트. stdin 읽지 않음 | 없음 | 0 |

현재 계산 연결 조건은 다음을 모두 만족해야 한다.

- `birthInput.timezoneId`가 정확히 `Etc/GMT-9`: IANA의 부호 규칙상 **고정 UTC+09:00**이다.
  실제 출생지의 시간대가 이 고정 시간 기준임을 확인한 입력만 사용한다. Asia/Seoul이나
  다른 지역 시간대를 성공시키려고 이름만 바꾸지 않는다.
- `birthTime.status`가 known, `solarTime: standard`, `dayBoundary: midnight`, `dstDisambiguation: reject`.
- 기존 어댑터의 양력 1800~2300/음력 1800~2100 범위. 날짜 실재는 공급자가 검증한다.

일반 시간대·DST/태양시/자시 정책은 이후 WBS에서 검증하므로 여기서는 unsupported다.
미상 시각도 자정/정오를 만들어 넘기지 않는다. `validate`는 미지원 계산 옵션을 포함한
기존 입력 계약 전체를 받을 수 있지만, 스키마 통과가 계산 가능이나 음력 실재 보증은 아니다.
위도/경도/순역 기준 미상 자체는 보정 없는 4기둥 호출을 차단하지 않고 metadata로 남긴다.
`calculated`는 이 제한된 스냅샷 호출 성공이며 F01~F11의 complete나 최종 NatalCore가 아니다.

입력은 최대 64 KiB(65,536바이트), 유효한 UTF-8만 받는다. UTF-8 BOM과 청크 분할을
처리하며 크기 초과·손상된 바이트·스트림 오류에서 부분 결과를 반환하지 않는다.
원본 JSON, Zod/공급자 예외 전문, stack/cause를 stderr로 노출하지 않는다.

구조:

- `domain/calendar`: 기존 WBS-01 DTO를 옮긴 공용 Zod 계약과 SDK 타입 없는 CalendarAdapter 포트.
- `infrastructure/manseryeok`: 고정 공급자 구현. 기존 WBS-01 export는 호환 별칭으로 유지.
- `application/saju`: AnalysisInput 검증, 현재 지원 범위 검사, 포트 요청/응답 검증. I/O 없음.
- `cli/run`: 인자·JSON·종료 코드 처리. `cli/input`/`main`만 실제 Node 표준입출력 담당.

`npm test -- tests/calendar-service.test.ts tests/cli.test.ts`는 포트 단위 검증과 실제 npm CLI
자식 프로세스를 함께 검증한다. 새 명령은 네트워크/DB/LLM/PG 없이 실행된다.
일부 제한 실행 환경은 tsx의 OS 사용자 정보 조회를 차단할 수 있다. 로컬 검증에서는
그 실패와 일반 실행 환경에서의 결과를 구분하며 테스트를 생략하지 않는다.

참고: [tsx Node CLI](https://tsx.hirok.io/dev-api/node-cli),
[Node 자식 프로세스](https://nodejs.org/docs/latest-v24.x/api/child_process.html),
[Node TextDecoder](https://nodejs.org/docs/latest-v24.x/api/util.html#class-utiltextdecoder).
