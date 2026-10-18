-- farm_subscriptions: clients may SELECT only; all writes are service_role
-- (Stripe webhook + complimentary admin grants). Defensive revoke even if
-- table was created with SELECT-only grants — matches tighten_grants pattern.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.farm_subscriptions FROM anon, authenticated;
GRANT SELECT ON TABLE public.farm_subscriptions TO authenticated;
GRANT ALL ON TABLE public.farm_subscriptions TO service_role;
