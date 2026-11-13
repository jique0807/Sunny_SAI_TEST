# Sunny SAI Risk Engine 2.0 — Preview implementation

Version: `risk-v2.0`
Deployment scope: preview branch `feature/seoul-busan-demo-20261109`

## Purpose and non-claims

A dependency-free, deterministic decision-support engine that checks evidence along a real navigation route before considering a reroute. This is **not** an LLM, a calibrated incident probability, a road closure authority, an automated steering system, or a certified safe-route recommendation.

Do not call a route "safe." Use "lower observed forecast-risk signal" only after comparable observations and official restrictions are checked. Lack of risk data means "unknown," never "no danger."

## Files

- `public/risk-engine.mjs`: classify individual provider signals; require validated geographic, temporal and grade provenance.
- `public/safe-route-engine.mjs`: evaluate each route, calculate evidence completeness, and compare multiple candidates conservatively.
- `public/route-hazards.mjs`: KMA-only forecast hazard adaptation.
- `lib/kma-road.mjs` and `public/road-risk-overlay.mjs`: distinguish literal, verified severity names from undocumented raw numeric KMA code values.
- `public/app.js`: display route risk summary for real road routes.
- `test/safe-route-engine.test.mjs`: deterministic regression cases.

No external paid AI API and no model inference are required.

## Route input

`evaluateRouteRisk(route, {weatherSamples, extraHazards, mode:'driving'})`

- route requires Kakao-origin real road path `rainPath[{lat,lng,seconds}]`, positive `distance` and `duration`.
- `route.samples` defines the planned weather sampling positions. `weatherSamples` must contain KMA provider records, location, forecast validity time and matching ETA.
- Provider forecasts are accepted only when their valid time falls within 90 minutes of ETA and position corresponds to the route sample.
- Route-linked warning and road signals must already be matched to a real road coordinate by a provider adapter, and must be close to the path. No flood and no black ice are inferred solely from rainfall.
- Official road numeric codes with unverified severity meanings are excluded. Text grades may be accepted only after a verified parsing pipeline and valid time/location.
- Synthetic demo records are excluded.

Outputs:
- `state`: `evaluated | partial | insufficient-data | unsupported | simulation`
- `coverage`: percentage of *queried route sample locations* with time-aligned KMA forecasts. It does **not** mean percentage of road length observed, or that all map layers were collected.
- `signalCount / signalIndex / signals`: relative evidence, not probabilities.
- `unknownSignals`: invalid/unverified signals that cannot increase the warning level.
- `riskLevel`: relative evidence severity based on available qualified signals.

## Multi-route comparison

`compareRouteRiskCandidates([{id,label,route,weatherSamples,extraHazards}, ...])`

- Requires **at least two** real, independently evaluated route candidates with >=80% of their route sample locations receiving valid KMA forecasts.
- For now, accepts candidates no more than 25% slower than the quickest comparable candidate.
- Sorts among eligible candidates by the relative verified warning signal index and then expected driving time.
- Returns `status:'not-comparable'` and `recommendation:null` if evidence is insufficient. A non-null candidate is a **conditional analysis suggestion**, not a validated safe passage.
- This module only **evaluates candidate route data supplied by the caller**. It does not yet fetch road alternatives, check closures, or automatically change live guidance.

## Current UI connection

The real-route risk rail summarizes KMA data coverage and verified risk evidence independently of the visibility toggle for icons. ITS event reception is now attempted on every real vehicle route regardless of the ITS map toggle; the toggle only hides or reveals its map/rail markers. Historical pedestrian route evidence already has an independent collector. KMA road-risk and KMA warning data are also now fetched in the background when an actual route is selected; the visibility toggles only control their map markings. The risk engine still rejects unknown severity codes, missing link geometry, stale time or unsupported modes. Background requests can fail or return unverified records and must remain **unknown** in that case. Other optional providers are not all wired as autonomous risk inputs yet.

The existing Seoul–Busan emergency example remains a synthetic demo and continues using its own Kakao waypoint comparison, not live autonomous rerouting.

## Next development gates

1. Background provider collectors decoupled from map layer switches; record freshness, official polygon validity and verified road-grade metadata.
2. Multi-candidate Kakao road alternatives with distinct ETA-aligned forecasts *for each candidate*; re-evaluate after data refresh.
3. User consent and safe fallbacks; no automatic redirection on incomplete, stale or incomparable data.
4. Separate pedestrian route input using verified sidewalks, crosswalks, flooding and urban heat. Never apply a car route as a pedestrian-safe path.
5. Historical incidents and calibration for optional ML probabilities, with independent validation and monitoring.

## Quick tests

`npm test`
`npm run check`

Preview review should cover: live Kakao route with KMA data, forecast not received, stale forecast, display layer OFF, demo isolation, and numeric road grade withheld.


## 자료·모델 확장 인터페이스 (2026-11-11)

- `lib/capability-catalog.mjs`: 출처별 API 키 **이름**, 호출 경로, 교체 슬롯, 위험판단/지도 용도를 선언한 읽기 전용 목록. `GET /api/capability-catalog`은 세션을 요구하며 인증키 값·위치·실측 결과를 반환하지 않는다. 'configured'는 키 등록만 의미한다.
- `public/risk-model-adapters.mjs`: 기본 `rules-v2`와 `rules-v2-strict` 선택을 지원하는 결정정책 인터페이스. 둘 모두 기존 Risk Engine 2.0의 검증 결과를 소비하며, 확장 정책은 판단을 보류할 수 있지만 위험 지점이나 관측값을 추가할 수 없다.
- `public/risk-lineage.mjs`: 실제 경로 데이터 수집·검증·판단 상태를 위치나 인증키 없이 요약하는 v1 JSON 계약. 환경설정의 '자료 처리 흐름·연결 구성'에서 확인 가능하다.
- LLM 기반 설명자는 현재 **미연결**. 별도 설명 어댑터를 연동하더라도 관측/위험판정은 재계산하지 못한다. API를 바꾸려면 기존과 동일한 출처·시간·좌표·등급·결측 계약시험과 운영자 설정이 필요하다.

자세한 개발 계약은 `docs/modular-architecture.md` 참조.
