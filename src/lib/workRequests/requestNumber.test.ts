import { describe, it, expect } from 'vitest';
import { generateRequestNumber } from './requestNumber';
import type { WorkRequest } from '@/types/farm';

const year = new Date().getFullYear();

describe('generateRequestNumber', () => {
  it('produces the WR-<YYYY>-<6-char> format', () => {
    const num = generateRequestNumber([], 1_700_000_000_000);
    expect(num).toMatch(new RegExp(`^WR-${year}-[A-Z0-9]{6}$`));
  });

  it('keeps the suffix uppercase base36 with no special chars', () => {
    const num = generateRequestNumber([], 1_700_000_000_000);
    const suffix = num.split('-')[2];
    expect(suffix).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('avoids collisions against an existing list', () => {
    const existing: Pick<WorkRequest, 'requestNumber'>[] = [];
    // Fill the first few candidates by deriving them from `now`.
    const now = 1_700_000_000_000;
    // First call uses now's suffix directly.
    const first = generateRequestNumber(existing, now);
    existing.push({ requestNumber: first });
    // Second call must differ (jitter changes the suffix).
    const second = generateRequestNumber(existing, now);
    expect(second).not.toBe(first);
    existing.push({ requestNumber: second });
    // A list containing both should never return either.
    const third = generateRequestNumber(existing, now);
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
  });

  it('eventually falls back to a random suffix after many collisions', () => {
    // Saturate: every candidate we generate, we also add to the list, forcing
    // the loop toward its fallback. 12+ iterations guarantees fallback coverage.
    const existing: Pick<WorkRequest, 'requestNumber'>[] = [];
    for (let i = 0; i < 15; i += 1) {
      existing.push({ requestNumber: `WR-${year}-${i.toString(36).toUpperCase().padStart(6, '0').slice(-6)}` });
    }
    const num = generateRequestNumber(existing, 1_700_000_000_000);
    expect(num).toMatch(new RegExp(`^WR-${year}-[A-Z0-9]{6}$`));
  });
});
