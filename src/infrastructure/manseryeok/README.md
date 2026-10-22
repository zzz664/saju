# 지정 manseryeok 패키지 어댑터

공급자는 [yhj1024/manseryeok](https://github.com/yhj1024/manseryeok)로 고정한다.
npm `manseryeok@2.0.0`의 package.json, dist/index.d.ts, dist/types.d.ts 및 실제 JS를 확인했다.
직접 버전과 npm 잠금 파일을 고정하고 공급자 import/타입 사용은 이 인프라 어댑터 내부에 한정한다.
별도 만세력 구현이나 대체 라이브러리는 추가하지 않는다.

```ts
import { calculateManseryeokSnapshot } from "@/infrastructure/manseryeok";

const snapshot = calculateManseryeokSnapshot({
  year: 1992, month: 10, day: 24, hour: 5, minute: 30,
  calendarType: "solar", isLeapMonth: false,
  timeReference: "fixed-utc+09:00", dayBoundary: "midnight",
});
```

현재 함수는 **패키지 연결을 검증하는 저수준 경계**다. `AnalysisInput`을 변환하는
애플리케이션 포트/CLI나 최종 `NatalCore`가 아니다. 출력은 year/month/day/hour의
천간·지지와 실제 패키지 이름/버전, 시간/일 경계 전제만 담은 readonly JSON DTO다.
공급자 클래스/메서드/십신/대운/공망을 외부로 반환하지 않으며, 반환값도 Zod로 검증한다.

WBS-03의 `manseryeokCalendarAdapter`는 공용 `CalendarAdapter` 포트를 구현한다.
공용 요청/스냅샷 스키마는 `domain/calendar`로 옮겼고 기존 export는 같은 계약의 별칭으로 유지한다.
`application/saju`와 [CLI](../../cli/README.md)는 명시적 `Etc/GMT-9` 입력만 이 포트에 연결한다.

모든 요청 필드는 필수다. 미상 시각은 hour를 생략/null/추정치로 보내지 않고 현재 호출
범위 밖에 둔다. 일반 IANA 시간대, `AnalysisInput`의 태양시·자시 정책이나 공급자의
trueSolarTime/gender 옵션을 덧붙이면 엄격한 스키마에서 거절한다.

`timeReference`는 **UTC+09:00 고정 표준시**를 명시한다. `Asia/Seoul` 민간시 전체와
같지 않다. 공급자 2.0.0은 trueSolarTime 옵션 미지정 시 고정 UTC+9를 쓰며 역사 DST를
해석하지 않는다. 이 옵션을 켜면 경도/균시차/한국 과거 오프셋이 결합되고 기본 경도도
추정하므로, 현재 어댑터에서는 활성화하지 않는다. 실제 지역 벽시계 입력을 이 함수에
그대로 연결하면 안 된다. WBS-03은 고정 시간 기준만 연결하며, 일반 지역 시간대에는
WBS-07/08/09의 독립 검증을 거친 시간 정규화·정책 적용이 선행되어야 한다.
WBS-07의 [현지 시각 → UTC 정규화](../../domain/timezone/README.md)는 별도 포트/서비스로 제공한다.
WBS-08의 [별도 태양시 정책](../../domain/solar-time/README.md)은 EoT 공개 API만 사용한다.
일반 지역 일주·시주 연결은 WBS-09에서 검증하므로 기존 계산 입력을 자동 확대하지 않는다.

양력 사주 API는 1800~2300, 음력 사주 API는 1800~2100이다. 공급자의 독립 음양력
변환 API(1391~2100)와 범위가 다르다. 날짜 실재/윤달 검증은 실제 calculateFourPillars에
위임하며 오류를 `ManseryeokAdapterError`의 고정 코드/문구로 정규화한다. 원본 생년월일이
들어갈 수 있는 공급자 오류 메시지나 cause를 보관/로그/노출하지 않는다.

- 실제 패키지의 양력 예제·음력 대응·윤달 플래그는 연결 스모크다. 같은 공급자 값을
  서로 비교한 테스트를 독립 골든으로 표시하지 않는다.
- 독립 일진 3건은 `tests/fixtures/manseryeok-day-golden.json`에 KASI 원문 URL·확인일·범위를
  함께 고정했다. [2024 KASI 달력자료](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2024)의
  2월 10일/3월 10일/4월 9일 양력 날짜와 일진만 대조한다. 해당 웹 자료는 공식 발표 자료가
  아님을 고지한다. 음력 월건을 절기 월주로 일반화하거나 시주 전체의 독립 검증으로 취급하지 않는다.
- 절입·일주 경계의 추가 검증은 아래 WBS-05/06 절을 참고한다. 일반 시간대/미상 시각·시주/
  대운·30건 종합 골든은 각 후속 WBS 범위다. 태양시 검증 범위는 아래 WBS-08 절에 기록한다.

`npm test -- tests/manseryeok-adapter.test.ts`는 네트워크 없이 설치된 실제 라이브러리를 호출한다.
OpenAI·PG 등 외부 공급자 호출이나 API 키는 필요하지 않다.

## WBS-04 날짜 변환

`manseryeokCalendarConversionAdapter`는 공급자 타입 없는 별도 `CalendarConversionAdapter`
포트를 구현한다. 생년월일을 시각/시간대/좌표/순역 기준 없이 변환할 수 있다.
기존 사주 계산 포트와 CLI calculate의 지원 조건은 그대로다.

```ts
import { manseryeokCalendarConversionAdapter } from "@/infrastructure/manseryeok";

const dates = manseryeokCalendarConversionAdapter.convert({
  year: 2023, month: 2, day: 1, calendarType: "lunar", isLeapMonth: true,
});
// dates.solar: { year: 2023, month: 3, day: 22 }
// dates.lunar: { year: 2023, month: 2, day: 1, isLeapMonth: true }
const same = manseryeokCalendarConversionAdapter.convert({
  ...dates.solar, calendarType: "solar", isLeapMonth: false,
});
```

- 요청은 year/month/day/calendarType/isLeapMonth를 모두 명시한다. 음력의 `false`는 평달,
  `true`는 윤달이다. 없는 윤달과 실제 월 길이 초과는 거절한다. 양력은 반드시 false다.
  문자열 숫자 변환, 빠진 윤달 기본값, 시각 추정이나 호스트 시간대 참조는 없다.
- 설치된 공개 `solarToLunar`/`lunarToSolar`만 호출한다. 변환 범위는 음력
  **1391-01-01 평달 ~ 2100-12-29 평달**, 대응 양력 **1391-02-13 ~ 2101-01-28**(양끝 포함)이다.
  2100년 음력 연말은 양력 2101년이므로 양력 연도를 2100으로 자르지 않는다.
  Zod는 그레고리 날짜 실재와 구조적 연도 범위를 확인하고 실제 변환 가능 구간과 음력 실재는
  고정 공급자가 검사한다. 이 범위는 사주 API의 1800~2300/1800~2100과 다르다.
- 반환은 readonly 양력/음력 날짜 쌍과 libraryName/libraryVersion,
  ruleId=`calendar.solar-lunar-conversion`, ruleVersion=`1.0.0`이다.
  요청에서 받은 원래 달력 날짜와 윤달 플래그도 날짜 쌍에 보존된다. DB 저장 계약은 후속 범위다.
- 잘못된 입력/공급자 RangeError는 `CalendarAdapterError(INPUT_REJECTED)`, 예상 밖 공급자 오류는
  CALCULATION_FAILED, 손상된 결과/버전은 OUTPUT_INVALID로 정규화한다.
  원본 날짜가 포함될 수 있는 공급자 메시지/cause나 Zod issues는 이 포트 밖으로 보내지 않는다.
- `tests/fixtures/calendar-conversion-golden.json`의 독립 기준은 KASI
  [2023 달력자료](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2023)와
  [2024 달력자료](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2024)의 음력 표다.
  월초와 대/소(30/29일)에서 월말을 산출한 방법·확인일·출처를 함께 기록했다.
  웹 자료의 비공식 고지를 유지하며 공급자 왕복 및 지원 구간 끝값 회귀와 구분한다.
- 공급자 테이블 주석은 1391~2049년 KASI API 기반, 2050~2100년 천문 계산 기반으로 설명한다.
  이번 독립 골든은 2023~2024년 10건이며 전 지원 연도 정확도나 역사적 지역 민간력·시간대,
  절입/연주/월주/일주 경계의 검증 완료를 의미하지 않는다.

`npm test -- tests/calendar-conversion.test.ts tests/calendar-conversion-errors.test.ts`로
실제 패키지 왕복·독립 골든·경계와 명시적 SDK 오류 Mock을 각각 확인한다.

## WBS-05 절기·연주·월주

`manseryeokSolarCalendarAdapter`는 공급자 타입 없는 `SolarCalendarAdapter` 포트다.
`getSolarTerms({ year })`는 소한부터 동지까지 24개를 시간순으로 반환한다.
각 항목은 index/name/startsAt(UTC ISO 문자열)/isMonthBoundary를 포함하며,
짝수 index의 **절 12개**만 월 경계다. Date 객체나 공급자 메서드는 반환하지 않는다.
조회 범위는 1800~2300으로 제한하여 라이브러리의 범위 밖 근사 폴백을 허용하지 않는다.

```ts
import { manseryeokSolarCalendarAdapter } from "@/infrastructure/manseryeok";

const schedule = manseryeokSolarCalendarAdapter.getSolarTerms({ year: 2024 });
// schedule.terms[2].startsAt === "2024-02-04T08:27:00.000Z"
const result = manseryeokSolarCalendarAdapter.calculateYearMonth({
  year: 2024, month: 2, day: 4, hour: 17, minute: 27,
  calendarType: "solar", isLeapMonth: false,
  timeReference: "fixed-utc+09:00", dayBoundary: "midnight",
});
// result.pillars.year: 갑진, month: 병인. 1분 전에는 계묘/을축.
```

`calculateYearMonth`는 기존 CalendarRequest와 실제 사주 계산 포트를 재사용해
연주·월주만 투영한다. 별도 간지/천문 계산식을 추가하지 않는다. 양력 1800~2300,
음력 1800~2100 및 기존 날짜/정책 거절 계약을 유지한다.
분 단위 known 시각과 **고정 UTC+09:00** 전용이다. 일반 IANA 민간시/DST·태양시·자시·미상 시각
처리를 대신하지 않으며 CLI calculate 출력도 바꾸지 않는다.

연주는 입춘, 월주는 12절의 **시작 포함** 경계다. 양력 새해/설날/음력 초하루·윤달,
중기 12개에서 새 연주/월주로 바꾸지 않는다. 출력 provenance는 실제 공급자 버전 및
ruleId=`calendar.solar-terms` 또는 `calendar.year-month-pillars`, ruleVersion=`1.0.0`,
precision=`minute`를 기록한다. 연월주에는 yearBoundary=`lichun`, monthBoundary=`12-jeol`,
boundaryInclusion=`start-inclusive`, timeReference도 명시한다. `minute`는 해상도이며
전 연도의 천문 정확도 보증이나 초 단위 정밀도를 뜻하지 않는다.

독립 기준은 [2024 공식 월력요항 보도자료와 HWP 첨부](https://www.kasi.re.kr/kor/publication/post/newsMaterial/29633?cPage=7)의
24절기 **날짜**, [KASI 기본 경로 달력자료](https://astro.kasi.re.kr/life/post/calendardata)의
2024년 **분 단위 시각**이다. 연월주 예상값은 입춘/12절 및 오호둔 정책으로 수기 고정했으며,
KASI 음력 월건을 절기 월주로 사용하지 않았다. fixture에 출처·확인일·방법을 기록했다.

- 12절 독립 시각은 허용오차 없이 일치하며 각각 1분 전/당시/1분 후를 검사한다.
- 예비 웹 자료는 비공식이며 `/kor/...calendarData?search_year=2024`의 청명 16:00과
  기본 경로의 16:02가 다르다. 공식 첨부는 날짜만 제공하므로 분 정확도의 공식 검증으로 부르지 않는다.
- **소설 중기**는 KASI 웹 04:56, 고정 공급자 04:57로 1분 차이가 남는다.
  fixture와 별도 회귀 테스트에 차이를 명시하고, 24개 시각 전부 독립 일치로 표시하지 않는다.
  이 중기는 월 경계가 아니므로 연월주 변화가 없다. 공급자를 교체하거나 근거 없이 보정하지 않았다.
- 절입 보정표는 공급자 주석상 6tail 천문 계산에서 생성한 값이다. 이번 독립 검증은 2024년이며
  1800/2300 끝값은 공급자 회귀다. 전 지원 구간의 독립 정확도 검증은 남아 있다.

잘못된 조회 입력/공급자 RangeError, 예상 밖 실패, 손상된 응답은 기존 CalendarAdapterError로
정규화한다. 24개 수량/순서/명칭-index 대응/연도/분 해상도를 응답 경계에서 검사한다.
`npm test -- tests/solar-calendar.test.ts tests/solar-calendar-errors.test.ts`로
실제 절입 경계와 명시적 SDK 오류 Mock을 구분해 실행한다.

## WBS-06 일주 계산과 독립 대조

`manseryeokDayCalendarAdapter`는 `DayCalendarAdapter`를 구현하고 기존 공개 사주 계산
포트를 재사용해 `pillars.day`만 반환한다. 일주 계산식을 복제하거나 다른 라이브러리를 추가하지 않는다.
응답은 strict/readonly `DaySnapshotSchema`로 검증하며 실제 공급자 버전과
ruleId=`calendar.day-pillar`, ruleVersion=`1.0.0`, timeReference, dayBoundary를 기록한다.

```ts
import { manseryeokDayCalendarAdapter } from "@/infrastructure/manseryeok";

const snapshot = manseryeokDayCalendarAdapter.calculateDay({
  year: 2024, month: 2, day: 10, hour: 0, minute: 0,
  calendarType: "solar", isLeapMonth: false,
  timeReference: "fixed-utc+09:00", dayBoundary: "midnight",
});
// snapshot.pillars.day: { heavenlyStem: "갑", earthlyBranch: "진" }
```

현재 입력은 기존 CalendarRequest와 동일하다. 양력 1800~2300, 음력 1800~2100,
실재하는 날짜와 명시적 시각/윤달 플래그, 고정 UTC+09:00·midnight만 지원한다.
23:00~23:59도 당일 일주를 유지하며 고정 지역 날짜 00:00에 다음 일주로 바뀐다.
UTC 날짜나 호스트 날짜로 일주를 바꾸지 않는다. 미상 시각의 hour를 추정하거나
일반 IANA 시간대/DST·태양시·자시·분리자시를 처리하지 않는다. 해당 정책과 후보 처리는 후속 WBS다.
기존 CLI 및 전체 사주 계산 계약은 유지한다.

`tests/fixtures/day-pillar-golden.json`의 직접 독립 기준 12건은
[2024 공식 월력요항 보도자료](https://www.kasi.re.kr/kor/publication/post/newsMaterial/29633?cPage=7)의
HWP 첨부 4쪽 음력 날짜 표에서 옮긴 **양력 날짜·음력 날짜·일진**이다.
[공식 HTML 미리보기](https://www.kasi.re.kr/file/htmlconverter_preview/1687408104839_1.hwp.files/4.html)에서도
같은 표를 확인했다. 공급자 출력·README·다른 계산 엔진을 기대값 생성에 사용하지 않았다.

- 12개 날짜의 양력/음력 입력을 각각 원문 일진과 대조하고 00:00/22:59/23:00/23:59도 확인한다.
- 윤일/60갑자 회귀(계해→갑자)/연말 경계 6건은 공식 갑진일·기사일 앵커에서 날짜 수와
  일진 순환으로 수기 산출했다. 각 앵커와 일수 차이를 fixture에 기록하며 원문 직접 인용 12건과 구분한다.
- 실제 SDK의 윤달 입력 동치, 1900/2100년 2월 29일 거절, 2000년 윤일과 60일 주기,
  지원 범위 끝값은 추가 회귀다. 독립 골든이나 전체 역사 범위 정확도 보증으로 표시하지 않는다.
- 초기 WBS-01의 예비 웹 자료 3건은 기존 연결 검증으로 유지하며, 이번 공식 자료와 출처를 혼동하지 않는다.
- 일주만 반환하며 시주/대운 등 공급자 부가 결과와 원문 오류/cause를 노출하지 않는다.
  기존 공통 CalendarAdapterError의 INPUT_REJECTED/CALCULATION_FAILED/OUTPUT_INVALID 계약을 유지한다.

`npm test -- tests/day-calendar.test.ts tests/day-calendar-errors.test.ts`는 실제 패키지 독립 대조와
명시적 SDK 오류 Mock을 구분한다. 이번 골든은 주로 2024년과 파생된 2025-01-01 경계이며
역사 DST·일반 시간대·다른 일 경계 관법·전 지원 연도 검증을 완료로 표시하지 않는다.

## WBS-08 균시차(EoT)

`manseryeokEquationOfTimeAdapter`는 공개 `equationOfTimeMinutes`에 검증된 UTC 시점의
밀리초를 전달한다. 공급자의 Meeus 28.3 근사를 사용하며 단위는 분, 부호는 겉보기−평균이다.
실제 패키지 버전과 모델/부호/규칙 버전, 요청 시점을 strict/readonly DTO에 기록한다.
요청 범위 1799~2301년은 1800~2300년 민간시의 UTC 연도 이동을 포함한다.
유한값/±30분 범위를 벗어나거나 고정 버전과 다른 출력은 OUTPUT_INVALID,
잘못된 요청은 INPUT_REJECTED, 공급자 예외는 CALCULATION_FAILED의 고정 SolarTimeError다.

실제 어댑터와 [순수 태양시 규칙](../../domain/solar-time/README.md)은 별개다. IANA에서 이미
DST를 해결한 UTC를 사용하고 SDK의 결합 trueSolarTime 옵션은 활성화하지 않는다.
NOAA 연주기 근사식에서 독립 산출한 2024년 네 시점과 사전 허용차 30초로 대조한다.
이 검증은 다른 근사 모델 간 비교이며 관측 골든이나 전 지원 연도 정확도 보증이 아니다.
추가 의존성·외부 API·비밀키 없이 기존 고정 패키지만 사용한다.
