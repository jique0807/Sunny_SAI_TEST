# Sunny SAI — 도보 모드 / 위험평가 엔진 사전 QA (2026-11-09)

## 범위와 결과
- 브랜치: `feature/pedestrian-risk-engine-20261109`
- GitHub Actions: https://github.com/jique0807/Sunny_SAI_TEST/actions/runs/42632297408
- 자동 테스트: **199 passed / 0 failed**; `pnpm check`, `pnpm test`, `pnpm build:vercel` PASS; Next.js 빌드 `/walk` 경로 확인.
- 실제 Vercel Preview 배포는 팀의 일일 API 배포 한도 `api-deployments-free-per-day` (HTTP 402) 때문에 실행하지 못함. 기존 운영(main) 미변경.
- 모든 TMAP 응답/기상 자료는 단위·통합시험에서 **모의 응답**으로 검증됨. 실제 TMAP 서비스, 카카오맵 SDK, 휴대전화 GPS, 웹 브라우저 렌더링의 end-to-end 성공을 보증하지 않음.

## 구현 및 테스트 시나리오
1. 대한민국 범위 좌표 입력 및 CSRF 세션 검증
2. API 키가 없는 상황에서 503 반환
3. TMAP HTTP 인증 실패에서 외부 응답 및 인증키 비노출
4. 경로 라인/거리/시간/안내점 유효성 검증
5. 좌표 밀집 구간에서 거리 기반 균등 시료 선정
6. TMAP `facilityType` (11 일반보행자도로, 12 육교, 14 지하보도, 15 횡단보도, 17 계단) 판독
7. TMAP `turnType` (126 지하보도, 211–217 횡단보도 등) 판독
8. 보행시설 위치는 `location_only`로 명시. 침수·결빙·통제 관측으로 간주하지 않음
9. 강수 없음, 눈, 영하 강수에 대한 기상 예보 기반 주의 판단
10. 기상자료 일부 누락 → `incomplete` 및 경로 추천 불가
11. 기온 또는 바람만 있고 강수/적설 변수 없음 → `unknown`
12. 대안 경로 간 비교 시 예보 미수신 경로 제외
13. GPS 거부/PC 환경에서 출발지 수동 검색, 모바일 경로탐색의 도보 링크 점검
14. Vercel 고정 프리뷰/개별 배포 URL의 허용 호스트 및 CSRF 출처 검증

## 배포 이전 남은 필수 실제 검증 (BLOCKERS)
- Vercel Preview 배포 생성 및 정확한 Git SHA 확인
- Preview에서 `/api/session` 호출 후 세션·CSRF 확인, 브라우저에서 Kakao SDK 로드 여부 확인
- 서울시청 → 서울역 검색/도보 경로 200 응답 및 경로 형상/시간/거리 확인
- TMAP Free 상품의 보행자 API 권한, 쿼터, 실제 인증키 수신 여부 검증
- KMA 실제 예보의 격자·발표시각·도보 ETA 일치와 `unknown` 처리 확인
- PC/Android/iPhone에서 `/walk` 지도, 버튼, 모바일 safe-area, 입력, 스크롤, 위험 아이콘 시각 테스트
- 실제 이동 GPS 연속 추적, 경로이탈·재탐색, 음성 안내 구현 및 시험
- 횡단보도·지하보도·인도 실제 침수·결빙·통제 관측 데이터와 Risk Engine 연결
- 실사용 경로 최적화: TMAP 경로 탐색 옵션 및 후보 복수 생성·비교 구현/검증
- TMAP 데이터의 외부 카카오 지도 렌더링에 대한 이용약관 점검

## 위험평가 범위
현재 엔진은 기상청 관측 노면 상태가 아니라 **격자 예보에 근거한 사전 주의 신호**를 계산한다. 저온·강수의 동시 발생이 노면 결빙을 확정하지 않으며, 시설 정보의 존재가 침수를 확정하지 않는다. 서비스 상 실제 위험 여부를 확인하지 못하면 `unknown`/`incomplete`로 표기하고 안전을 보장하지 않는다.

## 완료 기준
Preview의 실제 API·지도·GPS/동작 테스트와 시설정보 정확도 및 경로우회 검증을 통과하기 전에는 도보 서비스의 운영 배포를 승인하지 않는다.
