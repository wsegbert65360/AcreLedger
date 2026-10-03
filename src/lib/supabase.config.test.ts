/**
 * @vitest-environment jsdom
 *
 * Password-recovery URLs must not let the Supabase client auto-exchange the
 * one-time PKCE code. Every other page keeps detectSessionInUrl on.
 */
import { describe, expect, it, vi } from 'vitest';

type CreateClient = (
  url: string,
  key: string,
  options?: { auth?: { detectSessionInUrl?: boolean; flowType?: string } },
) => { auth: Record<string, never> };

const createClient = vi.hoisted(() => vi.fn<CreateClient>(() => ({ auth: {} })));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

vi.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

async function loadClient(path: string): Promise<boolean> {
  window.history.replaceState(null, '', path);
  vi.resetModules();
  await import('./supabase');
  const options = createClient.mock.calls.at(-1)?.[2];
  expect(options?.auth?.flowType).toBe('pkce');
  return options?.auth?.detectSessionInUrl === true;
}

describe('supabase client session detection', () => {
  it('does not auto-detect a session on the password-recovery URL', async () => {
    await expect(loadClient('/auth?mode=recovery&code=abc')).resolves.toBe(false);
  });

  it('auto-detects a session on the home page', async () => {
    await expect(loadClient('/')).resolves.toBe(true);
  });

  it('auto-detects a session on sign-in, a bare auth page, and sign-up', async () => {
    await expect(loadClient('/auth')).resolves.toBe(true);
    await expect(loadClient('/auth?mode=signin')).resolves.toBe(true);
    await expect(loadClient('/auth?mode=signup')).resolves.toBe(true);
  });
});
