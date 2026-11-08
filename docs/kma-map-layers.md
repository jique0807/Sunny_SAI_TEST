# Sunny SAI — map-first real KMA weather overlays (Preview)

## What is actually displayed
- **강수:** KMA `RN1` 1-hour precipitation forecast, coloured blue by magnitude for georeferenced 5-km cells. No rain is transparent; unqueried locations are also transparent but **must not** be read as dry.
- **눈:** KMA `PTY` snow / mixed precipitation *type*, not measured snowfall or snow accumulation.
- **초단기예보:** actual `T1H` temperature and `WSD` wind fields by KMA grid cell.
- **경로 기상예보 지점:** already implemented actual KMA route weather points on Kakao.
All of the above require valid KMA API responses, authorized `KMA_API_KEY`, and an initialized map. No simulated precipitation is used.

The selected cells are drawn as true KMA Lambert-grid four-corner polygons, matching the Kakao Maps latitude/longitude projection. On OpenStreetMap/VWorld the same cell geometry is rendered through Leaflet. Up to 16 cell sample queries per viewport; it is intentionally a **sampled mosaic**, not a continuous national radar map. For comprehensive seamless national coverage, a separately authorized nationwide-grid or radar source with verified response format and pixel georeferencing will be needed.

## Image-inspired interaction
A translucent blue rainfall overlay with intensity legend, and a small bottom time controller with forecast valid times at 0 / +1 / +2 / +3 hours. Each fetched `getUltraSrtFcst` API response includes the time series for that cell: the slider reuses real official values and does not make up future frames or issue extra provider calls per drag. Cells for an unavailable time remain transparent.
- Choose **표출 → 강수** (or **눈** / **초단기예보**); close the main controls with the visible **X**.
- Use the fixed bottom timeline to choose the actual forecast hour. Its X disables the weather overlay and dismisses the time control.
- Tap a coloured map cell for its exact KMA issued/valid time, value, grid ID and forecast caveat. Map and route overlay remain separate.
- Map opacity control affects real KMA grid polygons. No rain / unqueried pixels have no coloured overlay.

## Removed from the visible layer menu
Road ice / visibility risk: KMA road-risk ZIP may lack verified latitude/longitude or link geometry.
Warnings, road closures: no verified geometries/feed.
Flood WMS: cannot yet confirm it works on the currently preferred Kakao map; remains backend-only until service response and map alignment are demonstrated.
These may remain in internal backend modules but **must not appear as toggles** until they're verifiably drawable.

KMA official documentation:
- https://apihub.kma.go.kr/apiList.do?seqApi=10
- Full nationwide KMA 149x253 grid product (nph-dfs_vsrt_grd) is documented but not yet integrated; its format/order and API approval have not been verified. Do not confuse the current sampled 5km forecast with national seamless coverage or live radar observations.

## Build and deploy validation
`pnpm check && pnpm test && pnpm build:vercel`.
GitHub feature branch: `feature/responsive-mobile-viewport`; verify Preview deployment and alias before claiming the latest UI is live. Never modify Production without specific approval.
