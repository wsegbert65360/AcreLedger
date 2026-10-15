/** Quote stripping matches cleanEnvValue in src/lib/supabase.ts. */
export function cleanCapacitorEnvValue(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

/**
 * Capacitor builds bake VITE_SUPABASE_* into the native bundle. Reject a
 * missing anon key or a URL that is not https before that bundle is emitted.
 * Returns an error message, or null when the pair is usable.
 */
export function capacitorSupabaseEnvError(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): string | null {
  const url = cleanCapacitorEnvValue(env.VITE_SUPABASE_URL);
  const key = cleanCapacitorEnvValue(env.VITE_SUPABASE_ANON_KEY);
  let validHttps = false;
  try {
    validHttps = new URL(url).protocol === "https:";
  } catch {
    validHttps = false;
  }

  if (!validHttps || !key) {
    return "Capacitor builds require VITE_SUPABASE_URL to be a valid https URL and a non-empty VITE_SUPABASE_ANON_KEY.";
  }

  return null;
}
