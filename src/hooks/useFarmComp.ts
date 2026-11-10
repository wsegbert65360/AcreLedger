import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { FarmCompStatus } from '@/types/database';

/** The farm's complimentary-access status (owner farm), or null when it has none or is still loading. */
export function useFarmComp(): FarmCompStatus | null {
  const { farm_id, session } = useFarm();
  const userId = session?.user?.id;
  const [result, setResult] = useState<{ farmId: string; userId: string; comp: FarmCompStatus | null } | null>(null);
  useEffect(() => {
    if (!farm_id || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_farm_comp_status', { p_farm_id: farm_id });
        if (!cancelled) setResult({ farmId: farm_id, userId, comp: error ? null : data?.[0] ?? null });
      } catch {
        if (!cancelled) setResult(null);
      }
    })();
    return () => { cancelled = true; };
  }, [farm_id, userId]);
  return result?.farmId === farm_id && result?.userId === userId ? result.comp : null;
}

/** Keep mounted notices current across midnight, expiry, and resumed tabs. */
export function useNowClock() {
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