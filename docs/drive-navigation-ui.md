# Sunny SAI Preview — compact navigation and heading-up mode

The user's 2026-11-06 navigation UI feedback is implemented on the **preview branch only**.

## Layout
- When **안내 시작** is active, the map occupies the full mobile viewport and the normal bottom navigation/menu is hidden.
- The actual remaining-distance/estimated-travel-time/arrival bar is anchored flush with the bottom screen edge, with safe-area padding and a visible **종료** button.
- Two *small rectangular* cards overlap diagonally at the top left (second is shifted down/right). The closest observed risk appears first; when there aren't two actual risk records the unused slot states explicitly that data is pending or no *additional observed forecast risk* was found. No fake warning events.
- The right-side overall-route progress rail is aligned between the alert chips and bottom summary and includes actual weather risk locations. Native Kakao ZoomControl and OSM floating zoom sidebar are omitted. Home map zoom gestures remain available.

## Direction and limitations
- Kakao Maps **JavaScript** SDK does **not** offer a native map bearing/rotation API (see https://devtalk.kakao.com/t/topic/135421 and https://apis.map.kakao.com/web/documentation/).
- On foreground mobile guidance only, Sunny SAI uses a *visual CSS rotation* of the real Kakao map container when a trustworthy course is available. Maps/route line and labels rotate together; this is **not** equivalent to native SDK camera rotation and needs real-device testing. Interactive map drag/zoom is disabled in this mode to avoid inaccurate touch coordinates under rotation.
- Prefer moving GPS `heading` at speed >=1.5 m/s with accuracy <=60 m. When no heading is supplied, derive course from two measured GPS fixes separated by >=12 m with accuracy <=35 m and realistic velocity. At short stops retain a recent direction up to 20 s; otherwise return to north-up instead of guessing.
- The arrow is counter-rotated inside the map so that real travel direction is visually toward the top. When course cannot be determined, the map stays north-up with an explicit direction status.
- The actual camera position is still updated from watchPosition and route progress from projection onto the Kakao route; map heading is not a substitute for a safe, full-featured native navigation system.

## Verification
GitHub Actions checks `pnpm check && pnpm test && pnpm build:vercel`. Real-driving verification in foreground on iOS/Android remains necessary, including GPS accuracy, directional smoothing, visual map tile coverage, label readability and Safari map performance. Do not claim native navigation accuracy, automatic re-route, or background GPS support.
