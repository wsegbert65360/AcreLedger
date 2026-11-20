import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from '@/lib/county/__tests__/fixtures';
import type { CountyAssignment } from '@/lib/county/types';
import type { CountySubject } from '@/lib/county/plan';

const farm = vi.hoisted(() => ({
  countyAssignments: [] as CountyAssignment[],
  fields: [] as unknown[],
  fsaTracts: [] as unknown[],
  saveCountySplit: vi.fn(),
  restoreCountyAutomatic: vi.fn(),
  markCountyReviewed: vi.fn(),
  previewCounties: vi.fn(),
  applyCountyPlan: vi.fn(),
}));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CountyPanel from '../CountyPanel';
import CountyIdentificationCard from '../CountyIdentificationCard';

const subject: CountySubject = {
  type: 'field', key: 'field-1', label: 'Behind Mefford', fieldId: 'field-1', tractKey: null, cluNumber: null,
  geometry: null, point: null, recordedAcres: 55,
};
const henry = (over: Partial<CountyAssignment> = {}) => row({ id: 'h', countyName: 'Henry', mappedAcres: 45, proportion: 0.8182, ...over });
const benton = (over: Partial<CountyAssignment> = {}) => row({ id: 'b', countyFips: '29015', countyName: 'Benton', mappedAcres: 10, proportion: 0.1818, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  farm.countyAssignments = [];
  farm.fields = [];
  farm.fsaTracts = [];
  farm.saveCountySplit.mockResolvedValue({ ok: true, errors: [] });
  farm.restoreCountyAutomatic.mockResolvedValue(true);
  farm.markCountyReviewed.mockResolvedValue(true);
});

describe('CountyPanel', () => {
  it('shows County unknown and an unresolved badge with nothing saved', () => {
    render(<CountyPanel subject={subject} />);
    expect(screen.getByText('County unknown')).toBeTruthy();
    expect(screen.getByTestId('county-status-unresolved')).toBeTruthy();
  });

  it('shows the counties and split of an automatic assignment', () => {
    farm.countyAssignments = [henry(), benton()];
    render(<CountyPanel subject={{ ...subject, recordedAcres: 55 }} />);
    expect(screen.getByText(/Henry, MO/)).toBeTruthy();
    expect(screen.getByText(/Benton, MO/)).toBeTruthy();
    expect(screen.getByText(/81.8%/)).toBeTruthy();
  });

  it('labels a manual correction and offers restore automatic', async () => {
    farm.countyAssignments = [
      henry({ method: 'manual', manualAcres: 45, mappedAcres: null }),
      benton({ method: 'manual', manualAcres: 10, mappedAcres: null }),
    ];
    render(<CountyPanel subject={subject} />);
    expect(screen.getByTestId('county-status-manual')).toBeTruthy();
    fireEvent.click(screen.getByText('Restore automatic'));
    await waitFor(() => expect(farm.restoreCountyAutomatic).toHaveBeenCalledWith(subject));
  });

  it('flags a row that needs review and lets the farmer acknowledge it', async () => {
    farm.countyAssignments = [henry({ reviewStatus: 'needs_review', reviewReason: 'Boundary is close to a county line' })];
    render(<CountyPanel subject={subject} />);
    expect(screen.getByTestId('county-status-needs_review')).toBeTruthy();
    expect(screen.getByText('Boundary is close to a county line')).toBeTruthy();
    fireEvent.click(screen.getByText('Mark reviewed'));
    await waitFor(() => expect(farm.markCountyReviewed).toHaveBeenCalled());
  });

  it('flags a manual correction after the geometry changed, without hiding it', () => {
    farm.countyAssignments = [
      henry({ method: 'manual', manualAcres: 55, mappedAcres: null, reviewStatus: 'needs_review', reviewReason: 'Boundary changed after the manual county correction' }),
    ];
    render(<CountyPanel subject={subject} />);
    expect(screen.getByTestId('county-status-needs_review')).toBeTruthy();
    expect(screen.getByText('Keep correction')).toBeTruthy();
    expect(screen.getByText('Restore automatic')).toBeTruthy();
  });

  it('compares with notes as reference only', () => {
    farm.countyAssignments = [henry({ mappedAcres: 54, proportion: 0.98 }), benton({ mappedAcres: 1, proportion: 0.02 })];
    render(<CountyPanel subject={subject} notes="Behind Mefford on corner. About 10 ac Benton, 45 ac Henry" />);
    expect(screen.getByTestId('county-notes-differences').textContent).toMatch(/reference only/);
  });

  it('only lets a correction that adds up to the recorded acreage be saved', async () => {
    farm.countyAssignments = [henry(), benton()];
    render(<CountyPanel subject={subject} />);
    fireEvent.click(screen.getByText('Correct counties'));
    const save = screen.getByText('Save correction') as HTMLButtonElement;
    fireEvent.change(document.getElementById('county-acres-0') as HTMLInputElement, { target: { value: '30' } });
    expect(save.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/recorded acreage is 55/);
    fireEvent.change(document.getElementById('county-acres-0') as HTMLInputElement, { target: { value: '45' } });
    fireEvent.change(document.getElementById('county-acres-1') as HTMLInputElement, { target: { value: '10' } });
    expect(screen.getByTestId('county-split-total').textContent).toMatch(/Total 55 of 55/);
    expect((screen.getByText('Save correction') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText('Save correction'));
    await waitFor(() => expect(farm.saveCountySplit).toHaveBeenCalledTimes(1));
    const arg = farm.saveCountySplit.mock.calls[0][0];
    expect(arg.split.map((s: { county: { fips: string }; acres: number }) => [s.county.fips, s.acres])).toEqual([['29083', 45], ['29015', 10]]);
  });
});

describe('CountyIdentificationCard', () => {
  it('previews first and writes nothing until the farmer applies', async () => {
    const upsert = henry({ id: 'new' });
    farm.previewCounties.mockResolvedValue({
      unavailableReason: null,
      plan: {
        plans: [{ subject, action: 'create', reason: 'New county assignment', calculation: null, upserts: [upsert], softDeletes: [] }],
        upserts: [upsert], softDeletes: [],
        counts: { create: 1, update: 0, unchanged: 0, 'preserve-manual': 0, 'flag-review': 0, unresolved: 0, deferred: 0, remove: 0 },
      },
    });
    farm.applyCountyPlan.mockResolvedValue(true);
    render(<CountyIdentificationCard />);
    fireEvent.click(screen.getByText('Preview county identification'));
    await waitFor(() => expect(screen.getByTestId('county-preview')).toBeTruthy());
    expect(farm.applyCountyPlan).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing has changed yet/)).toBeTruthy();
    fireEvent.click(screen.getByText('Apply 1 change'));
    await waitFor(() => expect(farm.applyCountyPlan).toHaveBeenCalledTimes(1));
  });

  it('says so when boundaries are not downloaded, instead of applying anything', async () => {
    farm.previewCounties.mockResolvedValue({
      unavailableReason: 'County boundaries are not downloaded for this area yet; connect to download them.',
      plan: { plans: [], upserts: [], softDeletes: [], counts: { create: 0, update: 0, unchanged: 0, 'preserve-manual': 0, 'flag-review': 0, unresolved: 0, deferred: 1, remove: 0 } },
    });
    render(<CountyIdentificationCard />);
    fireEvent.click(screen.getByText('Preview county identification'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/not downloaded/));
    expect((screen.getByText('Apply 0 changes') as HTMLButtonElement).disabled).toBe(true);
  });
});
