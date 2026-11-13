# Sunny SAI — Automobile / Walking routing integration (pre-deployment)

## Mode selection

The route search form provides **🚗 자동차** and **🚶 도보**. Existing car routing remains the default.

A walking search calls the same authenticated `POST /api/route` endpoint with `travelMode: 'walking'`. The backend **never** substitutes the vehicle road route when walking fails.

### Separate Kakao routing products

- Car: Kakao Mobility `https://apis-navi.kakaomobility.com/v1/directions` / `future/directions`
- Pedestrian: Kakao Maps REST `https://dapi.kakao.com/v2/routing/walk`, with WGS84 coordinate pairs and a server-side REST API key
- External fallback when the pedestrian API is unavailable: `https://m.map.kakao.com/scheme/route?...&by=foot`; this opens Kakao Maps pedestrian directions without inventing a local route.
- The separate **Kakao Mobility partner walking API** at `/affiliate/walking/v1/directions` is a different, partnership-gated product and is **not** used here.

Official Kakao Maps API docs:
https://developers.kakao.com/docs/ko/kakaomap/rest-api

Official Kakao Maps link scheme:
https://apis.map.daum.net/ios_v2/docs/getting-started/urlscheme/

The Kakao Maps API may still require an enabled Maps product, appropriate quota and account permissions. No live confirmation has been obtained for the project's REST key before deployment.

## Supported first iteration

- Geographic, provider-backed pedestrian route polyline; duration, distance and sample ETA
- 2–18 pedestrian weather samples along the path
- Same KMA forecast sampling as driving; risk evaluation uses `mode:'walking'`
- GPS progress, off-route monitoring and user-visible reroute preserve walking mode
- Walking markers and explicit pedestrian route label
- Exclude automobile-specific KMA road-link icing/visibility grades from pedestrian risk
- Optional external opening of Kakao Maps foot directions
- Default driving demo (Seoul–Busan) remains unchanged

## Not yet available

- Verified sidewalk/crosswalk closure information, stairs, wheelchair accessibility and pedestrian incident feeds
- Tested on-device voice/heading/GPS outdoors for pedestrian movement
- Turn-by-turn pedestrian instruction audio or validated crossing guidance
- Autonomous selection of an actually safer pedestrian alternative, based on comprehensive risk layers

**Never infer a confirmed safe walking route from a lack of forecast data or a Kakao walking polyline.**

## Post-deployment verification

1. Ensure the correct Kakao REST API key is configured and Maps API permissions include pedestrian directions.
2. Open the fixed preview and select Walking. Search for **two nearby places** (e.g., places within the same city) and verify response shows `travelMode: walking`, the realistic footpath, route distance and time.
3. Select Driving using the same start/destination and verify the API returns a different car route.
4. Select walking, deny/disable walking API access and verify the UI **does not** draw car roads; external Kakao Maps walking link remains available.
5. Test route GPS updates, walking marker, weather refresh, and user-controlled reroute in a safe walking environment.
6. Check unknown risk conditions remain **unknown** and automotive road-risk grades never appear as verified pedestrian hazards.
7. Verify Seoul–Busan demo still uses the driving mode and existing simulated hazard narrative.
8. Inspect browser console/network for malformed route geometries, permission denials or missing provider data.

Unit tests:
`npm test`

Static check:
`npm run check`
