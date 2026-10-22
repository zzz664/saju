# 개발 환경

WBS-18의 npm 개발 환경, WBS-02의 출생 입력 계약, WBS-01의 지정 만세력 패키지 어댑터를 포함한다. 제품명은 미정이다.
WBS-03의 CLI·어댑터 포트 사용법과 현재 지원 범위는 [CLI 문서](src/cli/README.md)를 참고한다.
기능 개발 순서는 `docs/WBS.csv`의 `실행순서`와 실제 `develop` 병합 상태를 따른다.

입력 계약과 범위는 [src/domain/input/README.md](src/domain/input/README.md)를 참고한다.
Zod 검증과 입력 한계 판정은 Next.js/외부 서비스 없이 실행할 수 있다.
지정 패키지 `manseryeok@2.0.0`의 저수준 호출 범위와 시간 전제는
[어댑터 문서](src/infrastructure/manseryeok/README.md)를 참고한다.

- Node.js 24.x, npm 11.x (초기 검증: Node 24.12.0 / npm 11.6.2).
- Next.js App Router / TypeScript / Vitest. 직접 의존성과 잠금 파일을 함께 고정한다.
- 기존 `docs/examples`는 설계 참고 자료이며 앱이나 테스트에서 실행하지 않는다.
- 현재 초기화와 검증에는 환경변수 또는 외부 공급자 키가 필요하지 않다.

```sh
npm ci
npm run dev
```

개발 서버는 기본적으로 <http://localhost:3000>에서 열린다.
PowerShell에서 `npm.ps1` 실행이 제한되면 실행 정책을 변경하지 말고 `npm.cmd`를 사용한다.

```sh
npm test
npm run --silent saju -- --help
npm run typecheck
npm run lint
npm run build
npm start
```

`npm test`는 감시 모드 없이 실행하고 테스트가 없거나 실패하면 오류로 종료한다.
`npm run typecheck`는 먼저 Next.js 라우트 타입을 생성하므로 새 체크아웃에서도 실행할 수 있다.
Vitest는 기본 Node 환경에서 실행하며 이후 순수 도메인 코어도 웹 서버 없이 검증한다.
테스트는 입력 계약, 실제 만세력 패키지 호출/독립 일진 대조,
루트 TSX/한국어 레이아웃의 서버 렌더링을 확인한다.
프로덕션 기동 확인은 빌드 후 `npm start`에서 `/`의 200 응답과 없는 경로의 404 응답으로 수행한다.

환경파일·빌드 산출물·의존성 폴더는 Git에서 제외한다. `docs/examples/.env.example`은 보존한다.
외부 연동과 P06을 포함한 제품 기능, 배포 설정 및 CI는 이 초기화에 포함하지 않는다.

설정 참고: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation),
[Next.js의 Vitest 가이드](https://nextjs.org/docs/app/guides/testing/vitest),
[Vitest 설정](https://vitest.dev/config/).
