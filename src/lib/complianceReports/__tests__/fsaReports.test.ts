import { describe, it, expect } from 'vitest';
import { generateMissouriLogRows } from '../fsaReports';
import { SprayRecord, Field } from '../../../types/farm';

describe('Missouri Log Generation', () => {
    it('should split tank-mix into multiple rows (Missouri Log requirement)', () => {
        const field: Field = {
            id: 'field-1',
            name: 'North 80',
            acreage: 80,
            lat: 39,
            lng: -94,
            deleted_at: null
        };

        const spray: SprayRecord = {
            id: 'spray-1',
            fieldId: 'field-1',
            fieldName: 'North 80',
            products: [
                { product: 'Enlist Duo', rate: '2.5', rateUnit: 'pt/ac', epaRegNumber: '62719-649' },
                { product: 'Liberty', rate: '32', rateUnit: 'oz/ac', epaRegNumber: '7969-347' }
            ],
            windSpeed: 8,
            temperature: 72,
            timestamp: Date.now(),
            seasonYear: 2026,
            treatedAreaSize: 80,
            totalAmountApplied: 200,
            applicatorName: 'John Doe',
            licenseNumber: 'MO-12345',
            deleted_at: null
        };

        const rows = generateMissouriLogRows([spray], [field]);
        
        // Should have 2 rows for the 2 products
        expect(rows.length).toBe(2);
        
        // Check first row (Enlist)
        expect(rows[0]).toContain('Enlist Duo');
        expect(rows[0]).toContain('62719-649');
        
        // Check second row (Liberty)
        expect(rows[1]).toContain('Liberty');
        expect(rows[1]).toContain('7969-347');
        
        // Check that common data is replicated
        expect(rows[0]).toContain('John Doe');
        expect(rows[1]).toContain('John Doe');
        expect(rows[0]).toContain('North 80');
        expect(rows[1]).toContain('North 80');
    });

    it('should use treatedAreaSize first, then fall back to field acreage', () => {
        const field: Field = { id: 'f1', name: 'F1', acreage: 100, lat: 0, lng: 0, deleted_at: null };
        const spray: SprayRecord = {
            id: 's1', fieldId: 'f1', fieldName: 'F1',
            products: [{ product: 'P1', rate: '1', rateUnit: 'oz', epaRegNumber: '123' }],
            windSpeed: 0, temperature: 0, timestamp: 0, seasonYear: 2026,
            treatedAreaSize: 50, // Partial field
            deleted_at: null
        };

        const rows = generateMissouriLogRows([spray], [field]);
        expect(rows[0]).toContain(',\"50\",'); // Should use 50, not 100
    });
});
