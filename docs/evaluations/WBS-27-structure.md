# WBS-27 — M01 원국 구조 진단

## 구현 전 완료 조건

- 선행 WBS-12(PR #13), 실행순서 선행 WBS-26(PR #26), 직전 리팩터링 PR #28의 develop 병합/포함 확인. 기준 develop `aeb34aa`에서 기능 브랜치 한 개를 사용한다.
- 기존 원국·지장간·오행·십성을 재사용하는 순수 M01을 `domain/judgment/structure`에 추가한다. 기존 코어 JSON/해시·페르소나·LLM 입력 계약을 바꾸지 않는다.
- 월령 관찰, 동일 글자/동일 오행 통근 범위, 장간 투출, 월령·통근·천간/장간 인비·설극을 함께 보는 조건부 강약 후보, 월령 격국/용신 후보와 조후 후보를 각각 출처·버전·정책·예외로 추적한다. 단순 원소 개수·점수로 강약을 정하지 않는다.
- 승인 목록의 두 운영화 관법(`four-season-exact-root`, `month-qi-element-root`)을 분리하고 서로 다른 결론을 덮어쓰지 않는다. 사계와 월지 본기의 비교는 특히 토 월에서 서로 다르며 실제 절입 경과일별 사령을 계산한 것으로 표시하지 않는다.
- 격국/용신/강약은 **후보**다. M02의 합충·합화 및 전체 성패는 이번 WBS에서 구현하지 않고 미평가 한계를 명시한다. 조후 v1은 확인한 원전의 **갑목·인월의 병/계 후보**만 채택하고, 다른 조합은 규칙 미채택으로 명시한다.
- 일반 사용자 UI/API나 M09/F01~F11을 만들지 않는다. 검토용 애플리케이션 함수와 `diagnose-structure` CLI로 실제 기존 계산과 연결한다.

## 먼저 정의한 테스트

- 정상/양성: 월지/일간별 계절 상태, 동일 장간·동일 오행 통근, 월지 본기/기타 장간 투출, 인비/설극과 뿌리를 함께 보는 후보, 갑·인월 조후 후보.
- 음성: 뿌리 불성립·투출 불성립, 인성을 통근으로 오인하지 않음, 일간 자신은 투출 대상에서 제외, 다른 월/일간에 조후 후보를 확장하지 않음.
- 경계: 입춘 1분 전/후, 토 월 관법 차이, 같은 오행 개수라도 다른 월령/뿌리, 미상 시주·미확정 일주·전부 미상.
- 오류: 잘못된 facts/임의 ruleSet/미지원 버전/추가 필드/중복 관법 거절, 원문 없는 오류, 불변성·결정성·구조 계약·근거 경로 검사.
- 통합: 기존 원국 1회 계산, 이전 코어 JSON/해시 그대로 유지, 정상/부분/불가 CLI 종료 코드, 관련 기존 독립 골든·중재·스키마 회귀.

## 근거와 채택 범위

- [삼명통회 권2](https://zh.wikisource.org/wiki/三命通會/卷二)의 계절 오행과 지장간 맥락을 참조한다. 오행 왕상휴수사와 월지 본기 비교는 전통 분류의 운영화이며 사령 일수/기상·과학적 강약 측정이 아니다.
- [자평진전 영인본](https://upload.wikimedia.org/wikipedia/commons/d/d5/NLC416-13jh002326-46443_淵海子平_子平真詮_第2卷.pdf)의 득시와 통근을 함께 보라는 구절, [논용신](https://www.donglishuzhai.net/chapter/3721.html)과 [논용신변화](https://www.donglishuzhai.net/chapter/3723.html)의 월령/장간 노출 원칙을 참조한다. 두 교감 전사 페이지는 직접 요청이 시간 초과여서 검색 색인의 원문 구절 확인 범위다.
- [궁통보감 삼춘갑목](https://zh.wikisource.org/wiki/穷通宝鉴#三春甲木)의 갑·인월 병/계 구절만 조후 후보로 채택한다. 숙명·빈부·질병·관계·수명 단정은 전부 제외한다.
- 소스 확인은 구현자의 원문/운영화 대조이며 명리 전문가 승인·비평 정본 인증·과학적 유효성 인증이 아니다. 구체 조건의 보수적 조합은 버전이 붙은 구현 정책이며 원전에 그대로 적힌 알고리즘으로 주장하지 않는다.

## 구현·검증 결과

- `domain/judgment/structure/{schemas,catalog,index}.ts`에 엔진 없는 Zod 계약, 독립 1.0.0 출처/채택 정책, 순수 진단 함수를 구현했다. 상세 분기와 제한은 [모듈 문서](../../src/domain/judgment/structure/README.md)에 있다.
- `application/structure`와 `diagnose-structure` CLI로 연결했다. 기존 코어는 한 번 계산하고 JSON/해시 내용을 유지한다. M01 결과는 강약·격국·용신 후보와 미평가 한계 때문에 v1에서 `partial`(전 기둥 미상/계산 불가면 `unavailable`)이다. CLI 정상 후보 출력도 종료 코드 2이며 stderr 오류와 구분한다.
- 최초 `tests/structure.test.ts` 4건을 구현 전에 실행하여 모듈 부재 실패(RED)를 확인했다. 구현 후 초기 4건 및 정책/경계/통합을 확장한 신규 83건이 통과했다. 월지 12종×일간 오행 5종의 수기 기대표, 조후 120조합 중 채택 1조합/미채택 119조합, 입춘 전/경계/후, 뿌리·투출 음성, 시각/일주 미상, 오류·불변·출처/근거 경로 및 실제 stdin CLI를 검증했다.
- 관련 기존 회귀를 포함한 최종 명령은 아래 14파일 **389/389 PASS**다. 사용자 지침에 따라 전체 테스트 일괄 실행은 하지 않았다.

```sh
npm test -- tests/structure.test.ts tests/structure-policy.test.ts tests/structure-service.test.ts tests/natal-facts.test.ts tests/natal-facts-errors.test.ts tests/judgment.test.ts tests/judgment-service.test.ts tests/arbitration.test.ts tests/core-export.test.ts tests/core-export-service.test.ts tests/core-fingerprint.test.ts tests/independent-core-golden.test.ts tests/cli.test.ts tests/policy-cli.test.ts --maxWorkers=1
```

- `npx tsc --noEmit`, `npm run lint`, `npm run check:docs`(52파일/83링크/0오류), 변경 TS/모듈·CLI 문서의 LF 포맷 검사, `git diff --check` PASS.
- 기본 `npm run format:check`는 Windows 체크아웃의 기존 CRLF와 설정 `endOfLine: lf` 차이로 실패했다. 최초 179파일 경고 중 이번 문서 2건을 포맷했다. 기존 파일은 작업 범위를 넓혀 고치지 않았다. `git ls-files --eol`로 기존 파일의 index=LF/working=CRLF를 확인했고, `npm run format:check -- --end-of-line auto`는 전체 PASS다. 설정 변경이나 테스트 실패 무시 옵션은 쓰지 않았다.
- 중간 통합 검사의 CLI 2건은 새 분기가 JSON 파싱보다 먼저 실행되어 실패했고 파싱 이후로 고쳐 재검증했다. 실제 stdin 1건은 Windows 샌드박스 `uv_os_get_passwd ENOMEM`으로 실패하여 정상 프로세스 환경에서 재실행했고 최종 회귀에도 포함해 통과했다.
- UI/웹 route 변경이 없어 build/E2E는 미실행. 실제 OpenAI 호출 0회(`LIVE_NOT_RUN`), DB/PG/시크릿/CI 변경 없음. 조후 미채택 조합, 합충·합화 미평가와 전문가 미승인은 남은 명시적 제약이며 통과로 포장하지 않는다.
