# 지정 manseryeok 패키지 어댑터 — WBS-01

공급자는 [yhj1024/manseryeok](https://github.com/yhj1024/manseryeok)로 고정한다.
npm `manseryeok@2.0.0`의 package.json, dist/index.d.ts, dist/types.d.ts 및 실제 JS를 확인했다.
직접 버전과 npm 잠금 파일을 고정하고 공급자 import/타입 사용은 `adapter.ts` 내부에 한정한다.
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
- 실제 절입·일주 경계/시간대/미상 시각·시주/태양시·대운·30건 종합 골든은 각 후속 WBS 범위다.

`npm test -- tests/manseryeok-adapter.test.ts`는 네트워크 없이 설치된 실제 라이브러리를 호출한다.
OpenAI·PG 등 외부 공급자 호출이나 API 키는 필요하지 않다.
