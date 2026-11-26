/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const farm = vi.hoisted(() => ({
  cattleGroups: [] as unknown[],
  fields: [] as unknown[],
  addCattleGroup: vi.fn(async () => true),
  updateCattleGroup: vi.fn(async () => true),
  moveCattleGroup: vi.fn(async () => true),
}));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Radix Select does not open reliably in jsdom; a native select exercises the same props.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
    <select aria-label="select" value={value} onChange={event => onValueChange(event.target.value)}><option value="" />{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

import CattleGroupDialog from '../CattleGroupDialog';
import CattleMoveDialog from '../CattleMoveDialog';
import { localTodayIso } from '@/lib/equipment';
import type { CattleGroup } from '@/types/cattle';

const group: CattleGroup = {
  id: 'g1', farm_id: 'f', name: 'Cows', class: 'cows', headCount: 20,
  counts: { cows: 20, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};
const zero = { cows: 0, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 };

beforeEach(() => {
  farm.cattleGroups = [group];
  farm.fields = [
    { id: 'f1', name: 'Corn North', intendedUse: 'Corn', deleted_at: null },
    { id: 'f2', name: 'Back Pasture', intendedUse: 'Pasture', deleted_at: null },
  ];
  farm.addCattleGroup.mockClear(); farm.updateCattleGroup.mockClear(); farm.moveCattleGroup.mockClear();
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('CattleGroupDialog', () => {
  it('rejects a negative or fractional count', async () => {
    render(<CattleGroupDialog onClose={vi.fn()} />);
    type('Herd name', 'Heifers');
    for (const bad of ['-3', '2.5']) {
      type('Heifers', bad);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('whole number');
    }
    expect(farm.addCattleGroup).not.toHaveBeenCalled();
  });

  it('shows a friendly message for a duplicate name on add and on rename', async () => {
    const { unmount } = render(<CattleGroupDialog onClose={vi.fn()} />);
    type('Herd name', ' cows ');
    type('Cows', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already have a herd called "cows"');
    unmount();

    farm.cattleGroups = [group, { ...group, id: 'g2', name: 'Calves' }];
    render(<CattleGroupDialog group={{ ...group, id: 'g2', name: 'Calves' }} onClose={vi.fn()} />);
    type('Herd name', 'COWS');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already have a herd called "COWS"');
    expect(farm.updateCattleGroup).not.toHaveBeenCalled();
  });

  it('saves a new cow-calf herd with cows, calves and a bull together', async () => {
    const onClose = vi.fn();
    render(<CattleGroupDialog onClose={onClose} />);
    type('Herd name', '2014 herd');
    type('Cows', '30');
    type('Calves', '28');
    fireEvent.click(screen.getByRole('button', { name: 'One more bulls' }));
    expect(screen.getByTestId('cattle-total')).toHaveTextContent('59 head');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.addCattleGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: '2014 herd', class: 'mixed', counts: { ...zero, cows: 30, calves: 28, bulls: 1 },
    }));
  });

  it('adding bulls on edit keeps the cows', async () => {
    const onClose = vi.fn();
    render(<CattleGroupDialog group={group} onClose={onClose} />);
    expect((screen.getByLabelText('Cows') as HTMLInputElement).value).toBe('20');
    type('Bulls', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.updateCattleGroup).toHaveBeenCalledWith('g1', expect.objectContaining({
      name: 'Cows', counts: { ...zero, cows: 20, bulls: 1 },
    }));
  });
});

describe('CattleMoveDialog', () => {
  it('defaults the date to today, caps it at today, and lists pasture fields first', () => {
    render(<CattleMoveDialog group={group} onClose={vi.fn()} />);
    const date = screen.getByLabelText('Date') as HTMLInputElement;
    expect(date.value).toBe(localTodayIso());
    expect(date.max).toBe(localTodayIso());
    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options.indexOf('Back Pasture')).toBeLessThan(options.indexOf('Corn North (not pasture)'));
  });

  it('asks for a destination before saving', async () => {
    render(<CattleMoveDialog group={group} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick where');
    expect(farm.moveCattleGroup).not.toHaveBeenCalled();
  });

  it('refuses a future date', async () => {
    render(<CattleMoveDialog group={group} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'f2' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2999-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('future');
    expect(farm.moveCattleGroup).not.toHaveBeenCalled();
  });

  it('saves a move to the chosen pasture', async () => {
    const onClose = vi.fn();
    render(<CattleMoveDialog group={group} onClose={onClose} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'f2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.moveCattleGroup).toHaveBeenCalledWith({ groupId: 'g1', fieldId: 'f2', movedOn: localTodayIso(), notes: undefined });
  });
});
