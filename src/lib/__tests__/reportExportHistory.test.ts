import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildReportFingerprint,
  getReportExportStatus,
  readReportExportHistory,
  recordReportExport,
} from '@/lib/reportExportHistory';

const scope = { userId: 'user-1', farmId: 'farm-1', seasonYear: 2026, reportType: 'fsa-plant' as const };

describe('report export history', () => {
  beforeEach(() => localStorage.clear());

  it('creates stable fingerprints regardless of object key order', () => {
    expect(buildReportFingerprint({ b: 2, a: 1 })).toBe(buildReportFingerprint({ a: 1, b: 2 }));
    expect(buildReportFingerprint([{ a: 1 }])).not.toBe(buildReportFingerprint([{ a: 2 }]));
  });

  it('stores history within the user, farm, season, and report scope', () => {
    recordReportExport(scope, 'abc123', '2026-07-13T12:00:00.000Z');
    expect(readReportExportHistory(scope)).toEqual({
      exportedAt: '2026-07-13T12:00:00.000Z',
      fingerprint: 'abc123',
    });
    expect(readReportExportHistory({ ...scope, seasonYear: 2025 })).toBeNull();
  });

  it('reports whether source data changed after the last export', () => {
    expect(getReportExportStatus(scope, 'current')).toEqual({ exportedAt: null, hasChanges: false });
    recordReportExport(scope, 'original', '2026-07-13T12:00:00.000Z');
    expect(getReportExportStatus(scope, 'original')).toEqual({ exportedAt: '2026-07-13T12:00:00.000Z', hasChanges: false });
    expect(getReportExportStatus(scope, 'changed')).toEqual({ exportedAt: '2026-07-13T12:00:00.000Z', hasChanges: true });
  });
});
