/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const farm = vi.hoisted(() => ({
  cattleGroups: [] as unknown[],
  fields: [] as unknown[],
  addCattleGroup: vi.fn(async () => true),
  updateCattleGroup: vi.fn(async () => true),
  moveCattleGroup: vi.fn(async () => true),
  logCattleEvent: vi.fn(async () => true),
  transferCattleHead: vi.fn(async () => true),
  cattleEvents: [] as unknown[],
  cattleTreatments: [] as unknown[],
  cattleMoves: [] as unknown[],
  plantRecords: [] as unknown[],
  harvestRecords: [] as unknown[],
  hayHarvestRecords: [] as unknown[],
  activeSeason: '2026',
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
import CattleRemoveDialog from '../CattleRemoveDialog';
import CattleWeanDialog from '../CattleWeanDialog';
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
  farm.cattleEvents = [];
  farm.fields = [
    { id: 'f1', name: 'Corn North', intendedUse: 'Row crop', deleted_at: null },
    { id: 'f2', name: 'Back Pasture', intendedUse: 'Pasture', deleted_at: null },
    { id: 'f3', name: 'Bean South', intendedUse: 'Row crop', deleted_at: null },
  ];
  farm.plantRecords = [{ fieldId: 'f1', crop: 'Corn', seasonYear: 2026 }, { fieldId: 'f3', crop: 'Soybeans', seasonYear: 2026 }];
  farm.harvestRecords = [{ fieldId: 'f1', crop: 'Corn', harvestDate: '2026-10-20', seasonYear: 2026 }];
  for (const mock of [farm.addCattleGroup, farm.updateCattleGroup, farm.moveCattleGroup, farm.logCattleEvent, farm.transferCattleHead]) mock.mockClear();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-26T12:00:00') });
});

afterEach(() => { vi.useRealTimers(); });

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
  it('defaults the date to today, caps it at today, and groups pasture, then crop fields with details', () => {
    render(<CattleMoveDialog group={group} onClose={vi.fn()} />);
    const date = screen.getByLabelText('Date') as HTMLInputElement;
    expect(date.value).toBe(localTodayIso());
    expect(date.max).toBe(localTodayIso());
    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options.indexOf('Back Pasture — Pasture · never grazed')).toBeLessThan(options.indexOf('Corn North — Crop field · Corn stalks · harvested Oct 20'));
    expect(options).toContain('Bean South — Crop field · Soybeans stubble · not harvested yet');
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

  it('needs a confirmation before turning cattle into an unharvested crop', async () => {
    const onClose = vi.fn();
    render(<CattleMoveDialog group={group} onClose={onClose} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'f3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm the crop');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.moveCattleGroup).toHaveBeenCalledWith(expect.objectContaining({ fieldId: 'f3' }));
  });
});

const mixed: CattleGroup = {
  ...group, id: 'm1', name: 'Fall herd', class: 'mixed', headCount: 70,
  counts: { cows: 40, heifers: 0, bulls: 2, calves: 4, steers: 24, stockers: 0 },
};

describe('CattleRemoveDialog', () => {
  beforeEach(() => { farm.cattleGroups = [mixed, group]; });

  it('sells several classes in one save with the average weight and buyer', async () => {
    const onClose = vi.fn();
    render(<CattleRemoveDialog group={mixed} mode="sell" onClose={onClose} />);
    type('Steers (24)', '24'); type('Cows (40)', '3');
    type('Average weight, lb (optional)', '1250');
    type('Buyer or hauler (optional)', 'Smith Livestock');
    fireEvent.click(screen.getByRole('button', { name: 'Save sale' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.logCattleEvent).toHaveBeenCalledTimes(2);
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'head_removed', reason: 'shipped', cattleClass: 'steers', headDelta: -24, avgWeight: 1250, notes: 'Smith Livestock',
    }), expect.anything());
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({ cattleClass: 'cows', headDelta: -3 }), expect.anything());
  });

  it('refuses more head than the herd holds', async () => {
    render(<CattleRemoveDialog group={mixed} mode="sell" onClose={vi.fn()} />);
    type('Bulls (2)', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Save sale' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('only has 2 bulls');
    expect(farm.logCattleEvent).not.toHaveBeenCalled();
  });

  it('records a death with its cause', async () => {
    const onClose = vi.fn();
    render(<CattleRemoveDialog group={mixed} mode="death" onClose={onClose} />);
    type('Cows (40)', '1');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'predator' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save death' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'death', reason: 'predator', cattleClass: 'cows', headDelta: -1,
    }), expect.anything());
  });

  it('transfers to a new herd, then puts that herd in its field', async () => {
    let destinationReady = false;
    farm.addCattleGroup.mockImplementationOnce(async () => {
      setTimeout(() => { destinationReady = true; }, 0);
      return true;
    });
    farm.transferCattleHead.mockImplementationOnce(async () => {
      expect(destinationReady).toBe(true);
      return destinationReady;
    });
    const onClose = vi.fn();
    render(<CattleRemoveDialog group={mixed} mode="transfer" onClose={onClose} />);
    type('Steers (24)', '24');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new_herd__' } });
    const [, kind, location] = screen.getAllByRole('combobox');
    type('New herd name', 'Steers on stalks');
    fireEvent.change(kind, { target: { value: 'stockers' } });
    fireEvent.change(location, { target: { value: 'f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.addCattleGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Steers on stalks', class: 'stockers' }));
    const created = (farm.addCattleGroup.mock.calls[0] as unknown as [{ id: string }])[0].id;
    expect(farm.transferCattleHead).toHaveBeenCalledWith(expect.objectContaining({
      fromGroupId: 'm1', toGroupId: created, head: 24, cattleClass: 'steers',
    }), expect.anything());
    expect(farm.moveCattleGroup).toHaveBeenCalledWith(expect.objectContaining({ groupId: created, fieldId: 'f1' }));
  });
});

describe('CattleWeanDialog', () => {
  it('prefills the heifer / steer split from calving records and saves weaning, reclasses and a move', async () => {
    farm.cattleGroups = [{ ...mixed, counts: { ...mixed.counts, calves: 28 } }, group];
    farm.cattleEvents = [
      { groupId: 'm1', eventType: 'calving', eventDate: '2026-03-01', headDelta: 15, calfSex: 'heifer' },
      { groupId: 'm1', eventType: 'calving', eventDate: '2026-03-05', headDelta: 13, calfSex: 'steer' },
    ];
    const onClose = vi.fn();
    render(<CattleWeanDialog group={{ ...mixed, counts: { ...mixed.counts, calves: 28 } }} onClose={onClose} />);
    expect((screen.getByLabelText('Calves weaned') as HTMLInputElement).value).toBe('28');
    expect(screen.getByText(/15 heifers, 13 steers/)).toBeInTheDocument();
    type('Avg weight, lb', '540');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'weaning', headWeaned: 28, avgWeight: 540 }), expect.anything());
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'reclass', toClass: 'heifers', classHead: 15 }), expect.anything());
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'reclass', toClass: 'steers', classHead: 13 }), expect.anything());
    expect(farm.transferCattleHead).toHaveBeenCalledTimes(2);
  });

  it('waits for a newly created destination before transferring weaned calves', async () => {
    let destinationReady = false;
    farm.addCattleGroup.mockImplementationOnce(async () => {
      setTimeout(() => { destinationReady = true; }, 0);
      return true;
    });
    farm.transferCattleHead.mockImplementationOnce(async () => {
      expect(destinationReady).toBe(true);
      return destinationReady;
    });
    const onClose = vi.fn();
    render(<CattleWeanDialog group={mixed} onClose={onClose} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new_herd__' } });
    type('New herd name', 'Weaned calves');
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'f2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    await waitFor(() => expect(farm.transferCattleHead).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('resumes after an existing matching weaning without recording it twice', async () => {
    farm.cattleEvents = [{ groupId: mixed.id, eventType: 'weaning', eventDate: localTodayIso(), headWeaned: 4, deleted_at: null }];
    const onClose = vi.fn();
    render(<CattleWeanDialog group={mixed} onClose={onClose} />);
    type('Heifer calves (the rest become steers)', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.logCattleEvent).toHaveBeenCalledTimes(2);
    for (const [event] of farm.logCattleEvent.mock.calls as unknown as [{ eventType: string }][]) {
      expect(event.eventType).toBe('reclass');
    }
  });

  it('resumes after reclasses and one transfer already landed, saving only the remaining transfer', async () => {
    farm.cattleGroups = [mixed, group];
    farm.cattleEvents = [
      { groupId: mixed.id, eventType: 'weaning', eventDate: localTodayIso(), headWeaned: 4, deleted_at: null },
      ...(['heifers', 'steers'] as const).map(toClass => ({
        groupId: mixed.id, eventType: 'reclass', eventDate: localTodayIso(), cattleClass: 'calves',
        toClass, classHead: 2, deleted_at: null,
      })),
      { groupId: mixed.id, eventType: 'head_removed', reason: 'moved_to_another_group', eventDate: localTodayIso(),
        cattleClass: 'heifers', headDelta: -2, transferId: 't1', deleted_at: null },
      { groupId: group.id, eventType: 'head_added', eventDate: localTodayIso(),
        cattleClass: 'heifers', headDelta: 2, transferId: 't1', deleted_at: null },
    ];
    const onClose = vi.fn();
    render(<CattleWeanDialog group={mixed} onClose={onClose} />);
    type('Heifer calves (the rest become steers)', '2');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: group.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(farm.logCattleEvent).not.toHaveBeenCalled();
    expect(farm.transferCattleHead).toHaveBeenCalledTimes(1);
    expect(farm.transferCattleHead).toHaveBeenCalledWith(expect.objectContaining({
      fromGroupId: mixed.id, toGroupId: group.id, cattleClass: 'steers', head: 2,
    }), expect.anything());
  });

  it.each(['same name', 'changed name', 'no transfer yet'])('reuses the new herd on retry: %s', async scenario => {
    const destination = { ...group, id: 'new-herd', name: 'Weaned calves' };
    farm.cattleGroups = [mixed, destination];
    farm.cattleEvents = [
      { groupId: mixed.id, eventType: 'weaning', eventDate: localTodayIso(), headWeaned: 4, deleted_at: null },
      ...(['heifers', 'steers'] as const).map(toClass => ({
        groupId: mixed.id, eventType: 'reclass', eventDate: localTodayIso(), cattleClass: 'calves',
        toClass, classHead: 2, deleted_at: null,
      })),
      ...(scenario === 'no transfer yet' ? [] : [
        { groupId: mixed.id, eventType: 'head_removed', reason: 'moved_to_another_group', eventDate: localTodayIso(),
          cattleClass: 'heifers', headDelta: -2, transferId: 'new-transfer', deleted_at: null },
        { groupId: destination.id, eventType: 'head_added', eventDate: localTodayIso(),
          cattleClass: 'heifers', headDelta: 2, transferId: 'new-transfer', deleted_at: null },
      ]),
    ];
    const onClose = vi.fn();
    render(<CattleWeanDialog group={mixed} onClose={onClose} />);
    type('Heifer calves (the rest become steers)', '2');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new_herd__' } });
    type('New herd name', scenario === 'changed name' ? 'Another name' : destination.name);
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'f2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(farm.addCattleGroup).not.toHaveBeenCalled();
    expect(farm.logCattleEvent).not.toHaveBeenCalled();
    expect(farm.transferCattleHead).toHaveBeenCalledTimes(scenario === 'no transfer yet' ? 2 : 1);
    expect(farm.transferCattleHead).toHaveBeenCalledWith(expect.objectContaining({
      fromGroupId: mixed.id, toGroupId: destination.id, cattleClass: 'steers', head: 2,
    }), expect.anything());
    if (scenario !== 'no transfer yet') {
      expect(farm.transferCattleHead).not.toHaveBeenCalledWith(expect.objectContaining({ cattleClass: 'heifers' }), expect.anything());
    }
  });

  it.each(['other group', 'other date', 'other count', 'deleted'])('records weaning when the prior record has %s', async mismatch => {
    farm.cattleEvents = [{ groupId: mismatch === 'other group' ? 'other' : mixed.id, eventType: 'weaning',
      eventDate: mismatch === 'other date' ? '2026-11-25' : localTodayIso(),
      headWeaned: mismatch === 'other count' ? 3 : 4, deleted_at: mismatch === 'deleted' ? '2026-11-26' : null }];
    const onClose = vi.fn();
    render(<CattleWeanDialog group={mixed} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(farm.logCattleEvent).toHaveBeenCalledTimes(1);
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({ groupId: mixed.id, eventType: 'weaning', eventDate: localTodayIso(), headWeaned: 4 }), expect.anything());
  });

  it('refuses weaning more calves than the herd has', async () => {
    render(<CattleWeanDialog group={mixed} onClose={vi.fn()} />);
    type('Calves weaned', '9');
    fireEvent.click(screen.getByRole('button', { name: 'Wean' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('only has 4 calves');
    expect(farm.logCattleEvent).not.toHaveBeenCalled();
  });
});