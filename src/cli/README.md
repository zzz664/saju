# CLI·어댑터 인터페이스 — WBS-03

개발 도구이며 P06이나 최종 명리 리포트가 아니다. Node 24.x/npm 11.x에서 `npm ci` 후
실행한다. `tsx@4.23.15`는 개발 의존성이므로 `--omit=dev` 설치에는 CLI가 포함되지 않는다.

```sh
npm run --silent saju -- --help
npm run --silent saju -- validate < tests/fixtures/cli-input.json
npm run --silent saju -- calculate < tests/fixtures/cli-input.json
npm run --silent saju -- normalize-time < tests/fixtures/cli-input.json
npm run --silent saju -- calculate-policy < tests/fixtures/cli-input.json
npm run --silent saju -- derive-facts < tests/fixtures/cli-input.json
npm run --silent saju -- judge-facts < tests/fixtures/cli-input.json
npm run --silent saju -- arbitrate-facts < tests/fixtures/cli-input.json
```

PowerShell에서는 실행 정책 변경 없이 다음과 같이 파이프한다.

```powershell
Get-Content -Raw -Encoding utf8 tests/fixtures/cli-input.json | npm.cmd run --silent saju -- calculate
$LASTEXITCODE
```

인자는 `validate`, `calculate`, `normalize-time`, `calculate-policy`, `derive-facts`, `judge-facts`, `arbitrate-facts`, `--help` 중 하나다. 표준입력은 기존 `AnalysisInput` JSON
문서 한 개이며 인자에 생년월일을 넣지 않는다. `--silent`는 npm의 스크립트 안내만 숨겨
stdout을 JSON으로 유지하며 실패/종료 코드를 무시하지 않는다. stdout은 요청된 개발용
결과이고, 입력 원문을 그대로 반사하거나 일반 로그에 기록하지 않는다.

| 명령/상태 | stdout | stderr | 종료 코드 |
| --- | --- | --- | --- |
| `validate` 성공 | `status: valid`, 미상/한계 메타데이터 | 없음 | 0 |
| `calculate` 성공 | `status: calculated`, 4개 기둥 snapshot/출처/미상 정보 | 없음 | 0 |
| `normalize-time` 성공 | `status: normalized`, 현지 시각·UTC·오프셋 및 `solarTime` 정책 시계/보정량/EoT/버전·미상 정보 | 없음 | 0 |
| `calculate-policy` known 성공 | `status: calculated`, 실제 UTC/정책 시계 기준의 4기둥 및 버전 | 없음 | 0 |
| `calculate-policy` 시각 미상 | `status: partial`, 입력 분 구간별 후보와 공통 기둥, 확정 hour는 null | 없음 | 2 |
| `derive-facts` complete | `calculation` 및 `facts`(십성/지장간/분리 오행 개수/근거 버전) | 없음 | 0 |
| `derive-facts` partial/unavailable | 확정 범위의 facts 또는 null, 미상 한계와 기존 calculation | 없음 | 2 |
| `judge-facts` complete | 기존 analysis 및 20개 기초 규칙 평가/근거 finding | 없음 | 0 |
| `judge-facts` partial/unavailable | 기존 미상 범위 유지, 평가 가능한 관찰만 finding, evaluation 또는 null | 없음 | 2 |
| `arbitrate-facts` complete | 원래 judgment 및 충돌의 채택/억제/보류·근거를 담은 resolution | 없음 | 0 |
| `arbitrate-facts` partial/unavailable | 미상·부분 근거/미해결 충돌과 원본 trace, resolution 또는 null | 없음 | 2 |
| 시간 정규화 거절/미상·범위 미지원 | `status: rejected`(fold/gap, resolved 없음) 또는 `unavailable`(reasons) | 없음 | 2 |
| 계산 미지원/실제 달력 입력 거절 | `status: unavailable`, reasons/미상 정보. snapshot 없음 | 없음 | 2 |
| 잘못된 인자/JSON/입력/UTF-8/크기 초과 | 없음 | 고정 코드/메시지의 error JSON | 2 |
| 어댑터/입출력 실패 | 없음 | 고정 코드/메시지의 error JSON(출력 파이프 자체가 닫혔으면 출력 불가) | 1 |
| `--help` | 사용법 텍스트. stdin 읽지 않음 | 없음 | 0 |

기존 `calculate` 연결 조건은 다음을 모두 만족해야 한다.

- `birthInput.timezoneId`가 정확히 `Etc/GMT-9`: IANA의 부호 규칙상 **고정 UTC+09:00**이다.
  실제 출생지의 시간대가 이 고정 시간 기준임을 확인한 입력만 사용한다. Asia/Seoul이나
  다른 지역 시간대를 성공시키려고 이름만 바꾸지 않는다.
- `birthTime.status`가 known, `solarTime: standard`, `dayBoundary: midnight`, `dstDisambiguation: reject`.
- 기존 어댑터의 양력 1800~2300/음력 1800~2100 범위. 날짜 실재는 공급자가 검증한다.

`calculate`에서 일반 지역 시간대·DST/태양시/자시 정책 연결은 아직 unsupported다.
`normalize-time`은 [IANA 현지 시각 정규화](../domain/timezone/README.md)와
[WBS-08 태양시 정책](../domain/solar-time/README.md)을 순서대로 실행한다.
reject/earlier/later와 역사 오프셋·서머타임을 해석하고, 음력은 지정 변환 포트로 양력화한다.
standard는 법정 현지 시각(DST 포함)을 유지하고, mean/true는 경도 보정 및 선택적 EoT를 적용한다.
경도 미상으로 평/진태양시를 요청하면 unavailable/LONGITUDE_UNKNOWN(종료 2)이며 표준시로 대체하지 않는다.
실제 UTC를 보존하며 `solarTime.policyClock`은 시간대 없는 계산 시계다. 일반 지역의 일주/시주 연결은
별도 WBS-09 [calculate-policy](../domain/policy-calendar/README.md)로 실행한다.
이 명령은 연·월주를 실제 UTC, 일·시주를 정책 시계에 연결하며 midnight/zi-start를 적용한다.
미상 시각에는 1,440개 입력 분의 가능성을 인접 구간으로 합쳐 partial로 반환한다.
확정 시주나 대표 UTC는 반환하지 않는다. 공통 연·월·일주도 전체 분이 해석 가능하고 같은 경우에만 남긴다.
gap 이동 시각과 원래 양력 벽시계를 함께 반환한다. 해당 날짜·시각은 요청된 개발 도구 결과이며 일반 로그로 자동 기록하지 않는다.
미상 시각도 자정/정오를 만들어 넘기지 않는다. `validate`는 미지원 계산 옵션을 포함한
기존 입력 계약 전체를 받을 수 있지만, 스키마 통과가 계산 가능이나 음력 실재 보증은 아니다.
위도/경도/순역 기준 미상 자체는 보정 없는 4기둥 호출을 차단하지 않고 metadata로 남긴다.
`calculated`는 이 제한된 스냅샷 호출 성공이며 F01~F11의 complete나 최종 NatalCore가 아니다.

WBS-10의 [derive-facts](../domain/natal-facts/README.md)는 정책 계산 결과를 보존하고 확정 기둥만
파생 계산한다. 시각 미상 후보를 합치지 않으며 일간 미상이면 십성은 null이다.
표면 오행 개수와 지장간 출현 개수는 별도로 반환한다. 강약/용신 판단은 포함하지 않는다.
WBS-11 [judge-facts](../domain/judgment/README.md)는 같은 facts를 재사용하고 출처가 연결된
기초 관찰 규칙 20개를 평가한다. 미확인 부재는 unavailable이며 matched만 finding을 만든다.
입력 근거·출처·버전·예외/범위를 보존하고 충돌 중재나 강약/길흉 판단은 수행하지 않는다.
WBS-12 [arbitrate-facts](../domain/judgment/ARBITRATION.md)는 기존 판단을 한 번 계산해
보존하고 별도 중재 결과와 미상 trace를 추가한다. 우선순위 동률·관법 차이·부분 근거의
충돌은 보류한다. 기호 동시 존재를 충돌로 만들거나 부분 관찰을 확정으로 승격하지 않는다.

입력은 최대 64 KiB(65,536바이트), 유효한 UTF-8만 받는다. UTF-8 BOM과 청크 분할을
처리하며 크기 초과·손상된 바이트·스트림 오류에서 부분 결과를 반환하지 않는다.
원본 JSON, Zod/공급자 예외 전문, stack/cause를 stderr로 노출하지 않는다.

구조:

- `domain/calendar`: 기존 WBS-01 DTO를 옮긴 공용 Zod 계약과 SDK 타입 없는 CalendarAdapter 포트.
- `infrastructure/manseryeok`: 고정 공급자 구현. 기존 WBS-01 export는 호환 별칭으로 유지.
- `application/saju`: AnalysisInput 검증, 현재 지원 범위 검사, 포트 요청/응답 검증. I/O 없음.
- `domain/natal-facts`, `application/natal-facts`: 검증된 SDK 기호와 확정 기둥의 순수 기초 계산/연결.
- `domain/judgment`, `application/judgment`: 검토된 출처/기초 규칙 카탈로그와 순수 평가/연결.
- `cli/run`: 인자·JSON·종료 코드 처리. `cli/input`/`main`만 실제 Node 표준입출력 담당.

`npm test -- tests/calendar-service.test.ts tests/cli.test.ts`는 포트 단위 검증과 실제 npm CLI
자식 프로세스를 함께 검증한다. 새 명령은 네트워크/DB/LLM/PG 없이 실행된다.
일부 제한 실행 환경은 tsx의 OS 사용자 정보 조회를 차단할 수 있다. 로컬 검증에서는
그 실패와 일반 실행 환경에서의 결과를 구분하며 테스트를 생략하지 않는다.

참고: [tsx Node CLI](https://tsx.hirok.io/dev-api/node-cli),
[Node 자식 프로세스](https://nodejs.org/docs/latest-v24.x/api/child_process.html),
[Node TextDecoder](https://nodejs.org/docs/latest-v24.x/api/util.html#class-utiltextdecoder).
