import { describe, expect, it } from 'vitest';

import { ACCESS_TOKEN_REFRESH_LEEWAY_SEC, sessionNeedsRefresh } from './freshAccessToken';

const NOW = Date.parse('2026-10-13T12:00:00Z');

describe('sessionNeedsRefresh', () => {
  it('refreshes a missing session, a missing expiry, and a token inside the leeway', () => {
    expect(sessionNeedsRefresh(null, NOW)).toBe(true);
    expect(sessionNeedsRefresh({ access_token: 'tok' }, NOW)).toBe(true);
    const expiring = Math.floor(NOW / 1000) + ACCESS_TOKEN_REFRESH_LEEWAY_SEC;
    expect(sessionNeedsRefresh({ access_token: 'tok', expires_at: expiring }, NOW)).toBe(true);
  });

  it('keeps a token that expires later than the leeway', () => {
    const later = Math.floor(NOW / 1000) + ACCESS_TOKEN_REFRESH_LEEWAY_SEC + 1;
    expect(sessionNeedsRefresh({ access_token: 'tok', expires_at: later }, NOW)).toBe(false);
  });
});
