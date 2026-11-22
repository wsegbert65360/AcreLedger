import { describe, expect, it } from 'vitest';

import { buttonVariants } from '../button';

// docs/agents/ui.md: interactive touch targets are at least 44px.
describe('button tap targets', () => {
  it('default, lg and icon buttons are 44px', () => {
    expect(buttonVariants()).toContain('h-11');
    expect(buttonVariants({ size: 'lg' })).toContain('h-11');
    expect(buttonVariants({ size: 'icon' })).toMatch(/h-11 w-11/);
  });

  it('a small button keeps its look but gets a 44px touch area', () => {
    const sm = buttonVariants({ size: 'sm' });
    expect(sm).toContain('h-9');
    expect(sm).toContain('after:-inset-1');
  });
});
