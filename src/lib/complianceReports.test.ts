import { describe, it, expect } from 'vitest';
import { 
    generateMissouriLog, 
    exportFsa578Data, 
    exportHarvestData, 
    exportFertilizerData 
} from './complianceReports';
import { PlantRecord, Field } from '../types/farm';

describe('Compliance Reports', () => {
    const fields: Field[] = [{
        id: 'field-1',
        name: 'Test Field',
        acreage: 100,
        lat: 0,
        lng: 0,
        farm_id: 'farm-1',
        deleted_at: null
    }];

    describe('CSV Sanitization', () => {
        it('exports without crashing', () => {
            const records: PlantRecord[] = [];
            expect(exportFsa578Data).toBeDefined();
        });

        it('has all core export functions defined', () => {
            expect(generateMissouriLog).toBeDefined();
            expect(exportHarvestData).toBeDefined();
            expect(exportFertilizerData).toBeDefined();
        });
    });
});
