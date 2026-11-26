/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const farm = vi.hoisted(() => ({
  cattleGroups: [] as unknown[],
  cattleTreatments: [] as unknown[],
  logCattleEvent: vi.fn(async () => true),
  transferCattleHead: vi.fn(async () => true),
}));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
    <select aria-label="select" value={value} onChange={event => onValueChange(event.target.value)}><option value="" />{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

import CattleEventDialog from '../CattleEventDialog';
import { localTodayIso } from '@/lib/equipment';
import type { CattleGroup } from '@/types/cattle';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };
const zero = { cows: 0, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 };
const cows: CattleGroup = { ...base, id: 'g1', name: 'Cows', class: 'cows', headCount: 20, counts: { ...zero, cows: 20 } };
const calves: CattleGroup = { ...base, id: 'g2', name: 'Calves', class: 'calves', headCount: 5, counts: { ...zero, calves: 5 } };
const herd: CattleGroup = {
  ...base, id: 'g3', name: '2014 herd', class: 'mixed', headCount: 41, counts: { ...zero, cows: 30, calves: 10, bulls: 1 },
};

beforeEach(() => {
  farm.cattleGroups = [cows, calves];
  farm.logCattleEvent.mockClear().mockResolvedValue(true);
  farm.transferCattleHead.mockClear().mockResolvedValue(true);
});

const selects = () => screen.getAllByRole('combobox');
const pick = (index: number, value: string) => fireEvent.change(selects()[index], { target: { value } });
const typeInto = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const alertText = async () => (await screen.findByRole('alert')).textContent;

describe('CattleEventDialog', () => {
  it('logs calving as a positive head change', async () => {
    const onClose = vi.fn();
    render(<CattleEventDialog group={cows} onClose={onClose} />);
    typeInto('Calves born', '3');
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'g1', eventType: 'calving', headDelta: 3, eventDate: localTodayIso(),
    }), expect.anything());
  });

  it('requires at least one head and refuses a future date', async () => {
    render(<CattleEventDialog group={cows} onClose={vi.fn()} />);
    typeInto('Calves born', '0');
    save();
    expect(await alertText()).toContain('at least 1');
    typeInto('Calves born', '2');
    typeInto('Date', '2999-01-01');
    save();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('future'));
    expect(farm.logCattleEvent).not.toHaveBeenCalled();
  });

  it('logs a death as a negative change and will not remove more of a class than the herd has', async () => {
    render(<CattleEventDialog group={cows} onClose={vi.fn()} />);
    pick(0, 'death');
    typeInto('Head lost', '25');
    save();
    expect(await alertText()).toContain('only has 20 cows');
    typeInto('Head lost', '2');
    save();
    await waitFor(() => expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'death', headDelta: -2, cattleClass: 'cows',
    }), expect.anything()));
  });

  it('a death in a cow-calf herd can be a calf, checked against the calves', async () => {
    farm.cattleGroups = [herd, cows];
    render(<CattleEventDialog group={herd} onClose={vi.fn()} />);
    pick(0, 'death');
    pick(1, 'calves');
    typeInto('Head lost', '11');
    save();
    expect(await alertText()).toContain('only has 10 calves');
    typeInto('Head lost', '1');
    save();
    await waitFor(() => expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'death', headDelta: -1, cattleClass: 'calves',
    }), expect.anything()));
  });

  it('records calf sex on calving when all calves are one sex', async () => {
    render(<CattleEventDialog group={herd} onClose={vi.fn()} />);
    typeInto('Calves born', '2');
    pick(1, 'heifer');
    save();
    await waitFor(() => expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'calving', headDelta: 2, calfSex: 'heifer',
    }), expect.anything()));
  });

  it('changes class inside the herd without changing the total', async () => {
    render(<CattleEventDialog group={herd} onClose={vi.fn()} />);
    pick(0, 'reclass');
    pick(1, 'calves');
    pick(2, 'heifers');
    typeInto('How many head', '3');
    save();
    await waitFor(() => expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'reclass', headDelta: 0, cattleClass: 'calves', toClass: 'heifers', classHead: 3,
    }), expect.anything()));
  });

  it('asks why head were removed, and shipped is a plain removal', async () => {
    render(<CattleEventDialog group={cows} onClose={vi.fn()} />);
    pick(0, 'head_removed');
    typeInto('Head removed', '4');
    save();
    expect(await alertText()).toContain('why');
    pick(2, 'shipped');
    save();
    await waitFor(() => expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'head_removed', headDelta: -4, reason: 'shipped',
    }), expect.anything()));
    expect(farm.transferCattleHead).not.toHaveBeenCalled();
  });

  it('moving head to another herd is one transfer of one class and no separate event write', async () => {
    const onClose = vi.fn();
    render(<CattleEventDialog group={cows} onClose={onClose} />);
    pick(0, 'head_removed');
    typeInto('Head removed', '4');
    pick(2, 'moved_to_another_group');
    save();
    expect(await alertText()).toContain('Pick the herd');
    pick(3, 'g2');
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(farm.transferCattleHead).toHaveBeenCalledTimes(1);
    expect(farm.transferCattleHead).toHaveBeenCalledWith(expect.objectContaining({
      fromGroupId: 'g1', toGroupId: 'g2', head: 4, cattleClass: 'cows',
    }), expect.anything());
    expect(farm.logCattleEvent).not.toHaveBeenCalled();
  });

  it('weaning logs the event and moves N calves through one transfer', async () => {
    farm.cattleGroups = [herd, calves];
    render(<CattleEventDialog group={herd} onClose={vi.fn()} />);
    pick(0, 'weaning');
    typeInto('Move weaned calves to another herd (optional)', '6');
    pick(1, 'g2');
    save();
    await waitFor(() => expect(farm.transferCattleHead).toHaveBeenCalledTimes(1));
    expect(farm.logCattleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'weaning', headDelta: 0 }), expect.anything());
    expect(farm.transferCattleHead).toHaveBeenCalledWith(expect.objectContaining({
      fromGroupId: 'g3', toGroupId: 'g2', head: 6, cattleClass: 'calves',
    }), expect.anything());
  });

  it('weaning without a move is just the event', async () => {
    render(<CattleEventDialog group={cows} onClose={vi.fn()} />);
    pick(0, 'weaning');
    save();
    await waitFor(() => expect(farm.logCattleEvent).toHaveBeenCalledTimes(1));
    expect(farm.transferCattleHead).not.toHaveBeenCalled();
  });
});

describe('CattleEventDialog plan refusal', () => {
  it('shows the Pro wording when the server refuses the event for plan reasons', async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    farm.logCattleEvent.mockImplementation((async (_input: unknown, options?: { onPremiumRequired?: () => void }) => {
      options?.onPremiumRequired?.();
      return false;
    }) as never);
    const onClose = vi.fn();
    render(<CattleEventDialog group={cows} onClose={onClose} />);
    typeInto('Calves born', '3');
    save();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cattle events are part of Pro.'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
