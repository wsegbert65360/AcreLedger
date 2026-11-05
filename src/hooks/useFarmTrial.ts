import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { FarmCompStatus } from '@/types/database';
import type { Farm } from '@/types/farm';

type FarmTrial = Pick<Farm, 'trial_started_at' | 'trial_ends_at'> & { comp: FarmCompStatus | null };

export function useFarmTrial(): FarmTrial | null {
  const { farm_id, session } = useFarm();
  const userId = session?.user?.id;
  const [result, setResult] = useState<{ farmId: string; userId: string; farm: FarmTrial } | null>(null);
  useEffect(() => {
    if (!farm_id || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [trial, comp] = await Promise.allSettled([
          supabase.from('farms').select('trial_started_at, trial_ends_at').eq('id', farm_id).maybeSingle(),
          Promise.resolve().then(() => supabase.rpc('get_farm_comp_status', { p_farm_id: farm_id })),
        ]);
        const data = trial.status === 'fulfilled' && !trial.value.error ? trial.value.data : null;
        const compStatus: FarmCompStatus | null = comp.status === 'fulfilled' && !comp.value.error
          ? comp.value.data?.[0] ?? null : null;
        if (!cancelled) setResult(data || compStatus ? {
          farmId: farm_id,
          userId,
          farm: {
            trial_started_at: data?.trial_started_at ?? null,
            trial_ends_at: data?.trial_ends_at ?? null,
            comp: compStatus,
          },
        } : null);
      } catch {
        if (!cancelled) setResult(null);
      }
    })();
    return () => { cancelled = true; };
  }, [farm_id, userId]);
  return result?.farmId === farm_id && result?.userId === userId ? result.farm : null;
}

export { useTrialClock } from './useTrialClock';
