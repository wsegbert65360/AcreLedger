import { describe, expect, it, vi } from 'vitest';

import { authorizeReportExport } from '../authorizeReportExport';

const clientWith = (result: unknown) => ({ rpc: vi.fn(async () => result) });

describe('authorizeReportExport', () => {
  it('asks the server for paid reports and allows when it answers ok', async () => {
    const client = clientWith({ error: null });
    expect(await authorizeReportExport(client, 'farm-1', 'fsa-plant')).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('assert_premium', { p_farm_id: 'farm-1', p_feature: 'reports' });
  });

  it('blocks only on an explicit premium_required answer', async () => {
    expect(await authorizeReportExport(clientWith({ error: { code: 'P0402', message: 'premium_required:reports' } }), 'farm-1', 'fsa-plant')).toBe(false);
    expect(await authorizeReportExport(clientWith({ error: { message: 'premium_required:reports' } }), 'farm-1', 'spray-audit')).toBe(false);
  });

  it('fails open on other errors and when offline', async () => {
    expect(await authorizeReportExport(clientWith({ error: { code: '500', message: 'boom' } }), 'farm-1', 'fsa-plant')).toBe(true);
    const offline = { rpc: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) };
    expect(await authorizeReportExport(offline, 'farm-1', 'fsa-plant')).toBe(true);
  });

  it('never calls the server for free reports or without a farm', async () => {
    const client = clientWith({ error: { code: 'P0402', message: 'premium_required:reports' } });
    expect(await authorizeReportExport(client, 'farm-1', 'fall-fsa')).toBe(true);
    expect(await authorizeReportExport(client, null, 'fsa-plant')).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
