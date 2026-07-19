-- Harden scheduled MRMS Edge Functions with a named secret API key.
--
-- Operational prerequisite (must be provisioned per environment, never
-- committed):
--   vault.decrypted_secrets.mrms_automation_api_key = named `automations`
--     sb_secret_* key from Project Settings > API Keys
--   vault.decrypted_secrets.mrms_project_url = this environment's project URL
--
-- The migration fails closed when either value is absent, preventing a cron
-- job that silently sends NULL or falls back to a privileged legacy key.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'mrms_automation_api_key'
      AND decrypted_secret LIKE 'sb_secret_%'
  ) THEN
    RAISE EXCEPTION 'Vault secret mrms_automation_api_key is missing or invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'mrms_project_url'
      AND decrypted_secret ~ '^https://[a-z0-9]+[.]supabase[.]co/?$'
  ) THEN
    RAISE EXCEPTION 'Vault secret mrms_project_url is missing or invalid';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mrms-hourly-ingestion') THEN
    PERFORM cron.unschedule('mrms-hourly-ingestion');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mrms-morning-backfill') THEN
    PERFORM cron.unschedule('mrms-morning-backfill');
  END IF;

  PERFORM cron.schedule(
    'mrms-hourly-ingestion',
    '20 * * * *',
    $job$
      SELECT net.http_post(
        url := rtrim((
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'mrms_project_url'
        ), '/') || '/functions/v1/mrms-hourly',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'mrms_automation_api_key'
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );

  PERFORM cron.schedule(
    'mrms-morning-backfill',
    '5 7 * * *',
    $job$
      SELECT net.http_post(
        url := rtrim((
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'mrms_project_url'
        ), '/') || '/functions/v1/mrms-backfill',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'mrms_automation_api_key'
          )
        ),
        body := '{"mode":"overnight"}'::jsonb
      );
    $job$
  );

  -- The previous scheduler read a service-role JWT from this application
  -- table. Remove that credential only after both replacement jobs exist.
  IF to_regclass('public.rainfall_settings') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.rainfall_settings WHERE key = $1'
      USING 'service_role_key';
  END IF;
END
$migration$;
