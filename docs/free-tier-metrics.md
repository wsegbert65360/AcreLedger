# Free tier metrics queries

Read-only queries to size the cost of free farms. Run them yourself in the Supabase SQL editor (service role).
They were NOT run against production by the agent that wrote them; check column names against the live schema first.
Plan comes from `public._farm_entitlement(farm_id)` (internal function, service role only).

## Rainfall rows per day, by plan
```sql
-- Hourly rows written in the last 7 days, split by plan (free farms only collect slot fields once tiering is live).
SELECT e.plan,
       count(*) / 7.0                       AS hourly_rows_per_day,
       count(DISTINCT h.field_id)           AS fields_collecting
FROM public.field_rainfall_hourly h
JOIN public.fields f ON f.id = h.field_id
CROSS JOIN LATERAL public._farm_entitlement(f.farm_id) e
WHERE h.timestamp_utc >= now() - interval '7 days'
GROUP BY e.plan
ORDER BY e.plan;

-- Daily-total rows (free farms) in the last 7 days.
SELECT e.plan,
       count(*) / 7.0                       AS daily_rows_per_day,
       count(DISTINCT d.field_id)           AS fields_collecting
FROM public.field_rainfall_daily d
JOIN public.fields f ON f.id = d.field_id
CROSS JOIN LATERAL public._farm_entitlement(f.farm_id) e
WHERE d.rain_date >= current_date - 7
GROUP BY e.plan
ORDER BY e.plan;
```

## Photo storage per farm (photos are base64 inside spray `notes` today)
```sql
SELECT s.farm_id,
       e.plan,
       count(*) FILTER (WHERE s.notes LIKE '%[ATTACHMENT:data:image%')                      AS photos,
       pg_size_pretty(sum(octet_length(s.notes)) FILTER (WHERE s.notes LIKE '%[ATTACHMENT:data:image%')) AS photo_bytes
FROM public.spray_records s
CROSS JOIN LATERAL public._farm_entitlement(s.farm_id) e
WHERE s.deleted_at IS NULL
GROUP BY s.farm_id, e.plan
ORDER BY sum(octet_length(s.notes)) FILTER (WHERE s.notes LIKE '%[ATTACHMENT:data:image%') DESC NULLS LAST;
```

## Farms over a free limit today (grandfathered, not blocked)
```sql
SELECT f.farm_id,
       e.plan,
       count(*) FILTER (WHERE f.deleted_at IS NULL) AS active_fields,
       e.field_cap
FROM public.fields f
CROSS JOIN LATERAL public._farm_entitlement(f.farm_id) e
GROUP BY f.farm_id, e.plan, e.field_cap
HAVING e.field_cap IS NOT NULL AND count(*) FILTER (WHERE f.deleted_at IS NULL) > e.field_cap;
```

## After turning on `shadow`: what would be blocked
```sql
SELECT farm_id, feature, plan, count(*) AS would_block, max(created_at) AS last_seen
FROM public.entitlement_shadow_log
GROUP BY 1, 2, 3
ORDER BY would_block DESC;
```
Expected: nothing for Egbert Farm or the legacy trial farms (once their `farm_comps` rows exist).
