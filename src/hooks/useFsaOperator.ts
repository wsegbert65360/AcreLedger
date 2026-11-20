import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { offlineStorage } from '@/lib/offlineStorage';
import { useFarm } from '@/store/farmStore';

/** FSA-578 box 5 operator details, stored on public.farms. */
export interface FsaOperator {
  name: string;
  address: string;
}

const CACHE_TABLE = 'fsa_operator';
const EMPTY: FsaOperator = { name: '', address: '' };

function fromCache(data: unknown, farmId: string): FsaOperator | null {
  if (!Array.isArray(data)) return null;
  const entry = data[0] as { farmId?: unknown; name?: unknown; address?: unknown } | undefined;
  if (!entry || entry.farmId !== farmId) return null;
  return {
    name: typeof entry.name === 'string' ? entry.name : '',
    address: typeof entry.address === 'string' ? entry.address : '',
  };
}

/**
 * Reads and saves the FSA-578 operator name/address for the current farm.
 * Reads are fail-soft (a database without the columns yet, or offline, keeps
 * the cached value). Saving goes through the set_farm_fsa_operator RPC and
 * needs a connection, like renaming the farm.
 */
export function useFsaOperator() {
  const { farm_id, session } = useFarm();
  const userId = session?.user?.id ?? null;
  const [operator, setOperator] = useState<FsaOperator>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOperator(EMPTY);
    setLoaded(false);
    if (!farm_id || !userId) return () => { cancelled = true; };

    (async () => {
      const cached = fromCache(await offlineStorage.loadCache(CACHE_TABLE, userId).catch(() => null), farm_id);
      if (!cancelled && cached) setOperator(cached);
      try {
        const { data, error } = await supabase
          .from('farms')
          .select('fsa_operator_name, fsa_operator_address')
          .eq('id', farm_id)
          .single();
        if (cancelled || error || !data) return;
        const row = data as { fsa_operator_name?: string | null; fsa_operator_address?: string | null };
        const next = { name: row.fsa_operator_name?.trim() || '', address: row.fsa_operator_address?.trim() || '' };
        setOperator(next);
        await offlineStorage.saveCache(CACHE_TABLE, userId, [{ farmId: farm_id, ...next }]);
      } catch (error) {
        console.warn('FSA operator details did not load; keeping the saved value.', error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [farm_id, userId]);

  const save = useCallback(async (next: FsaOperator): Promise<boolean> => {
    if (!farm_id || !userId) return false;
    const trimmed = { name: next.name.trim(), address: next.address.trim() };
    try {
      const { error } = await supabase.rpc('set_farm_fsa_operator', {
        p_farm_id: farm_id,
        p_name: trimmed.name,
        p_address: trimmed.address,
      });
      if (error) throw error;
      setOperator(trimmed);
      await offlineStorage.saveCache(CACHE_TABLE, userId, [{ farmId: farm_id, ...trimmed }]);
      toast.success('FSA-578 operator details saved.');
      return true;
    } catch (error) {
      console.error('Error saving FSA operator details:', error);
      toast.error('Could not save. Check your connection and try again.');
      return false;
    }
  }, [farm_id, userId]);

  return { operator, loaded, save };
}
