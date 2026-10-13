/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GrainMovementModal from '../GrainMovementModal';
import GrainTab from '../activity/GrainTab';
import type { GrainMovement } from '@/types/farm';

const state = vi.hoisted(() => ({
  add: vi.fn(), update: vi.fn(), total: vi.fn(),
  warning: vi.fn(), error: vi.fn(),
}));
vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addGrainMovement: state.add, updateGrainMovement: state.update, getBinTotal: state.total,
    bins: [{ id: 'bin', name: 'Bin', capacity: 1000, deleted_at: null }],
    fields: [], viewingSeason: 2026,
  }),
}));
vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: () => ({ preferences: { locale: 'en-AU' } }),
}));
vi.mock('sonner', () => ({ toast: { error: state.error, warning: state.warning } }));
vi.mock('@/lib/native', () => ({ native: { haptic: { error: vi.fn(), success: vi.fn() } } }));

const movement: GrainMovement = {
  id: 'grain', farm_id: 'farm', binId: 'bin', binName: 'Bin', type: 'in',
  bushels: 100, moisturePercent: 15, timestamp: 1770000000000, seasonYear: 2026,
  harvestRecordId: 'harvest', version: 1, deleted_at: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.add.mockResolvedValue(true);
  state.update.mockResolvedValue(true);
  state.total.mockReturnValue(100);
});

describe('linked harvest grain guards', () => {
  it.each(['edit', 'duplicate'] as const)('makes linked %s read-only and prevents save', mode => {
    render(<GrainMovementModal open onClose={vi.fn()} initialData={movement} mode={mode} />);
    expect(screen.getByLabelText(/bushels/i)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/moisture/i)).toHaveAttribute('readonly');
    expect(screen.getByRole('combobox', { name: /storage bin/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Edit or delete the harvest instead.');
    const save = screen.getByRole('button', { name: mode === 'edit' ? /update movement/i : /log duplicate/i });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(state.add).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it('blocks grain-tab selection for deletion and duplication while allowing read-only inspection', () => {
    const onToggle = vi.fn(), onDuplicate = vi.fn(), onEdit = vi.fn();
    render(<GrainTab records={[movement]} selected={new Set()} onToggle={onToggle} onDuplicate={onDuplicate} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('heading').closest('.group')!);
    fireEvent.click(screen.getByRole('button', { name: /duplicate record/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith('This load came from a harvest record. Edit or delete the harvest instead.');
    fireEvent.click(screen.getByRole('button', { name: /edit record/i }));
    expect(onEdit).toHaveBeenCalledWith(movement);
  });
});

describe('unlinked grain projections and locale input', () => {
  it('warns on a duplicate exceeding capacity but permits grouped numeric input and save', async () => {
    state.total.mockReturnValue(900);
    render(<GrainMovementModal open onClose={vi.fn()} initialData={{ ...movement, harvestRecordId: undefined }} mode="duplicate" />);
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '1,200.5' } });
    fireEvent.click(screen.getByRole('button', { name: /log duplicate/i }));
    await waitFor(() => expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ bushels: 1200.5 })));
    expect(state.warning).toHaveBeenCalledWith('This change would exceed bin capacity.', expect.anything());
  });

  it('subtracts the previous outbound delta and warns without blocking negative projected inventory', async () => {
    state.total.mockReturnValue(50);
    render(<GrainMovementModal open onClose={vi.fn()} initialData={{ ...movement, harvestRecordId: undefined, type: 'out' }} />);
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /update movement/i }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    expect(state.warning).toHaveBeenCalledWith('This change would leave negative bin inventory.', expect.anything());
  });

  it('does not warn when an unchanged edit already fits (no double-counting)', async () => {
    state.total.mockReturnValue(1000);
    render(<GrainMovementModal open onClose={vi.fn()} initialData={{ ...movement, harvestRecordId: undefined }} />);
    fireEvent.click(screen.getByRole('button', { name: /update movement/i }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    expect(state.warning).not.toHaveBeenCalled();
  });
});
