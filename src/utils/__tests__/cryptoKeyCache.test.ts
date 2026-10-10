import { describe, expect, it, vi } from 'vitest';

import { decryptData, encryptData, generateKey } from '../crypto';

describe('derived key cache', () => {
  it('derives the PBKDF2 key once per secret', async () => {
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    const secret = `cache-test-${Math.random()}`;

    const encrypted = await encryptData('hello', secret);
    await encryptData('again', secret);
    await expect(decryptData(encrypted, secret)).resolves.toBe('hello');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(await generateKey(secret)).toBe(await generateKey(secret));
    spy.mockRestore();
  });
});
