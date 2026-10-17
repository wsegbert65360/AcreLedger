type AuPilotEnv = {
  VITE_AU_PILOT_ENABLED?: string;
  VITE_AU_PILOT_ALLOWLIST?: string;
};

const defaultEnv = (): AuPilotEnv => ({
  VITE_AU_PILOT_ENABLED: import.meta.env.VITE_AU_PILOT_ENABLED,
  VITE_AU_PILOT_ALLOWLIST: import.meta.env.VITE_AU_PILOT_ALLOWLIST,
});

/** Comma-separated emails or user ids. Empty entries are dropped. Case is preserved. */
export function parseAuPilotAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

export type AuPilotIdentity = {
  email?: string | null;
  id?: string | null;
};

/**
 * Australia pilot region card. Hidden unless the flag is exactly "true",
 * or the signed-in email (case-insensitive) or user id (exact) is on the
 * optional allowlist. Hiding the card does not change a region the user
 * already chose.
 */
export function isAuPilotEnabled(
  identity: AuPilotIdentity | null | undefined,
  env: AuPilotEnv = defaultEnv(),
): boolean {
  if (env.VITE_AU_PILOT_ENABLED === 'true') return true;
  if (!identity) return false;
  const allowlist = parseAuPilotAllowlist(env.VITE_AU_PILOT_ALLOWLIST);
  if (allowlist.length === 0) return false;
  const email = identity.email?.trim().toLowerCase() ?? '';
  const id = identity.id?.trim() ?? '';
  if (!email && !id) return false;
  return allowlist.some(entry =>
    (email !== '' && entry.toLowerCase() === email) || (id !== '' && entry === id),
  );
}
