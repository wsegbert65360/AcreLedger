import { describe, expect, it } from 'vitest';
import { isAskBookEnabled } from './askBookAccess';

describe('isAskBookEnabled', () => {
  it.each([
    ['cc3280e8-8fe3-49a8-9020-7132a7e8241c', true],
    ['d4124658-d3dc-41e8-9792-b3327954c5c5', false],
    [null, false],
    [undefined, false],
    ['', false],
  ])('checks farm %s', (farmId, expected) => {
    expect(isAskBookEnabled(farmId)).toBe(expected);
  });
});
