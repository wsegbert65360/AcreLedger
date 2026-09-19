import { describe, expect, it } from 'vitest';

import { trackProductEvent } from '@/lib/productAnalytics';

describe('trackProductEvent', () => {
  it('is a synchronous no-op for the approved carry events', () => {
    expect(() => trackProductEvent('carry_suggestion_shown', { recordType: 'spray' })).not.toThrow();
    expect(() => trackProductEvent('carry_suggestion_accepted', { recordType: 'plant' })).not.toThrow();
    expect(() => trackProductEvent('carry_suggestion_declined', { recordType: 'fertilizer' })).not.toThrow();
  });
});
