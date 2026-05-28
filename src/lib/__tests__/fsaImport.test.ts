import { describe, expect, it } from 'vitest';

import { parseFsaGeoJson } from '@/lib/fsaImport';

describe('parseFsaGeoJson', () => {
  it('maps FSA GeoJSON properties into field import candidates', () => {
    const contents = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-93.52, 38.45],
              [-93.51, 38.45],
              [-93.51, 38.46],
              [-93.52, 38.46],
              [-93.52, 38.45],
            ]],
          },
          properties: {
            plu_id: 29016210,
            tract: 1327,
            county: 'Henry',
            state: 'Missouri',
            plu_status: 'Active',
            case_name: 'Egbert_Farms_LLC--------6730',
            plu_number: '1',
            hel: 'NHEL',
            land_use: 'Crop',
            calc_acres: 32.41,
            prog_acres: 32.38,
          },
        },
      ],
    });

    const [candidate] = parseFsaGeoJson(contents, 'T1327 FSN 918.json');

    expect(candidate.name).toBe('Tract 1327 Field 1');
    expect(candidate.acreage).toBe(32.38);
    expect(candidate.fsaFarmNumber).toBe('918');
    expect(candidate.fsaTractNumber).toBe('1327');
    expect(candidate.fsaFieldNumber).toBe('1');
    expect(candidate.intendedUse).toBe('Crop');
    expect(candidate.boundary?.type).toBe('Polygon');
    expect(candidate.notes).toContain('HEL: NHEL');
  });

  it('preserves interior rings when importing polygons with holes', () => {
    const contents = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-93.52, 38.45],
            [-93.50, 38.45],
            [-93.50, 38.47],
            [-93.52, 38.47],
            [-93.52, 38.45],
          ],
          [
            [-93.515, 38.455],
            [-93.510, 38.455],
            [-93.510, 38.460],
            [-93.515, 38.460],
            [-93.515, 38.455],
          ],
        ],
      },
      properties: {
        tract: 1327,
        plu_number: '1',
        land_use: 'Crop',
      },
    });

    const [candidate] = parseFsaGeoJson(contents, 'T1327 FSN 918.json');

    expect(candidate.boundary?.coordinates).toHaveLength(2);
    expect(candidate.boundary?.coordinates[1]).toHaveLength(5);
  });

  it('rejects files without supported polygon features', () => {
    const contents = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-93.52, 38.45] },
          properties: {},
        },
      ],
    });

    expect(() => parseFsaGeoJson(contents, 'bad.json')).toThrow('No supported polygon fields were found');
  });
});
