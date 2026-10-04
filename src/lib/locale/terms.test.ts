import { describe, expect, it } from 'vitest';

import { term } from './terms';

describe('locale terminology (AU pilot)', () => {
  it('renders "field" under en-US', () => {
    expect(term('field', 'en-US')).toBe('field');
    expect(term('fields', 'en-US')).toBe('fields');
  });

  it('renders "paddock" under en-AU', () => {
    expect(term('field', 'en-AU')).toBe('paddock');
    expect(term('fields', 'en-AU')).toBe('paddocks');
  });
});
