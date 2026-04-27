import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
// Storage utilities for session persistence

export function useAuth() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [farm_id, setFarmId] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<number>(new Date().getFullYear());
  const [viewingSeason, setViewingSeason] = useState<number>(new Date().getFullYear());

  // Initialize Supabase session & handle Auth Changes
  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);

        if (initialSession?.user) {
          // Priority 1: Storage (Fastest persistent path)
          const prefix = initialSession.user.id;
          let storedId: string | null = null;
          let storedSeason: string | null = null;
          try {
            storedId = localStorage.getItem(`${prefix}_al_farm_id`);
            storedSeason = localStorage.getItem(`${prefix}_al_active_season`);
          } catch (storageErr) {
            console.error('Local storage read failed during session bootstrap:', storageErr);
          }
          
          if (storedId) setFarmId(storedId);
          if (storedSeason) {
            setActiveSeason(parseInt(storedSeason, 10));
            setViewingSeason(parseInt(storedSeason, 10));
          }

          // Priority 2: JWT (Authoritative cloud path)
          const jwtFarmId = initialSession.user.app_metadata?.farm_id || initialSession.user.user_metadata?.farm_id;
          if (jwtFarmId) setFarmId(jwtFarmId);
        }
      } catch (err) {
        console.error('Session initialization failed:', err);
        toast.error('Could not connect to authentication service. Check your connection.');
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const jwtFarmId = newSession.user.app_metadata?.farm_id || newSession.user.user_metadata?.farm_id;
        if (jwtFarmId) setFarmId(jwtFarmId);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync farm_id from Profile to JWT (One-way stabilization)
  useEffect(() => {
    if (!session || !session.user) return;

    const syncAuth = async () => {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('farm_id, active_season')
          .eq('id', session.user.id)
          .single();

        if (profileData) {
          let currentFarmId = profileData.farm_id;

          // Auto-create + link farm through transactional RPC if missing.
          if (!currentFarmId) {
            const { data: ensuredFarmId, error: ensureError } = await supabase.rpc('ensure_user_farm');
            if (ensureError) {
              console.error('Error ensuring user farm:', ensureError);
              toast.error('Failed to initialize farm for this account');
            } else if (ensuredFarmId) {
              currentFarmId = ensuredFarmId;
            }
          }

          if (currentFarmId) {
            setFarmId(currentFarmId);
            // ONLY refresh if the JWT is actually missing the ID
            const jwtId = session.user.app_metadata?.farm_id || session.user.user_metadata?.farm_id;
            if (currentFarmId !== jwtId) {
              await supabase.auth.refreshSession();
            }
            if (profileData.active_season) {
              setActiveSeason(profileData.active_season);
              setViewingSeason(profileData.active_season);
            }
          }
        }
      } catch (err) {
        console.error('Sync error:', err);
      }
    };

    syncAuth();
  }, [session?.user?.id]); // Only runs when user changes

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    loading,
    setLoading,
    farm_id,
    setFarmId,
    activeSeason,
    setActiveSeason,
    viewingSeason,
    setViewingSeason,
    signOut,
  };
}
