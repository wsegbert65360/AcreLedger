/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Field } from '@/types/farm';

import FieldCard from '../FieldCard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: 'field-1',
    name: 'Home 40',
    acreage: 40,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null,
    ...overrides,
  };
}

describe('FieldCard', () => {
  it('colors a planted corn field yellow and labels the crop', () => {
    render(
      <FieldCard
        field={field({
          activitySummary: { planted: true, crop: 'Corn', sprayed: 0, fertilized: 0 },
        })}
      />,
    );

    const card = screen.getByRole('button', { name: 'Open Home 40 details, Corn' });
    expect(card).toHaveAttribute('data-crop', 'corn');
    expect(card.className).toContain('border-crop-corn');
    expect(screen.getByText('Corn')).toBeTruthy();
  });

  it('colors soybeans green and wheat brown', () => {
    const { rerender } = render(
      <FieldCard
        field={field({
          activitySummary: { planted: true, crop: 'Soybeans', sprayed: 0, fertilized: 0 },
        })}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-crop', 'soybean');

    rerender(
      <FieldCard
        field={field({
          id: 'field-2',
          name: 'West',
          activitySummary: { planted: true, crop: 'Wheat', sprayed: 0, fertilized: 0 },
        })}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-crop', 'wheat');
  });

  it('leaves unplanted fields without a crop color', () => {
    render(<FieldCard field={field()} />);
    expect(screen.getByRole('button')).not.toHaveAttribute('data-crop');
    expect(screen.getByText('No activity')).toBeTruthy();
  });
});
