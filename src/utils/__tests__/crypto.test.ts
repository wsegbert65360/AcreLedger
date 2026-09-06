import { describe, it, expect } from 'vitest';
import { encryptData, decryptData } from '../crypto';

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

  it('should throw on decryption failure with wrong secret', async () => {
    const encrypted = await encryptData(plainText, secret);
    await expect(decryptData(encrypted, 'wrong-secret')).rejects.toThrow('Decryption failed');
  });

  it('should handle non-encrypted strings in decrypt gracefully', async () => {
    const result = await decryptData('not-encrypted', secret);
    expect(result).toBe('not-encrypted');
  });

  it('round-trips a large encoded attachment payload', async () => {
    const attachment = JSON.stringify({
      filename: 'spray-label.jpg',
      mimeType: 'image/jpeg',
      data: 'A'.repeat(500_000),
    });

    const encrypted = await encryptData(attachment, secret);

    await expect(decryptData(encrypted, secret)).resolves.toBe(attachment);
  });

  it('round-trips a large tract GeoJSON payload', async () => {
    const coordinates = Array.from({ length: 30_000 }, (_, index) => [
      -93.5 + index / 1_000_000,
      38.4 + index / 1_000_000,
    ]);
    const geoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties: { cluNumber: '1', acres: 120.5 },
      }],
    });
    expect(geoJson.length).toBeGreaterThan(500_000);

    const encrypted = await encryptData(geoJson, secret);

    await expect(decryptData(encrypted, secret)).resolves.toBe(geoJson);
  });
});
