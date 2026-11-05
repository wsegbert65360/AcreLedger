import { useCallback, useEffect, useState } from 'react';

import { getFarmAccessState, FULL_ACCESS } from '@/lib/farmAccess';
import type { FarmAccessState } from '@/lib/farmAccess';
import { supabase } from '@/lib/supabase';
import type { FarmCompStatus } from '@/types/database';
import type { FarmSubscription } from '@/types/farm';

import { useTrialClock } from './useTrialClock';

interface AccessSnapshot {
  key: string;
  trialEndsAt: string | null;
  comp: FarmCompStatus | null;
  subscription: FarmSubscription | null;
}

/**
 * Loads what the read-only decision needs for the selected farm. Takes ids
 * directly (not `useFarm()`) so FarmProvider itself can call it.
 *
 * A failed read keeps the last good snapshot for the same user and farm;
 * with no snapshot the farm keeps full access (fail open).
 */
export function useFarmAccessState(options: {
  enforce: boolean;
  farmId: string | null;
  userId: string | undefined;
  isOnline: boolean;
}): FarmAccessState {
  const { enforce, farmId, userId, isOnline } = options;
  const key = farmId && userId ? `${userId}:${farmId}` : null;
  const now = useTrialClock();
  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken(token => token + 1), []);

  useEffect(() => {
    if (!enforce || !key) return;
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enforce, key, reload]);

  useEffect(() => {
    if (!enforce || !key || !farmId || !isOnline) return;
    let cancelled = false;
    void (async () => {
      try {
        const [farm, comp, subscription] = await Promise.all([
          supabase.from('farms').select('trial_ends_at').eq('id', farmId).maybeSingle(),
          supabase.rpc('get_farm_comp_status', { p_farm_id: farmId }),
          supabase.from('farm_subscriptions').select('*').eq('farm_id', farmId).is('deleted_at', null).maybeSingle(),
        ]);
        if (cancelled || farm.error || comp.error || subscription.error) return;
        setSnapshot({
          key,
          trialEndsAt: farm.data?.trial_ends_at ?? null,
          comp: (comp.data as FarmCompStatus[] | null)?.[0] ?? null,
          subscription: (subscription.data as FarmSubscription | null) ?? null,
        });
      } catch {
        // Keep the last good snapshot; with none the farm stays fully usable.
      }
    })();
    return () => { cancelled = true; };
  }, [enforce, key, farmId, isOnline, reloadToken]);

  if (!enforce) return FULL_ACCESS;
  const current = snapshot?.key === key ? snapshot : null;
  return getFarmAccessState({
    enforce,
    loaded: current !== null,
    trialEndsAt: current?.trialEndsAt,
    comp: current?.comp,
    subscription: current?.subscription,
    nowMs: now,
  });
}
