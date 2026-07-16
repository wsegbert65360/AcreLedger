import { describe, expect, it } from 'vitest';

import { parseCluGeoJson } from '@/lib/cluImport';

const validJson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
      properties: { cluNumber: '11', acres: 10.5 },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
      },
      properties: { cluNumber: '14', acres: 5.2 },
    },
  ],
});

describe('parseCluGeoJson', () => {
  it('parses a valid CLU GeoJSON FeatureCollection', () => {
    const result = parseCluGeoJson(validJson, '6418-1417.json');
    expect(result.tractKey).toBe('6418-1417');
    expect(result.collection.features).toHaveLength(2);
    expect(result.collection.features[0].properties.cluNumber).toBe('11');
    expect(result.collection.features[0].properties.acres).toBe(10.5);
    expect(result.collection.features[1].properties.cluNumber).toBe('14');
  });

  it('extracts tract key from filename', () => {
    expect(parseCluGeoJson(validJson, '4251-9747.json').tractKey).toBe('4251-9747');
    expect(parseCluGeoJson(validJson, '/path/to/6418-1315.json').tractKey).toBe('6418-1315');
  });

  it('handles underscore separator in filename', () => {
    expect(parseCluGeoJson(validJson, '6418_1315.json').tractKey).toBe('6418-1315');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCluGeoJson('not json', 'test.json')).toThrow('not valid JSON');
  });

  it('throws on non-FeatureCollection', () => {
    expect(() => parseCluGeoJson('{"type":"Feature"}', 'test.json')).toThrow('FeatureCollection');
  });

  it('throws when no features have cluNumber', () => {
    const noClu = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: { someProp: 'val' },
      }],
    });
    expect(() => parseCluGeoJson(noClu, 'test.json')).toThrow('CLU numbers');
  });

  it('filters out features without cluNumber', () => {
    const mixed = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
          properties: { cluNumber: '5', acres: 1 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { cluNumber: '6', acres: 2 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
          properties: { otherProp: 'val' },
        },
      ],
    });
    const result = parseCluGeoJson(mixed, 'test.json');
    expect(result.collection.features).toHaveLength(1);
    expect(result.collection.features[0].properties.cluNumber).toBe('5');
  });

  it('calculates acres from geometry when the property is missing', () => {
    const noAcres = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: { cluNumber: '7' },
      }],
    });
    const result = parseCluGeoJson(noAcres, 'test.json');
    expect(result.collection.features[0].properties.acres).toBeGreaterThan(0);
  });

  it('parses comma-formatted acreage', () => {
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { cluNumber: '7', acres: '1,234.5' },
      }],
    });

    expect(parseCluGeoJson(input, 'test.json').collection.features[0].properties.acres).toBe(1234.5);
  });

  it('recognizes clu_number and clu_acres property names', () => {
    const fsaFormat = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: { clu_number: '11', clu_acres: 10.5, tract_num: '9747', farm_num: '4251' },
      }],
    });
    const result = parseCluGeoJson(fsaFormat, 'test.json');
    expect(result.collection.features[0].properties.cluNumber).toBe('11');
    expect(result.collection.features[0].properties.acres).toBe(10.5);
  });

  it('recognizes uppercase USDA-style property names', () => {
    const fsaFormat = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: { CLU_NUMBER: '48', CLU_ACRES: 2.75, FARM_NUM: '918', TRACT_NUM: '1327' },
      }],
    });
    const result = parseCluGeoJson(fsaFormat, 'MEFFORD.json');
    expect(result.tractKey).toBe('918-1327');
    expect(result.collection.features[0].properties.cluNumber).toBe('48');
    expect(result.collection.features[0].properties.acres).toBe(2.75);
  });

  it('recognizes PLU-style FSA export property names', () => {
    const fsaFormat = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: { plu_number: '5', tract: 1327, calc_acres: 0.77, land_use: 'Water' },
      }],
    });
    const result = parseCluGeoJson(fsaFormat, 'F918_T1327_MEFFORD.json');
    expect(result.tractKey).toBe('918-1327');
    expect(result.collection.features[0].properties.cluNumber).toBe('5');
    expect(result.collection.features[0].properties.acres).toBe(0.77);
  });

  it('handles F{farm}_T{tract} filename pattern', () => {
    const result = parseCluGeoJson(validJson, 'F4251_T9747_HENSLEE.json');
    expect(result.tractKey).toBe('4251-9747');
  });

  it('falls back to farm_num/tract_num from feature properties', () => {
    const propsJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: { clu_number: '11', clu_acres: 5, farm_num: '4251', tract_num: '9747' },
      }],
    });
    const result = parseCluGeoJson(propsJson, 'some_unusual_name.json');
    expect(result.tractKey).toBe('4251-9747');
  });

  it('converts Web Mercator coordinates to WGS84', () => {
    const mercatorJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-10414319.557, 4645247.026], [-10414335.030, 4645249.453], [-10414344.328, 4645249.453], [-10414352.464, 4645241.899], [-10414353.626, 4645233.182], [-10414353.626, 4645228.533], [-10414319.557, 4645247.026]]],
        },
        properties: { clu_number: '11', clu_acres: 0.14 },
      }],
    });
    const result = parseCluGeoJson(mercatorJson, 'F4251_T9747.json');
    const coords = result.collection.features[0].geometry.coordinates[0];
    expect(coords[0][0]).toBeCloseTo(-93.55, 1);
    expect(coords[0][1]).toBeCloseTo(38.47, 1);
  });

  it('does not convert WGS84 coordinates', () => {
    const result = parseCluGeoJson(validJson, 'test.json');
    expect(result.collection.features[0].geometry.coordinates[0][0]).toEqual([0, 0]);
  });

  it('parses MultiPolygon features correctly', () => {
    const multiPolygonJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]]
          ],
        },
        properties: { clu_number: '99', clu_acres: 15.5 },
      }],
    });
    const result = parseCluGeoJson(multiPolygonJson, '1234-5678.json');
    expect(result.collection.features).toHaveLength(1);
    expect(result.collection.features[0].geometry.type).toBe('MultiPolygon');
    expect(result.collection.features[0].geometry.coordinates).toHaveLength(2);
    expect(result.collection.features[0].properties.cluNumber).toBe('99');
  });
});
