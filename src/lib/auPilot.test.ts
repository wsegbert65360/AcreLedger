import { describe, expect, it } from 'vitest';
import { isAuPilotEnabled, parseAuPilotAllowlist } from './auPilot';

describe('isAuPilotEnabled', () => {
  it('is off when the flag and allowlist are missing', () => {
    expect(isAuPilotEnabled({ email: 'a@x.com' }, {})).toBe(false);
    expect(isAuPilotEnabled(null, {})).toBe(false);
    expect(isAuPilotEnabled(undefined, {})).toBe(false);
  });

  it('enables for any identity only when the flag is exactly true', () => {
    expect(isAuPilotEnabled(null, { VITE_AU_PILOT_ENABLED: 'true' })).toBe(true);
    expect(isAuPilotEnabled({ email: 'a@x.com' }, { VITE_AU_PILOT_ENABLED: 'true' })).toBe(true);
    expect(isAuPilotEnabled({ email: 'a@x.com' }, { VITE_AU_PILOT_ENABLED: 'TRUE' })).toBe(false);
    expect(isAuPilotEnabled({ email: 'a@x.com' }, { VITE_AU_PILOT_ENABLED: '1' })).toBe(false);
  });

  it('matches an allowlisted email case-insensitively and trimmed', () => {
    const env = { VITE_AU_PILOT_ALLOWLIST: '  A@x.com , b@y.com' };
    expect(isAuPilotEnabled({ email: ' a@X.com ' }, env)).toBe(true);
    expect(isAuPilotEnabled({ email: 'b@y.com' }, env)).toBe(true);
    expect(isAuPilotEnabled({ email: 'c@z.com' }, env)).toBe(false);
  });

  it('matches an allowlisted user id exactly after trim', () => {
    const env = { VITE_AU_PILOT_ALLOWLIST: ' User-1 , a@x.com' };
    expect(isAuPilotEnabled({ id: ' User-1 ' }, env)).toBe(true);
    expect(isAuPilotEnabled({ email: 'other@example.com', id: 'User-1' }, env)).toBe(true);
    expect(isAuPilotEnabled({ id: 'user-1' }, env)).toBe(false);
    expect(isAuPilotEnabled({ id: 'User-2' }, env)).toBe(false);
  });

  it('stays off for a null or empty identity even when an allowlist is set', () => {
    const env = { VITE_AU_PILOT_ALLOWLIST: 'a@x.com' };
    expect(isAuPilotEnabled(null, env)).toBe(false);
    expect(isAuPilotEnabled({ email: '' }, env)).toBe(false);
    expect(isAuPilotEnabled({ email: '   ' }, env)).toBe(false);
    expect(isAuPilotEnabled({ id: '   ' }, env)).toBe(false);
    expect(isAuPilotEnabled({}, env)).toBe(false);
  });

  it('ignores empty allowlist entries', () => {
    expect(parseAuPilotAllowlist(',,')).toEqual([]);
    expect(isAuPilotEnabled({ email: 'a@x.com' }, { VITE_AU_PILOT_ALLOWLIST: ',,' })).toBe(false);
  });
});
