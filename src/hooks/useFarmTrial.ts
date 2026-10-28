import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { Farm } from '@/types/farm';

export function useFarmTrial() {
  const { farm_id, session } = useFarm();
  const userId = session?.user?.id;
  const [result, setResult] = useState<{ farmId: string; userId: string; farm: Pick<Farm, 'trial_started_at' | 'trial_ends_at'> } | null>(null);
  useEffect(() => {
    if (!farm_id || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from('farms')
          .select('trial_started_at, trial_ends_at').eq('id', farm_id).maybeSingle();
        if (!cancelled) setResult(!error && data ? { farmId: farm_id, userId, farm: data } : null);
      } catch {
        if (!cancelled) setResult(null);
      }
    })();
    return () => { cancelled = true; };
  }, [farm_id, userId]);
  return result?.farmId === farm_id && result?.userId === userId ? result.farm : null;
}

/** Keep mounted reminders current across midnight, expiry, and resumed tabs. */
export function useTrialClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return now;
}
