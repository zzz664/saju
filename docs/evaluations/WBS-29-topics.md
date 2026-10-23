# WBS-29 — M03 주제별 판단 규칙

## 구현 전 완료 조건

- PR #30의 develop MERGED(`e7deb19`)와 origin/develop 포함, 선행 WBS-27 PR #29 포함 확인. develop fast-forward/이전 브랜치 안전 삭제 후 `feature/WBS-29-topic-judgments` 한 개에서 진행한다. 실행순서 30의 WBS-29만 수행한다.
- 기존 facts/M01/M02를 바꾸지 않는 순수 `domain/judgment/topics`에 temperament/strengths/career/wealth/romance/social 6개 규칙팩을 둔다. 선택한 주제의 규칙만 평가하고 원국·십성·관계를 새로 계산하지 않는다.
- 각 팩은 복합 기호 조건 두 개와 상충 맥락 보류 규칙을 갖는다. 단일 십성·성별·기호 개수로 인격/능력/적직/재물/결혼을 확정하지 않는다. 주제별 검토 후보와 실제 성향·미래 예측은 구분한다.
- 출처·운영 정책·독립 버전·입력 증거·우선순위·미상·충돌을 추적한다. 구조 불확실성/관계 공존 검토 규칙이 낮은 우선순위 후보보다 우선하며 후보를 삭제하지 않고 보류한다. 원국/M01/M02 불일치·변조 입력은 거절한다.
- 원국/M01/M02를 한 번 산출한 뒤 주제를 적용하는 application/CLI를 추가한다. M09/F01~F11·UI/API·LLM·기간/궁합·DB/PG는 구현하지 않는다.

## 먼저 정의한 테스트

- 정상: 6주제 각각의 두 복합 조건, 주제별 필요한 규칙만 평가, 입력 원국/M01/M02 불변, 출처/근거 경로·버전 추적.
- 음성/경계: 단일 십성군, 일간 자신, 단일 기호 반복을 복합으로 오인하지 않음. 미상 시주·일주, 일지 없는 연애 판단 제외. 강약 후보/관계 효과 미평가를 확정 해석으로 승격하지 않음.
- 충돌: 구조/관법 차이·일지 관계 공존·복수 합 상대, 높은 우선순위 검토 규칙에 따른 보류, 낮은 후보가 검토를 덮지 않음.
- 오류: 미지원 주제·추가 필드·다른 원국/기간/두 사람의 M02·M01/M02 변조 거절, 원문 없는 오류, JSON 왕복·출력 동결/결정성.
- 통합: 원국/기초 모듈 1회 산출, 기존 코어 JSON/해시 동일, 성별 기준 male/female/unspecified가 같은 기둥에 다른 주제 결론을 만들지 않음. 실제 CLI/관련 회귀, 전체 테스트 자동 실행 없음.

## 채택 범위

고전의 십성군/상호 맥락 원칙과 기존 M01/M02의 근거를 재사용한다. 학습·표현·자원·역할·자기기준 등의 현대적 검토 문구와 두 범주의 결합 조건은 **명시한 구현 정책**이며 원전에 그대로 있는 성격 알고리즘이나 과학적·전문가 승인 결과로 표시하지 않는다. 연애는 성별별 배우자성 고정 규칙을 쓰지 않고 확인된 일지 관계와 다른 기둥의 맥락만 검토한다. 규칙 미성립을 반대 성향이나 능력 부족으로 해석하지 않는다.

원전은 삼명통회 권5의 인식관재 명의/복합 생극 맥락과 권2 관계 표지를 대조했다. source URL·확인 범위·운영화 설명은 모듈 catalog.ts/README에 있다. 원전에서 현대적 성격·업무 능력/연애 결과가 검증됐다고 주장하지 않는다.

## 구현·검증 결과

- topics/{schemas,catalog,context,index}.ts에 6주제×3규칙(복합 후보 12개/맥락 검토 6개), 입력 의미 검증과 불변 결과를 구현했다. 선택 주제 3개 rule ID만 평가하며 근거 경로/실제 값, 버전, 우선순위, 후보·보류 및 양방향 충돌 ID를 기록한다. 상충 검토가 있으면 낮은 우선순위 후보를 보존한 채 deferred로 두며, 상충 근거가 없을 때도 partial 후보만 반환한다.
- M01/M02의 계산 규칙/버전은 바꾸지 않고 parseStructureDiagnosis/parseRelationAnalysis 의미 검증 경계를 추가했다. 내부 엔진이 생성한 불변 결과는 WeakMap/WeakSet으로 재사용하고, 외부 JSON은 기존 facts/참조로 모듈 결과를 대조한다. application/structure·relations의 Zod 경계를 유지하며 검증된 자식 참조를 보존해 내부 호출에서 엔진 중복 실행을 피했다.
- application/topics와 `diagnose-topic <topic>` CLI를 추가했다. core/M01/M02를 한 번 산출하고 검토 주제만 적용한다. 미지원 주제는 계산/표준입력 대기 전에 거절한다. 기존 JSON/해시·원국/M01/M02 값과 불가 사유를 유지한다. M09/F01~F11·UI/API/서술은 구현하지 않았다.
- 모듈 부재 초기 RED 확인 후 신규 3파일 **34건 PASS**. 10개 십성군 복합 규칙의 양성/각 군 누락, 연애 2규칙의 양성/일지·월지 누락, 한 군 반복·일간 제외, 6팩 매핑/근거 경로, 우선순위·상호 보류와 후보 유지, 변조/타 원국·기간/두 사람 입력 거절, JSON 왕복/출력 동결, 실제 stdin CLI, 성별 기준 3종×6주제 결과 동일성을 검증했다. 중간 1건은 보류 참조의 정렬 순서가 결과 순서와 달라 실패했고 ID 정렬로 고쳐 재검증했다.
- 최종 관련 회귀는 **21파일 584/584 PASS**다. 전체 테스트는 사용자 AGENTS 지침대로 일괄 실행하지 않았다.

```sh
npm test -- tests/topics.test.ts tests/topics-policy.test.ts tests/topics-service.test.ts tests/relations.test.ts tests/relations-tables.test.ts tests/relations-contract.test.ts tests/relations-service.test.ts tests/structure.test.ts tests/structure-policy.test.ts tests/structure-service.test.ts tests/natal-facts.test.ts tests/natal-facts-errors.test.ts tests/judgment.test.ts tests/judgment-service.test.ts tests/arbitration.test.ts tests/core-export.test.ts tests/core-export-service.test.ts tests/core-fingerprint.test.ts tests/independent-core-golden.test.ts tests/cli.test.ts tests/policy-cli.test.ts --maxWorkers=1
```

- npx tsc --noEmit, npm run lint(경고 0), 변경 TS/CLI·모듈 문서의 LF Prettier, 문서 링크 56파일/89링크/0오류, git diff --check PASS. 실제 CLI는 앞서 확인된 Windows 샌드박스 tsx 프로세스 제한을 피하는 승인된 정상 프로세스 환경에서 검증했다.
- 한계/미실행: 후보·보류형 정책이며 전문가 승인/과학적 성격 예측이 아니다. 기존 M01의 관법 차이/강약 후보와 M02의 강도/합화 미평가는 유지한다. 전체 format:check/build/E2E는 이번에 미실행(UI/웹 route 변경 없음, 기존 CRLF 체크아웃 보존). 실제 OpenAI 0회/LIVE_NOT_RUN, .env/.local 실제 예산 파일 열람·변경 없음, DB/PG/시크릿/CI 변경 없음.
