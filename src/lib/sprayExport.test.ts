import { describe, it, expect } from 'vitest';
import { 
  formatNumber, 
  formatUnit, 
  getComplianceStatus, 
  getChronologicalDateRange,
  getRecordOmissions,
  formatTime, 
  formatReportDate,
  sanitizeFilename 
} from './sprayExportFormatters';

describe('sprayExportFormatters', () => {
  describe('formatNumber', () => {
    it('formats numbers with up to 2 decimal places', () => {
      expect(formatNumber(10.1234)).toBe('10.12');
      expect(formatNumber(10.1)).toBe('10.1');
      expect(formatNumber(10)).toBe('10');
    });

    it('handles null/undefined with a dash', () => {
      expect(formatNumber(null)).toBe('-');
      expect(formatNumber(undefined)).toBe('-');
    });
  });

  describe('formatUnit', () => {
    it('lowercases units', () => {
      expect(formatUnit('OZ/AC')).toBe('oz/ac');
    });

    it('handles empty units', () => {
      expect(formatUnit('')).toBe('');
      expect(formatUnit(null)).toBe('');
    });
  });

  describe('getComplianceStatus', () => {
    it('returns complete for compliant records', () => {
      expect(getComplianceStatus(false)).toContain('Complete');
      expect(getComplianceStatus(undefined)).toContain('Complete');
    });

    it('returns warning for non-compliant records', () => {
      expect(getComplianceStatus(true)).toContain('Warning');
    });

    it('requires review when export-visible values are missing', () => {
      expect(getComplianceStatus(false, ['temperature'])).toContain('Review needed');
    });
  });

  describe('formatTime', () => {
    it('formats HH:mm strings to 12h format', () => {
      expect(formatTime('08:30')).toBe('8:30 AM');
      expect(formatTime('14:45')).toBe('2:45 PM');
      expect(formatTime('12:00')).toBe('12:00 PM');
      expect(formatTime('00:00')).toBe('12:00 AM');
    });

    it('handles null/empty times', () => {
      expect(formatTime('')).toBe('-');
      expect(formatTime(null)).toBe('-');
    });

    it('normalizes HH:mm:ss values to the same 12-hour format', () => {
      expect(formatTime('17:07:00')).toBe('5:07 PM');
    });
  });

  describe('spray report completeness', () => {
    it('derives the actual chronological range regardless of input order', () => {
      const records = [
        { sprayDate: '2026-06-24' },
        { sprayDate: '2026-03-29' },
      ] as never;
      expect(getChronologicalDateRange(records)).toEqual({ start: '2026-03-29', end: '2026-06-24' });
    });

    it('reports missing product totals and weather values', () => {
      const record = {
        temperature: 0,
        relativeHumidity: undefined,
        products: [{ product: 'Test', rate: '1', rateUnit: 'qt/ac' }],
      } as never;
      expect(getRecordOmissions(record)).toEqual(['relative humidity', 'one or more product totals']);
    });
  });

  describe('formatReportDate', () => {
    it('formats ISO dates correctly', () => {
      expect(typeof formatReportDate('2024-03-25')).toBe('string');
      expect(formatReportDate('')).toBe('-');
    });
  });

  describe('sanitizeFilename', () => {
    it('removes illegal characters', () => {
      expect(sanitizeFilename('My Farm: Log?')).toBe('My_Farm__Log_');
      expect(sanitizeFilename('Fields/2026*')).toBe('Fields_2026_');
    });

    it('replaces spaces with underscores', () => {
      expect(sanitizeFilename('Spray Log 2026')).toBe('Spray_Log_2026');
    });
  });
});
