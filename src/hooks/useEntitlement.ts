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

function settle(entitlement: Entitlement): Entitlement {
  return isEntitlementStale(entitlement) ? freeEntitlement(entitlement.enforced) : entitlement;
}

function readSettledCache(userId: string | undefined, farmId: string | null | undefined): Entitlement | null {
  if (!farmId || !userId) return null;
  const cached = readCache(userId, farmId);
  return cached ? settle(cached) : null;
}

/**
 * Display-only plan info for gating UI and upgrade prompts. Never use this as
 * authorization: the server enforces. Offline, the last server answer is reused
 * until its premiumUntil passes. Until the first answer, the plan is `loading`.
 * `cachedEntitlement` is that last answer read during render, so a free enforced
 * farm does not paint a Pro report before the request returns.
 * A failed request with no cache sets `failed` and ends `loading` without
 * inventing a plan (and without writing the cache). Paid reports then fail
 * closed to the preview. A cached Pro answer is left in place for offline use.
 */
export function useEntitlement(): {
  entitlement: Entitlement | null;
  loading: boolean;
  cachedEntitlement: Entitlement | null;
  /** True when this farm's request failed and there is still no answer to show. */
  failed: boolean;
} {
  const { farm_id, session } = useFarm();
  const userId = session?.user?.id;
  const [state, setState] = useState<{ key: string; entitlement: Entitlement } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const cachedEntitlement = readSettledCache(userId, farm_id);

  useEffect(() => {
    if (!farm_id || !userId) return;
    const key = `${userId}:${farm_id}`;
    let cancelled = false;
    const cached = readCache(userId, farm_id);
    if (cached) {
      setFailedKey(null);
      setState({ key, entitlement: cached });
    }
    const noteFailure = () => {
      // Keep a cached server answer. Do not persist a synthetic plan: the next
      // successful response must be the first value stored.
      if (!cancelled && !cached) setFailedKey(key);
    };
    void (async () => {
      try {
        const { data, error } = await (supabase.rpc as unknown as (
          fn: string, args: Record<string, unknown>,
        ) => Promise<{ data: unknown[] | null; error: unknown }>)('farm_entitlement', { p_farm_id: farm_id });
        if (cancelled) return;
        const parsed = !error && data ? parseEntitlementRow(data[0]) : null;
        if (!parsed) {
          noteFailure();
          return;
        }
        writeCache(userId, farm_id, parsed);
        setFailedKey(null);
        setState({ key, entitlement: parsed });
      } catch {
        noteFailure();
      }
    })();
    return () => { cancelled = true; };
  }, [farm_id, userId]);

  const key = farm_id && userId ? `${userId}:${farm_id}` : null;
  const current = state && state.key === key ? state.entitlement : null;
  const failed = !!key && failedKey === key && !current;
  if (!current) return { entitlement: null, loading: !!key && !failed, cachedEntitlement, failed };
  // A lapsed cached premium plan must not keep showing as premium while offline.
  return { entitlement: settle(current), loading: false, cachedEntitlement, failed: false };
}
