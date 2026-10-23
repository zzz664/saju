# 평태양시·진태양시 정책 — WBS-08

`applySolarTimePolicy`는 WBS-07의 검증된 `ResolvedTime`에 명시적인
`standard/mean-solar/true-solar`와 `longitudeDeg`를 적용한다. Next/Node/SDK 없이
사용하는 순수 도메인이며 진태양시에만 별도 `EquationOfTimeAdapter`를 주입한다.

| 모드       | 정책 시계                                 | 필요한 값                  |
| ---------- | ----------------------------------------- | -------------------------- |
| standard   | 해결된 IANA 법정 현지 시각 유지(DST 포함) | 알려진 시각                |
| mean-solar | UTC + 경도 × 240초                        | 시각, 명시적 경도          |
| true-solar | UTC + 경도 × 240초 + EoT × 60초           | 시각, 명시적 경도, EoT(분) |

동경이 양수이며 경도 1도는 4분이다. 0도는 유효하고 ±180도는 날짜가 하루 차이 난다.
경도·시간대·표준 자오선을 서로 추정하지 않는다. standard의 경도 출력은 사용하지
않았다는 뜻의 null이다. nonstandard에서 경도 null이면 LONGITUDE_REQUIRED다.
standard는 여기서 추가 태양시 보정이 없는 민간시 정책을 뜻하며 DST를 제거하지 않는다.
mean/true는 이미 해결된 UTC에서 출발하므로 역사 오프셋/DST를 두 번 빼지 않는다.

EoT는 **겉보기 태양시 − 평균 태양시**이며 양수이면 진태양시가 앞선다.
`manseryeokEquationOfTimeAdapter`는 설치된 고정 공급자의 공개
`equationOfTimeMinutes(UTC milliseconds)`만 사용한다. 실제 UTC 시점으로 한 번 호출하며,
공급자의 결합 trueSolarTime/DST 옵션과 기본 경도는 사용하지 않는다.

출력은 실제 `instant`, `civilClock/civilOffsetSeconds`, `policyClock`,
`offsetFromUtcSeconds`, `correctionSeconds`, 사용 경도/EoT와 규칙·공급자 버전을 보존한다.
`policyClock`은 **시간대 없는 계산용 시계 라벨**이며 UTC나 새로운 IANA 현지 시각이 아니다.
물리적 UTC 시점은 변하지 않는다. 초 단위 오프셋과 소수 경도/EoT를 유지한 뒤 출력 시계만
가장 가까운 밀리초로 반올림한다. 이 해상도는 천문학적 밀리초 정확도 보증이 아니다.
보정량과 시계/UTC의 산술 일치, EoT의 시점/부호 관례/고정 버전을 strict/readonly DTO로 검증한다.

```ts
import { prepareBirthTime } from "@/application/solar-time";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import {
  manseryeokCalendarConversionAdapter,
  manseryeokEquationOfTimeAdapter,
} from "@/infrastructure/manseryeok";

const result = prepareBirthTime(analysisInput, {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
  equationOfTime: manseryeokEquationOfTimeAdapter,
});
// 서울 2024-01-01 12:00 / 경도 127.5 / mean-solar:
// UTC 03:00:00Z, 정책 시계 11:30:00.000, 보정 -1800초
```

애플리케이션은 AnalysisInput 검증 → 필요하면 음양력 변환 → IANA 해석 → 태양시 순서다.
미상 시각은 unavailable/BIRTH_TIME_UNKNOWN, 평/진태양시 경도 미상은
unavailable/LONGITUDE_UNKNOWN이며 의존 포트를 호출하지 않는다. fold/gap 거절에는
태양시나 EoT를 만들지 않고, earlier/later를 명시하면 실제 해결된 시점에 적용한다.
`normalizeBirthTime`은 계속 민간시 전용이고 CLI `normalize-time`은 이 새 서비스를 실행한다.

민간시 입력 범위는 기존 1800~2300년, 음력은 기존 변환 범위를 따른다. UTC는 연초/연말의
인접 연도로 이동할 수 있어 EoT 요청은 1799~2301년으로 검증한다. EoT ±30분은 손상 응답
차단 범위다. SDK 예외와 잘못된 출력은 고정 SolarTimeError 코드/문구로 반환하며 원문/cause를
보관하지 않는다. 시주·자시·미상 시각 후보와 사주 계산 연결은
[WBS-09 calculate-policy](../policy-calendar/README.md)에서 제공한다.

독립 기준과 한계:

- [NOAA 계산식](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)의 경도·시간 보정 관계 및
  [USNO EoT 정의](https://aa.usno.navy.mil/faq/eqtime)로 단위와 부호를 확인했다.
- `tests/fixtures/equation-of-time-golden.json`은 NOAA의 연주기 근사식으로 2024년 UTC 정오
  네 시점의 EoT를 별도 산출했다. 공급자 출력에서 기대값을 생성하지 않았다. 사전 허용차
  30초로 다른 근사 모델인 SDK Meeus 28.3과 대조하며 관측값의 정확한 골든으로 부르지 않는다.
- UTC 기반 근사이며 별도 UT1/DUT1 보정은 없다. 역사·미래 전 구간의 천문 정확도나 지역
  법정시의 실재를 독립 보증하지 않는다. IANA 해석과 EoT 모델의 버전을 재현 조건에 포함한다.

`npm test -- tests/solar-time.test.ts tests/solar-time-errors.test.ts tests/solar-time-application.test.ts`는
경도/DST/날짜 경계, 독립 EoT 근사, 손상 응답과 실제 npm CLI를 검증한다.
