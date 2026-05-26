-- Tighten overly permissive GRANTs for read-only tables
REVOKE INSERT, UPDATE, DELETE ON TABLE public.field_rainfall_hourly FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.field_rainfall_coverage FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.farm_rainfall_daily FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.farms FROM authenticated;