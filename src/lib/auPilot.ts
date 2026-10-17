type AuPilotEnv = {
  VITE_AU_PILOT_ENABLED?: string;
  VITE_AU_PILOT_ALLOWLIST?: string;
};

const defaultEnv = (): AuPilotEnv => ({
  VITE_AU_PILOT_ENABLED: import.meta.env.VITE_AU_PILOT_ENABLED,
  VITE_AU_PILOT_ALLOWLIST: import.meta.env.VITE_AU_PILOT_ALLOWLIST,
});

/** Comma-separated emails. Empty entries are dropped. Matching is case-insensitive. */
export function parseAuPilotAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Australia pilot region card. Hidden unless the flag is exactly "true",
 * or the signed-in email is on the optional allowlist. Hiding the card does
 * not change a region the user already chose.
 */
export function isAuPilotEnabled(
  email: string | null | undefined,
  env: AuPilotEnv = defaultEnv(),
): boolean {
  if (env.VITE_AU_PILOT_ENABLED === 'true') return true;
  const normalized = email?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return parseAuPilotAllowlist(env.VITE_AU_PILOT_ALLOWLIST).includes(normalized);
}
