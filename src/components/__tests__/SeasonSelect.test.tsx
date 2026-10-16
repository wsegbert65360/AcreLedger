import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SeasonSelect from '../SeasonSelect';

vi.mock('@/store/farmStore', () => ({ useFarm: () => ({ activeSeason: 2026, viewingSeason: 2026, seasonOptions: [2025, 2026, 2027], setViewingSeason: vi.fn() }) }));

describe('SeasonSelect width', () => {
  it('bounds the default trigger and truncates the year', () => {
    render(<SeasonSelect />);
    const trigger = screen.getByRole('combobox', { name: 'Season' });
    expect(trigger).toHaveClass('max-w-[6.5rem]', 'w-auto');
    expect(trigger).not.toHaveClass('w-full');
    expect(screen.getByText('2026')).toHaveClass('truncate');
  });
  it('keeps the sidebar full width', () => {
    render(<SeasonSelect variant="sidebar" />);
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveClass('w-full');
  });
});
