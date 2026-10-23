# 승인형 페르소나 — WBS-47 (v2: 스타일 가이드 렌더링)

페르소나는 **문체·성격·구성에만** 관여한다. 명리 규칙·사실·상태·근거를 계산하거나 변경하지 않는다.
서술 계획(`src/domain/narration/plan.ts`)은 캐릭터와 무관하게 만들어지고, 페르소나는 렌더링 단계에서만 적용된다.

## 승인형 JSON 로더

`createApprovedPersonaRegistry()`의 기본 목록은 비어 있다. 서버가 검토한 JSON을
`{ status: "approved", personaId, personaVersion, json }` manifest에 등록하고,
`load({ personaId, personaVersion })`으로 정확한 버전만 선택한다.
manifest는 **서버 설정**이며 클라이언트 업로드나 `approved:true`를 받아 만드는 기능이 아니다.
스키마 통과 자체가 실제 사업/콘텐츠 승인을 뜻하지도 않는다.

PersonaProfile은 docs/11의 식별/가상 서술자 공개, 성격/강도, 한국어 높임법·거리·리듬·
은유/유머/이모지, 선호/회피/유행어, 문단/문장 범위, 비교 예시를 strict Zod로 검증한다.
성격 강도는 0~1, 표현 목록은 각 10개 이하, 예시는 1~4개, JSON은 실제 UTF-8 32 KiB 이하다.

현재 개발자 API와 품질 평가는 [서버 JSON 카탈로그](../../infrastructure/persona/README.md)를 함께 사용한다.
새 페르소나 추가는 JSON과 서버 승인/활성 목록 변경으로 처리하며, API/프롬프트에 캐릭터별 분기를 넣지 않는다.

## 프롬프트에 들어가는 방식

페르소나 JSON은 **그대로 전송하지 않는다.** `renderStyleGuide(persona)`(`src/domain/narration/render.ts`)가
한국어 산문 스타일 안내로 바꾼다: 역할·성격·높임법·거리·리듬·비유/유머/이모지 정책·문단/문장 범위·선호/회피 표현·문체 대조 예시.
첫 줄은 `[캐릭터 스타일 안내] <personaId> <personaVersion>`으로 고정되어 가짜 HTTP 테스트가 캐릭터를 복원할 수 있다.

캐릭터를 바꾸면 `narrationKey`만 바뀌고 `analysisKey`·`planKey`는 유지된다. 문체 준수는 soft 점수로만 본다.

```sh
npm test -- tests/persona-catalog.test.ts tests/narration-render.test.ts
```

음성 읽기(TTS)를 붙일 때는 이 프로필에 `voiceId`류 필드를 **별도 버전**으로 추가하고, 완료된 말풍선 텍스트를 읽는 어댑터를 `infrastructure`에 둔다. 프롬프트 조립은 바뀌지 않는다.
