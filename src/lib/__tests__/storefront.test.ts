import { beforeEach, describe, expect, it, vi } from 'vitest';

let platform = 'ios';
let pluginResult: () => Promise<{ countryCode?: string | null }> = async () => ({ countryCode: 'USA' });

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform },
  registerPlugin: () => ({ getCountryCode: () => pluginResult() }),
}));

import {
  getStorefrontCountryCode,
  isUsStorefrontCode,
  parseUpgradeUrl,
  resolveIosUpgradeLink,
} from '@/lib/storefront';

const URL_OK = 'https://acreledger.com/plans';

describe('storefront gate (fails closed)', () => {
  beforeEach(() => {
    platform = 'ios';
    pluginResult = async () => ({ countryCode: 'USA' });
  });

  it('recognizes only the alpha-3 US code', () => {
    expect(isUsStorefrontCode('USA')).toBe(true);
    expect(isUsStorefrontCode(' usa ')).toBe(true);
    for (const v of ['US', 'DEU', 'CAN', '', null, undefined, 1]) expect(isUsStorefrontCode(v)).toBe(false);
  });

  it('accepts only https upgrade URLs', () => {
    expect(parseUpgradeUrl(URL_OK)).toBe(URL_OK);
    for (const v of [undefined, '', 'http://acreledger.com', 'javascript:alert(1)', 'not a url']) {
      expect(parseUpgradeUrl(v)).toBeNull();
    }
  });

  it('shows the link on iOS with a US storefront and a valid URL', async () => {
    expect(await resolveIosUpgradeLink(URL_OK)).toBe(URL_OK);
  });

  it('hides the link for a non-US storefront', async () => {
    pluginResult = async () => ({ countryCode: 'DEU' });
    expect(await resolveIosUpgradeLink(URL_OK)).toBeNull();
  });

  it('hides the link when the storefront is unknown or the plugin is missing or throws', async () => {
    pluginResult = async () => ({ countryCode: null });
    expect(await resolveIosUpgradeLink(URL_OK)).toBeNull();
    pluginResult = async () => ({});
    expect(await resolveIosUpgradeLink(URL_OK)).toBeNull();
    pluginResult = async () => { throw new Error('"Storefront" plugin is not implemented on ios'); };
    expect(await getStorefrontCountryCode()).toBeNull();
    expect(await resolveIosUpgradeLink(URL_OK)).toBeNull();
  });

  it('hides the link when no upgrade URL is configured', async () => {
    expect(await resolveIosUpgradeLink(undefined)).toBeNull();
  });

  it('never reports a storefront off iOS', async () => {
    platform = 'android';
    expect(await getStorefrontCountryCode()).toBeNull();
    platform = 'web';
    expect(await resolveIosUpgradeLink(URL_OK)).toBeNull();
  });
});
