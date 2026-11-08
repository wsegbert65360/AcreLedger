import { useEffect, useState } from 'react';

import {
  type Entitlement,
  freeEntitlement,
  isEntitlementStale,
  parseCachedEntitlement,
  parseEntitlementRow,
} from '@/lib/entitlements';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';

const cacheKey = (userId: string, farmId: string) => `${userId}_al_entitlement_${farmId}`;

function readCache(userId: string, farmId: string): Entitlement | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId, farmId));
    return raw ? parseCachedEntitlement(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, farmId: string, value: Entitlement) {
  try {
    localStorage.setItem(cacheKey(userId, farmId), JSON.stringify(value));
  } catch {
    // Storage unavailable: display falls back to the server result next load.
  }
}

/**
 * Display-only plan info for gating UI and upgrade prompts. Never use this as
 * authorization: the server enforces. Offline, the last server answer is reused
 * until its premiumUntil passes. Until the first answer, the plan is `loading`.
 */
export function useEntitlement(): { entitlement: Entitlement | null; loading: boolean } {
  const { farm_id, session } = useFarm();
  const userId = session?.user?.id;
  const [state, setState] = useState<{ key: string; entitlement: Entitlement } | null>(null);

  useEffect(() => {
    if (!farm_id || !userId) return;
    const key = `${userId}:${farm_id}`;
    let cancelled = false;
    const cached = readCache(userId, farm_id);
    if (cached) setState({ key, entitlement: cached });
    void (async () => {
      try {
        const { data, error } = await (supabase.rpc as unknown as (
          fn: string, args: Record<string, unknown>,
        ) => Promise<{ data: unknown[] | null; error: unknown }>)('farm_entitlement', { p_farm_id: farm_id });
        if (error || !data) return; // offline or error: keep the cached value
        const parsed = parseEntitlementRow(data[0]);
        if (!parsed || cancelled) return;
        writeCache(userId, farm_id, parsed);
        setState({ key, entitlement: parsed });
      } catch {
        // keep cached value
      }
    })();
    return () => { cancelled = true; };
  }, [farm_id, userId]);

  const key = farm_id && userId ? `${userId}:${farm_id}` : null;
  const current = state && state.key === key ? state.entitlement : null;
  if (!current) return { entitlement: null, loading: !!key };
  // A lapsed cached premium plan must not keep showing as premium while offline.
  return { entitlement: isEntitlementStale(current) ? freeEntitlement(current.enforced) : current, loading: false };
}
