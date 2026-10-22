# 십성·지장간·오행 기초 사실 — WBS-10

`deriveNatalFacts(knownPillars, catalog)`는 검증된 기둥과 공급자 타입 없는 기호 카탈로그를
받는 순수 함수다. year/month/day/hour 슬롯은 모두 필요하며 모르는 기둥은 null이다.
간지의 음양 짝이 맞는 60갑자 조합만 받는다. Node/Next/SDK/네트워크에 의존하지 않는다.

`manseryeokSymbolCatalogAdapter.load()`가 고정 2.0.0의 공개 음양·오행 조회와
`getTenGod(dayMaster, target)`를 사용해 10천간·12지지·100십성 조합을 제공한다.
모든 항목의 개수·유일성·고정 버전을 검증한다. 파생 함수는 알려진 기둥별로 다음을 반환한다.

- 천간의 오행·음양과 일간 기준 십성. 기준 일간 자신은 '일간'으로 구분한다.
- 지지의 오행·음양, 채택한 본기 천간과 본기 기준 십성.
- 해당 지지의 모든 지장간과 각 천간의 오행·음양·상대 십성, 본기 여부.
- 드러난 천간/지지의 `distribution.surface`와 지장간의 `distribution.hidden` 출현 개수.
  반복 출현은 각각 센다. 두 집계를 합치거나 강약/비율/용신 점수로 바꾸지 않는다.

지장간은 [연해자평 지지장둔가](https://zh.wikisource.org/zh-hant/淵海子平大全#又地支藏遁歌)의
집합을 채택한다. 子는 癸만, 卯는 乙만, 酉는 辛만, 亥는 壬·甲이며 전체 집합은 28개다.
본기를 첫 번째로 표시하고 나머지 순서는 표시 순서다. 월령별 사령 일수/분야표나
여기·중기 가중치를 혼합하지 않는다. 다른 학파의 추가 장간·배분은 이 관법에 포함하지 않는다.
본기 대응은 설치 SDK의 지지 십신 전제와 맞춘다.

모르는 기둥에는 facts도 null이며 관측하지 않은 기둥을 오행 0개로 확정하지 않는다.
`knownSurfaceSymbols/missingSurfaceSymbols`가 근거 범위를 표시한다. 일간이 불명확하면
모든 상대 십성은 null이고 알려진 기둥의 오행/지장간만 제공한다. 전부 미상이면
facts 상태는 unavailable, 모든 개수는 확인된 자료가 없어서 0이다.
4기둥이 알려지면 complete, 일부만 알려지면 partial이다. 이는 기초 사실의 범위 표시다.

```sh
npm run --silent saju -- derive-facts < tests/fixtures/cli-input.json
```

`application/natal-facts.calculateNatalFacts`는 WBS-09 계산 결과를 `calculation`에 보존하고
확정된 기둥만 `facts`에 전달한다. 미상 시각은 confirmedPillars만 사용하며 후보 시주를
확정 원국으로 합치지 않는다. 자시/절입 때문에 확정 일간이 없으면 십성을 채우지 않는다.
기둥 계산이 rejected/unavailable이면 카탈로그를 호출하지 않고 facts는 null이다.
최상위 상태가 partial이고 공통 기둥이 전혀 없으면 facts 자체는 unavailable일 수 있다.

CLI는 complete 종료 0, partial/unavailable 종료 2, 입력 오류 종료 2,
설정/공급자 오류 종료 1이다. 원문 생년월일·SDK 예외·cause를 일반 로그나 오류에 노출하지 않는다.
요청된 개발용 JSON 출력에는 계산에 필요한 결과 시각과 후보가 포함될 수 있다.

출력에는 원래 확정 기둥, 미상 한계, SDK 실제 이름/버전, 오행·십성·지장간·집계의
ruleId/ruleVersion/sourceRef, 지장간 관법과 스키마 버전을 기록한다.
카탈로그/결과는 중첩 strict/readonly DTO이며 분리 합계, 본기와 지장간 목록,
미상 전파, 원래 기둥과 결과의 대응도 검증한다.

독립 fixture는 같은 고전의 갑·을 일간 예시 및 지장둔가를 전사하고 나머지 십성 대응을
오행 생극·음양 관례로 별도 산출했다. SDK 출력에서 기대값을 생성하지 않았다.
해당 Wikisource 전사본에는 출처 미확인/미완성 고지가 있어 비평 정본으로 취급하지 않는다.
이는 채택한 기초 규칙의 일관성 검증이며 고전의 숙명적 해석은 도입하지 않는다.
고전 출처 카탈로그와 기초 구조 규칙은 [WBS-11 판단 계층](../judgment/README.md)에서 제공한다.
강약/용신·성격/길흉 판단과 확장 M01/F01~F11은 후속 범위다.

`npm test -- tests/natal-facts.test.ts tests/natal-facts-errors.test.ts tests/natal-facts-service.test.ts`는
100십성/12지장간·음양오행/미상·합계·오류·실제 CLI를 검증한다.
