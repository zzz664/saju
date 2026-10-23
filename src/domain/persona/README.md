# WBS-47 — 승인형 페르소나와 R01 내부 서술 검증

페르소나는 문체/안전/목차에만 관여한다. 명리 규칙·사실·상태·근거를 계산하거나 변경하지 않는다.
현재 입력은 기존 CoreExport의 기초 관찰이며 featureId는 내부 식별자 `core-base`다.
F01~F11 실행기나 R02/R03/P06을 대체하지 않는다. 실제 사용자 풀이 스트리밍에 이 JSON을 연결하지 않는다.

## 승인형 JSON 로더

`createApprovedPersonaRegistry()`의 기본 목록은 비어 있다. 서버가 검토한 JSON을
`{ status: "approved", personaId, personaVersion, json }` manifest에 등록하고,
`load({ personaId, personaVersion })`으로 정확한 버전만 선택한다.
manifest는 **서버 설정**이며 클라이언트 업로드나 `approved:true`를 받아 만드는 기능이 아니다.
스키마 통과 자체가 실제 사업/콘텐츠 승인을 뜻하지도 않는다.

PersonaProfile은 docs/11의 식별/가상 서술자 공개, 성격/강도, 한국어 높임법·거리·리듬·
은유/유머/이모지, 선호/회피/유행어, 문단/문장 범위, 비교 예시를 strict Zod로 검증한다.
성격 강도는 0~1, 표현 목록은 각 10개 이하, 예시는 1~4개, JSON은 실제 UTF-8 32 KiB 이하다.
개수/길이·일관된 min/max·제어문자·추가 필드·중복 ID/버전·잘못된 JSON·manifest/본문 불일치를 거절한다.
정규화한 nested readonly 스냅샷을 보관하며 선택 실패/파서 오류에 원문을 반사하지 않는다.
경로나 임의 profile/system prompt를 받지 않는다.

`tests/fixtures/persona-style.json`은 테스트 합성 자료다. 문서의 character-a와 예시 서비스/상품명은
실제 제품 캐릭터나 기본값으로 등록하지 않았다. 런타임에서 문서 예제를 읽거나 자동 승인하지 않는다.

## 세 계층과 공급자 경계

1. instructions: docs/12의 text 코드 블록을 제목/코드펜스 없이 그대로 사용한 공통 정책.
2. developer: R01 내부 JSON 출력 계약 + 서버 승인 PersonaProfile/FeatureNarrationSpec.
3. user: 기존 투영의 verifiedFindings·evidence·한계·출처/버전·상태와 내부 기능 ID.

공통 문구는 원문 동기화 테스트로 확인한다. 그 안의 R02/R03 이름은 모드 예시이며,
docs/20의 **텍스트 전용 스트리밍 지시를 조립하지 않는다**. JSON 계약은 R01 developer 계층에만 있다.
style examples는 실제 분석 대상의 사실이 아니라 표현 대조 자료임을 명시한다.
하위 판단 데이터를 developer로 올리지 않고 문자열 경계를 이스케이프한다. 주입 방지를 보장하지는 않는다.

FeatureNarrationSpec은 버전 있는 서버 설정이다. core-base, 고유 section ID/목적/최소 근거 수,
섹션 길이 50~3000자, 일반 독자, 제한 포함, 운세 점수 금지를 고정한다.
현재 코어에는 적용 기간이 없으므로 임의 날짜/기간을 만들지 않는다. Fxx/기간별 입력 계약은 후속 기능 범위다.

`createPersonaExperiment`는 WBS-24의 환경/권한·기한·예산·동시성 가드를 재사용한다.
mock gpt-4o-mini 대상, store:false, stream:false와 전체 persona 요청의 서버 출력 상한을 유지한다.
기존 provider 포트는 developer/user 메시지와 독립 JSON 스키마를 담을 수 있게 일반화했다.
기존 코어용 요청/응답 계약은 유지한다. guard의 execute 전략은 신뢰할 수 있는 서버 코드이며 요청 본문으로 받지 않는다.

```ts
const registry = createApprovedPersonaRegistry(serverApprovedManifest);
// store/policy/resolver는 WBS-24와 같은 서버 전용 값. 원장은 요청 간 공유한다.
const runner = createPersonaExperiment({
  ...serverExperimentOptions,
  registry,
  selection: { personaId: approvedId, personaVersion: approvedVersion },
  spec: serverNarrationSpec,
  hash: nodeSha256Adapter,
});
const draft = await runner.run(core, { signal });
```

실제 승인 프로필/설정이나 HTTP 엔드포인트를 제공하는 예제가 아니다. 승인하지 않은 ID·위조 body profile·
잘못된 코어/최소 근거 조건은 공급자 호출·예산 사용 전에 거절한다. 실 API/production 차단은 그대로다.

## 출력·버전·캐시

모델 생성 필드는 schemaVersion/featureId/sections뿐이다. 각 section은
sectionId/title/paragraphs/evidenceIds이며 서버 spec의 섹션/제목을 정확히 유지한다.
알 수 없는 기능·섹션·근거 ID, 중복/누락, 빈 근거(설명할 확정 근거가 있는 경우), 길이 초과,
현재 기초 관찰 범위에 없는 날짜, 모델이 붙인 meta/limitations를 거절한다.
서버가 원래 순서로 정렬하고 sourceStatus·limitations와 persona/prompt/model/spec/schema 버전을 붙인다.
partial/unavailable을 complete로 승격하지 않으며, 확정 근거가 없으면 새 근거를 만들지 않는다.
응답 거절·불완전·오류·취소·바이트 상한은 기존 공급자 경계를 재사용하고 자동 재시도하지 않는다.

공통/페르소나 프롬프트·출력 스키마 버전은 각각 1.0.0이다. 기존 SHA-256 코어 체크섬을 analysisKey로 쓰고,
narration.persona-cache/1.0.0 키에는 그 키와 기능·persona ID/버전·공통/서술 프롬프트·모델·spec·출력 버전을 넣는다.
프로필/spec/프롬프트 내용 digest도 넣어 같은 버전을 잘못 재사용한 경우 충돌을 줄인다.
페르소나 변경은 원래 analysisKey를 바꾸거나 명리 계산을 다시 실행하지 않는다.
실제 캐시 저장/조회는 구현하지 않았으며 키는 서명·권한·익명화·DB 완료 증명이 아니다.

## Mock 문체 평가와 한계

Mock은 동일한 원문 assertion을 인용하고 승인 register에 맞춘 합성 도입/제한 문장만 바꾼다.
새 운세·성격·기간을 만들지 않는다. 문장 자연스러움을 재현하거나 모든 성격 설정을 시뮬레이션하지 않는다.
해요체/합쇼체/반말 대조는 register와 데이터 불변성 확인용이다.

styleEvaluation은 상투어, 중복 문단, 확정·과장 표현, 이모지, 높임법 종결, 유행어 횟수,
문단/문장 수와 내부 ID 노출을 잡는 버전 있는 **휴리스틱**이다. 원문 인용과 주변 목소리를 구분한다.
오탐/미탐이 가능하고 `passed`는 의미·환각·안전성·사람이 느끼는 자연스러움 인증이 아니다.
평가 실패 초안도 내부 검토를 위해 결과를 반환하므로 사용자 게시에 직접 연결하면 안 된다.

|검증|이번 결과|
|---|---|
|승인 목록/정확한 버전·프로필/스펙 strict 검증|자동 테스트 통과|
|세 계층·공통 원문·개인 입력 제외|자동 테스트 통과|
|해요체/합쇼체/반말의 동일 근거·서로 다른 문체/서술 키|합성 mock 대조 통과|
|미상/계산 불가·근거/제목/길이/날짜·오류/거절·예산 차단|자동 테스트 통과|
|자연스러움/가독성 평균 4점·30케이스 반복·2명 평가|미실시, WBS-25의 별도 평가 범위|
|실 OpenAI/고객 캐릭터/제품명·R02/R03 SSE/DB 완료|미구현·미검증, 실연동 BLOCKED|

```sh
npm test -- tests/persona.test.ts tests/narration.test.ts tests/experiment-guard.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run lint
```

비밀키·개인 출생정보·일반 원문 로그 없이 별도 합성 입력만 사용한다.
공식 참고(2026-10-23 확인): [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)의
지시/입력 역할 구분과 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)의
구조화 출력·별도 거절 처리를 참고했다. 모델은 지정된 gpt-4o-mini를 유지한다.
