import { describe, it, expect } from 'vitest';
import {
    buildFsa578Rows,
    buildFsa578WorksheetCsv,
    buildFsaFallProductionCsv,
    buildFsaFallProductionRows,
    calculateFsa578PlantedAcreTotals,
    generateMissouriLogRows,
    validateFsa578Rows,
    validateFsaFallProductionRows
} from '../fsaReports';
import { SprayRecord, Field, PlantRecord, HarvestRecord, HayHarvestRecord } from '../../../types/farm';
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

    it('keeps multiple planting records as separate FSA acreage rows', () => {
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
            cropStatus: 'Cover Crop' as const,
            plantingPattern: 'Double crop',
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

        expect(rows).toHaveLength(2);
        expect(rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                date: '2026-06-10',
                seedVariety: 'Old Variety',
                fieldNumber: '2',
                acreage: 28.26,
                cropStatus: 'Planted',
            }),
            expect.objectContaining({
                date: '2026-06-11',
                seedVariety: 'Eisenhower 2639e',
                fieldNumber: '2',
                acreage: 28.26,
                cropStatus: 'Cover Crop',
                plantingPattern: 'Double crop',
            }),
        ]));
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

    it('labels pasture and hay ground as the crop on non-cropland FSA worksheet rows', () => {
        const pastureField: Field = {
            id: 'pasture-1',
            name: 'South Pasture',
            acreage: 20,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            intendedUse: 'Pasture',
            deleted_at: null
        };

        const hayField: Field = {
            id: 'hay-1',
            name: 'East Hay Ground',
            acreage: 15,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            intendedUse: 'Hay Ground',
            deleted_at: null
        };

        const assignments: FieldCluAssignment[] = [
            {
                id: 'pasture-assignment',
                farmId: 'farm-1',
                fieldId: 'pasture-1',
                tractKey: '123-456',
                cluNumber: '30',
                acres: 20,
                landUse: 'non_cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            },
            {
                id: 'hay-assignment',
                farmId: 'farm-1',
                fieldId: 'hay-1',
                tractKey: '123-456',
                cluNumber: '31',
                acres: 15,
                landUse: 'non_cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            }
        ];

        const rows = buildFsa578Rows([], [pastureField, hayField], assignments);

        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.crop)).toEqual(['Pasture', 'Hay Ground']);
        expect(rows.map(row => row.intendedUse)).toEqual(['Pasture', 'Hay Ground']);
        expect(rows.every(row => row.landUse === 'Non-cropland')).toBe(true);
    });

    it('calculates planted totals from cropland rows only', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Bottom Field',
            acreage: 40,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
            intendedUse: 'Grain',
            deleted_at: null
        };

        const plantRecord: PlantRecord = {
            id: 'plant-1',
            fieldId: 'field-1',
            fieldName: 'Bottom Field',
            crop: 'Soybeans',
            seedVariety: 'AG38XF3',
            acreage: 40,
            plantDate: '2026-05-01',
            timestamp: new Date('2026-05-01T12:00:00Z').getTime(),
            seasonYear: 2026,
            deleted_at: null
        };

        const assignments: FieldCluAssignment[] = [
            {
                id: 'cropland-assignment',
                farmId: 'farm-1',
                fieldId: 'field-1',
                tractKey: '918-1327',
                cluNumber: '1',
                acres: 32,
                landUse: 'cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            },
            {
                id: 'non-cropland-assignment',
                farmId: 'farm-1',
                fieldId: 'field-1',
                tractKey: '918-1327',
                cluNumber: '2',
                acres: 8,
                landUse: 'non_cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            }
        ];

        const rows = buildFsa578Rows([plantRecord], [field], assignments);
        const totals = calculateFsa578PlantedAcreTotals(rows);

        expect(rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ acreage: 32, landUse: 'Cropland' }),
            expect.objectContaining({ acreage: 8, landUse: 'Non-cropland', crop: 'Grain' }),
        ]));
        expect(totals.totalAcres).toBe(32);
        expect(totals.byField).toEqual([{ fieldName: 'Bottom Field', acres: 32 }]);
    });

    it('includes assigned cropland that has no planting record for FSA review', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Unreported North',
            acreage: 24,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
            intendedUse: 'Grain',
            deleted_at: null
        };

        const assignments: FieldCluAssignment[] = [{
            id: 'cropland-assignment',
            farmId: 'farm-1',
            fieldId: 'field-1',
            tractKey: '918-1327',
            cluNumber: '4',
            acres: 24,
            landUse: 'cropland',
            assignedAt: '2026-06-16T00:00:00.000Z',
            deletedAt: null
        }];

        const rows = buildFsa578Rows([], [field], assignments);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            fieldName: 'Unreported North',
            landUse: 'Cropland',
            crop: '',
            acreage: 24,
            notes: 'Assigned cropland has no planting or prevented/failed status recorded.',
        });
        expect(validateFsa578Rows(rows)).toEqual(expect.arrayContaining([
            expect.objectContaining({ severity: 'error', field: 'crop' }),
        ]));
    });

    it('uses hay or pasture field use as the crop for assigned cropland readiness', () => {
        const pastureField: Field = {
            id: 'pasture-1',
            name: 'South Pasture',
            acreage: 20,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            intendedUse: 'Pasture',
            deleted_at: null
        };

        const hayField: Field = {
            id: 'hay-1',
            name: 'East Hay Ground',
            acreage: 15,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            intendedUse: 'Hay Ground',
            deleted_at: null
        };

        const assignments: FieldCluAssignment[] = [
            {
                id: 'pasture-assignment',
                farmId: 'farm-1',
                fieldId: 'pasture-1',
                tractKey: '123-456',
                cluNumber: '30',
                acres: 20,
                landUse: 'cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            },
            {
                id: 'hay-assignment',
                farmId: 'farm-1',
                fieldId: 'hay-1',
                tractKey: '123-456',
                cluNumber: '31',
                acres: 15,
                landUse: 'cropland',
                assignedAt: '2026-06-16T00:00:00.000Z',
                deletedAt: null
            }
        ];

        const rows = buildFsa578Rows([], [pastureField, hayField], assignments);

        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.crop)).toEqual(['Pasture', 'Hay Ground']);
        expect(rows.map(row => row.notes)).toEqual(['', '']);
        expect(validateFsa578Rows(rows).filter(issue => issue.field === 'crop')).toEqual([]);
    });

    it('defaults planted rows to planted status without untracked certifications', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Bottom Field',
            acreage: 40,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
            fsaFieldNumber: '1',
            producerShare: 100,
            deleted_at: null
        };

        const plantRecord = {
            id: 'plant-1',
            fieldId: 'field-1',
            fieldName: 'Bottom Field',
            crop: 'Corn',
            seedVariety: 'Pioneer 1185',
            acreage: 40,
            plantDate: '2026-04-20',
            timestamp: new Date('2026-04-20T12:00:00.000Z').getTime(),
            seasonYear: 2026,
            deleted_at: null
        };

        const rows = buildFsa578Rows([plantRecord], [field]);

        expect(rows[0]).toMatchObject({
            cropStatus: 'Planted',
            notes: ''
        });
        expect(rows[0].cropSequence).toBeUndefined();
        expect(rows[0].organicStatus).toBeUndefined();
    });

    it('validates missing FSA worksheet data with error and warning severity', () => {
        const issues = validateFsa578Rows([
            {
                id: 'row-1',
                date: '2026-05-01',
                fieldName: 'Problem Field',
                farmNumber: '',
                tractNumber: '',
                fieldNumber: '',
                acreage: 0,
                crop: '',
                seedVariety: '',
                intendedUse: '',
                irrigationCode: 'NI',
                producerShare: '100%',
                landUse: 'Cropland',
            }
        ]);

        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ severity: 'error', field: 'farmNumber' }),
            expect.objectContaining({ severity: 'error', field: 'tractNumber' }),
            expect.objectContaining({ severity: 'warning', field: 'fieldNumber' }),
            expect.objectContaining({ severity: 'error', field: 'crop' }),
            expect.objectContaining({ severity: 'error', field: 'acreage' }),
        ]));
    });

    it('treats whitespace-only FSA worksheet fields as missing', () => {
        const issues = validateFsa578Rows([
            {
                id: 'row-1',
                date: '2026-05-01',
                fieldName: 'Whitespace Field',
                farmNumber: '   ',
                tractNumber: '\t',
                fieldNumber: '  ',
                acreage: 12,
                crop: '   ',
                seedVariety: '',
                intendedUse: '',
                irrigationCode: 'NI',
                producerShare: '100%',
                landUse: 'Cropland',
            }
        ]);

        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ severity: 'error', field: 'farmNumber' }),
            expect.objectContaining({ severity: 'error', field: 'tractNumber' }),
            expect.objectContaining({ severity: 'warning', field: 'fieldNumber' }),
            expect.objectContaining({ severity: 'error', field: 'crop' }),
        ]));
    });

    it('returns no validation issues for a complete FSA worksheet row', () => {
        const issues = validateFsa578Rows([
            {
                id: 'row-1',
                date: '2026-05-01',
                fieldName: 'Ready Field',
                farmNumber: '918',
                tractNumber: '1327',
                fieldNumber: '1',
                acreage: 32.41,
                crop: 'Soybeans',
                seedVariety: 'AG38XF3',
                intendedUse: 'Grain',
                irrigationCode: 'NI',
                producerShare: '100%',
                landUse: 'Cropland',
            }
        ]);

        expect(issues).toEqual([]);
    });

    it('builds farmer-facing FSA-578 worksheet CSV with crop year and disclaimer columns', () => {
        const csv = buildFsa578WorksheetCsv({
            metadata: {
                farmName: 'AcreLedger Test Farm',
                producerName: 'Jane Farmer',
                county: 'Lafayette',
                state: 'MO',
                cropYear: 2026,
                reportDate: '2026-06-17',
            },
            rows: [{
                id: 'row-1',
                date: '2026-05-01',
                fieldName: 'Ready Field',
                farmNumber: '918',
                tractNumber: '1327',
                fieldNumber: '1',
                acreage: 32.41,
                crop: 'Soybeans',
                seedVariety: 'AG38XF3',
                intendedUse: 'Grain',
                irrigationCode: 'NI',
                producerShare: '100%',
                landUse: 'Cropland',
                cropStatus: 'Planted',
                cropSequence: 'Initial',
                organicStatus: 'Conventional',
                notes: 'Review with county office',
            }]
        });

        expect(csv).toContain('FSA-578 Acreage Certification Worksheet');
        expect(csv).toContain('Not an official USDA form');
        expect(csv).toContain('Crop Year');
        expect(csv).toContain('"2026"');
        expect(csv).toContain('"AcreLedger Test Farm"');
        expect(csv).not.toContain('"AcreLedger Field"');
        expect(csv).toContain('"Field Name"');
        expect(csv).toContain('"Type / Variety"');
        expect(csv).toContain('"Ready Field"');
        expect(csv).toContain('"Planted"');
    });

    it('does not duplicate rows when field CLU numbers are repeated', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Behind Grandma',
            acreage: 36,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '6418',
            fsaTractNumber: '1417',
            cluNumbers: ['2', '7', '2'], // duplicate '2'
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
    });

    it('does not duplicate rows when farm/tract numbers are repeated', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Behind Grandma',
            acreage: 36,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '6418/6418',
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
    });

    it('does not duplicate rows when active CLU assignments are repeated', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Bottom Field',
            acreage: 40,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
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
                cluNumber: '1', // duplicate CLU
                acres: 32.41,
                landUse: 'cropland',
                assignedAt: '2026-06-17T00:00:00.000Z',
                deletedAt: null
            }
        ];

        const rows = buildFsa578Rows([plantRecord], [field], assignments);

        expect(rows).toHaveLength(1);
        expect(rows[0].fieldNumber).toBe('1');
        expect(rows[0].acreage).toBe(32.41);
    });
});

describe('FSA fall harvest production report rows', () => {
    it('builds corn soybean wheat production rows with FSA identifiers and evidence fields', () => {
        const field: Field = {
            id: 'field-1',
            name: 'Bottom Field',
            acreage: 40,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '918',
            fsaTractNumber: '1327',
            deleted_at: null,
        };

        const harvestRecord: HarvestRecord = {
            id: 'harvest-1',
            fieldId: 'field-1',
            fieldName: 'Bottom Field',
            crop: 'Corn',
            destination: 'town',
            moisturePercent: 16.2,
            landlordSplitPercent: 0,
            bushels: 7200,
            harvestDate: '2026-10-12',
            timestamp: new Date('2026-10-12T00:00:00.000Z').getTime(),
            seasonYear: 2026,
            scaleTicketNumber: 'TCK-1001',
            deleted_at: null,
        };

        const rows = buildFsaFallProductionRows({
            harvestRecords: [harvestRecord],
            hayRecords: [],
            fields: [field],
        });

        expect(rows.grainRows[0]).toMatchObject({
            recordType: 'grain',
            fieldName: 'Bottom Field',
            crop: 'Corn',
            farmNumber: '918',
            tractNumber: '1327',
            production: 7200,
            productionUnit: 'bu',
            moisturePercent: 16.2,
            destination: 'Elevator/Sale',
            evidenceReference: 'TCK-1001',
        });
    });

    it('builds hay production rows with bale count and FSA identifiers', () => {
        const field: Field = {
            id: 'hay-field',
            name: 'East Hay Ground',
            acreage: 15,
            lat: 39,
            lng: -94,
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            intendedUse: 'Hay Ground',
            deleted_at: null,
        };

        const hayRecord: HayHarvestRecord = {
            id: 'hay-1',
            fieldId: 'hay-field',
            fieldName: 'East Hay Ground',
            date: '2026-07-01',
            baleCount: 38,
            cuttingNumber: 1,
            baleType: 'Round',
            timestamp: new Date('2026-07-01T00:00:00.000Z').getTime(),
            seasonYear: 2026,
            deleted_at: null,
        };

        const rows = buildFsaFallProductionRows({
            harvestRecords: [],
            hayRecords: [hayRecord],
            fields: [field],
        });

        expect(rows.hayRows[0]).toMatchObject({
            recordType: 'hay',
            fieldName: 'East Hay Ground',
            crop: 'Hay Ground',
            farmNumber: '123',
            tractNumber: '456',
            production: 38,
            productionUnit: 'bales',
            destination: 'On-Farm / Hay Storage',
            evidenceReference: 'Cutting 1',
            notes: 'Cutting 1, Round bales',
        });
    });

    it('warns when fall production rows are missing FSA or evidence fields', () => {
        const issues = validateFsaFallProductionRows([{
            id: 'row-1',
            recordType: 'grain',
            fieldName: 'Problem Corn',
            crop: 'Corn',
            farmNumber: '',
            tractNumber: '',
            harvestDate: '',
            production: 0,
            productionUnit: 'bu',
            destination: '',
            evidenceReference: '',
            notes: '',
        }]);

        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ severity: 'error', field: 'farmNumber' }),
            expect.objectContaining({ severity: 'error', field: 'tractNumber' }),
            expect.objectContaining({ severity: 'error', field: 'harvestDate' }),
            expect.objectContaining({ severity: 'error', field: 'production' }),
            expect.objectContaining({ severity: 'warning', field: 'destination' }),
            expect.objectContaining({ severity: 'warning', field: 'evidenceReference' }),
        ]));
    });

    it('builds fall production CSV with grain and hay rows', () => {
        const csv = buildFsaFallProductionCsv({
            metadata: {
                farmName: 'AcreLedger Test Farm',
                cropYear: 2026,
                reportDate: '2026-11-01',
            },
            rows: [
                {
                    id: 'grain-1',
                    recordType: 'grain',
                    fieldName: 'Bottom Field',
                    crop: 'Corn',
                    farmNumber: '918',
                    tractNumber: '1327',
                    harvestDate: '2026-10-12',
                    production: 7200,
                    productionUnit: 'bu',
                    moisturePercent: 16.2,
                    destination: 'Elevator/Sale',
                    evidenceReference: 'TCK-1001',
                    landlordSplitPercent: 0,
                    notes: '',
                },
                {
                    id: 'hay-1',
                    recordType: 'hay',
                    fieldName: 'East Hay Ground',
                    crop: 'Hay Ground',
                    farmNumber: '123',
                    tractNumber: '456',
                    harvestDate: '2026-07-01',
                    production: 38,
                    productionUnit: 'bales',
                    destination: 'On-Farm / Hay Storage',
                    evidenceReference: 'Cutting 1',
                    notes: 'Cutting 1, Round bales',
                },
            ],
        });

        expect(csv).toContain('FSA Fall Harvest / Production Evidence Worksheet');
        expect(csv).toContain('Not an official USDA form');
        expect(csv).toContain('"Corn"');
        expect(csv).toContain('"7200"');
        expect(csv).toContain('"TCK-1001"');
        expect(csv).toContain('"Hay Ground"');
        expect(csv).toContain('"38"');
    });

    it('does not create fall production rows for pasture without a production record', () => {
        const pastureField: Field = {
            id: 'pasture-1',
            name: 'South Pasture',
            acreage: 20,
            lat: 39,
            lng: -94,
            intendedUse: 'Pasture',
            fsaFarmNumber: '123',
            fsaTractNumber: '456',
            deleted_at: null,
        };

        const rows = buildFsaFallProductionRows({
            harvestRecords: [],
            hayRecords: [],
            fields: [pastureField],
        });

        expect(rows.grainRows).toEqual([]);
        expect(rows.hayRows).toEqual([]);
    });
});
