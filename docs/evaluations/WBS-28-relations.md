# WBS-28 — M02 천간·지지 관계

## 구현 전 완료 조건

- PR #29의 develop MERGED(`4540093`)와 origin/develop 포함 확인. develop fast-forward, 직전 브랜치 안전 삭제 후 `feature/WBS-28-ganji-relations` 한 개에서 진행한다. WBS.csv 실행순서 29, 선행 WBS-27을 충족한다.
- 기존 간지 타입을 재사용한 순수 `domain/judgment/relations`에 출처가 있는 천간 오합/사충, 지지 육합/삼합/방합/충/형/자형/파/해 대응표를 구현한다. 1~32개 기둥 참조와 natal/luck/annual/monthly/daily/personA/personB 출처·맥락·위치를 보존한다.
- 관계 존재와 강도/합화 성립은 별개다. 존재하는 글자 조합만 confirmed로 기록하며 합화·강도는 미평가로 남긴다. 누락 기둥이나 두 글자로 삼합/방합을 완성하지 않고, 동일 기둥을 두 번 사용해 자형을 만들지 않는다.
- 입력 순서와 무관한 ID/정렬, 동일 관계 중복 제거, 다른 위치의 같은 글자 구분, 합과 충·형·파·해의 공존을 보존한다. 형의 두 글자 채택/삼자 완비 정책과 천간충 채택 여부를 명시한다. 관법 차이로 결과를 묵시적으로 바꾸지 않는다.
- 기존 코어·M01 계산을 한 번 재사용하는 애플리케이션/검토용 CLI를 연결하고 기존 JSON/해시·M01 후보를 바꾸지 않는다. M03/M09, UI/API, 기간 계산·궁합 해석·서술은 구현하지 않는다.

## 먼저 정의한 테스트

- 양성: 대응표 모든 행과 역순, 3글자 삼합/방합, 형/자형, 파·해, 출처/근거 경로.
- 음성: 표에 없는 모든 천간/지지 쌍, 삼합/방합의 각 누락 조합, 단일 辰의 자형 부재, 없는 戊己 천간충, 미상 기둥에서의 관계 생성 금지.
- 경계: 같은 글자 다른 위치, 세 글자 형의 pairwise/full-group 정책, 복수 합 상대·상반 관계 공존, 입력 순열 동일성, 1/32/33개, 중복 ID/동일 위치·맥락 중복 거절.
- 오류/계약: 잘못된 간지/음양 불일치/출처/관법/추가 필드 거절, 원문 없는 오류, 입력 불변·출력 동결/JSON 왕복.
- 통합: 원국 1회 계산, 기존 코어 해시/M01 동일, 미상 시각과 일주 미확정, 불가 사유, 실제 stdin CLI, 관련 기존 회귀.

## 근거와 채택 정책

- [삼명통회 권2](https://zh.wikisource.org/wiki/三命通會/卷二): 논십간합/화기, 논지원육합/삼합, 논삼형/육해/충격의 **글자 대응만** 채택한다. 형의 방향에 따른 인과·강도, 운명·질병·관계·빈부 단정은 채택하지 않는다. 삼합은 세 글자 완비를 요구하고 土局/반합/공합은 미채택이다.
- [삼명통회 사고전서본 권6](https://zh.wikisource.org/wiki/三命通會_(四庫全書本)/卷06): 寅卯辰/巳午未/申酉戌/亥子丑의 동방/남방/서방/북방 집합만 방합 표로 운영화한다. 글자 완비가 오행 변화 확정을 뜻하지 않는다.
- [선택기요 상편](https://zh.wikisource.org/wiki/選擇紀要/上編)의 천간충: 甲庚/乙辛/丙壬/丁癸 네 쌍을 명시적 선택 정책으로 채택한다. 戊己 충은 만들지 않으며 천간충 미채택 선택도 지원한다.
- [육임대전 권1](https://zh.wikisource.org/wiki/六壬大全/1)의 破 대응: 子酉/卯午/辰丑/未戌/寅亥/巳申만 채택한다. 이는 술수 원전의 대응표 참조이며 육임 점단이나 명리적 효과를 이식하는 것이 아니다. 서로 다른 문헌을 삼명통회 한 출처로 뭉치지 않는다.
- 웹 원전 전사를 구현자가 대조한 범위이며 교감 정본·명리 전문가 승인·과학적 유효성 인증이 아니다. 형 pairwise/full-group은 동일 표의 두 운영 정책이며 새 학파를 지칭하지 않는다. 원국 위치 인접성/계절·투출/합화·강도는 미평가 한계로 명시한다.

## 구현 및 검증 결과

- `domain/judgment/relations/{schemas,catalog,index}.ts`: 엔진 없는 Zod 계약, 원전별 출처 카탈로그와 54개 버전 규칙 행, 순수 관계 엔진을 구현했다. 기본 정책은 52행, full-group 형 선택은 두 삼자 행을 사용한다. 존재가 확인된 관계와 별개로 effect의 강도/합화는 unavailable/not-assessed다.
- canonical reference ID 정렬과 조합 열거로 입력 순서와 무관한 결과를 만들고 같은 규칙·같은 참여자 집합의 중복을 방지했다. 다른 위치의 반복 글자는 별도로 남긴다. 같은 층위의 합/대립 공존 및 복수 합 상대는 관계 ID를 참조하는 미해결 검토 항목이며 자동 합 해소나 사건 예측이 아니다.
- `application/relations`는 기존 코어/M01을 한 번 계산하고 확정 natal 기둥으로 관계만 추가한다. 원국 불가 사유, 코어 JSON/해시 및 M01 후보/제약은 그대로 유지한다. CLI `diagnose-relations`를 추가했다. 강도/합화 미평가로 정상 출력도 partial/종료 2이며 오류 stderr와 구분한다.
- 최초 모듈 부재 RED를 확인한 뒤 신규 4파일 **161건 PASS**. 천간 55쌍·지지 78쌍(반복 포함)의 독립 수기 양성/음성 대응표와 역순, 삼합/방합 8집합의 각 글자 누락·순열, 형 정책 차이, 출처 7종, 단일/반복 자형, 1/32/33개 및 중복 거절, 불변/출력 동결·근거 경로, 원국 1회 계산/기존 해시, 미상 시각/일주, 실제 stdin CLI를 검증했다.
- 최종 관련 회귀 **18파일 550/550 PASS**. 전체 테스트는 사용자 AGENTS 지침에 따라 일괄 실행하지 않았다.

```sh
npm test -- tests/relations.test.ts tests/relations-tables.test.ts tests/relations-contract.test.ts tests/relations-service.test.ts tests/structure.test.ts tests/structure-policy.test.ts tests/structure-service.test.ts tests/natal-facts.test.ts tests/natal-facts-errors.test.ts tests/judgment.test.ts tests/judgment-service.test.ts tests/arbitration.test.ts tests/core-export.test.ts tests/core-export-service.test.ts tests/core-fingerprint.test.ts tests/independent-core-golden.test.ts tests/cli.test.ts tests/policy-cli.test.ts --maxWorkers=1
```

- `npx tsc --noEmit`, `npm run lint`(경고 0), 변경 TS/CLI·모듈 문서의 기본 LF Prettier 검사, 문서 링크 54파일/86링크/0오류, `git diff --check` PASS. 중간 타입 검사에서 문자열 리터럴 추론 2건이 실패하여 명시적 타입으로 고친 뒤 재검증했다. 실제 CLI 테스트는 앞서 확인된 Windows 샌드박스 tsx 프로세스 제한을 피하는 승인된 정상 프로세스 환경에서 실행했다.
- 기존 Windows CRLF 체크아웃/저장소 LF 설정 차이는 범위를 넓혀 수정하지 않았다. 전체 format:check/build/E2E는 이번에 미실행했다. UI·웹 route 변경이 없으며 관련 CLI/도메인 회귀를 검증했다. 실제 OpenAI 0회(`LIVE_NOT_RUN`), DB/PG/시크릿/CI 변경 없음. 원전 확인은 전문가 승인으로 간주하지 않는다.
