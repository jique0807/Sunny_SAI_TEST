# Sunny SAI data-layer integration

## KMA: route forecasts (existing)
The server-side `/api/weather` uses the `KMA_API_KEY` Vercel environment variable to call `getUltraSrtFcst` / `getVilageFcst`. Samples are mapped by grid and estimated passage time, with per-point source/time and explicit unavailability. Do not infer area-scale precipitation, snowfall, fog, road closure or measured road weather from these route-point forecasts.

## Safemap: national-river flood extent (new)
Official documentation: https://www.safemap.go.kr/opna/data/dataViewRenew.do?objtId=209
- Type: IF_0089_WMS, layer A2SM_FLOODFOVRRISK1
- Meaning: approximate 100-year national river-flood extent. **NOT real-time road inundation**.
- The server only reads `SAFEMAP_API_KEY`. The `GET /api/safemap/wms` proxy injects it into the fixed WMS URL and validates EPSG:3857 bounding boxes strictly within South Korea and requested image sizes (128–1024 pixels). It rejects non-PNG responses and never returns provider credentials or raw upstream error text.
- The layer works in **OpenStreetMap and VWorld Leaflet maps** only, at zoom >= 9. If enabled while Kakao is active, it switches to the OpenStreetMap base map for geospatial alignment. Overlay defaults to off and shares the existing opacity control.
- Map layers and connection status do not claim the presence of a registered key is proof of approved/usable data. Visit **데이터 연결 → 기상청·생활안전지도 실제 응답 검사**; it performs a KMA forecast-point request and a small Safemap PNG request. A PNG can be empty; this verifies transport and format, not that the test region is actually flood-prone.
- The official Safemap content page lists **공공누리 제4유형** (attribution, noncommercial, no derivatives). Confirm rights and approval before public/commercial release.
- No assertion is made about objtId=223; it was not independently verified.

## Test and deployment
Run `pnpm check && pnpm test && pnpm build:vercel`, then inspect GitHub Actions.
Ensure `KMA_API_KEY` and `SAFEMAP_API_KEY` are enabled in Vercel Preview. Changes to variables require **new deployments**.
Do not merge this feature branch into main until API responses and visual placement have been checked in the preview on desktop and iPhone.
