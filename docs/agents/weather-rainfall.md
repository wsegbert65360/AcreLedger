# Weather and rainfall

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/services/WeatherService.ts, api/weather-proxy.ts, src/lib/fieldLocation.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
<!-- contents:end -->

## Weather and Rainfall Rules

- Weather uses Visual Crossing, routed through `WeatherService.buildWeatherUrl`. Local `npm run dev` may call Visual Crossing directly when `VITE_VISUALCROSSING_KEY` is set. Every non-dev build, including Capacitor (`vite build --mode capacitor`), returns an empty bundled key so the vendor key is not inlined. Production web and native builds go through the `/api/weather-proxy` Vercel Function. Production proxy requests require a Supabase bearer token, validated server-side with `auth.getUser(token)`. `WeatherService` resolves the proxy base via `resolveWeatherProxyUrl()`.
- `VITE_WEATHER_PROXY_URL` is required for Capacitor and other native builds. `vite.config.ts` fails a `capacitor` mode build when it is missing, and `codemagic.yaml` does the same before the native bundle step. If set, the URL must be HTTPS (or `localhost`/`127.0.0.1`), have no surrounding quotes, and not already include the `/api/weather-proxy` path suffix — `WeatherService` appends it. `cleanEnvValue` in `src/lib/weatherBuildConfig.ts` strips stray quotes/whitespace. Do not put `VITE_VISUALCROSSING_KEY` in the CodeMagic `appstore` group or any App Store/native build.
- The proxy's server-only variables, exact-origin CORS allowlist, method and endpoint allowlists, timeout, and per-user quota are specified in [BLUEPRINT → Weather Proxy](../../BLUEPRINT.md#weather-proxy-apiweather-proxyts). The per-user quota is 30 calls per authenticated user per one-minute window and 500 calls per rolling 24 hours (`20260928120000_add_weather_proxy_daily_rate_limit.sql`). Exhaustion returns `429` with `Retry-After`; database/RPC failure fails closed with `503`. A separate global UTC daily spend cap (`WEATHER_DAILY_CAP`, default 2000) also fails closed with `503`. Never use a wildcard origin. Apply the rate-limit migration before deploying proxy code, and redeploy after any Vercel variable change. Responses set `Cache-Control: no-store`.
- Rainfall uses the Rain API with IEM Stage IV radar plus Supabase RPC merge.
- Rainfall lookups should use coordinates when available so the radar merge remains active.
- Lat/lng should be rounded to 4 decimals for radar grid consistency.
- Polygon field boundaries should fall back to centroids when explicit coordinates are missing.
- Field rainfall lookups should go through `resolveFieldRainfallLocation` from `@/lib/fieldLocation.ts` so fields without explicit lat/lng can use drawn boundary centroids, assigned CLU geometry, or legacy CLU numbers before showing missing-location errors.
- When resolving CLU geometry for rainfall or maps, preserve tract keys with `loadKeyedTractCollections` rather than losing key context from raw `TractFeatureCollection[]` arrays.
- Weather and rainfall request failures should degrade gracefully without crashing the UI.
- Windy radar embeds require CSP entries in both `child-src` and `frame-src`.
