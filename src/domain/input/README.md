# 출생 입력 계약 — WBS-02

`AnalysisInputSchema.parse(unknown)` 또는 `safeParse`로 외부 값을 검증한다.
루트는 `birthInput`과 `calculationPolicy`를 분리한다. 모든 필드를 명시해야 하며,
타입 강제 변환·문자열 trim·기본값 보충·알 수 없는 필드 제거를 하지 않는다.
파싱된 객체는 readonly이며 서버/Next.js/만세력/LLM/DB 없이 사용할 수 있다.

| BirthInput 필드 | 계약 |
| --- | --- |
| `calendarType` | `solar` 또는 `lunar` |
| `birthDate` | 입력 달력의 `YYYY-MM-DD`, 구조상 0001~9999년. 양력은 Gregorian 윤년/월별 일수 검사, 음력은 1~30일 구조만 검사 |
| `isLeapMonth` | boolean 필수. 양력은 false, 음력은 입력값 보존 |
| `birthTime` | `{ status: "known", time: "HH:mm" }` 또는 `{ status: "unknown" }`. 미상 분기에 time 혼입 금지 |
| `timezoneId` | 명시적 IANA area/location ID 또는 `UTC`. 런타임 Intl 지원 확인. `/`를 포함한 IANA 별칭도 보존. 약어/숫자 offset을 추측하지 않음 |
| `longitudeDeg` | 유한한 number -180~180 또는 명시적 null(미상) |
| `latitudeDeg` | 유한한 number -90~90 또는 명시적 null(미상) |
| `directionBasis` | `male` / `female` / `unspecified`. 전통 대운 순역 규칙의 입력 기준이며 성별 정체성으로 추정하거나 별도 저장하지 않음 |

좌표 0과 실제 자정 `00:00`은 알려진 값이다. 필수 값 자체의 생략은 오류이고,
시각의 `unknown`, 좌표의 null, 순역 기준의 `unspecified`가 허용되는 미상 표현이다.
시간대는 필수이며 출생지/경도/서버 시간대에서 자동 추정하지 않는다.
분 단위의 현지 시각만 받는다. 시각 범위/초 단위/날짜 부분 입력은 현재 계약에 없다.

| CalculationPolicy 필드 | 계약 |
| --- | --- |
| `solarTime` | `standard`(표준시), `mean-solar`(평태양시), `true-solar`(진태양시) |
| `dayBoundary` | `midnight`(00시 날짜 경계), `zi-start`(23시 자시 시작 경계) |
| `dstDisambiguation` | `reject`, `earlier`, `later`. WBS-07 현지 시각 정규화에서 적용하는 중복/누락 시각 정책 |

이 enum은 정책 선택을 저장하는 계약이며 각 기능의 지원 범위를 별도로 확인해야 한다.
실제 음력 변환/윤달 실재/지원 연도는 WBS-01/04, 역사 TZ/DST는 [WBS-07 정규화](../timezone/README.md),
태양시는 [WBS-08 정책](../solar-time/README.md)에서 적용한다. standard는 해결된 법정 현지 시각(DST 포함)을
보존하고 평/진태양시는 명시적 경도가 필요하다. 자시·시주 연결은 WBS-09 범위다.
음력 `2023-02-30`을 구조적으로 받을 수 있어도 해당 달력 날짜의 실재를 보증하지 않는다.
원본 음력 날짜를 JS Date/ISO 시점으로 강제 변환하지 않는다. 향후 DB 저장은 변환된
양력 날짜와 원래 달력/윤달 정보의 보존 계약을 별도 검토해야 한다(현재 DB 연동 없음).

`getInputInformation(parsedInput)`은 검증된 입력에서 값 없는 메타데이터만 만든다.

- `unknownFields`: 시각/경도/위도/대운 순역 기준의 명시적 미상 필드 목록.
- `BIRTH_TIME_UNKNOWN`: 시주 및 시각 의존 판단을 제한해야 함.
- `LUCK_DIRECTION_BASIS_UNKNOWN`: 순역 방향을 추정하면 안 됨.
- `SOLAR_TIME_INPUT_MISSING`: 요청된 평/진태양시 보정에 시각 또는 경도가 없음.
  실제 빠진 필드 경로를 반환하며 표준시로 묵시적으로 대체하지 않음.

위도 미상 자체는 위도에 의존하지 않는 계산을 막지 않는다. 입력 메타데이터의 한계는
F01~F11의 완성 여부와 다르다. 후속 기능은 의존 항목에 따라 partial/unavailable을 결정한다.
`InputInformationSchema`로 메타데이터도 검증할 수 있으며 목록은 고정 순서로 반환한다.
원본 생년월일·시각·장소 값을 이 메타데이터에 복사하거나 일반 로그로 남기지 않는다.

현재 스키마는 CLI/애플리케이션 서비스에서 사용하며 API/UI/DB 연결은 후속 범위다. `npm test -- tests/birth-input.test.ts`로
단독 검증할 수 있다. 스키마 API 참고: [Zod 공식 문서](https://zod.dev/api).
