import { describe, it, expect } from 'vitest';
import { parseFsaGeoJson, FsaImportCandidate } from '../fsaImport';

function makeFeature(overrides?: Record<string, unknown>) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    },
    properties: {
      plu_id: 'PLU-001',
      plu_name: 'Field Alpha',
      tract: 'T1',
      plu_number: 'F1',
      calc_acres: 80.5,
      prog_acres: 82.0,
      land_use: 'Grain',
      county: 'Dundy',
      state: 'NE',
      ...overrides,
    },
    ...overrides,
  };
}

describe('parseFsaGeoJson', () => {
  // ─── Valid Inputs ───────────────────────────────────────────────────────────

  it('parses a valid FeatureCollection with one feature', () => {
    const input = {
      type: 'FeatureCollection',
      features: [makeFeature()],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('Field Alpha');
    expect(candidates[0].acreage).toBe(82.0); // prog_acres preferred over calc_acres
    expect(candidates[0].fsaTractNumber).toBe('T1');
    expect(candidates[0].fsaFieldNumber).toBe('F1');
    expect(candidates[0].intendedUse).toBe('Grain');
  });

  it('parses a valid FeatureCollection with multiple features', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        makeFeature({ properties: { plu_id: '1', plu_name: 'A', tract: 'T1', plu_number: '1', calc_acres: 50 } }),
        makeFeature({ properties: { plu_id: '2', plu_name: 'B', tract: 'T2', plu_number: '2', calc_acres: 75 } }),
      ],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates).toHaveLength(2);
  });

  it('parses a single Feature (not wrapped in FeatureCollection)', () => {
    const input = makeFeature();
    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('Field Alpha');
  });

  // ─── Acreage Calculation ────────────────────────────────────────────────────

  it('uses calc_acres when prog_acres is missing', () => {
    const input = {
      type: 'FeatureCollection',
      features: [makeFeature({ properties: { plu_id: '1', plu_name: 'A', calc_acres: 55.3 } })],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates[0].acreage).toBe(55.3);
  });

  it('calculates acreage from boundary when both are missing', () => {
    const input = {
      type: 'FeatureCollection',
      features: [makeFeature({ properties: { plu_id: '1', plu_name: 'A' } })],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    // Boundary is a 1x1 unit square = ~247 acres (1 sq km)
    expect(candidates[0].acreage).toBeGreaterThan(0);
  });

  // ─── Centroid Calculation ──────────────────────────────────────────────────

  it('calculates centroid from boundary', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
          },
          properties: { plu_id: '1', plu_name: 'A' },
        }),
      ],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates[0].lat).toBeCloseTo(1.0, 5);
    expect(candidates[0].lng).toBeCloseTo(1.0, 5);
  });

  // ─── Farm Number from Filename ─────────────────────────────────────────────

  it('extracts farm number from filename', () => {
    const input = {
      type: 'FeatureCollection',
      features: [makeFeature()],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input), 'Farm123 FSN ABC.geojson');
    expect(candidates[0].fsaFarmNumber).toBe('ABC');
  });

  // ─── Name Fallbacks ───────────────────────────────────────────────────────

  it('uses fallback name when plu_name is missing', () => {
    const input = {
      type: 'FeatureCollection',
      features: [makeFeature({ properties: { plu_id: '1', tract: 'T5', plu_number: 'F3' } })],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates[0].name).toBe('Tract T5 Field F3'); // uses plu_number when available
  });

  // ─── Error Cases ──────────────────────────────────────────────────────────

  it('throws on invalid JSON', () => {
    expect(() => parseFsaGeoJson('not json')).toThrow('The selected file is not valid JSON.');
  });

  it('throws on valid JSON with no features', () => {
    expect(() => parseFsaGeoJson('{"type": "FeatureCollection", "features": []}'))
      .toThrow('No GeoJSON features were found in this file.');
  });

  it('throws on JSON with no supported type', () => {
    expect(() => parseFsaGeoJson('{"type": "GeometryCollection"}'))
      .toThrow('No GeoJSON features were found in this file.');
  });

  it('skips features without Polygon geometry', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { plu_id: '1', plu_name: 'Point' },
        },
      ],
    };

    expect(() => parseFsaGeoJson(JSON.stringify(input)))
      .toThrow('No supported polygon fields were found in this file.');
  });

  it('skips features with empty coordinates array', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { plu_id: '1', plu_name: 'Empty' },
        },
      ],
    };

    expect(() => parseFsaGeoJson(JSON.stringify(input)))
      .toThrow('No supported polygon fields were found in this file.');
  });

  // ─── Boundary Validation ──────────────────────────────────────────────────

  it('closes unclosed polygon rings', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]], // missing closing point
          },
          properties: { plu_id: '1', plu_name: 'Open Ring' },
        }),
      ],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    expect(candidates).toHaveLength(1);
    const coords = candidates[0].boundary!.coordinates[0];
    // Should be closed now: first point == last point
    expect(coords[0]).toEqual(coords[coords.length - 1]);
    expect(coords).toHaveLength(5);
  });

  // ─── Notes Generation ─────────────────────────────────────────────────────

  it('builds notes from properties', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        makeFeature({
          properties: {
            plu_id: '1',
            plu_name: 'A',
            county: 'Lancaster',
            state: 'NE',
            hel: 'Y',
            status: 'Active',
          },
        }),
      ],
    };

    const candidates = parseFsaGeoJson(JSON.stringify(input));
    const notes = candidates[0].notes!;
    expect(notes).toContain('County: Lancaster');
    expect(notes).toContain('State: NE');
    expect(notes).toContain('HEL: Y');
  });
});
