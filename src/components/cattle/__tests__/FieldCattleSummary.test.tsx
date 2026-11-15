/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({ runsCattle: true, cattleGroups: [] as unknown[], cattleMoves: [] as unknown[] }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));

import FieldCattleSummary from '../FieldCattleSummary';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };
const show = () => render(<MemoryRouter><FieldCattleSummary fieldId="f1" /></MemoryRouter>);

beforeEach(() => { farm.runsCattle = true; farm.cattleGroups = []; farm.cattleMoves = []; });

describe('FieldCattleSummary', () => {
  it('renders nothing while cattle is off', () => {
    farm.runsCattle = false;
    show();
    expect(screen.queryByTestId('field-cattle-summary')).toBeNull();
  });

  it('shows none and never grazed for a fresh field', () => {
    show();
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.getByText('Never grazed')).toBeTruthy();
  });

  it('lists the group grazing there now', () => {
    farm.cattleGroups = [{ ...base, id: 'g1', name: 'Cows', class: 'cows', headCount: 12, currentFieldId: 'f1', currentSince: '2026-03-01' }];
    farm.cattleMoves = [{ ...base, id: 'm1', groupId: 'g1', fieldId: 'f1', movedOn: '2026-03-01', headCount: 12 }];
    show();
    expect(screen.getByText('Cows · 12 head').getAttribute('href')).toBe('/cattle/g1');
    expect(screen.getByText('Grazing now')).toBeTruthy();
  });

  it('shows rest days after the herd left', () => {
    farm.cattleMoves = [
      { ...base, id: 'm1', groupId: 'g1', fieldId: 'f1', movedOn: '2026-03-01', headCount: 12 },
      { ...base, id: 'm2', groupId: 'g1', fieldId: 'f2', movedOn: '2026-03-10', headCount: 12 },
    ];
    show();
    expect(screen.getByText(/days? of rest/)).toBeTruthy();
  });
});
