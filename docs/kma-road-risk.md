# KMA road ice / low-visibility hazard — preview, approval-gated

**Official KMA source:** https://apihub.kma.go.kr/apiList.do?apiMov=3.+%EB%8F%84%EB%A1%9C%EA%B8%B0%EC%83%81%EA%B4%80%EC%B8%A1%EC%A0%95%EB%B3%B4&seqApi=971&seqApiSub=293

- API: `https://apihub.kma.go.kr/api/typ04/url/road_file_down.php?roadNum=001&authKey=...`
- Latest ZIP requested with a **KMA road API** authorization; `tm` is deliberately omitted.
- The allowed highway route numbers are those listed in the official KMA API Hub document.
- Road ice season: **Nov 15–Mar 15**; road visibility risk: year-round.
- KMA produces ice risk *probability* and low-visibility *risk*, not confirmation a road is frozen or closed. Risk levels from the source (interest / caution / danger) must be reported honestly.

## Server security and georeferencing
The credential `KMA_API_KEY` remains only on the server. `POST /api/road-risk` requires the existing CSRF/authenticated session and an allowlisted three-digit `roadNum`. It retrieves a bounded ZIP from only the KMA API Hub host, refuses text/html API errors, unknown ZIP formats, oversized/unsafe content, and does not return the key.

The client NEVER makes up a road location: only risk records with explicit WGS84 Point/LineString geometry or verified lat/lon can be placed. Pure node-link IDs require a licensed, verified link-geometry table *before* displaying road line segments; these are not replaced with approximate locations. Only explicit ice / visibility risk field names and unambiguous risk levels are accepted. Unknown format/columns produce an honest disabled/no-data status.

## Kakao map support
Kakao Maps JavaScript supports `Polyline`, `Marker`, `Polygon`, and `CustomOverlay` as well as `setMap(null)`. The **same actual coordinates** are displayed as Kakao `Polyline` (verified line geometry) or `Marker` (verified point geometry), and as Leaflet `polyline`/`circleMarker` in OSM/VWorld. Road data is not restricted to Leaflet. A point never pretends to be a road segment.

The weather-layer panel has a large **X** close button with sticky header, keyboard Escape, and correct hidden state on mobile and desktop.

### Caution
The public KMA API documentation states the road-risk output is ZIP and links to a file-format PDF; actual current ZIP could be node-link-only, a format not matching CSV/GeoJSON/WKT, or require *separate* API authorization. Such records are intentionally not mapped until validated. `KMA_API_KEY` presence alone is not proof of authorization. KMA API Hub content is independent of the Korea Expressway Corporation and ITS APIs, which remain excluded. Do not promote this functionality to production before inspecting the first real approved ZIP and mapping its schema.

## CI and verification
Run `pnpm check && pnpm test && pnpm build:vercel`.
In Preview: **표출 → 도로살얼음 위험예보 / 도로 저시정 위험예보 → 고속도로 선택 → 조회**. Read the status and only view verified geometries, on Kakao or Leaflet maps. On mobile, scroll the panel and tap **X** to close. Check *both* the correct data-warning wording and the absence of fictitious road danger segments.
