/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Field } from '@/types/farm';
import HarvestModal from '../HarvestModal';

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addHarvestRecord: vi.fn(), addHarvestWithGrain: vi.fn(), updateHarvestRecord: vi.fn(),
    addGrainMovement: vi.fn(), updateGrainMovement: vi.fn(), deleteGrainMovements: vi.fn(),
    grainMovements: [], harvestRecords: [],
    bins: [{ id: 'bin-1', farm_id: 'farm-1', name: 'Big Bin', capacity: 50000, deleted_at: null }],
    viewingSeason: 2026,
  }),
}));
vi.mock('@/lib/native', () => ({ native: { haptic: { error: vi.fn(), success: vi.fn(), light: vi.fn() } } }));

const field = { id: 'field-1', name: 'Home Place', acreage: 80, farm_id: 'farm-1' } as unknown as Field;

describe('HarvestModal outside taps', () => {
  it('keeps the form open and its input when a tap lands outside the dialog', async () => {
    const onClose = vi.fn();
    render(<HarvestModal field={field} open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /town/i }));
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '1200' } });

    // A tap that misses the dialog (e.g. after the iOS keyboard shifts the
    // viewport) lands on the overlay/body.
    await new Promise(r => setTimeout(r, 20));
    fireEvent.pointerDown(document.body);
    fireEvent.focusIn(document.body);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/bushels/i)).toHaveValue(1200);
  });
});
