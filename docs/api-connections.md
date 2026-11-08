# Sunny SAI — API connection operations (Preview)

Working GitHub repository: `jique0807/Sunny_SAI_TEST`. Use branch `fix/mobile-reroute-rain-layout` for pre-release verification. Never deploy to `main`/Production without separate review.

## Check API connections from the app

Open **환경설정 → 데이터 연결 상태 → 상태 새로고침**. The 12 entries are data-source / functionality checks, **not** 12 independent credentials.

- **카카오맵 지도 / 장소검색 / 자동차 길찾기**: `KAKAO_JAVASCRIPT_KEY` and `KAKAO_REST_API_KEY`.
- **VWorld 위성지도**: `VWORLD_API_KEY`; this screen reports **key presence only**. To verify actual tiles, switch to VWorld in the app and inspect tile loading / domain authorization. The existing Preview environment does not currently have this key (as checked 2026-11-08); Production has a key, but Production must not be modified as part of Preview fixes.
- **경로 기상예보 / RN1 강수예보 / HSR 레이더 / 도로살얼음·안개 / 기상특보**: `KMA_API_KEY`. Some endpoints need separate provider permissions or spatial schema verification. KMA forecast authorization does not certify road-risk or warning geometry.
- **국가하천 범람예상지도**: `SAFEMAP_API_KEY`; WMS image receipt is only partial confirmation, **not** live inundation or proof of hazardous road conditions.
- **지방하천 범람예상지도 / 하천수위**: **미연동**; request approval and implement transport, time validity, spatial geometry and tests before declaring connected.

### Interpretation of statuses

- **키 등록**: key exists, no verified provider response for this item. **수신 성공**: the relevant probe received the expected response format. **부분 확인**: some transport/format evidence but not verified operational layers. **키 없음**, **수신 오류**, **검사 보류**, and **미연동** must not be presented as safe road conditions.
- Most real-provider diagnostic endpoints are **Preview only** and rate-limited. An HTTP 404 in Production is expected for such probes; it does not prove that all operational APIs have failed.
- A newly added Vercel environment variable requires a **fresh deployment**. Register authorized Preview domains with Kakao/VWorld as applicable. Keep actual keys in Vercel environment variables; never commit them.

## Adding a new API (development checklist)

1. Identify the official endpoint, terms of use, permitted usage, authentication, quotas, update interval, observation/forecast validity and spatial reference.
2. Add only the **environment variable name** to `.env.example`; configure its secret value in Vercel Preview (server-side credentials never logged or displayed).
3. Implement a bounded, provider-specific server proxy in `lib/api.mjs` and/or a dedicated `lib/*.mjs`. Validate parameter ranges, source host, response size, data times and geometry. Never expose private keys in URLs returned to clients.
4. Add a source entry and a truthful probe mapping in `public/connection-status.mjs`. Keep **registered** separate from **data received**, and **data received** separate from **route risk confirmed**.
5. Add deterministic tests under `test/`, run `pnpm check && pnpm test && pnpm build:vercel`, then inspect Preview logs and actual requests before adding a map layer or voice alert.
6. Document data licensing and attribution. Never synthesize real-time hazards from absent or stale data.

For safe comparison, keep `Sunny_SAI_TEST/main` and the current Production Vercel deployment unchanged while Preview changes are validated.
