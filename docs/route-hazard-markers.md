# Sunny SAI route hazard icons — Preview

This feature uses the same real KMA route-grid forecasts for the route-search result and in-drive right-side progress rail. It does not show fictitious ice, flood, fog or road-closure warnings.

## Route search
- After a real Kakao Mobility route is found, the route-result sheet displays the full-route vertical rail.
- Real forecast requests run asynchronously. While pending, the rail has no warning icons and explicitly reports pending.
- Successful KMA PTY/RN1 values with actual matched route time populate 🌧️ rain, ❄️ snow, 🌨️ mixed rain/snow icons at route-length fractions (not equally spaced).
- Hazard events are chronological; same type within 10 minutes are consolidated. At most 10 icons are drawn to reduce clutter.
- A tap/click opens real expected passing time, 1-hour rain amount (RN1/PCP), 1-hour new snowfall (SNO when present), forecast valid time and source. Only KMA short-range (getVilageFcst) provides SNO; ultra-short-range PTY means precipitation type, never snowfall depth. No value shows “자료 없음”.
- No KMA response or an unrequested route interval means unknown, never safe. On provider selection Open-Meteo, KMA-specific PTY meanings are not assumed.

## Live navigation
- The same shared markers follow the route progress rail (bottom=start, top=destination) and update from actually retrieved forward forecasts. Tapping a marker opens the same detail panel.
- Markers do not attempt to assert actual ice on the road, road flooding, or confirmed closures.

## Known limits
- KMA forecast is representative of a 5-km grid, not direct road-surface observations.
- Until the KMA road-risk ZIP and flood hazard source are georeferenced to route segments, ice and flood icons do not appear. Data sources and data freshness require verification before activation.
- Preview-only change, no Production deployment.
