import { useState, useEffect, useCallback, useRef } from 'react';

import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

import { endAuthSession, type SignOutScope } from '@/lib/authSignOut';
import { readFarmRole, type FarmRole } from '@/lib/backupRestorePolicy';
import {
  isValidActiveSeason,
  isValidViewingSeason,
  resolveRemoteViewingSeason,
} from '@/lib/seasonYears';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [deletionStatus, setDeletionStatus] = useState<'clear' | 'pending'>('clear');
  const [loading, setLoading] = useState(true);
  const [farm_id, setFarmId] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<number>(new Date().getFullYear());
  const [viewingSeason, setViewingSeason] = useState<number>(new Date().getFullYear());
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false);
  const [onboardingStatusKnown, setOnboardingStatusKnown] = useState(false);
  const [farmRole, setFarmRole] = useState<FarmRole | null>(null);
  const activeSeasonRef = useRef(activeSeason);
  const identityRef = useRef<{ userId: string | null; generation: number }>({ userId: null, generation: 0 });
  const refreshAttemptedRef = useRef<string | null>(null);

  const acceptSession = useCallback((nextSession: Session | null, signedOut = false) => {
    const userId = signedOut ? null : nextSession?.user?.id ?? null;
    if (signedOut || identityRef.current.userId !== userId) {
      identityRef.current = { userId, generation: identityRef.current.generation + 1 };
      refreshAttemptedRef.current = null;
      const year = new Date().getFullYear();
      activeSeasonRef.current = year;
      setDeletionStatus('clear');
      setFarmId(null);
      setOnboardingComplete(false);
      setOnboardingStatusKnown(false);
      setFarmRole(null);
      setActiveSeason(year);
      setViewingSeason(year);
    }
    setSession(signedOut ? null : nextSession);
    const jwtFarmId = !signedOut && nextSession?.user.app_metadata?.farm_id;
    if (typeof jwtFarmId === 'string' && jwtFarmId) setFarmId(jwtFarmId);
  }, []);

  const ensureFarm = useCallback(async (): Promise<string | null> => {
    const identity = identityRef.current;
    if (!identity.userId) return null;
    try {
      const { data, error } = await supabase.rpc('ensure_user_farm');
      if (identityRef.current !== identity) return null;
      if (error) throw error;
      if (typeof data !== 'string' || !data) throw new Error('Farm initialization returned no farm.');
      setFarmId(data);
      return data;
    } catch (error) {
      if (identityRef.current === identity) {
        console.error('Error ensuring user farm:', error);
        toast.error('Failed to initialize farm for this account. Please try again.');
      }
      return null;
    }
  }, []);

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
    let active = true;
    let authEventCount = 0;
    const initSession = async () => {
      const initialIdentity = identityRef.current;
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!active || authEventCount > 0 || identityRef.current !== initialIdentity) return;
        acceptSession(initialSession);

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
          if (storedOnboarding === '1') {
            setOnboardingComplete(true);
            setOnboardingStatusKnown(true);
          }
          if (storedSeason) {
            const active = parseInt(storedSeason, 10);
            if (isValidActiveSeason(active)) {
              activeSeasonRef.current = active;
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
          const jwtFarmId = initialSession.user.app_metadata?.farm_id;
          if (typeof jwtFarmId === 'string' && jwtFarmId) setFarmId(jwtFarmId);
        }
      } catch (err) {
        if (!active || authEventCount > 0) return;
        acceptSession(null);
        console.error('Session initialization failed:', err);
        toast.error('Could not connect to authentication service. Check your connection.');
      } finally {
        if (active) setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      authEventCount += 1;
      acceptSession(newSession, event === 'SIGNED_OUT');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [acceptSession]);

  // Sync farm_id from Profile to JWT (One-way stabilization)
  useEffect(() => {
    if (!session || !session.user) return;

    const identity = identityRef.current;
    const userId = session.user.id;
    let cancelled = false;
    let checkGeneration = 0;

    const syncAuth = async () => {
      const generation = ++checkGeneration;
      const isCurrent = () => !cancelled && identityRef.current === identity && generation === checkGeneration;
      try {
        const { data: deletion, error: deletionError } = await supabase
          .from('account_deletion_requests').select('status').eq('user_id', userId).maybeSingle();
        if (!isCurrent()) return;
        if (deletionError) {
          console.error('Could not check account deletion status:', deletionError);
          return; // Unknown status must not prevent cached offline access.
        }
        if (deletion?.status === 'pending') {
          setDeletionStatus('pending');
          return;
        }
        setDeletionStatus('clear');
        let { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('farm_id, active_season, onboarding_complete, farm_role')
          .eq('id', userId)
          .single();
        if (profileError && /farm_role/i.test(String(profileError.message ?? ''))) {
          const retry = await supabase
            .from('profiles')
            .select('farm_id, active_season, onboarding_complete')
            .eq('id', userId)
            .single();
          profileData = retry.data ? { ...retry.data, farm_role: null } : null;
          profileError = retry.error;
        }

        if (!isCurrent()) return;
        if (profileError) {
          console.error('Could not load profile:', profileError);
        }
        if (profileData) {
          setFarmRole(readFarmRole((profileData as { farm_role?: unknown }).farm_role));
          setOnboardingComplete(Boolean(profileData.onboarding_complete));
          setOnboardingStatusKnown(true);
          try {
            const key = `${userId}_al_onboarding_complete`;
            if (profileData.onboarding_complete) localStorage.setItem(key, '1');
            else localStorage.removeItem(key);
          } catch (storageError) {
            console.error('Failed to cache profile onboarding progress:', storageError);
          }
          let currentFarmId = profileData.farm_id;

          // Auto-create + link farm through transactional RPC if missing.
          if (!currentFarmId) {
            currentFarmId = await ensureFarm();
            if (!isCurrent()) return;
          }

          if (currentFarmId) {
            setFarmId(currentFarmId);
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

            activeSeasonRef.current = active;
            setActiveSeason(active);

            const prefix = userId;
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

            const jwtId = session.user.app_metadata?.farm_id;
            if (currentFarmId !== jwtId && refreshAttemptedRef.current !== userId) {
              // Set before awaiting: TOKEN_REFRESHED can immediately rerun this effect.
              refreshAttemptedRef.current = userId;
              try {
                const { error } = await supabase.auth.refreshSession();
                if (error && identityRef.current === identity) refreshAttemptedRef.current = null;
              } catch (error) {
                if (identityRef.current === identity) refreshAttemptedRef.current = null;
                throw error;
              }
            }
          }
        }
      } catch (err) {
        if (isCurrent()) {
          console.error('Sync error:', err);
        }
      }
    };

    void syncAuth();
    const retryWhenActive = () => {
      if (document.visibilityState === 'visible') void syncAuth();
    };
    window.addEventListener('online', retryWhenActive);
    window.addEventListener('focus', retryWhenActive);
    document.addEventListener('visibilitychange', retryWhenActive);
    return () => {
      cancelled = true;
      window.removeEventListener('online', retryWhenActive);
      window.removeEventListener('focus', retryWhenActive);
      document.removeEventListener('visibilitychange', retryWhenActive);
    };
  }, [ensureFarm, session]); // Also refreshes profile state when Supabase refreshes the session.

  // Keep the active season synchronized across devices. Realtime handles the
  // normal case; foreground/online refreshes recover from suspended sockets.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const identity = identityRef.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && identityRef.current === identity;
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
        if (isCurrent()) applyRemoteActiveSeason(data?.active_season);
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
        payload => { if (isCurrent()) applyRemoteActiveSeason(payload.new?.active_season); },
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

  const signOut = useCallback(async (scope: SignOutScope = 'local') => {
    const result = await endAuthSession(session, scope);
    acceptSession(null, true);
    return result;
  }, [acceptSession, session]);

  return {
    session,
    loading,
    setLoading,
    farm_id: deletionStatus === 'clear' ? farm_id : null,
    deletionStatus,
    setFarmId,
    activeSeason,
    setActiveSeason,
    viewingSeason,
    setViewingSeason,
    onboardingComplete,
    onboardingStatusKnown,
    setOnboardingComplete,
    farmRole,
    signOut,
    ensureFarm,
  };
}
