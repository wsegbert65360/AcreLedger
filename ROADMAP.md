# ROADMAP.md — AcreLedger

Planned, **not built**. Nothing here is architecture or a commitment; do not treat these items as
existing behavior. When an item ships, document it in [BLUEPRINT.md](./BLUEPRINT.md) and remove it here.

## Weather decision-support cards

Additional cards for the `/weather` page, ported from FarmCMD's feature set:

- **Field Workability** — composite score (0–100) factoring soil temperature, rainfall, wind, and forecast.
- **Frost & Freeze** — three-night outlook with advisory/warning thresholds.
- **Rain Window** — dry-stretch analysis with a soil-saturation estimate.
- **Atmosphere** — humidity, dew point, sunrise/sunset, and daylight hours.

Intended approach: each calculator is a pure function in `@/lib/` with no config dependency, using
named constants for thresholds (matching `evaluateSprayConditions` and `WIND_ALERT_MPH`).
