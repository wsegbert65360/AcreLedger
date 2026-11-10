/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { freeEntitlement, type Entitlement } from '@/lib/entitlements';
import type { Field, PlantRecord } from '@/types/farm';

const rpc = vi.hoisted(() => vi.fn());
const entitlementState = vi.hoisted(() => ({
  entitlement: null as Entitlement | null,
  loading: false,
  cachedEntitlement: null as Entitlement | null,
  failed: false,
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => entitlementState,
}));

vi.mock('@/lib/bundledFsaTracts', () => ({
  loadBundledFsaTracts: () => Promise.resolve([]),
  mergeBundledFsaTracts: (imported: unknown[] = []) => imported,
}));

const farmState = vi.hoisted(() => ({
  plantRecords: [] as PlantRecord[],
  sprayRecords: [] as unknown[],
  harvestRecords: [] as unknown[],
  hayHarvestRecords: [] as unknown[],
  customSprayRecords: [] as unknown[],
  tillageRecords: [] as unknown[],
  fertilizerApplications: [] as unknown[],
  fields: [] as Field[],
  cluAssignments: [] as unknown[],
  fsaTracts: [] as unknown[],
  farmName: 'Test Farm',
  viewingSeason: 2026,
  activeSeason: 2026,
  seasonOptions: [2026],
  setViewingSeason: vi.fn(),
  session: { user: { id: 'user-1' } },
  farm_id: 'farm-1' as string | null,
  isOnline: true,
  pendingSyncCount: 0,
  failedSyncCount: 0,
  syncQueueLocked: false,
  syncQueueReadFailed: false,
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmState,
}));

import Reports from '../Reports';

const FIELD_NAMES = ['Alpha Quarter', 'Bravo Quarter', 'Charlie Quarter', 'Delta Quarter'];

function makeField(name: string): Field {
  return {
    id: name,
    name,
    acreage: 40,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null,
  };
}

function makePlant(name: string): PlantRecord {
  return {
    id: name,
    fieldId: name,
    fieldName: name,
    seedVariety: 'Pioneer',
    acreage: 40,
    timestamp: 1,
    crop: 'Corn',
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
  };
}

function renderReports(initialPath = '/reports') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Reports />
    </MemoryRouter>,
  );
}

describe('Reports Pro gate', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.error).mockClear();
    window.print = vi.fn();
    farmState.fields = FIELD_NAMES.map(makeField);
    farmState.plantRecords = FIELD_NAMES.map(makePlant);
    farmState.farm_id = 'farm-1';
    entitlementState.entitlement = freeEntitlement(true);
    entitlementState.cachedEntitlement = freeEntitlement(true);
    entitlementState.loading = false;
    entitlementState.failed = false;
    vi.stubEnv('VITE_BILLING_UI_ENABLED', 'true');
  });

  it('renders a three-row preview, not the full report, for a free enforced farm', () => {
    renderReports();

    const preview = screen.getByTestId('report-preview');
    expect(screen.getAllByTestId('report-preview-row')).toHaveLength(3);
    expect(preview.textContent).toContain('FSA-578 Acreage Certification Worksheet');
    expect(preview.textContent).toContain('Alpha Quarter');
    expect(preview.textContent).toContain('Bravo Quarter');
    expect(preview.textContent).toContain('Charlie Quarter');
    expect(preview.textContent).not.toContain('Delta Quarter');
    expect(document.body.textContent).not.toContain('Delta Quarter');
    expect(preview.querySelector('.report-preview-watermark')?.textContent).toBe(ENTITLEMENT_COPY.reportPreviewLabel);
    expect(preview.className).not.toContain('print:hidden');
    expect(screen.getByText(ENTITLEMENT_COPY.reportLockedTitle)).toBeTruthy();
    expect(screen.getByText(ENTITLEMENT_COPY.reportLockedBody)).toBeTruthy();
    expect(screen.getByRole('link', { name: ENTITLEMENT_COPY.planUpgradeLink }).getAttribute('href'))
      .toBe('/settings?section=billing');
    expect(screen.queryByText('FSA-578 acreage worksheet')).toBeNull();
  });

  it('renders the full report for Pro', () => {
    const paid = { ...freeEntitlement(true), plan: 'paid' as const };
    entitlementState.entitlement = paid;
    entitlementState.cachedEntitlement = paid;
    renderReports();

    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(screen.getByText('FSA-578 acreage worksheet')).toBeTruthy();
    for (const name of FIELD_NAMES) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it('keeps the full report when the plan is not enforced', () => {
    entitlementState.entitlement = freeEntitlement(false);
    entitlementState.cachedEntitlement = freeEntitlement(false);
    renderReports();

    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(document.body.textContent).toContain('Delta Quarter');
  });

  it('shows a loading state instead of the full report while a cached free plan is unresolved', () => {
    entitlementState.entitlement = null;
    entitlementState.loading = true;
    entitlementState.cachedEntitlement = freeEntitlement(true);
    renderReports();

    expect(screen.getByTestId('report-plan-loading').textContent).toBe(ENTITLEMENT_COPY.reportPlanLoading);
    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(screen.queryByText('FSA-578 acreage worksheet')).toBeNull();
    expect(document.body.textContent).not.toContain('Alpha Quarter');
    expect(document.body.textContent).not.toContain('Delta Quarter');
  });

  it('shows a loading state, not the full report, while entitlement is pending with no cache', () => {
    entitlementState.entitlement = null;
    entitlementState.loading = true;
    entitlementState.cachedEntitlement = null;
    entitlementState.failed = false;
    renderReports();

    expect(screen.getByTestId('report-plan-loading').textContent).toBe(ENTITLEMENT_COPY.reportPlanLoading);
    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(screen.queryByText('FSA-578 acreage worksheet')).toBeNull();
    expect(screen.queryAllByTestId('report-preview-row')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Alpha Quarter');
    expect(document.body.textContent).not.toContain('Delta Quarter');
  });

  it('renders the full report while entitlement is pending when a Pro plan is cached', () => {
    const paid = { ...freeEntitlement(true), plan: 'paid' as const };
    entitlementState.entitlement = null;
    entitlementState.loading = true;
    entitlementState.cachedEntitlement = paid;
    entitlementState.failed = false;
    renderReports();

    expect(screen.queryByTestId('report-plan-loading')).toBeNull();
    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(screen.getByText('FSA-578 acreage worksheet')).toBeTruthy();
    for (const name of FIELD_NAMES) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it('does not mount the landlord report while entitlement is pending with no cache', () => {
    entitlementState.entitlement = null;
    entitlementState.loading = true;
    entitlementState.cachedEntitlement = null;
    entitlementState.failed = false;
    renderReports('/reports?tab=landlord-statement');

    expect(screen.getByTestId('report-plan-loading')).toBeTruthy();
    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Landlord Summary' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Farm Owner Summary' })).toBeNull();
    expect(screen.queryByText('Select a landlord to generate their summary')).toBeNull();
    expect(document.body.textContent).not.toContain('Alpha Quarter');
    expect(document.body.textContent).not.toContain('Delta Quarter');
  });

  it('shows the locked preview, not the full report, when the plan check failed with no cache', () => {
    entitlementState.entitlement = null;
    entitlementState.loading = false;
    entitlementState.cachedEntitlement = null;
    entitlementState.failed = true;
    renderReports();

    expect(screen.queryByTestId('report-plan-loading')).toBeNull();
    expect(screen.getAllByTestId('report-preview-row')).toHaveLength(3);
    expect(screen.queryByText('FSA-578 acreage worksheet')).toBeNull();
    expect(document.body.textContent).toContain('Alpha Quarter');
    expect(document.body.textContent).not.toContain('Delta Quarter');
  });

  it('shows the landlord preview, not the full statement, when the plan check failed with no cache', () => {
    entitlementState.entitlement = null;
    entitlementState.loading = false;
    entitlementState.cachedEntitlement = null;
    entitlementState.failed = true;
    renderReports('/reports?tab=landlord-statement');

    expect(screen.queryByTestId('report-plan-loading')).toBeNull();
    expect(screen.getByTestId('report-preview').textContent).toContain('Farm Owner Summary');
    expect(screen.getAllByTestId('report-preview-row')).toHaveLength(3);
    expect(screen.queryByText('Select a landlord to generate their summary')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Landlord Summary' })).toBeNull();
    expect(document.body.textContent).not.toContain('Delta Quarter');
  });

  it('still mounts a free report when the plan check is pending or failed', () => {
    entitlementState.entitlement = null;
    entitlementState.loading = true;
    entitlementState.cachedEntitlement = null;
    entitlementState.failed = false;
    const pending = renderReports('/reports?tab=hay-summary');
    expect(screen.getByText('Hay production summary')).toBeTruthy();
    expect(screen.queryByTestId('report-plan-loading')).toBeNull();
    pending.unmount();

    entitlementState.loading = false;
    entitlementState.failed = true;
    renderReports('/reports?tab=hay-summary');
    expect(screen.getByText('Hay production summary')).toBeTruthy();
    expect(screen.queryByTestId('report-plan-loading')).toBeNull();
    expect(screen.queryByTestId('report-preview')).toBeNull();
  });

  it('still mounts a free report for a free enforced farm', () => {
    renderReports('/reports?tab=hay-summary');
    expect(screen.getByText('Hay production summary')).toBeTruthy();
    expect(screen.queryByTestId('report-preview')).toBeNull();
    expect(document.body.textContent).not.toContain('FSA-578 Acreage Certification Worksheet');
  });

  it('blocks print and CSV export when the server check fails', async () => {
    const paid = { ...freeEntitlement(true), plan: 'paid' as const };
    entitlementState.entitlement = paid;
    entitlementState.cachedEntitlement = paid;
    rpc.mockResolvedValue({ error: { code: '500', message: 'boom' } });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(ENTITLEMENT_COPY.reportCheckFailedToast);
    });
    expect(window.print).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('assert_premium', { p_farm_id: 'farm-1', p_feature: 'reports' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Export CSV' })[0]);
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(2);
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(window.print).not.toHaveBeenCalled();
    createObjectURL.mockRestore();
  });

  it('uses the Pro toast when the server returns premium_required', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0402', message: 'premium_required:reports' } });
    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(ENTITLEMENT_COPY.reportLockedToast);
    });
    expect(window.print).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('prints the preview watermark', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toMatch(/@media print[\s\S]*\.report-preview-watermark/);
  });
});
