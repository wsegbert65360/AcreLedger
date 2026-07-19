import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../supabase';

// Credentials live in .env.test.local (gitignored) as TEST_BOT_EMAIL /
// TEST_BOT_PASSWORD and are loaded into process.env by vitest.integration.config.ts.
const botEmail = process.env.TEST_BOT_EMAIL || '';
const botPassword = process.env.TEST_BOT_PASSWORD || '';

// Skip cleanly when bot credentials are absent so `npm run test:integration`
// reports "skipped" rather than failing. Gate on process.env because that is
// what this module reads.
describe.skipIf(!botEmail || !botPassword)('QA Bot Auth Verification', () => {

    beforeAll(async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: botEmail,
            password: botPassword,
        });
        if (error) throw new Error(`Bot login failed: ${error.message}`);
        expect(data.user?.email).toBe(botEmail);
    });

    afterAll(async () => {
        await supabase.auth.signOut();
    });

    it('should resolve a valid farm_id for the bot', async () => {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('farm_id')
            .single();

        if (error) throw new Error(`Profile fetch failed: ${error.message}`);

        expect(profile.farm_id).toBeDefined();
        expect(typeof profile.farm_id).toBe('string');
        console.log(`[QA Sync] Verified Bot Farm ID: ${profile.farm_id}`);
    });
});
