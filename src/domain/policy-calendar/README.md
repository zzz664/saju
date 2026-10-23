# 자시·시주와 미상 시각 후보 — WBS-09

`application/policy-saju.calculatePolicySaju`는 기존 AnalysisInput을 검증하고 음양력 변환,
IANA 현지 시각 해석, 태양시 정책, 고정 manseryeok 계산을 연결하는 순수 서비스다.
입력/출력에 SDK 타입·Node I/O·외부 서비스가 들어가지 않는다.

```sh
npm run --silent saju -- calculate-policy < input.json
```

알려진 시각은 `status: calculated`와 `snapshot`, `time`, `solarTime`, `information`을 반환한다.
원래 현지 시각과 해결된 UTC·역사 오프셋·태양시 보정/버전을 보존한다.
연·월주는 절입의 **실제 UTC**, 일·시주는 선택한 **정책 시계**로 계산한다.
태양시 보정이나 자시 정책으로 입춘 순간을 옮기지 않는다.

| dayBoundary | 정책 시계 23:00~23:59의 일주 | 시주 천간의 기준 일간 |
| ----------- | ---------------------------- | --------------------- |
| midnight    | 당일                         | 당일                  |
| zi-start    | 다음날                       | 다음날                |

12시진은 자시 23:00~01:00, 축시 01:00~03:00 순서이며 시작을 포함하고 끝을 제외한다.
`zi-start`는 SDK `jasi`에 매핑한다. 분리자시(splitJasi)는 기존 입력 계약에 없어 채택하지 않는다.
23시부터 일주·시주 기준을 함께 다음날로 보는 관법을 명시적으로 선택하는 것이며,
다른 관법의 보편적 정답이라고 주장하지 않는다.

`PolicyCalendarAdapter`는 `{ instant, policyClock, dayBoundary }`를 받고 같은 요청을
snapshot에 반영한다. 두 시계를 SDK 공개 `calculateFourPillars`에 각각 투영한다.
실제 UTC+9 시계 호출의 연·월주와 정책 시계 호출의 일·시주만 조합한다.
private 모듈 import나 간지 계산식 복제는 없다. 두 호출 모두 보정 옵션을 끄며
경도 기본값·한국 역사 DST·EoT를 다시 적용하지 않는다.

SDK는 분 단위 입력이므로 각 시계의 초/밀리초를 **분 내림**한다. 분 단위 절입과
시진 경계의 시작 포함 판정을 유지하며 경계 직전 초를 다음 분으로 반올림하지 않는다.
ruleId=`calendar.policy-pillars`, ruleVersion=`1.0.0`, 실제 라이브러리 버전과
`absolute-utc/policy-clock/floor-minute` 전제를 반환한다. 원래 UTC와 정책 시계의
초/밀리초는 snapshot 요청에 보존하지만 천문학적 초 정밀도를 보증하지 않는다.

SDK 지원 범위 때문에 **실제 UTC+9 투영 연도와 정책 시계 연도 모두 1800~2300**이어야 한다.
IANA 입력 범위 안이어도 날짜 이동으로 이 구간을 벗어나면 PILLAR_RANGE_UNSUPPORTED다.
음력은 기존 변환 범위와 실제 윤달/날짜 검증을 거친다. fold/gap 거절에는 기둥을 만들지 않고,
earlier/later를 명시한 경우 해결된 시점을 사용한다. 요청/응답·버전 불일치와 손상 결과는
CalendarAdapterError로 차단하고 공급자 원문·cause를 노출하지 않는다.

출생시각이 unknown이면:

- 분 단위 입력 계약의 00:00~23:59 **1,440개 가설**을 전부 평가한다. 특정 시각을 관측값으로
  채우거나 정오/자정을 대표값으로 고르지 않는다. 음력 날짜 변환은 한 번만 한다.
- 같은 기둥/거절/미지원 결과의 인접 입력 분을 합친다. `startMinute` 포함,
  `endMinuteExclusive` 미포함이며 전체 구간은 0~1440을 빠짐없이 덮는다.
  구간은 원래 입력 달력 날짜의 현지 **분 라벨**이며 실제 경과 시간이나 연속적인 초 범위가 아니다.
- 상태는 partial, `confirmedPillars.hour`는 항상 null이다. 확정 snapshot/단일 UTC/태양시가 없다.
  모든 분이 계산 가능하고 같은 경우에만 연·월·일주 공통값을 반환한다. 입춘/23시/태양시 날짜
  경계를 넘거나 미해결 구간이 있으면 해당 값은 null이다. 후보를 확정 원국으로 사용하면 안 된다.
- 후보는 possible/rejected/unavailable로 구분한다. 후보 수에 확률을 부여하지 않는다.
  하루 전체가 거절되면 NO_RESOLVED_CANDIDATES, 전체 미지원이면 해당 사유로 unavailable다.
  예상 밖 공급자 장애는 부분 성공으로 감추지 않고 실패시킨다.
- context에 원래 달력/날짜/윤달/시간대/정책과 unknown을, provenance에 전수 평가 기준과
  SDK·정규화 버전을 기록한다. 기존 미상/한계 메타데이터도 유지한다.

known 성공의 CLI 종료 코드는 0, partial/rejected/unavailable은 2, 잘못된 입력은 2,
설정/공급자 실패는 비식별 오류와 함께 1이다. 기존 `calculate`는 고정 UTC+9 전용이고
`normalize-time`은 민간시/태양시 전용이다. UI·DB·LLM·F01~F11 판단은 후속 작업이다.

독립 검증은 [HKO 표 3·5](https://www.hko.gov.hk/tc/gts/time/stemsandbranches.htm)의 시진과
일간별 시간 대응표, 기존 [KASI 공식 일진 앵커](https://www.kasi.re.kr/file/htmlconverter_preview/1687408104839_1.hwp.files/4.html)를
함께 사용한다. fixture는 공급자 결과에서 생성하지 않았다. 다음날/자시 예상값은
앵커와 명시된 정책에서 수기 산출했으며 천문대가 자시 관법을 인증한 것으로 표현하지 않는다.
입춘 시각은 기존 WBS-05의 분 해상도와 검증 한계를 따른다.

`npm test -- tests/policy-calendar.test.ts tests/policy-calendar-errors.test.ts tests/policy-saju.test.ts tests/policy-cli.test.ts`로
정상·경계·손상 응답·후보·실제 CLI를 검증한다.
