export const ACRELEDGER_IOS_BUNDLE_ID = 'com.wsegbert.acreledger';

export type IosStoreListing = {
  version: string;
  url: string | null;
};

function numericParts(version: string): number[] | null {
  const core = version.trim().split('-')[0] ?? '';
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map((part) => Number(part));
}

/** True when the App Store marketing version is newer than the installed app. */
export function isStoreVersionNewer(installed: string, store: string): boolean | null {
  const current = numericParts(installed);
  const latest = numericParts(store);
  if (!current || !latest) return null;

  const length = Math.max(current.length, latest.length);
  for (let index = 0; index < length; index += 1) {
    const left = current[index] ?? 0;
    const right = latest[index] ?? 0;
    if (right > left) return true;
    if (right < left) return false;
  }
  return false;
}

export function parseItunesLookup(body: unknown): IosStoreListing | null {
  if (!body || typeof body !== 'object') return null;
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0];
  if (!first || typeof first !== 'object') return null;
  const version = (first as { version?: unknown }).version;
  if (typeof version !== 'string' || !numericParts(version)) return null;
  const url = (first as { trackViewUrl?: unknown }).trackViewUrl;
  return {
    version: version.trim(),
    url: typeof url === 'string' && url.startsWith('https://') ? url : null,
  };
}

export async function lookupIosStoreVersion(
  bundleId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IosStoreListing | null> {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=us`;
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  return parseItunesLookup(await response.json());
}
