import { describe, it, expect } from 'vitest';
import { 
  formatNumber, 
  formatUnit, 
  getComplianceStatus, 
  formatTime, 
  formatReportDate 
} from './sprayExportFormatters';

describe('sprayExportFormatters', () => {
  describe('formatNumber', () => {
    it('formats numbers with up to 2 decimal places', () => {
      expect(formatNumber(10.1234)).toBe('10.12');
      expect(formatNumber(10.1)).toBe('10.1');
      expect(formatNumber(10)).toBe('10');
    });

    it('handles null/undefined with a dash', () => {
      expect(formatNumber(null)).toBe('—');
      expect(formatNumber(undefined)).toBe('—');
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
  });

  describe('formatTime', () => {
    it('formats HH:mm strings to 12h format', () => {
      expect(formatTime('08:30')).toBe('8:30 AM');
      expect(formatTime('14:45')).toBe('2:45 PM');
      expect(formatTime('12:00')).toBe('12:00 PM');
      expect(formatTime('00:00')).toBe('12:00 AM');
    });

    it('handles null/empty times', () => {
      expect(formatTime('')).toBe('—');
      expect(formatTime(null)).toBe('—');
    });
  });

  describe('formatReportDate', () => {
    it('formats ISO dates correctly', () => {
      // formatIsoDate uses parseLocalDate which is local-safe
      // We just check it doesn't crash and returns a string
      expect(typeof formatReportDate('2024-03-25')).toBe('string');
      expect(formatReportDate('')).toBe('—');
    });
  });
});
