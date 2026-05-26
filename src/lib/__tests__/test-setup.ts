import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../supabase';

describe('QA Bot Auth Verification', () => {
    const botEmail = process.env.VITE_BOT_EMAIL || '';
    const botPassword = process.env.VITE_BOT_PASSWORD || '';

    beforeAll(async () => {
        if (!botEmail || !botPassword) {
            throw new Error('Bot credentials missing from environment (VITE_BOT_EMAIL, VITE_BOT_PASSWORD)');
        }
        const { data, error } = await supabase.auth.signInWithPassword({
            email: botEmail,
            password: botPassword,
        });
        if (error) throw new Error(`Bot login failed: ${error.message}`);
        expect(data.user?.email).toBe(botEmail);
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
