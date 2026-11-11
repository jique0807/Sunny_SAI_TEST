# Sunny SAI · 자동차·도보 엔진 입력자료 코드 대조 및 안정성 점검 (2026-11-11)

기준: `feature/sunny-dummy-scenarios-20261111`, 원본 커밋 `dcd7b35ca010f19a190a1b99ebfe51b06e0824f2`. 이 보고서는 코드 경로·기존 실제 API 확인 이력·테스트를 구분한다. 새로운 기관 API 실시간 재호출 또는 휴대폰 화면 검증을 수행했다고 주장하지 않는다.

| 자료 | 자동차 판단 | 도보 판단 | 수신과 검증 범위 | 입력 출처 코드 |
|---|---|---|---|---|
| KMA 경로 격자예보 (강수·기온·바람·PTY, 같은 시각 SNO) | 사용 | 사용 | 통과시각 ±90분, 조회 경로지점, SNO 누락 시 원예보 유지 | `lib/kma.mjs`, `public/route-hazards.mjs` |
| GK2A RR·CI·FOG | 사용 | 사용 | 원본 NC·품질·좌표 검증, RR/CI 20분·FOG 60분, 통과 15분 이내, 누락 픽셀 제외 | `public/gk2a-numeric-overlay.mjs`, `public/satellite-route-risk.mjs` |
| CCTV 기반 도로 안개·비·눈 | 사용 (인접 참고) | 사용 (인접 참고) | 기존 8지점 수신 이력, 30분·250m·10분 이내 통과, 실제 도로·차로 일치 미확인 | `lib/road-weather-observations.mjs`, `public/road-weather-risk.mjs` |
| KMA 도로 살얼음·안개 위험등급 | 사용 | 제외 | 위험등급 1~3, 링크 점 2개·25m 경로 정합·15분 신선도 | `public/road-risk-overlay.mjs` |
| KMA 발효 기상특보 | 사용 | 사용 | 공식 특보구역 경로 교차, 통제·침수 확정값 아님 | `public/kma-warning-overlay.mjs` |
| 국가교통정보센터 ITS 사고·공사·통제 | 경로 인접 참고 | 제외 | 120m 이내·발생시각/만료시각 검증, 도로·진행방향 미확인 시 자동 우회 금지 | `public/its-route-risk.mjs` |
| TAAS 2024 보행자·어린이·노인 사고이력 | 제외 | 사용 (과거 참고) | 승인된 REST·행정구역 조회, 120m 이내 경로 위험 신호; 현재 사고 아님 | `lib/pedestrian-route-context.mjs`, `public/pedestrian-history-risk.mjs` |
| TMAP 보행시설·도보 경로 | 제외 | 경로 형상·시설 위치로 사용 | 횡단보도·계단은 자체 위험등급 아님 | `lib/kakao-walk.mjs`, `public/safe-route-engine.mjs` |
| AWS 737관측행 | 제외 | 제외 | 관측소 좌표 API HTTP 403 · 활용 승인 대기 | `docs/display-item-inventory-20261111.md` |
| 추가 법규위반 사고자료·실제 무더위쉼터 | 제외 | 제외 | 서비스키 오류 또는 HTTP 500, 시연 데이터는 실제 시설 아님 | `docs/display-item-inventory-20261111.md` |
| 하천 범람 WMS·HSR 영상 레이어 | 직접 위험판단 제외 | 직접 위험판단 제외 | WMS 지리중첩/강수 영상의 수치·경로 검증이 완료된 근거가 아님 | `docs/display-item-inventory-20261111.md` |

## 구현 보강

- `public/safe-route-engine.mjs`: 동일 출처·위험종류·10분 이내라도 **서로 다른 위치(100m 초과)**는 분리. 같은 위치라도 서로 다른 명시적 원본 ID나 관측소 ID면 합치지 않음. 동일 지점·ID의 중복 이벤트는 1회 평가.
- `public/risk-source-eligibility.mjs`: 자동차·도보 공통으로 `satelliteEvidenceStatus`와 `observationsEvidenceStatus`를 수신상태에 기록. 개별 기록이 엔진 통과한 횟수를 별도 표시하며 수신 성공 ≠ 경로 위험신호를 구분.
- `test/risk-evidence-audit.test.mjs`: 양쪽 엔진에서 중복·별개 위치·누락·만료·경로 외·자료별 수신상태 테스트를 추가.

### 점검 해석 제한

- 실제 위성 NC 수신과 도로날씨 8지점, 단기 SNO, TAAS 3종 결과는 앞선 임시 Vercel 진단 결과다. 이 커밋은 실제 기관 자료를 새로 내려받거나 카카오맵 실기기 동작을 확인하지 않는다.
- 화면 표출 스위치와 엔진 수집은 독립이다. `public/app.js`의 `renderRouteHazards`와 `createRouteEvidenceRefresh`가 자동차/도보 맞춤 어댑터로 연결된다.
- 실패·오래됨·미수신은 안전으로 간주하지 않는다. 도보 도로 위험등급 및 ITS, 자동차 TAAS는 절대 교차 입력하지 않는다. 관측자료만으로 자동 우회를 확정하지 않는다.
- CI 성공이 확인되면 해당 실행 링크/커밋을 별도 기록한다. 운영 배포는 수행하지 않는다.
