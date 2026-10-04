import { describe, expect, it } from 'vitest';

import { formatDate, formatDisplayDate, formatIsoDate, formatShortDate } from '../dates';

describe('locale-aware date display (Australia pilot)', () => {
  it('defaults to the previous behavior when no locale is passed', () => {
    const d = new Date(2026, 9, 4, 12, 0);
    expect(formatDisplayDate(d)).toBe(d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
    expect(formatDate(d.getTime())).toBe(
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    );
  });

  it('renders en-AU dates day-first (4 Oct 2026, not Oct 4, 2026)', () => {
    const d = new Date(2026, 9, 4, 12, 0);
    expect(formatDisplayDate(d, 'en-AU')).toBe('4 Oct 2026');
    expect(formatDisplayDate(d, 'en-US')).toBe('Oct 4, 2026');
  });

  it('threads the locale through ISO-date display without a day shift', () => {
    expect(formatIsoDate('2026-10-04', 'en-AU')).toBe('4 Oct 2026');
    expect(formatIsoDate('2026-10-04', 'en-US')).toBe('Oct 4, 2026');
  });

  it('keeps short dates working in both locales', () => {
    const ts = new Date(2026, 9, 4, 12, 0).getTime();
    expect(formatShortDate(ts, 'en-AU')).toBe('4 Oct');
    expect(formatShortDate(ts, 'en-US')).toBe('Oct 4');
  });
});
