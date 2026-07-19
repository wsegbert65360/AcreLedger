import { describe, test, expect } from 'vitest';
import {
  generateLandlordStatement,
  generateLandlordStatementCSV,
  getUniqueLandlordNames,
} from './generateLandlordStatement';
import { HarvestRecord } from '../../types/farm';

const mockRecords: HarvestRecord[] = [
  {
    id: '1', farm_id: 'farm-1', fieldId: 'f1', fieldName: 'North 40', landlordName: 'John Smith',
    crop: 'Corn', harvestDate: '2025-10-01', bushels: 4000,
    landlordSplitPercent: 25, timestamp: Date.now(), seasonYear: 2025,
    destination: 'bin', moisturePercent: 15, scaleTicketNumber: 'TKT-00482', deleted_at: null
  },
  {
    id: '2', farm_id: 'farm-1', fieldId: 'f2', fieldName: 'South Field', landlordName: 'John Smith',
    crop: 'Soybeans', harvestDate: '2025-10-15', bushels: 1200,
    landlordSplitPercent: 25, timestamp: Date.now(), seasonYear: 2025,
    destination: 'bin', moisturePercent: 13, deleted_at: null
  },
  {
    id: '3', farm_id: 'farm-1', fieldId: 'f3', fieldName: 'East Quarter', landlordName: 'Mary Jones',
    crop: 'Corn', harvestDate: '2025-10-05', bushels: 6000,
    landlordSplitPercent: 33, timestamp: Date.now(), seasonYear: 2025,
    destination: 'bin', moisturePercent: 15, deleted_at: null
  },
];

describe('generateLandlordStatement', () => {
  test('filters to correct landlord only', () => {
    const stmt = generateLandlordStatement(mockRecords, 'John Smith');
    expect(stmt.rows).toHaveLength(2);
    expect(stmt.rows.every(r => r.fieldName !== 'East Quarter')).toBe(true);
  });

  test('calculates landlord bushels correctly', () => {
    const stmt = generateLandlordStatement(mockRecords, 'John Smith');
    expect(stmt.rows[0].landlordBushels).toBe(1000);   // 4000 * 0.25
    expect(stmt.rows[1].landlordBushels).toBe(300);    // 1200 * 0.25
    expect(stmt.totalLandlordBushels).toBe(1300);
  });

  test('sorts by harvest date ascending', () => {
    const stmt = generateLandlordStatement(mockRecords, 'John Smith');
    expect(stmt.rows[0].fieldName).toBe('North 40');   // Oct 1 before Oct 15
    expect(stmt.rows[1].fieldName).toBe('South Field');
  });

  test('returns empty rows for unknown landlord', () => {
    const stmt = generateLandlordStatement(mockRecords, 'Nobody Here');
    expect(stmt.rows).toHaveLength(0);
    expect(stmt.totalLandlordBushels).toBe(0);
  });

  test('CSV contains header and totals row', () => {
    const stmt = generateLandlordStatement(mockRecords, 'John Smith');
    const csv = generateLandlordStatementCSV(stmt);
    expect(csv).toContain('Field Name');
    expect(csv).toContain('Scale Ticket #');
    expect(csv).toContain('TKT-00482');
    expect(csv).toContain('TOTAL');
    expect(csv).toContain('1300');
  });

  test('scaleTicketNumber is included in statement rows when present', () => {
    const stmt = generateLandlordStatement(mockRecords, 'John Smith');
    expect(stmt.rows[0].scaleTicketNumber).toBe('TKT-00482');
    expect(stmt.rows[1].scaleTicketNumber).toBeUndefined();
  });

  test('getUniqueLandlordNames returns sorted deduped list', () => {
    const names = getUniqueLandlordNames(mockRecords);
    expect(names).toEqual(['John Smith', 'Mary Jones']);
  });
});
