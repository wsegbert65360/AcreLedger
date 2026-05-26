import { describe, it, expect } from 'vitest';
import { encryptData, decryptData, generateKey } from '../crypto';

describe('Crypto Utility', () => {
  const secret = 'test-session-secret';
  const plainText = JSON.stringify({ hello: 'world', data: [1, 2, 3] });

  it('should encrypt and decrypt data correctly', async () => {
    const encrypted = await encryptData(plainText, secret);
    expect(encrypted).toMatch(/^enc:/);
    
    const decrypted = await decryptData(encrypted, secret);
    expect(decrypted).toBe(plainText);
    expect(JSON.parse(decrypted)).toEqual({ hello: 'world', data: [1, 2, 3] });
  });

  it('should return plain text if secret is missing', async () => {
    const result = await encryptData(plainText, '');
    expect(result).toBe(plainText);
  });

  it('should return empty string on decryption failure with wrong secret', async () => {
    const encrypted = await encryptData(plainText, secret);
    const decrypted = await decryptData(encrypted, 'wrong-secret');
    // WebCrypto throws on mismatch, our helper returns ''
    expect(decrypted).toBe('');
  });

  it('should handle non-encrypted strings in decrypt gracefully', async () => {
    const result = await decryptData('not-encrypted', secret);
    expect(result).toBe('not-encrypted');
  });
});