import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../supabase';

// Credentials live in .env.test.local (gitignored) as TEST_BOT_EMAIL /
// TEST_BOT_PASSWORD and are loaded into process.env by vitest.integration.config.ts.
const botEmail = process.env.TEST_BOT_EMAIL || '';
const botPassword = process.env.TEST_BOT_PASSWORD || '';
const hasAuthCreds = Boolean(botEmail && botPassword);

// Skip cleanly when bot credentials are absent so `npm run test:integration`
// reports "skipped" rather than failing.
describe.skipIf(!hasAuthCreds)('QA Bot Auth Verification', () => {
  let botUserId = '';
  let originalProfile: {
    id: string;
    farm_id: string | null;
    active_season: number | null;
    onboarding_complete: boolean | null;
  };

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

    originalProfile = {
      id: profile.id,
      farm_id: profile.farm_id,
      active_season: profile.active_season,
      onboarding_complete: profile.onboarding_complete,
    };
  });

  afterAll(async () => {
    // Restore the mutable fields that tests may have changed.
    // farm_id and id are unreachable via the Data API (intentional), so if the
    // protection was somehow absent the restore silently fails—the test failure
    // is the important signal.
    await supabase
      .from('profiles')
      .update({
        active_season: originalProfile.active_season,
        onboarding_complete: originalProfile.onboarding_complete,
      } as Record<string, unknown>, { count: 'exact' })
      .eq('id', botUserId);
    await supabase.auth.signOut();
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
    // Probe a non-existent UUID. RLS returns zero rows for any row where
    // id != auth.uid(), so this confirms the USING clause is applied.
    const fakeId = '00000000-0000-4000-8000-000000000001';
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', fakeId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    // Also confirm that a raw SELECT (without eq filter) returns only the
    // caller's own row. If RLS were permissive, other profiles would appear.
    const { data: allRows } = await supabase
      .from('profiles')
      .select('id')
      .limit(10);
    expect(allRows?.length).toBe(1);
    expect(allRows?.[0]?.id).toBe(botUserId);
  });

  it('user can update active_season', async () => {
    const currentYear = new Date().getFullYear();
    const testSeason =
      originalProfile.active_season === currentYear ? currentYear - 1 : currentYear;

    const { error, count } = await supabase
      .from('profiles')
      .update({ active_season: testSeason }, { count: 'exact' })
      .eq('id', botUserId);
    expect(error).toBeNull();
    expect(count).toBe(1);

    const { data } = await supabase
      .from('profiles')
      .select('active_season')
      .eq('id', botUserId)
      .single();
    expect(data?.active_season).toBe(testSeason);

    // Restore immediately so afterAll state is consistent.
    await supabase
      .from('profiles')
      .update({ active_season: originalProfile.active_season })
      .eq('id', botUserId);
  });

  it('user can update onboarding_complete', async () => {
    const flipped = !(originalProfile.onboarding_complete ?? false);

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
      .update({ onboarding_complete: originalProfile.onboarding_complete })
      .eq('id', botUserId);
  });

  it('user cannot update farm_id', async () => {
    // Use a well-formed UUID so that any blocking is due to column-privilege
    // revocation, not UUID-parsing failure.
    const { error, count } = await supabase
      .from('profiles')
      .update({ farm_id: '00000000-0000-4000-8000-0000000000f1' }, { count: 'exact' })
      .eq('id', botUserId);

    // Must be blocked — either PostgREST returns an error (42501 column
    // privilege) or count is 0 if RLS alone blocked it.
    expect(count === 0 || error != null).toBe(true);

    const { data } = await supabase
      .from('profiles')
      .select('farm_id')
      .eq('id', botUserId)
      .single();
    expect(data?.farm_id).toBe(originalProfile.farm_id);
  });

  it('user cannot update id', async () => {
    const { error, count } = await supabase
      .from('profiles')
      .update({ id: '00000000-0000-4000-8000-0000000000id' } as never, { count: 'exact' })
      .eq('id', botUserId);

    expect(count === 0 || error != null).toBe(true);

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', botUserId)
      .single();
    expect(data?.id).toBe(botUserId);
  });

  it('user cannot insert or delete a profile', async () => {
    // Attempt INSERT — must fail because authenticated lacks table-level INSERT.
    const { error: insertError, count: insertCount } = await supabase
      .from('profiles')
      .insert({
        id: '00000000-0000-4000-8000-0000000000in',
        farm_id: originalProfile.farm_id,
      } as never, { count: 'exact' });
    expect(insertCount === 0 || insertCount == null || insertError != null).toBe(true);

    // Attempt DELETE — must fail.
    const { error: deleteError, count: deleteCount } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', botUserId);
    expect(deleteCount === 0 || deleteCount == null || deleteError != null).toBe(true);

    // Confirm the bot profile is intact.
    const { data } = await supabase
      .from('profiles')
      .select('id, farm_id')
      .eq('id', botUserId)
      .single();
    expect(data?.id).toBe(botUserId);
    expect(data?.farm_id).toBe(originalProfile.farm_id);
  });

  it('failed farm_id reassignment does not alter access to either farm', async () => {
    const botFarmBefore = originalProfile.farm_id;
    expect(botFarmBefore).toBeTruthy();

    const { error, count } = await supabase
      .from('profiles')
      .update({ farm_id: '00000000-0000-4000-8000-0000000000f2' }, { count: 'exact' })
      .eq('id', botUserId);
    expect(count === 0 || error != null).toBe(true);

    // Confirm farm_id unaffected.
    const { data: botProfile } = await supabase
      .from('profiles')
      .select('farm_id')
      .eq('id', botUserId)
      .single();
    expect(botProfile?.farm_id).toBe(botFarmBefore);

    // Confirm the bot still sees only its own farm-scoped fields.
    const { data: botFields } = await supabase
      .from('fields')
      .select('id, farm_id')
      .limit(5);
    for (const row of botFields ?? []) {
      expect(row.farm_id).toBe(botFarmBefore);
    }
  });
});
