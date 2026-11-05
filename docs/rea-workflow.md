# REA 실행과 분석 범위

공식 저장소: https://github.com/morluto/rea

이 개발 세션에서 공식 npm 배포 `rea-agents@6.7.0`을 실제 실행했습니다. `--help`와 `analyze-javascript-application --help`로 지원 명령을 확인했습니다. REA는 앱 제작 프레임워크가 아니라 개발 분석 도구이며 배포 앱에 포함하지 않습니다.

테파일럿 공개 소개 페이지의 HTML에서 공개 JavaScript를 추출하고 공개 `assets/config.js`, `assets/ui.js`를 받아 정적 분석 대상으로 사용했습니다. 실제 분석 명령은 파일 목록과 부분 Evidence를 생성했으나 이 Work 실행 환경의 프로세스 소유권 조회 단계에서 중단되었습니다. 오류: `capability_unavailable`, provider `process-ownership`, `ps -axo ...` → `fatal library error, lookup self`. 따라서 전체 정적 분석 성공으로 보고하지 않습니다. 원본 타사 스크립트와 HTML은 이 저장소에 포함하지 않습니다. 정적 분석은 공개 웹 소개의 코드 구조에 한정되며, 모바일 앱의 비공개 API·백그라운드 기능·차량 연동 구현은 확인하지 않았습니다.

PC에서 같은 버전의 CLI를 체험할 수 있습니다:

```bash
npx --yes rea-agents@6.7.0 --help
npx --yes rea-agents@6.7.0 analyze-javascript-application /absolute/path/to/your/application --format json
```

Codex CLI 등 로컬 에이전트에서 MCP 연동을 원할 때:

```bash
npx rea-agents@6.7.0 setup
```

Codex를 선택하고 제안된 설정을 확인한 뒤 해당 로컬 에이전트를 재시작합니다. ChatGPT Work 대화에 새 MCP 도구가 자동 등록되는 것은 아닙니다. 이 대화에서는 CLI 방식으로 실행했습니다. Node.js 24.x >=24.11 또는 공식 README의 지원 버전과 Linux procps `ps`가 필요합니다. 모바일 앱 분석은 별도 앱 파일과 적절한 분석 환경을 준비한 후 진행할 수 있습니다.

분석 결과: REA의 파일 인벤토리 및 부분 Evidence까지 생성되었으며 전체 소스 구문 분석은 환경 오류로 완료되지 않았습니다. 로컬 PC에서 위 명령으로 다시 실행할 수 있습니다.
