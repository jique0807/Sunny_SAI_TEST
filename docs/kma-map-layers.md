# Georeferenced KMA map layers — preview

Source: [KMA API Hub short-range/ultra-short range forecast documentation](https://apihub.kma.go.kr/apiList.do?seqApi=10)

## Real data products
- **초단기예보**: T1H (air temperature, °C) and WSD (wind speed, m/s).
- **강수**: RN1 (forecast hourly precipitation, including qualitative ranges); no interpolation to unqueried areas, and no radar-imagery claims.
- **눈**: PTY code 2 (rain/snow), 3 (snow), 6 (raindrops/snow grains), 7 (snow grains); **NOT** accumulation or snow-depth data.

The backend endpoint `POST /api/map-forecast` validates up to 9 map-viewport sample points in South Korea, snaps them to official KMA 5-km grid cells, deduplicates grids, and obtains actual `getUltraSrtFcst` records through existing server-side `kmaWeather` with `KMA_API_KEY`. It returns cell center, exact four KMA Lambert conformal-grid cell corners, forecast value, issue/valid times and status. It does not accept credentials from the client and does not reveal upstream URLs or keys. Existing per-session rate limiting applies, with an extra 2-per-minute counter for map forecast requests.

Each retrieved cell is rendered as a small actual georeferenced polygon with a value badge on Kakao Maps, OpenStreetMap (Leaflet) or VWorld. Only queried cells are painted; there is no invented continuous precipitation, snow or temperature distribution. The UI reports how many cells returned actual forecasts and makes empty/unavailable cells explicit.

## Use in Preview
1. Confirm `KMA_API_KEY` is enabled for Preview and a newer preview deployment exists.
2. Open `https://sunny-sai-preview.vercel.app`.
3. Open **표출**, select **초단기예보**, **강수**, or **눈**. Zoom in: Leaflet zoom 9+, Kakao map level 7 or lower.
4. Read the source, queried-cell counts and forecast valid time in the status area. Empty snow results are valid when no sampled cell forecasts snow; missing area outside the cells is **unknown**, not clear weather.
5. Pan to a new area and choose **현재 지도 범위의 기상청 예보 다시 조회**. Refresh attempts are controlled to avoid excessive KMA API usage.
6. The opacity slider applies to the real KMA polygons. Existing Safemap river-flood WMS remains separate and **not real-time inundation**.

The following controls remain disabled because their actual verified, georeferenced sources are not implemented: road icing/hazards, weather-warning polygons, fog/low visibility, and road closures. The ITS and Korea Expressway Corporation APIs are intentionally excluded.

Run `pnpm check && pnpm test && pnpm build:vercel` and verify real data display through the Preview URL before any merge to Production.
