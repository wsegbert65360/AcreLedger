import { describe, expect, it } from 'vitest';
import {
  getAuthErrorMessage,
  getPasswordResetErrorMessage,
  PASSWORD_RESET_CODE_ERROR,
  PASSWORD_RESET_OFFLINE_ERROR,
  PASSWORD_RESET_RATE_LIMIT_ERROR,
} from './authErrors';

describe('getAuthErrorMessage', () => {
  it('turns hosted email throttling into an actionable message', () => {
    expect(getAuthErrorMessage({ status: 429, message: 'email rate limit exceeded' }))
      .toBe('Too many account emails were requested. Please wait and try again.');
  });

  it('preserves ordinary authentication errors', () => {
    expect(getAuthErrorMessage(new Error('Invalid login credentials')))
      .toBe('Invalid login credentials');
  });

  it('maps password-reset code, throttle, and network failures to safe guidance', () => {
    expect(getPasswordResetErrorMessage({ message: 'Token has expired' }, 'verify'))
      .toBe(PASSWORD_RESET_CODE_ERROR);
    expect(getPasswordResetErrorMessage({ status: 429, message: 'For security purposes' }, 'request'))
      .toBe(PASSWORD_RESET_RATE_LIMIT_ERROR);
    expect(getPasswordResetErrorMessage(new TypeError('Failed to fetch'), 'request'))
      .toBe(PASSWORD_RESET_OFFLINE_ERROR);
  });
});
