import type { WorkRequest } from '@/types/farm';

/**
 * Generate a human-readable, unique-per-farm work request number.
 *
 * Format: `WR-<YYYY>-<6-char base36>`, where the base36 segment encodes the
 * creation timestamp plus randomness. Uniqueness is checked against the
 * in-memory list and the generator retries on collision; the database
 * `UNIQUE(farm_id, request_number)` constraint is the final backstop.
 */
export function generateRequestNumber(existing: Pick<WorkRequest, 'requestNumber'>[] = [], now: number = Date.now()): string {
  const year = new Date().getFullYear();
  const taken = new Set(existing.map(r => r.requestNumber));

  // Try a handful of candidate values derived from `now` + random jitter so a
  // near-simultaneous add doesn't loop forever. base36 keeps the suffix compact
  // and URL/filename-safe.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const jitter = attempt === 0 ? now : now + Math.floor(Math.random() * 1_000_000) + attempt;
    const suffix = jitter.toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0');
    const candidate = `WR-${year}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Extremely unlikely fallback — full random suffix.
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, '0');
  return `WR-${year}-${random.slice(-6)}`;
}
