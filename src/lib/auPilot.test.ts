import { describe, expect, it } from 'vitest';
import { isAuPilotEnabled, parseAuPilotAllowlist } from './auPilot';

describe('isAuPilotEnabled', () => {
  it('is off when the flag and allowlist are missing', () => {
    expect(isAuPilotEnabled('a@x.com', {})).toBe(false);
    expect(isAuPilotEnabled(null, {})).toBe(false);
    expect(isAuPilotEnabled(undefined, {})).toBe(false);
  });

  it('enables for any email only when the flag is exactly true', () => {
    expect(isAuPilotEnabled(null, { VITE_AU_PILOT_ENABLED: 'true' })).toBe(true);
    expect(isAuPilotEnabled('a@x.com', { VITE_AU_PILOT_ENABLED: 'true' })).toBe(true);
    expect(isAuPilotEnabled('a@x.com', { VITE_AU_PILOT_ENABLED: 'TRUE' })).toBe(false);
    expect(isAuPilotEnabled('a@x.com', { VITE_AU_PILOT_ENABLED: '1' })).toBe(false);
  });

  it('matches an allowlisted email case-insensitively and trimmed', () => {
    const env = { VITE_AU_PILOT_ALLOWLIST: '  A@x.com , b@y.com' };
    expect(isAuPilotEnabled(' a@X.com ', env)).toBe(true);
    expect(isAuPilotEnabled('b@y.com', env)).toBe(true);
    expect(isAuPilotEnabled('c@z.com', env)).toBe(false);
  });

  it('stays off for a null or empty email even when an allowlist is set', () => {
    const env = { VITE_AU_PILOT_ALLOWLIST: 'a@x.com' };
    expect(isAuPilotEnabled(null, env)).toBe(false);
    expect(isAuPilotEnabled('', env)).toBe(false);
    expect(isAuPilotEnabled('   ', env)).toBe(false);
  });

  it('ignores empty allowlist entries', () => {
    expect(parseAuPilotAllowlist(',,')).toEqual([]);
    expect(isAuPilotEnabled('a@x.com', { VITE_AU_PILOT_ALLOWLIST: ',,' })).toBe(false);
  });
});
