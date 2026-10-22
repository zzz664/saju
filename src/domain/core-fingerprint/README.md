# 결정성·버전·해시 — WBS-14

검증된 WBS-13 CoreExport에 버전 manifest와 SHA-256 체크섬을 붙인다.
`calculateHashedCoreExport`는 기존 계산을 한 번 실행하고, `fingerprintCoreExport`는
그 결과만 검증/정규화한다. 원래 facts·판단·근거·충돌·미상 제한을 변경하지 않는다.

```sh
npm run --silent saju -- hash-json < tests/fixtures/cli-input.json
```

```powershell
Get-Content -Raw -Encoding utf8 tests/fixtures/cli-input.json | npm.cmd run --silent saju -- hash-json
$LASTEXITCODE
```

출력은 `{ status, document, fingerprint }` JSON 한 개다. document는 기존 CoreExport와 같고,
fingerprint는 algorithm=sha256, policyId=fingerprint.core-export, policyVersion=1.0.0,
canonicalization=sorted-json-v1, versions, 소문자 64자리 hash를 담는다.
complete/partial/unavailable의 종료 코드는 0/2/2다. 입력 오류는 2, 공급자/해시 오류는
고정 비식별 메시지와 종료 1을 반환한다. export-json/manual-prompt/export-schema는 기존 계약을 유지한다.

| versions 필드 | 원본에서 가져오는 실제 버전/근거 |
| --- | --- |
| coreSchemaVersion | 코어 내보내기 스키마 버전 |
| calculation | 실제 라이브러리·기둥 규칙·절기/정책 시계 기준 |
| normalization | Temporal·ICU·tzdb 및 현지 시각 정규화 규칙 |
| facts | 파생 facts 스키마·SDK·오행/십성/지장간/개수 규칙·출처/관법 |
| judgment | 기초 규칙집·출처 카탈로그·facts/SDK 버전·적용 범위 |
| arbitration | 중재 정책 ID/버전·적용 범위 |

해당 단계가 수행되지 않았으면 manifest도 null이다. 미상/거절/미지원 결과에도
원래 상태를 유지한 체크섬을 만들 수 있으며, 해시 존재가 계산 성공이나 DB 저장 완료를 뜻하지 않는다.
서술용 모델·프롬프트·페르소나 버전은 코어에 넣지 않는다. 모델/표현 변경으로 코어 해시를
바꾸지 않으며 서술 캐시 식별자는 후속 기능에서 별도로 구성해야 한다.

해시 입력은 다음 객체를 sorted-json-v1로 직렬화한 UTF-8 바이트다.

```text
{ policy: FINGERPRINT_POLICY, versions: 원본에서 추출한 manifest, document: 검증된 CoreExport }
```

policy ID·정책 버전·정규화 방식·알고리즘도 입력에 포함해 다른 해시 목적과 구분한다.
해시 값 자체와 바깥 status는 입력에 중복 포함하지 않으며 status는 document.status에 대조한다.
manifest의 누락·변조나 미지원 정책/알고리즘은 스키마 검증에서 거절한다.
일관성이 맞는 문서 내용이나 계산 정책·실제 실행 버전이 바뀌면 해시도 달라진다.
현재 지원하지 않는 SDK/규칙/스키마 버전은 기존 계약대로 거절하며 임의 미래 버전을 허용하지 않는다.

sorted-json-v1은 객체 키를 UTF-16 코드 단위 순서로 정렬하고 배열 순서를 보존한다.
정수처럼 보이는 키도 직접 직렬화해 사전 순서를 유지한다. 문자열/숫자/null/불리언은
JSON.stringify 표현을 사용하며 -0은 0이 된다. Unicode 정규화는 하지 않는다.
문서의 들여쓰기·줄바꿈·객체 키 삽입 순서는 해시를 바꾸지 않는다.
undefined·비유한 수·BigInt·함수·심볼·Date 등 비평범 객체·접근자·비열거 속성·순환 참조·
성긴/추가 속성 배열과 64단계를 넘는 중첩은 거절한다. 같은 객체의 반복 참조는 순환이 아니면 허용한다.
프로젝트 고유 정책이며 RFC 8785 전체 준수를 주장하지 않는다.

도메인은 SHA-256 포트만 사용하며 `infrastructure/hashing`이 Node 내장 crypto를 구현한다.
시계·난수·네트워크·파일·키·환경변수를 읽지 않는다. 해시 공급자 예외/잘못된 결과는
입력이나 예외 전문을 반사하지 않는 FingerprintError로 바꾼다.

`HashedCoreExportSchema`는 문서/manifest/상태/해시 형식을 검증한다.
실제 바이트 체크섬 검증은 `verifyCoreFingerprint(value, nodeSha256Adapter)`로 수행한다.
문서나 다이제스트가 달라지면 false이며, 해시 공급자가 실패하면 고정 오류를 발생시킨다.
원본 생성 환경의 ICU/tzdb 등 버전이 바뀌면 달라질 수 있으며 재현에는 같은 내용·정책·버전이 필요하다.

이 값은 내보낸 결과의 체크섬이다. 원본 출생 입력을 해시하지 않으므로 여러 입력이 같은
내보내기 결과를 만들면 같은 값이 된다. 입력 캐시 키·사용자 식별자·권한·서명·MAC·출처 인증으로
사용하지 않는다. 누구나 문서와 해시를 함께 다시 만들 수 있다. 코어 분석과 그 해시는
민감할 수 있고 익명화 보장이나 공개 로그용 ID가 아니다. 원문 입력의 보호된 캐시 키와
실제 저장/인증/서술 캐시는 이번 작업에 포함하지 않는다. 비밀키 변경도 없다.

```sh
npm test -- tests/core-fingerprint.test.ts tests/core-fingerprint-service.test.ts
```

합성 입력을 실제로 100회 계산해 동일 hash/manifest와 공급자 100회 호출을 확인한다.
partial/unavailable도 각각 100회 해시한다. SHA-256 독립 기대값, 키 순서·배열/Unicode,
정책/실행 버전 변경·변조·공급자 실패, 실제 CLI의 UTC/Pacific-Honolulu 호스트 시간대
독립성과 기존 내보내기를 검증한다. 사용자가 수정한 예제 입력을 골든 데이터로 읽지 않는다.
