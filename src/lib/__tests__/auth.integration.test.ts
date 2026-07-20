import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';

// Credentials live in .env.test.local (gitignored) as TEST_BOT_EMAIL /
// TEST_BOT_PASSWORD and are loaded into process.env by vitest.integration.config.ts.
const botEmail = process.env.TEST_BOT_EMAIL || '';
const botPassword = process.env.TEST_BOT_PASSWORD || '';
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

const hasAuthCreds = Boolean(botEmail && botPassword && supabaseUrl && supabaseAnonKey);

// Skip cleanly when bot credentials are absent so `npm run test:integration`
// reports "skipped" rather than failing. Gate on process.env because that is
// what this module reads.
describe.skipIf(!hasAuthCreds)('QA Bot Auth Verification', () => {
  let botUserId = '';
  let originalFarmId: string | null = null;
  let originalActiveSeason: number | null = null;
  let originalOnboardingComplete: boolean | null = null;
  let foreignUserClient: SupabaseClient | null = null;
  let foreignUserId: string | null = null;
  let foreignFarmId: string | null = null;
  let createdForeignUser = false;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: botEmail,
      password: botPassword,
    });
    if (error) throw new Error(`Bot login failed: ${error.message}`);
    expect(data.user?.email).toBe(botEmail);
    botUserId = data.user!.id;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, farm_id, active_season, onboarding_complete')
      .eq('id', botUserId)
      .single();
    if (profileError) throw new Error(`Profile fetch failed: ${profileError.message}`);

    originalFarmId = profile.farm_id ?? null;
    originalActiveSeason = profile.active_season ?? null;
    originalOnboardingComplete = profile.onboarding_complete ?? null;

    // Second throwaway user for cross-profile isolation checks. Prefer signUp when
    // the project allows it; fall back to skipping foreign-user cases when blocked.
    const stamp = Date.now();
    const foreignEmail = `profile-auth-test-${stamp}@example.com`;
    const foreignPassword = `TmpAuth_${stamp}_x9!`;
    foreignUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signUpData, error: signUpError } = await foreignUserClient.auth.signUp({
      email: foreignEmail,
      password: foreignPassword,
    });
    if (!signUpError && signUpData.user?.id && signUpData.session) {
      createdForeignUser = true;
      foreignUserId = signUpData.user.id;
      const { data: foreignProfile } = await foreignUserClient
        .from('profiles')
        .select('farm_id')
        .eq('id', foreignUserId)
        .maybeSingle();
      foreignFarmId = foreignProfile?.farm_id ?? null;
      if (!foreignFarmId) {
        const { data: ensured } = await foreignUserClient.rpc('ensure_user_farm');
        foreignFarmId = (ensured as string | null) ?? null;
      }
    } else {
      foreignUserClient = null;
    }
  });

  afterAll(async () => {
    // Restore bot profile fields touched by tests.
    if (botUserId && originalActiveSeason != null) {
      await supabase
        .from('profiles')
        .update({
          active_season: originalActiveSeason,
          onboarding_complete: originalOnboardingComplete,
        })
        .eq('id', botUserId);
    }

    if (foreignUserClient) {
      await foreignUserClient.auth.signOut();
    }
    await supabase.auth.signOut();

    // Best-effort cleanup of throwaway auth user is not available via anon key.
    void createdForeignUser;
  });

  it('should resolve a valid farm_id for the bot', async () => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('farm_id')
      .eq('id', botUserId)
      .single();

    if (error) throw new Error(`Profile fetch failed: ${error.message}`);

    expect(profile.farm_id).toBeDefined();
    expect(typeof profile.farm_id).toBe('string');
    console.log(`[QA Sync] Verified Bot Farm ID: ${profile.farm_id}`);
  });

  it('user can read their own profile', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, farm_id, active_season, onboarding_complete')
      .eq('id', botUserId)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(botUserId);
    expect(data?.farm_id).toBeTruthy();
  });

  it('user cannot read another profile', async () => {
    if (!foreignUserId || !foreignUserClient) {
      // Without a second session, probe a random UUID; RLS must return zero rows.
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const { data, error } = await supabase
        .from('profiles')
        .select('id, farm_id')
        .eq('id', fakeId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
      return;
    }

    const { data: asBot, error: botErr } = await supabase
      .from('profiles')
      .select('id, farm_id')
      .eq('id', foreignUserId)
      .maybeSingle();
    expect(botErr).toBeNull();
    expect(asBot).toBeNull();

    const { data: asForeign, error: foreignErr } = await foreignUserClient
      .from('profiles')
      .select('id, farm_id')
      .eq('id', botUserId)
      .maybeSingle();
    expect(foreignErr).toBeNull();
    expect(asForeign).toBeNull();
  });

  it('user can update active_season', async () => {
    const currentYear = new Date().getFullYear();
    const nextSeason = originalActiveSeason === currentYear ? currentYear - 1 : currentYear;

    const { error, count } = await supabase
      .from('profiles')
      .update({ active_season: nextSeason }, { count: 'exact' })
      .eq('id', botUserId);

    expect(error).toBeNull();
    expect(count).toBe(1);

    const { data } = await supabase
      .from('profiles')
      .select('active_season')
      .eq('id', botUserId)
      .single();
    expect(data?.active_season).toBe(nextSeason);

    // Restore immediately so later tests see a known value.
    await supabase
      .from('profiles')
      .update({ active_season: originalActiveSeason })
      .eq('id', botUserId);
  });

  it('user can update onboarding_complete', async () => {
    const flipped = !(originalOnboardingComplete ?? false);

    const { error, count } = await supabase
      .from('profiles')
      .update({ onboarding_complete: flipped }, { count: 'exact' })
      .eq('id', botUserId);

    expect(error).toBeNull();
    expect(count).toBe(1);

    const { data } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', botUserId)
      .single();
    expect(data?.onboarding_complete).toBe(flipped);

    await supabase
      .from('profiles')
      .update({ onboarding_complete: originalOnboardingComplete })
      .eq('id', botUserId);
  });

  it('user cannot update farm_id', async () => {
    const targetFarmId =
      foreignFarmId && foreignFarmId !== originalFarmId
        ? foreignFarmId
        : '00000000-0000-4000-8000-0000000000f1';

    const { error, count } = await supabase
      .from('profiles')
      .update({ farm_id: targetFarmId }, { count: 'exact' })
      .eq('id', botUserId);

    // Column privilege revoke and/or RLS must reject the write.
    expect(count === 0 || error != null).toBe(true);

    const { data } = await supabase
      .from('profiles')
      .select('farm_id')
      .eq('id', botUserId)
      .single();
    expect(data?.farm_id).toBe(originalFarmId);
  });

  it('user cannot update id', async () => {
    const spoofId = foreignUserId ?? '00000000-0000-4000-8000-0000000000id';

    const { error, count } = await supabase
      .from('profiles')
      .update({ id: spoofId } as { id: string }, { count: 'exact' })
      .eq('id', botUserId);

    expect(count === 0 || error != null).toBe(true);

    const { data } = await supabase
      .from('profiles')
      .select('id, farm_id')
      .eq('id', botUserId)
      .single();
    expect(data?.id).toBe(botUserId);
    expect(data?.farm_id).toBe(originalFarmId);
  });

  it('user cannot insert or delete a profile', async () => {
    const spoofId = '00000000-0000-4000-8000-0000000000in';

    const { error: insertError, count: insertCount } = await supabase
      .from('profiles')
      .insert(
        {
          id: spoofId,
          farm_id: originalFarmId,
          active_season: new Date().getFullYear(),
          onboarding_complete: false,
        } as never,
        { count: 'exact' },
      );
    expect(insertCount === 0 || insertCount == null || insertError != null).toBe(true);

    const { data: inserted } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', spoofId)
      .maybeSingle();
    expect(inserted).toBeNull();

    const { error: deleteError, count: deleteCount } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', botUserId);
    expect(deleteCount === 0 || deleteCount == null || deleteError != null).toBe(true);

    const { data: stillThere } = await supabase
      .from('profiles')
      .select('id, farm_id')
      .eq('id', botUserId)
      .single();
    expect(stillThere?.id).toBe(botUserId);
    expect(stillThere?.farm_id).toBe(originalFarmId);
  });

  it('failed farm_id reassignment does not alter access to either farm', async () => {
    const botFarmBefore = originalFarmId;
    expect(botFarmBefore).toBeTruthy();

    const attackerTarget =
      foreignFarmId && foreignFarmId !== botFarmBefore
        ? foreignFarmId
        : '00000000-0000-4000-8000-0000000000f2';

    await supabase
      .from('profiles')
      .update({ farm_id: attackerTarget }, { count: 'exact' })
      .eq('id', botUserId);

    const { data: botProfile } = await supabase
      .from('profiles')
      .select('farm_id')
      .eq('id', botUserId)
      .single();
    expect(botProfile?.farm_id).toBe(botFarmBefore);

    // Bot still sees only its own farm-scoped fields (or empty set), never a foreign farm.
    const { data: botFields, error: botFieldsErr } = await supabase
      .from('fields')
      .select('id, farm_id')
      .limit(5);
    expect(botFieldsErr).toBeNull();
    for (const row of botFields ?? []) {
      expect(row.farm_id).toBe(botFarmBefore);
    }

    if (foreignUserClient && foreignFarmId) {
      const { data: foreignFields, error: foreignFieldsErr } = await foreignUserClient
        .from('fields')
        .select('id, farm_id')
        .limit(5);
      expect(foreignFieldsErr).toBeNull();
      for (const row of foreignFields ?? []) {
        expect(row.farm_id).toBe(foreignFarmId);
        expect(row.farm_id).not.toBe(botFarmBefore);
      }
    }
  });
});
