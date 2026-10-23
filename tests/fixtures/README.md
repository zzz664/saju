# 회귀 입력과 수동 CLI 입력

- `core-reference-input.json`: WBS-03~13 회귀 테스트의 고정 예시 입력. WBS-17에서 기존 develop의 커밋된 CLI 예시를 그대로 분리했다. 기존 기대값을 재생성하거나 사용자 편집 내용을 복사하지 않았다. 변경 시 관련 계산 기대값과 출처를 함께 검토한다.
- `cli-input.json`: 로컬에서 CLI를 수동 실행할 때 편집할 수 있는 입력 파일. 자동 테스트는 이 파일을 읽지 않는다. 개인 정보로 편집한 내용은 Git/PR/일반 로그에 올리지 않는다.
- `independent-core-golden.json`: 독립 출처와 채택 정책을 명시한 별도의 30개 골든 사례. core-reference-input으로 기대값을 대체하지 않는다. 승인 범위와 오차는 [검토표](../../docs/checklists/WBS-16-independent-golden-review.md)에 기록한다.
- `persona-evaluation-cases.json`: 독립 골든 및 명시적 불가/미상 사례로 구성한 합성 Mock 평가 manifest. 사람 품질 평가나 실제 Live 성공으로 간주하지 않는다.
