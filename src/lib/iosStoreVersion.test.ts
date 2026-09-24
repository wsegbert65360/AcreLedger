import { describe, expect, it, vi } from 'vitest';
import {
  isStoreVersionNewer,
  lookupIosStoreVersion,
  parseItunesLookup,
} from './iosStoreVersion';

describe('isStoreVersionNewer', () => {
  it('treats an equal marketing version as current', () => {
    expect(isStoreVersionNewer('3.6.0', '3.6.0')).toBe(false);
    expect(isStoreVersionNewer('3.6.0-AcreLedger', '3.6.0')).toBe(false);
  });

  it('detects a newer store version and ignores a newer local build', () => {
    expect(isStoreVersionNewer('3.6.0', '3.7.0')).toBe(true);
    expect(isStoreVersionNewer('3.6.0', '3.6.1')).toBe(true);
    expect(isStoreVersionNewer('3.6.2', '3.6.1')).toBe(false);
  });

  it('returns null when either version is not numeric', () => {
    expect(isStoreVersionNewer('', '3.6.0')).toBeNull();
    expect(isStoreVersionNewer('3.6.0', 'latest')).toBeNull();
  });
});

describe('parseItunesLookup', () => {
  it('reads the first listing version and https store url', () => {
    expect(parseItunesLookup({
      resultCount: 1,
      results: [{ version: '3.7.0', trackViewUrl: 'https://apps.apple.com/us/app/acreledger/id1' }],
    })).toEqual({
      version: '3.7.0',
      url: 'https://apps.apple.com/us/app/acreledger/id1',
    });
  });

  it('returns null when the app is not listed', () => {
    expect(parseItunesLookup({ resultCount: 0, results: [] })).toBeNull();
    expect(parseItunesLookup({ results: [{ version: 'soon' }] })).toBeNull();
  });
});

describe('lookupIosStoreVersion', () => {
  it('returns null when Apple does not answer', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(lookupIosStoreVersion('com.wsegbert.acreledger', fetchImpl)).resolves.toBeNull();
  });
});
