import { describe, expect, it, vi } from 'vitest';

import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { authorizeReportExport, reportExportDeniedMessage } from '../authorizeReportExport';

const clientWith = (result: unknown) => ({ rpc: vi.fn(async () => result) });

describe('authorizeReportExport', () => {
  it('allows a paid report only when assert_premium returns with no error', async () => {
    const client = clientWith({ data: null, error: null });
    const decision = await authorizeReportExport(client, 'farm-1', 'fsa-plant');
    expect(decision.allowed).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('assert_premium', { p_farm_id: 'farm-1', p_feature: 'reports' });
  });

  it('denies when the server raises premium_required', async () => {
    const byCode = await authorizeReportExport(
      clientWith({ error: { code: 'P0402', message: 'premium_required:reports' } }),
      'farm-1',
      'fsa-plant',
    );
    const byMessage = await authorizeReportExport(
      clientWith({ error: { message: 'premium_required:reports' } }),
      'farm-1',
      'spray-audit',
    );
    expect(byCode).toEqual({ allowed: false, reason: 'premium_required' });
    expect(byMessage).toEqual({ allowed: false, reason: 'premium_required' });
    expect(reportExportDeniedMessage('premium_required')).toBe(ENTITLEMENT_COPY.reportLockedToast);
  });

  it('denies on any other error, a thrown exception, or a missing response', async () => {
    const other = await authorizeReportExport(
      clientWith({ error: { code: '500', message: 'boom' } }),
      'farm-1',
      'fsa-plant',
    );
    const offline = { rpc: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) };
    const thrown = await authorizeReportExport(offline, 'farm-1', 'fsa-plant');
    const missing = await authorizeReportExport(clientWith(undefined), 'farm-1', 'fertilizer-summary');
    expect(other).toEqual({ allowed: false, reason: 'unavailable' });
    expect(thrown).toEqual({ allowed: false, reason: 'unavailable' });
    expect(missing).toEqual({ allowed: false, reason: 'unavailable' });
    expect(reportExportDeniedMessage('unavailable')).toBe(ENTITLEMENT_COPY.reportCheckFailedToast);
  });

  it('asks the server for every prepared report, and a free farm is denied each one', async () => {
    const prepared = [
      'fsa-plant', 'fsa-harvest', 'spray-audit', 'fertilizer-summary', 'hay-summary',
      'landlord-statement', 'farm-owner-summary',
    ];
    for (const reportType of prepared) {
      const client = clientWith({ error: { code: 'P0402', message: 'premium_required:reports' } });
      expect(await authorizeReportExport(client, 'farm-1', reportType)).toEqual({ allowed: false, reason: 'premium_required' });
      expect(client.rpc).toHaveBeenCalledWith('assert_premium', { p_farm_id: 'farm-1', p_feature: 'reports' });
    }
  });

  it('allows every prepared report for paid and complimentary farms', async () => {
    for (const reportType of ['fsa-harvest', 'hay-summary', 'landlord-statement', 'farm-owner-summary']) {
      expect(await authorizeReportExport(clientWith({ data: null, error: null }), 'farm-1', reportType)).toEqual({ allowed: true });
    }
  });

  it('never calls the server for non-report exports or without a farm', async () => {
    const client = clientWith({ error: { code: 'P0402', message: 'premium_required:reports' } });
    expect(await authorizeReportExport(client, 'farm-1', 'work-requests')).toEqual({ allowed: true });
    expect(await authorizeReportExport(client, null, 'fsa-plant')).toEqual({ allowed: true });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
