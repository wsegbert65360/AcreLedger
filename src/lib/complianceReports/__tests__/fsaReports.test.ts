import { describe, it, expect } from 'vitest';
import { buildFsa578Rows, generateMissouriLogRows } from '../fsaReports';
import { SprayRecord, Field } from '../../../types/farm';
import type { FieldCluAssignment, FsaTractImport } from '../../../types/fsaTract';

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
        expect(rows[0]).toContain('"50"'); // Should use treatedAreaSize 50, not field acreage 100
    });
});

describe('FSA 578 report rows', () => {
    it('splits planted crop acreage by assigned cropland CLU numbers', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Bottom Field',
            acreage: 40,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
            fsaFieldNumber: '1',
            deleted_at: null
        };

        const plantRecord = {
            id: 'plant-1',
            fieldId: 'field-1',
            fieldName: 'Bottom Field',
            crop: 'Soybeans',
            seedVariety: 'AG38XF3',
            acreage: 40,
            timestamp: new Date('2026-05-01T12:00:00.000Z').getTime(),
            seasonYear: 2026,
            deleted_at: null
        };

        const assignments: FieldCluAssignment[] = [
            {
                id: 'assignment-1',
                farmId: 'farm-1',
                fieldId: 'field-1',
                tractKey: '918-1327',
                cluNumber: '1',
                acres: 32.41,
                landUse: 'cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            },
            {
                id: 'assignment-2',
                farmId: 'farm-1',
                fieldId: 'field-1',
                tractKey: '918-1327',
                cluNumber: '6',
                acres: 0.33,
                landUse: 'cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            }
        ];

        const rows = buildFsa578Rows([plantRecord], [field], assignments);

        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.fieldNumber)).toEqual(['1', '6']);
        expect(rows.map(row => row.acreage)).toEqual([32.41, 0.33]);
        expect(rows.every(row => row.crop === 'Soybeans')).toBe(true);
        expect(rows.every(row => row.landUse === 'Cropland')).toBe(true);
    });

    it('splits legacy planted fields by stored CLU numbers when no assignments exist', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Behind Grandma',
            acreage: 36,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '6418',
            fsaTractNumber: '1417',
            cluNumbers: ['2', '7'],
            deleted_at: null
        };

        const plantRecord = {
            id: 'plant-1',
            fieldId: 'field-1',
            fieldName: 'Behind Grandma',
            crop: 'Soybeans',
            seedVariety: 'Eisenhower 2639e',
            acreage: 36,
            timestamp: new Date('2026-06-10T12:00:00.000Z').getTime(),
            seasonYear: 2026,
            deleted_at: null
        };

        const tract: FsaTractImport = {
            id: 'tract-1',
            farmId: 'farm-1',
            tractKey: '6418-1417',
            filename: 'F6418_T1417.json',
            featureCount: 2,
            importedAt: '2026-06-16T00:00:00.000Z',
            deletedAt: null,
            geojson: {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
                        properties: { cluNumber: '2', acres: 28.26 }
                    },
                    {
                        type: 'Feature',
                        geometry: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] },
                        properties: { cluNumber: '7', acres: 0.64 }
                    }
                ]
            }
        };

        const rows = buildFsa578Rows([plantRecord], [field], [], [tract]);

        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.fieldNumber)).toEqual(['2', '7']);
        expect(rows.map(row => row.acreage)).toEqual([28.26, 0.64]);
        expect(rows.every(row => row.farmNumber === '6418')).toBe(true);
        expect(rows.every(row => row.tractNumber === '1417')).toBe(true);
    });

    it('uses the latest planting date and variety when a field has multiple planting records', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Hensley',
            acreage: 40,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '4251',
            fsaTractNumber: '9747',
            cluNumbers: ['2'],
            deleted_at: null
        };

        const olderPlantRecord = {
            id: 'plant-old',
            fieldId: 'field-1',
            fieldName: 'Hensley',
            crop: 'Soybeans',
            seedVariety: 'Old Variety',
            acreage: 40,
            plantDate: '2026-06-10',
            timestamp: new Date('2026-06-10T12:00:00.000Z').getTime(),
            seasonYear: 2026,
            deleted_at: null
        };

        const updatedPlantRecord = {
            ...olderPlantRecord,
            id: 'plant-new',
            seedVariety: 'Eisenhower 2639e',
            plantDate: '2026-06-11',
            timestamp: new Date('2026-06-11T12:00:00.000Z').getTime(),
        };

        const tract: FsaTractImport = {
            id: 'tract-1',
            farmId: 'farm-1',
            tractKey: '4251-9747',
            filename: 'F4251_T9747.json',
            featureCount: 1,
            importedAt: '2026-06-16T00:00:00.000Z',
            deletedAt: null,
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
                    properties: { cluNumber: '2', acres: 28.26 }
                }]
            }
        };

        const rows = buildFsa578Rows([olderPlantRecord, updatedPlantRecord], [field], [], [tract]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            date: '2026-06-11',
            seedVariety: 'Eisenhower 2639e',
            fieldNumber: '2',
            acreage: 28.26
        });
    });

    it('infers a single CLU number from the imported tract polygon when legacy fields lack cluNumbers', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Medford',
            acreage: 32,
            lat: 0.5,
            lng: 0.5,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
            deleted_at: null
        };

        const plantRecord = {
            id: 'plant-1',
            fieldId: 'field-1',
            fieldName: 'Medford',
            crop: 'Soybeans',
            seedVariety: 'Kentucky 1936E',
            acreage: 32,
            plantDate: '2026-06-05',
            timestamp: new Date('2026-06-05T12:00:00.000Z').getTime(),
            seasonYear: 2026,
            deleted_at: null
        };

        const tract: FsaTractImport = {
            id: 'tract-1',
            farmId: 'farm-1',
            tractKey: '918-1327',
            filename: 'F918_T1327_MEFFORD.json',
            featureCount: 1,
            importedAt: '2026-06-16T00:00:00.000Z',
            deletedAt: null,
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
                    properties: { cluNumber: '1', acres: 32.41 }
                }]
            }
        };

        const rows = buildFsa578Rows([plantRecord], [field], [], [tract]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            fieldNumber: '1',
            acreage: 32.41,
            farmNumber: '918',
            tractNumber: '1327'
        });
    });

    it('includes non-cropland CLU assignments without creating crop rows', () => {
        const field: Field = {
            id: 'field-1',
            name: 'North 80',
            acreage: 80,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            fsaFieldNumber: '7',
            producerShare: 100,
            deleted_at: null
        };

        const assignment: FieldCluAssignment = {
            id: 'assignment-1',
            farmId: 'farm-1',
            fieldId: 'field-1',
            tractKey: '123-456',
            cluNumber: '25',
            acres: 3.5,
            landUse: 'non_cropland',
            assignedAt: '2026-06-16T00:00:00.000Z',
            deletedAt: null
        };

        const rows = buildFsa578Rows([], [field], [assignment]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            fieldName: 'North 80',
            acreage: 3.5,
            crop: '',
            intendedUse: 'Non-cropland',
            landUse: 'Non-cropland',
            farmNumber: '123',
            tractNumber: '456',
            fieldNumber: '25'
        });
    });
});
