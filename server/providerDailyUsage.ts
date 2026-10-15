import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_WEATHER_DAILY_CAP = 2000;
export const DEFAULT_AI_DAILY_CAP = 500;

export type ProviderDailyName = 'weather' | 'ai';

export function resolveDailyCap(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createServiceRoleClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function consumeProviderDailyCap(
  service: SupabaseClient,
  provider: ProviderDailyName,
  cap: number,
): Promise<'ok' | 'exceeded' | 'unavailable'> {
  const { data, error } = await service.rpc('increment_provider_daily_usage', {
    p_provider: provider,
    p_cap: cap,
  });
  if (error) return 'unavailable';
  if (data !== true) return 'exceeded';
  return 'ok';
}
