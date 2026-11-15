/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({
  runsCattle: true,
  initialFetchComplete: true,
  cattleLoadFailed: false,
  cattleGroups: [] as unknown[],
  cattleMoves: [] as unknown[],
  cattleEvents: [] as unknown[],
  fields: [] as unknown[],
  deleteCattleGroup: vi.fn(async () => true),
  deleteCattleMove: vi.fn(async () => true),
  deleteCattleEvent: vi.fn(async () => true),
}));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => null }));
vi.mock('@/components/cattle/CattleGroupDialog', () => ({ default: () => <div>group dialog</div> }));
vi.mock('@/components/cattle/CattleMoveDialog', () => ({ default: () => <div>move dialog</div> }));
vi.mock('@/lib/cattle/report', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/cattle/report')>();
  return { ...original, exportCattleCsv: vi.fn(async () => undefined) };
});

import Cattle from './Cattle';
import { exportCattleCsv } from '@/lib/cattle/report';
import { localTodayIso } from '@/lib/equipment';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };
const cows = { ...base, id: 'g1', name: 'Cows', class: 'cows', headCount: 20, currentFieldId: 'f1', currentSince: localTodayIso() };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/cattle" element={<Cattle />} />
        <Route path="/cattle/:groupId" element={<Cattle />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  farm.runsCattle = true;
  farm.initialFetchComplete = true;
  farm.cattleGroups = [];
  farm.cattleMoves = [];
  farm.cattleEvents = [];
  farm.fields = [{ id: 'f1', name: 'Back Pasture', intendedUse: 'Pasture', deleted_at: null }];
  vi.mocked(exportCattleCsv).mockClear();
});

describe('Cattle page', () => {
  it('sends you home when cattle is off', () => {
    farm.runsCattle = false;
    renderAt('/cattle');
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('shows a one-line empty state and no export when there are no groups', () => {
    renderAt('/cattle');
    expect(screen.getByText('Add your first group to start tracking cattle.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Export cattle CSV/ })).toBeNull();
  });

  it('lists groups with pasture and exports one CSV', () => {
    farm.cattleGroups = [cows];
    renderAt('/cattle');
    expect(screen.getByText('Cows').closest('a')?.getAttribute('href')).toBe('/cattle/g1');
    expect(screen.getByText(/Back Pasture · 0 days/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Export cattle CSV/ }));
    expect(exportCattleCsv).toHaveBeenCalledTimes(1);
  });

  it('shows "Pasture removed" when the current field was deleted', () => {
    farm.cattleGroups = [cows];
    farm.fields = [{ id: 'f1', name: 'Back Pasture', intendedUse: 'Pasture', deleted_at: '2026-02-01' }];
    renderAt('/cattle');
    expect(screen.getByText('Pasture removed')).toBeTruthy();
  });

  it('opens a group with a large Move button, Moves and Events', () => {
    farm.cattleGroups = [cows];
    farm.cattleMoves = [{ ...base, id: 'm1', groupId: 'g1', fieldId: 'f1', movedOn: '2026-03-01', headCount: 20 }];
    farm.cattleEvents = [{ ...base, id: 'e1', groupId: 'g1', eventType: 'death', eventDate: '2026-03-02', headDelta: -1 }];
    renderAt('/cattle/g1');
    const move = screen.getByRole('button', { name: 'Move' });
    expect(move.className).toContain('h-14');
    expect(screen.getByRole('heading', { name: 'Moves' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeTruthy();
    expect(screen.getByText('Death (-1)')).toBeTruthy();
    fireEvent.click(move);
    expect(screen.getByText('move dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(screen.getByText('group dialog')).toBeTruthy();
  });

  it('says so when the group is gone', () => {
    renderAt('/cattle/missing');
    expect(screen.getByText('This group is no longer here.')).toBeTruthy();
  });
});
