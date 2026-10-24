# 서술 계획·렌더링·검증 — WBS-70

`FeatureResult` → **서술 계획(NarrationPlan, 캐릭터 무관)** → **렌더링(캐릭터 적용)** → **검증(근거 hard / 문체 soft)**.
R01 개발자 JSON 경로가 지금 이 계획을 소비하고, R02 말풍선 스트리밍과 음성 읽기는 같은 계획의 beat를 하나씩 소비할 예정이다.
결정 배경은 [결정 메모](../../../docs/decisions/2026-10-24_해석층_재설계_결정.md).

## 1. 서술 계획 (`plan.ts`)

`buildNarrationPlan({ input, facts, interpretations, analysisKey, featureCacheKey, interpretationCatalogVersion }, spec, hash)`

- `spec`(`NarrationPlanSpec`)은 서버 설정이다. 기능별로 어떤 말풍선(beat)을 어떤 순서로 쓰는지 정한다. F03은 `F03_PLAN_SPEC`: `chart → observation → interpretation → limitations`.
- beat마다 `evidence[]`가 있고 각 근거는 `alias(E1…)`, `kind(fact|interpretation|limitation)`, `text`, `source`(고전 라벨 또는 null), `refId`(서버 전용)다. **모델은 alias와 text, source만 본다.**
- `chart` beat는 사람이 읽는 원국 요약("일간은 갑(목)이다", "시주는 미상이어서 제외한다")이다. `observation`은 확정 관측(`verifiedFindings`)이다. `interpretation`은 `usable`한 해석 단위의 요약이며 **없으면 beat를 생략하고 한계에 적는다.** `limitations`는 항상 있다.
- `status: unavailable`이면 한계 beat 하나만 남는다.
- `planKey`는 계획 전체의 해시다. 캐릭터·모델이 바뀌어도 변하지 않는다.

## 2. 렌더링 (`render.ts`)

`composeNarrationRequest(plan, persona, modelId)`

| 계층         | 내용                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| instructions | `COMMON_SYSTEM_PROMPT` 1.1.0 (docs/12와 테스트로 동기화)                                    |
| developer    | `renderStyleGuide(persona)` 산문 + `R01_PLAN_CONTRACT` 2.0.0 + 좋은 출력 예시 1건           |
| user         | `planForModel(plan)` JSON — featureId, status, chart, beats(alias/text/source), limitations |
| output       | strict JSON Schema. `beatId`는 이 계획의 id enum, `usedAliases`는 이 계획의 alias enum      |

페르소나 JSON을 그대로 보내지 않는다. `schemaVersion`·`identityDisclosure`·`strength: 0.8` 같은 기계 필드는 산문 안내에 들어가지 않는다. 제목은 서버가 소유하므로 모델 출력에 없다.

## 3. 검증

- `validateNarrationDraft(text, plan)` — **hard**. 거절은 `NarrationRejection(code, beatId)`: `BYTES · JSON_PARSE · SCHEMA · BEAT_SET · ALIAS_UNKNOWN · ALIAS_MISSING · LENGTH · DATE_FORBIDDEN · INTERNAL_ID_LEAK`. 서버 실행 기록에는 `OUTPUT_REJECTED_<CODE>`로 남아 실측 루프에서 분포를 집계할 수 있다.
- `scoreNarrationStyle(narration, persona)` — **soft**. 점수 0~1과 `issues[{code, beatId, detail}]`. 높임법은 인용부를 제외한 **문장 단위**로 판정하고 선택 문체 비율이 70% 미만일 때만 `REGISTER_MIX`를 낸다. `죠/네요/군요`는 해요체, `니다/니까/습니까`는 합쇼체로 인식한다. 실행을 실패시키지 않는다.

## 4. 캐시 키

`narrationCacheKeys(plan, persona, modelId, hash)` → `analysisKey`(원국 해시) · `featureKey` · `planKey` · `narrationKey`(계획 + 캐릭터 digest + 모델 + 프롬프트 digest + 출력 스키마 버전). 실제 저장소 연결은 아직 없다.

## 5. Mock과 평가

`createPlanMockProvider()`는 계획의 beat마다 근거를 인용부로 재진술하고 캐릭터 register와 문단/문장 범위를 지킨다. 글자 상한에는 문단 구분자도 포함하며, 인용문 일부만 담을 때도 닫는 인용부호와 종결어미를 먼저 확보한다. 실제 담은 근거의 별칭만 사용한다. 전체 계획 또는 모델용 투영 어느 쪽을 받아도 동작하므로 가짜 HTTP 테스트가 전송 본문에서 요청을 복원할 수 있다. Mock에는 횟수·토큰·비용 예산을 적용하지 않는다. **Mock 통과는 배선 검증이며 품질 기준선이 아니다.**

`evaluateNarrationMatrix`(`npm run eval:persona`)는 30 합성 사례 × 2 문체 × 3회를 Mock으로 돌려 근거 검증 통과율·거절 코드 분포·문체 점수를 `docs/evaluations/narration-plan-mock-*`에 남긴다. 사람 평가는 별도다.

```sh
npm test -- tests/narration-plan.test.ts tests/narration-render.test.ts tests/feature-narration.test.ts tests/narration-evaluation.test.ts
npm run eval:persona
```

## 6. 다음 단계

- **WBS-71 실측 보정 루프**: 보호된 `/dev/api-test`에서 2 문체 × 3 사례 × 3회 = 18회 Live. 거절 코드 분포와 문체 점수를 `docs/evaluations`에 비식별로 기록하고, 그 결과로 프롬프트·검증기를 조정한다. 이 루프 전까지 어떤 Live 품질 주장도 하지 않는다.
- R02 스트리밍은 beat 단위 텍스트 출력 계약(docs/20)으로 같은 계획을 소비한다. 음성 읽기는 완료된 beat 텍스트를 받는 어댑터다.
