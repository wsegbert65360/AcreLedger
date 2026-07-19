import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  isValidActiveSeason,
  isValidViewingSeason,
  resolveRemoteViewingSeason,
} from '@/lib/seasonYears';

export function useAuth() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [farm_id, setFarmId] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<number>(new Date().getFullYear());
  const [viewingSeason, setViewingSeason] = useState<number>(new Date().getFullYear());
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false);
  const activeSeasonRef = useRef(activeSeason);

  useEffect(() => {
    activeSeasonRef.current = activeSeason;
  }, [activeSeason]);

  const applyRemoteActiveSeason = useCallback((nextActiveSeason: unknown) => {
    if (typeof nextActiveSeason !== 'number' || !isValidActiveSeason(nextActiveSeason)) {
      console.error('Ignored invalid active_season received from profile:', nextActiveSeason);
      return;
    }

    const previousActiveSeason = activeSeasonRef.current;
    activeSeasonRef.current = nextActiveSeason;
    setActiveSeason(nextActiveSeason);
    setViewingSeason(current => resolveRemoteViewingSeason(
      current,
      previousActiveSeason,
      nextActiveSeason,
    ));
  }, []);

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
          let storedViewingSeason: string | null = null;
          let storedOnboarding: string | null = null;
          try {
            storedId = localStorage.getItem(`${prefix}_al_farm_id`);
            storedSeason = localStorage.getItem(`${prefix}_al_active_season`);
            storedViewingSeason = localStorage.getItem(`${prefix}_al_viewing_season`);
            storedOnboarding = localStorage.getItem(`${prefix}_al_onboarding_complete`);
          } catch (storageErr) {
            console.error('Local storage read failed during session bootstrap:', storageErr);
          }
          
          if (storedId) setFarmId(storedId);
          if (storedOnboarding === '1') setOnboardingComplete(true);
          if (storedSeason) {
            const active = parseInt(storedSeason, 10);
            if (isValidActiveSeason(active)) {
              setActiveSeason(active);
              let viewing = active;
              if (storedViewingSeason) {
                const parsedViewing = parseInt(storedViewingSeason, 10);
                if (isValidViewingSeason(parsedViewing, active)) {
                  viewing = parsedViewing;
                }
              }
              setViewingSeason(viewing);
            }
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
          .select('farm_id, active_season, onboarding_complete')
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
            let active = profileData.active_season;
            if (!isValidActiveSeason(active)) {
              active = new Date().getFullYear();
              Promise.resolve(
                supabase
                  .from('profiles')
                  .update({ active_season: active })
                  .eq('id', session.user.id),
              )
                .then(({ error }) => {
                  if (error) console.error('Failed to sync fallback active_season to profile:', error);
                })
                .catch((syncErr: unknown) => {
                  console.error('Unexpected error syncing active_season:', syncErr);
                });
            }

            setActiveSeason(active);

            const prefix = session.user.id;
            let storedViewingSeason: string | null = null;
            try {
              storedViewingSeason = localStorage.getItem(`${prefix}_al_viewing_season`);
            } catch (storageErr) {
              console.error('Local storage read failed during session sync:', storageErr);
            }

            let viewing = active;
            if (storedViewingSeason) {
              const parsedViewing = parseInt(storedViewingSeason, 10);
              if (isValidViewingSeason(parsedViewing, active)) {
                viewing = parsedViewing;
              }
            }
            setViewingSeason(viewing);

            if (profileData.onboarding_complete) {
              setOnboardingComplete(true);
            }
          }
        }
      } catch (err) {
        console.error('Sync error:', err);
      }
    };

    syncAuth();
  }, [session]); // Also refreshes profile state when Supabase refreshes the session.

  // Keep the active season synchronized across devices. Realtime handles the
  // normal case; foreground/online refreshes recover from suspended sockets.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;
    const refreshActiveSeason = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('active_season')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Failed to refresh active season:', error);
          return;
        }
        if (!cancelled) applyRemoteActiveSeason(data?.active_season);
      } catch (err) {
        console.error('Unexpected active season refresh failure:', err);
      }
    };

    const channel = supabase
      .channel(`profile-season-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        payload => applyRemoteActiveSeason(payload.new?.active_season),
      )
      .subscribe();

    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') void refreshActiveSeason();
    };
    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener('focus', refreshWhenActive);
    window.addEventListener('online', refreshWhenActive);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener('focus', refreshWhenActive);
      window.removeEventListener('online', refreshWhenActive);
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteActiveSeason, session?.user?.id]);

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
    onboardingComplete,
    setOnboardingComplete,
    signOut,
  };
}
