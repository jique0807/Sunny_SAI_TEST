# 키 입력과 Vercel 배포 — 여기서 시작

## 1. 키를 입력하는 정확한 위치

https://github.com/AIHackN1/Sunny_SAI/settings/secrets/actions

저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 이름과 값을 각각 등록합니다. 코드를 편집하거나 Add file을 누르는 위치가 아닙니다. Secrets는 나중에 값이 표시되지 않으며 교체할 수 있습니다. 저장소를 Public으로 유지해도 실제 키를 커밋하지 않습니다.

## 2. Vercel 프로젝트 준비

Vercel에서 GitHub 저장소 `AIHackN1/Sunny_SAI`를 Import해 프로젝트를 만듭니다. GitHub 앱의 이 저장소 접근을 허용해야 합니다. 프레임워크는 Next.js, 빌드 명령은 `pnpm build:vercel`, 설치 명령은 `pnpm install --frozen-lockfile`입니다. 저장소의 `vercel.json`에 설정되어 있습니다.

프로젝트의 실제 production 도메인을 확인하고 카카오·브이월드에 허용 도메인으로 등록합니다. 예전 chatgpt.site 주소를 새 Vercel 주소로 대신 사용할 수 없습니다. 배포 보호 설정도 의도한 사용자 접근 범위에 맞게 확인합니다.

## 3. GitHub Secrets 목록

| 이름 | 값 | 필요 시점 |
| --- | --- | --- |
| `KAKAO_REST_API_KEY` | 운영자 카카오 REST 키 | 장소 검색·차량 경로 |
| `KAKAO_JAVASCRIPT_KEY` | 운영자 카카오 JavaScript 키 | 지도 표시 |
| `VWORLD_API_KEY` | 운영자 브이월드 키 | 위성 배경지도 |
| `APP_ORIGIN` | 실제 Vercel production HTTPS 주소, 끝에 `/` 제외 | 출처 검증 |
| `SESSION_SECRET` | 최소 43자의 암호학적 무작위 값 | 사용자 고급음성 키 암호화 |
| `VERCEL_TOKEN` | 해당 Vercel 프로젝트를 관리할 권한의 API 토큰 | 배포 작업 인증 |
| `VERCEL_PROJECT_ID` | Vercel 프로젝트 Settings의 Project ID | 배포 대상 지정 |
| `VERCEL_TEAM_ID` | 팀 프로젝트의 Team ID, 개인 프로젝트는 필요시만 | 선택 |

지도 키 3개부터 등록해도 됩니다. 단, 수동 배포를 실제 실행하기 전에는 필수 항목을 모두 준비해야 합니다. `SESSION_SECRET`은 지도 키를 재사용하지 말고 비밀번호 관리자 등에서 안전한 무작위 값을 생성하세요. 실제 값을 채팅·이슈·PR·스크린샷에 올리지 마세요.

카카오 JavaScript 키·브이월드 키는 실제 지도 요청에서 브라우저에 전달됩니다. 암호화 저장이 브라우저의 키를 숨겨주는 것은 아닙니다. 도메인·허용 API·할당량 제한을 설정합니다. 카카오 REST 키는 서버에만 남습니다. Google 개인 TTS 키는 이 목록에 넣지 않고 앱의 선택형 고급음성 설정을 사용합니다.

## 4. 준비가 끝나면 수동 배포

이 변경사항을 main에 병합한 뒤 저장소 **Actions → Deploy Sunny SAI to Vercel → Run workflow → main**을 선택합니다.

워크플로는 다음 순서로 실행합니다:

1. 필수 Secrets·HTTPS origin·Vercel 프로젝트의 GitHub 저장소 연결 확인.
2. 지도 키와 앱 보안 설정 5개를 Vercel의 **encrypted production environment variables**로 동기화.
3. 선택한 main 커밋으로 production 배포 요청.
4. READY 상태까지 확인. 실패·대기 중이면 기존 Vercel 배포부터 확인.

실제 키·토큰은 로그나 명령줄 인수에 출력하지 않습니다. 환경변수 동기화는 production의 동일 이름 값을 교체합니다. GitHub Secrets에만 넣고 워크플로를 실행하지 않으면 기존 chatgpt.site 앱이나 Vercel 앱에 자동 반영되지 않습니다. 이 워크플로는 chatgpt.site 환경을 변경하지 않습니다. 사용자 키가 아직 없어 실제 Vercel 서비스에 대한 유효성 검증은 별도로 필요합니다.

Vercel Git 자동 배포도 켜 두면 같은 커밋이 자동/수동으로 두 번 배포될 수 있습니다. 처음에는 Secrets 동기화를 수동으로 완료하고, 그 뒤 프로젝트 운영 방식에 따라 Git 자동 배포를 이용하세요. 키 변경은 수동 워크플로를 다시 실행해야 반영됩니다.

## 5. 연결 검사

앱의 데이터 연결에서 키 설정 상태 확인 → 출발지·목적지 검색 → 실제 차량 경로 확인 → 구간별 모델 예보 → 지도/위성 전환 → 기본 음성 재생을 확인합니다. 연결 상태의 ‘키 설정됨’은 키 유효성·할당량·도메인 승인까지 검증했다는 뜻이 아닙니다.

이 버전은 기상·주행 지원 개발용입니다. GK2A·공식 공사·통제 자료·실제 GPS 자동 주행 감시·백그라운드 동작은 아직 미구현입니다. 공개 운영 전 익명 요청에 대한 전체 호출 제한·운영 모니터링이 필요합니다.
