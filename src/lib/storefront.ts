import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * App Store storefront detection, used to decide whether the iOS app may show a link to
 * the website's paid plan. Apple allows such links only on the US storefront (Guidelines
 * 3.1.1(a) / 3.1.3), so everything here FAILS CLOSED: any doubt means no link.
 *
 * The native side is ios/App/App/StorefrontPlugin.swift (see docs/ios-storefront-link.md).
 * Until that file is added to the Xcode target the plugin is UNIMPLEMENTED and the link
 * simply never shows.
 */
interface StorefrontPlugin {
  getCountryCode(): Promise<{ countryCode?: string | null }>;
}

const Storefront = registerPlugin<StorefrontPlugin>('Storefront');

/** StoreKit returns ISO 3166-1 alpha-3 codes: the US storefront is exactly "USA". */
export function isUsStorefrontCode(code: unknown): boolean {
  return typeof code === 'string' && code.trim().toUpperCase() === 'USA';
}

/** Resolves the storefront code, or null when unknown (web, Android, plugin missing, error). */
export async function getStorefrontCountryCode(): Promise<string | null> {
  if (Capacitor.getPlatform() !== 'ios') return null;
  try {
    const { countryCode } = await Storefront.getCountryCode();
    return typeof countryCode === 'string' && countryCode.length > 0 ? countryCode : null;
  } catch {
    return null;
  }
}

/**
 * The https URL of the website's plans page, or null. Only a valid https URL counts, so an
 * unset or malformed VITE_UPGRADE_URL hides the link instead of breaking.
 */
export function parseUpgradeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** True only on iOS, with a US storefront, and a configured https upgrade URL. */
export async function resolveIosUpgradeLink(
  upgradeUrl: string | undefined = import.meta.env.VITE_UPGRADE_URL,
): Promise<string | null> {
  const url = parseUpgradeUrl(upgradeUrl);
  if (!url) return null;
  const code = await getStorefrontCountryCode();
  return isUsStorefrontCode(code) ? url : null;
}
