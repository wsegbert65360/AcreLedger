import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from './authErrors';

describe('getAuthErrorMessage', () => {
  it('turns hosted email throttling into an actionable message', () => {
    expect(getAuthErrorMessage({ status: 429, message: 'email rate limit exceeded' }))
      .toBe('Too many account emails were requested. Please wait and try again.');
  });

  it('preserves ordinary authentication errors', () => {
    expect(getAuthErrorMessage(new Error('Invalid login credentials')))
      .toBe('Invalid login credentials');
  });
});
