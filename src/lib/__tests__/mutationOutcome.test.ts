import { describe, expect, it } from 'vitest';

import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';

describe('isUnknownMutationOutcome', () => {
  it('matches the shape postgrest-js produces when the 15s abort fires', () => {
    // postgrest-js catches the abort and returns it wrapped; the HTTP status
    // lives on the response object, not on this error.
    expect(
      isUnknownMutationOutcome({
        message: 'AbortError: signal is aborted without reason',
        details: '',
        hint: 'Request was aborted (timeout or manual cancellation)',
        code: '',
      }),
    ).toBe(true);
  });

  it('matches a raw thrown AbortError and TimeoutError', () => {
    expect(isUnknownMutationOutcome(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isUnknownMutationOutcome(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
  });

  it('matches wrapped network failures', () => {
    expect(
      isUnknownMutationOutcome({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }),
    ).toBe(true);
  });

  it('matches fetch TypeErrors but not ordinary code-bug TypeErrors', () => {
    expect(isUnknownMutationOutcome(new TypeError('Failed to fetch'))).toBe(true);
    expect(isUnknownMutationOutcome(new TypeError('Load failed'))).toBe(true);
    expect(isUnknownMutationOutcome(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
  });

  it('does not treat real database errors as unknown outcomes', () => {
    expect(
      isUnknownMutationOutcome({
        message: 'current transaction is aborted, commands ignored until end of transaction block',
        code: '25P02',
      }),
    ).toBe(false);
    expect(isUnknownMutationOutcome({ message: 'duplicate key value', code: '23505' })).toBe(false);
    expect(isUnknownMutationOutcome({ message: 'permission denied', code: '42501', status: 403 })).toBe(false);
    expect(isUnknownMutationOutcome(null)).toBe(false);
  });
});
