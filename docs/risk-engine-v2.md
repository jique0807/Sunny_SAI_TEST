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

The real-route risk rail summarizes KMA data coverage and verified risk evidence independently of the visibility toggle for icons. ITS event reception is now attempted on every real vehicle route regardless of the ITS map toggle; the toggle only hides or reveals its map/rail markers. Historical pedestrian route evidence already has an independent collector. Other feeds (notably KMA road-risk and warning overlays) still depend on their collection controls and remain **unknown** if not checked. Full source/visibility separation is future work.

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
