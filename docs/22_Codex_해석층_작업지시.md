# Codex 작업 지시 — 해석 층 재설계 이후 (v2.6)

> 이 문서는 `05_Codex_작업지시_프롬프트.md`의 **보충**이다. 05의 1WBS·1브랜치·1PR·머지 게이트·Live 금지 규칙은 그대로다. 여기에는 해석 카탈로그(IK)·서술 계획(NP)이 들어온 뒤 Codex가 **정확히 어디를 어떻게 고쳐야 하는지**를 적는다. 모르는 채 추측하지 않도록 파일 경로와 함수 이름을 명시한다.

## A. 먼저 읽을 것 (순서대로)

1. `AGENTS.md` — 해석/서술 원칙이 바뀌었다(LLM은 서술 계획 안에서만 문장을 만든다).
2. `docs/decisions/2026-10-24_해석층_재설계_결정.md` — 왜 바꿨는지, 무엇을 보장하고 무엇을 보장하지 않는지.
3. `src/domain/interpretation/README.md` — 조건 키·카탈로그·수집/요약 스크립트.
4. `src/domain/narration/README.md` — 서술 계획·렌더링·검증(hard/soft)·캐시 키·Mock.
5. `docs/12_공통_시스템_프롬프트.md`(v1.1.0), `docs/20_…프롬프트.md`(R02는 beat 단위).
6. `docs/WBS.csv`의 `WBS-69/70/71`과 재정의된 `WBS-32~35`.

## B. 현재 구조 한 장 요약

```
executeFeature(request)  →  FeatureResult (M01~M03·M09, 변경 없음)
  └ buildFeatureNarrationInput(result)   확정 판정만 (status complete/confirmed/accepted)
matchInterpretations(facts, catalog, {topics})   조건 키 조회 → MatchedInterpretation[] (usable 플래그)
buildNarrationPlan({input, facts, interpretations, keys}, spec, hash)   → NarrationPlan (beats, E1…, limitations, planKey)
composeNarrationRequest(plan, persona, modelId)   → instructions / developer(스타일 산문+계약+예시) / user(planForModel JSON) / strict schema
receiveNarrationText → validateNarrationDraft(text, plan)  [hard: NarrationRejection code]
                     → scoreNarrationStyle(narration, persona) [soft: score, issues]
```

- 애플리케이션 진입점: `src/application/narration/feature.ts`의 `prepareFeatureNarration` / `narrateFeature` / `createFeatureNarrationExperiment`.
- 서버 진입점: `src/server/api-test.ts`(Mock·Live 공통), `src/server/api-test-live.ts`(Responses 전송 + 영속 장부), `src/server/api-test-catalog.ts`(가상 사례·페르소나·카탈로그).
- Mock: `src/infrastructure/llm/plan-mock.ts`. 가짜 HTTP 복원: `tests/helpers/openai-wire.ts`.
- 삭제됨(다시 만들지 말 것): `domain/persona/{narration,data,prompt}.ts`, `application/narration/persona.ts`, `infrastructure/llm/{mock,persona-mock}.ts`, `FeatureNarrationSpec`, `narrateCore`, `createNarrationRequest`, `sections/title/evidenceIds` 출력 계약, `core-base` 기능 ID.

## C. 새 기능(F02·F04·F05·F06…)에 서술을 붙이는 절차 — 복사용

```text
AGENTS.md, docs/decisions/2026-10-24_해석층_재설계_결정.md, src/domain/interpretation/README.md, src/domain/narration/README.md, docs/WBS.csv를 읽어라.
현재 작업은 {WBS-ID} 한 건이다. 직전 PR의 develop 머지와 선행 WBS를 확인하고, 미병합이면 보고 후 중지하라.
다음만 수행한다.
1. src/application/saju/features/profiles/{feature}.ts 에 FeatureExecutor를 등록한다(F03의 strengths.ts 패턴). 새 명리 규칙을 만들지 않고 M03 topic 판정과 관측만 선택한다.
2. src/domain/narration/plan.ts 에 {FEATURE}_PLAN_SPEC 을 추가한다. beat는 chart → observation → interpretation → limitations 순서를 유지하고 role/title/guidance/maxCharacters만 기능에 맞게 쓴다. limitations beat는 정확히 하나다.
3. src/application/narration/feature.ts 의 SPECS 맵과 topics 매핑에 기능을 추가한다. 해석 카탈로그 topics 는 이미 scaffold.ts 에 있다. 조건 키를 새로 추가해야 하면 scaffold.ts 에만 추가하고 원문/요약은 스크립트로 채운다.
4. src/server/api-test-catalog.ts 의 API_TEST_FEATURES 와 src/application/dev-api-test/index.ts 의 ApiTestFeatureIdSchema 에 기능 ID를 추가한다. UI 분기는 추가하지 않는다.
5. 테스트: tests/narration-plan.test.ts 와 tests/feature-narration.test.ts 패턴으로 정상/시각 미상/불가 사례, 별칭 연속성, 내부 ID 비노출, 결정성(planKey 동일)을 검사한다. Mock 통과만으로 품질을 주장하지 마라.
6. npm test, npm run typecheck, npm run lint, npm run format:check, npm run check:docs 를 실행하고 docs/worklog.md 에 기록하라.
develop 대상 PR 한 건을 만들고 중지하라.
```

## D. 해석 카탈로그를 채우는 절차 (사용자 환경에서, Codex가 대신 Live를 켜지 않는다)

> 2026-10-24 기준 1~3단계는 완료되어 `passages.json`에 141건이 들어 있다. 다시 수집할 일은 scaffold의 locator/url을 바꿀 때만 있다(해당 항목을 `passages.json`에서 지우고 재실행; 수집기는 이미 있는 항목을 건너뛴다).

```text
1. node scripts/interpretation/collect-passages.mjs --dry-run   # 어떤 locator가 Wikisource 본문에서 발견되는지 확인. page …: MISSING_TITLE 은 scaffold.ts 의 url 제목 오류, RATE_LIMITED 는 잠시 후 재실행
2. 발견되지 않는 슬롯은 src/infrastructure/interpretation/scaffold.ts 의 locator 를 Wikisource 실제 소제목(또는 단락 첫 구절)에 맞게 수정한다. 전부 missing 이면 --dry-run --inspect 로 페이지 구조(소제목 목록·본문 앞부분)를 먼저 본다. 구절을 손으로 붙이지 않는다.
3. node scripts/interpretation/collect-passages.mjs              # passages.json 채움. diff 로 수집 범위 확인 후 커밋
4. (사용자 승인·키·플래그가 있을 때만) OPENAI_MODEL=gpt-4.1 ENABLE_INTERPRETATION_SUMMARY=true node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/interpretation/summarize-units.mjs --confirm --max 10
   gpt-4o-mini 는 1차 보정에서 2/10 만 통과했다(丙→정화 같은 글자 오역). 모델은 사용자가 정한다.
5. summaries.json 에서 entailment.status 와 reason 을 확인한다. failed 는 그대로 두고(usable=false) --retry-failed 로 재생성만 허용한다. 요약 문장을 손으로 고치지 않는다.
6. npm test -- tests/interpretation.test.ts tests/narration-plan.test.ts 로 카탈로그 무결성(digest 바인딩)을 확인한다.
```

## E. WBS-71 실측 보정 루프 — 복사용

```text
WBS-71 한 건만 수행한다. 코드 변경은 docs/evaluations 기록과, 기록이 가리키는 프롬프트/검증기 1회 조정으로 제한한다.
사용자가 /dev/api-test 에서 Live 를 켜고 2 문체 × 3 가상 사례 × 3회 = 18회를 직접 실행한다. Codex 는 호출하지 않는다.
각 실행의 비식별 결과(evidence, errorCode/rejection.code, verdict.styleScore, styleIssues 코드, 토큰)를 docs/evaluations/WBS-71-live-calibration.md 표로 모은다. 원문 출력·출생 입력은 기록하지 않는다.
거절 사유 코드 분포를 보고 src/domain/narration/prompt.ts(R01_PLAN_CONTRACT·예시) 또는 render.ts(검증기) 중 한 곳만 조정하고 버전을 올린다. 검증 기준을 완화해 통과율을 만들지 마라.
사용자가 Live 를 실행하지 않았으면 LIVE_NOT_RUN 으로 기록하고 조정 없이 PR 한다.
```

## F. 하지 말 것

- `R01_PLAN_CONTRACT`에 금지 지시를 더 쌓아 문제를 풀려 하지 마라. 거절 사유 코드 분포를 먼저 본다.
- 문체 점수를 실패 사유로 되돌리지 마라. 문체는 soft다.
- 모델에게 `refId`·`planKey`·`provenance`·페르소나 JSON을 보내지 마라. `planForModel`과 `renderStyleGuide`만 통과한다.
- 해석 요약을 `confirmed` 사실로 승격하거나 `reviewStatus`를 손으로 `human-reviewed`로 올리지 마라.
- 기능별 UI 분기, 캐릭터별 프롬프트 분기를 만들지 마라. 데이터(spec·profile·catalog)로 해결한다.
