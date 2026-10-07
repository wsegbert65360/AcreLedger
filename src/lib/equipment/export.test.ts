import { describe, expect, it } from 'vitest';
import { buildMaintenanceCsv } from './export';
import type { Equipment, MaintenanceLog } from '@/types/equipment';

const equipment: Equipment = {
  id: 'e1', farm_id: 'f1', kind: 'tractor', year: 2020, make: 'John Deere', model: '8R',
  meterUnit: 'hours', currentReading: 100, status: 'active', createdAt: '', updatedAt: '', deleted_at: null,
};

const log: MaintenanceLog = {
  id: 'l1', farm_id: 'f1', equipmentId: 'e1', kind: 'repair', performedOn: '2026-10-06',
  description: 'Seal, hose', costParts: 12.5, costLabor: 5, createdAt: '', updatedAt: '', deleted_at: null,
};

describe('buildMaintenanceCsv', () => {
  it('labels equipment, escapes cells, and totals costs', () => {
    const csv = buildMaintenanceCsv([log], [equipment]);
    expect(csv).toContain('2020 John Deere 8R');
    expect(csv).toContain('"Seal, hose"');
    expect(csv).toContain(',12.5,5,17.5');
  });

  it('omits soft-deleted logs', () => {
    expect(buildMaintenanceCsv([{ ...log, deleted_at: '2026-10-07' }], [equipment]).split('\r\n')).toHaveLength(1);
  });
});
