/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({
  runsCattle: false,
  farm_id: 'farm-1' as string | null,
  updateRunsCattle: vi.fn(async () => true),
}));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));

import CattleToggle from '../CattleToggle';

beforeEach(() => {
  farm.runsCattle = false;
  farm.farm_id = 'farm-1';
  farm.updateRunsCattle.mockClear();
});

describe('CattleToggle', () => {
  it('turns cattle on when tapped', async () => {
    render(<CattleToggle />);
    const toggle = screen.getByRole('switch', { name: 'I run cattle' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    await waitFor(() => expect(farm.updateRunsCattle).toHaveBeenCalledWith(true));
  });

  it('turns cattle off when it is on', async () => {
    farm.runsCattle = true;
    render(<CattleToggle />);
    fireEvent.click(screen.getByRole('switch', { name: 'I run cattle' }));
    await waitFor(() => expect(farm.updateRunsCattle).toHaveBeenCalledWith(false));
  });

  it('is disabled until a farm exists, and the row is at least 44 pt tall', () => {
    farm.farm_id = null;
    render(<CattleToggle />);
    const toggle = screen.getByRole('switch', { name: 'I run cattle' });
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(toggle.closest('label')?.className).toContain('min-h-14');
  });
});
