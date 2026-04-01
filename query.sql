SELECT source, finalized, count(*), sum(rainfall_in) 
FROM public.field_rainfall_hourly 
WHERE timestamp_utc > now() - interval '7 days' 
GROUP BY source, finalized;
