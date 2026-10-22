# IANA 현지 시각 정규화 — WBS-07

`LocalTimeRequestSchema`와 `TimeZoneAdapter.resolve`는 명시적인 양력 현지 시각
`YYYY-MM-DDTHH:mm`, IANA ID(또는 UTC), `reject/earlier/later` 정책을 받는다.
요청 범위는 1800~2300년이다. 빠진 시간대·시각·정책에 기본값을 주지 않고,
오프셋 문자열/약어, 초 단위 입력, 실재하지 않는 날짜와 추가 필드를 거절한다.
기존 입력의 TimezoneIdSchema를 재사용하고 입력 별칭을 보존한다.

```ts
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";

const result = temporalTimeZoneAdapter.resolve({
  localDateTime: "1988-10-09T02:30", timezoneId: "Asia/Seoul",
  disambiguation: "later",
});
// status: resolved, kind: fold
// resolved: { instant: "1988-10-08T17:30:00Z",
//   localDateTime: "1988-10-09T02:30:00", offsetSeconds: 32400 }
```

| kind | reject | earlier / later |
| --- | --- | --- |
| unique | UTC 한 개 반환 | 같은 UTC, 요청한 정책은 보존 |
| fold(반복된 현지 시각) | rejected / AMBIGUOUS_LOCAL_TIME, resolved 없음 | 이른/늦은 UTC 선택, 현지 시각은 유지 |
| gap(생략된 현지 시각) | rejected / NONEXISTENT_LOCAL_TIME, resolved 없음 | 전환 폭만큼 이전/이후의 유효한 현지 시각으로 이동 |

정책은 [Temporal의 모호성 처리](https://tc39.es/proposal-temporal/docs/timezone.html)를 따른다.
gap에서 원래 현지 시각이 유효해졌다고 표시하지 않는다. request와 resolved를 함께
반환해 30분/1시간/하루 생략의 이동을 드러낸다. offsetSeconds는 초 단위 정수이며,
서울 1900년 LMT의 +08:27:52처럼 분 미만 오프셋도 반올림하지 않는다.
입력 시각이 분 단위여도 UTC는 초 단위가 될 수 있다.

응답은 중첩 strict/readonly JSON DTO다. UTC+오프셋과 해결된 현지 시각의 일관성,
unique/fold/gap과 명시적 정책의 일관성을 검증한다. 원래 요청과 다른 응답은
애플리케이션 경계에서도 거절한다. 오류는 TimeZoneAdapterError의 고정 코드/문구이며
공급자 원문·cause·Zod issues를 보관하거나 일반 로그로 보내지 않는다.

도메인/애플리케이션은 Temporal/Next/Node I/O에 의존하지 않는다. Node 전용
`infrastructure/timezone`이 `@js-temporal/polyfill@0.5.1`과 런타임 Intl을 사용한다.
설치 패키지 이름/버전(공개 dist 진입점 옆 manifest), Node의 ICU/tzdb 버전을 읽어
ruleId=`time.local-to-instant`, ruleVersion=`1.0.0`과 함께 기록한다.
호스트 기본 시간대·Date.now·공급자 네트워크 API는 사용하지 않는다.
만세력 계산은 계속 지정 manseryeok이며 이 모듈에서 일주/태양시를 재계산하지 않는다.

`application/time-normalization.normalizeBirthTime`은 기존 AnalysisInput을 받는다.
미상 시각은 unavailable/BIRTH_TIME_UNKNOWN으로 반환하고 두 포트를 호출하지 않는다.
음력은 지정 날짜 변환 포트로 실제 날짜/윤달을 검증·양력화한 뒤 IANA 시각을 해석한다.
`time.request.localDateTime`은 그 양력 벽시계이며 원본 AnalysisInput은 변경하지 않는다.
변환된 양력 연도가 1800~2300인지 검사한다. 정규화 성공 상태는 `normalized`다.
solarTime/dayBoundary는 후속 정책 단계이고 기존 미상/한계 메타데이터를 유지한다.
전체 사주 계산이나 F01~F11 완료를 의미하지 않는다.

`npm run --silent saju -- normalize-time < input.json`은 WBS-08의
[`prepareBirthTime`](../solar-time/README.md)을 통해 이 서비스와 명시적 태양시 정책을 순서대로 실행한다.
기존 `calculate`는 fixed UTC+9 전용 계약을 유지한다. 일반 지역의 민간시/UTC와
공급자의 고정 UTC+9 계산 시각을 이름만 바꿔 연결하면 일주·시주가 달라질 수 있으므로,
WBS-09의 일 경계/시주 연결에서 검증해야 한다.

독립 fixture는 [IANA 2025b Asia](https://data.iana.org/time-zones/tzdb-2025b/asia),
[North America](https://data.iana.org/time-zones/tzdb-2025b/northamerica),
[Australasia](https://data.iana.org/time-zones/tzdb-2025b/australasia)의 Zone/Rule에서
UTC와 이동 시각을 수기 계산했다. 서울 역사 오프셋/DST, New York, Lord Howe 30분,
Apia 하루 생략과 정확한 fold/gap 구간 끝값을 검증한다. UTC/호놀룰루 호스트 설정에서
실제 npm CLI 결과도 대조한다. fixture 기대값을 Temporal 출력으로 생성하지 않았다.

**재현 한계:** 잠금 파일은 polyfill 버전을 고정하지만 IANA 데이터는 런타임 ICU에서 온다.
ICU/tzdb 변경 시 결과가 달라질 수 있어 해당 버전도 저장/캐시·재현 조건에 포함해야 한다.
IANA 자체가 특히 오래된 역사 자료의 불확실성을 고지하며 이 테스트는 IANA 규칙과의
호환성 확인이다. 모든 시대의 실제 민간시 기록이나 미래 법령 변경까지 보증하지 않는다.
필요한 ICU/tzdb 버전 정보가 없는 런타임은 유효한 응답을 만들 수 없어 실패한다.

`npm test -- tests/timezone.test.ts tests/timezone-errors.test.ts tests/time-normalization.test.ts tests/normalize-time-cli.test.ts`
