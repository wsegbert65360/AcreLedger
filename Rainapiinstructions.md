# Rain API Integration Guide (v2.0 - 2026-03-29)

This document provides the technical contract for the **Rain API** as implemented in the Vercel deployment and consumed by the AcreLedger frontend.

## Overview

The Rain API serves multi-source rainfall data:
1. **IEM Stage IV** (Radar-derived) for coordinate-based lookups.
2. **AcreLedger Supabase (MRMS)** for field-based historical lookups.

---

## API Documentation

### Base URL
`https://rain-api.vercel.app`

### 1. Cumulative Rainfall & Breakdown (GET)
Used for dashboard stats (24h, 72h, 7d).

**Endpoint:** `GET /rain`

**QueryParams:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `lat` | number | Yes | Latitude of the point. |
| `lon` | number | Yes | Longitude of the point. |
| `days` | number | No | Days to look back (default: 7). |

**Response Schema:**
```json
{
  "mode": "iem",
  "location": { "lat": 38.4, "lon": -93.5 },
  "rainfall": 1.25,
  "breakdown": {
    "2026-03-27": 0.5,
    "2026-03-28": 0.75
  },
  "period": { "start": "2026-03-22", "end": "2026-03-28", "days": 7 },
  "units": "inches",
  "source": "IEM Stage IV"
}
```

### 2. Custom Date Range (GET)
Used for "Since Planting" and "Since Last Spray" stats.

**Endpoint:** `GET /rain`

**QueryParams:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `field_id` | UUID | Yes | AcreLedger field identifier. |
| `start_date` | string | Yes | YYYY-MM-DD. |
| `end_date` | string | No | YYYY-MM-DD (defaults to today). |

**Response Schema:**
```json
{
  "rainfall": 2.45,
  "source": "Supabase MRMS"
}
```

---

## Implementation Details

### Protocol Rules
1. **No POST:** The API only supports `GET` and `OPTIONS`. 
2. **Coordinate Mode:** If `lat` and `lon` are present, the API uses IEM Stage IV radar data. `field_id` is ignored in this mode.
3. **Centroid Extraction:** For fields with polygons, the client must compute a centroid coordinate to use the IEM mode.
4. **Client-side Aggregation:** For 24h and 72h stats, the client should sum the values in the `breakdown` object.

### Error Handling
- `400 Bad Request`: Missing coordinates or required params.
- `500 Internal Error`: Service failure.
- Failures in custom ranges should be treated as 0.0" rainfall to prevent UI crashes.
