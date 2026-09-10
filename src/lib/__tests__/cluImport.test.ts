import { describe, expect, it } from 'vitest';

import { parseCluFile, parseCluGeoJson, parseCluGeoJsonTracts, parseCluZip } from '@/lib/cluImport';

import {
  buildShapefileZip,
  GEOGRAPHIC_WGS84_PRJ,
  shapefileZipFile,
  squareRing,
  UTM_ZONE_15N_PRJ,
} from './shapefileFixture';

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

describe('parseCluFile / parseCluZip', () => {
  it('imports a real shapefile ZIP locally as a single tract', async () => {
    const file = shapefileZipFile(buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47)],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 10.5 },
      }],
      prj: GEOGRAPHIC_WGS84_PRJ,
    }));

    const tracts = await parseCluFile(file);
    expect(tracts).toHaveLength(1);
    expect(tracts[0].tractKey).toBe('6418-1417');
    expect(tracts[0].collection.features).toHaveLength(1);
    expect(tracts[0].collection.features[0].properties.cluNumber).toBe('11');
    expect(tracts[0].collection.features[0].properties.acres).toBe(10.5);
    expect(tracts[0].collection.features[0].geometry.type).toBe('Polygon');
  });

  it('routes .zip files to the shapefile path and .json files to the GeoJSON path', async () => {
    const zipFile = shapefileZipFile(buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47)],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 1 },
      }],
      prj: GEOGRAPHIC_WGS84_PRJ,
    }));
    const zipTracts = await parseCluFile(zipFile);
    expect(zipTracts[0].tractKey).toBe('6418-1417');

    const jsonFile = new File([validJson], '4251-9747.geojson', { type: 'application/json' });
    const jsonTracts = await parseCluFile(jsonFile);
    expect(jsonTracts).toHaveLength(1);
    expect(jsonTracts[0].tractKey).toBe('4251-9747');
    expect(jsonTracts[0].collection.features).toHaveLength(2);
  });

  it('separates multiple tracts in one ZIP by farm and tract number', async () => {
    const buffer = buildShapefileZip({
      features: [
        { rings: [squareRing(-93.55, 38.47)], attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 10.5 } },
        { rings: [squareRing(-93.50, 38.47)], attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '12', CALC_ACRES: 8.2 } },
        { rings: [squareRing(-93.45, 38.47)], attributes: { FARM_NUM: '7653', TRACT_NUM: 12050, CLU_NUMBER: '3', CALC_ACRES: 4.1 } },
      ],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    const tracts = await parseCluZip(buffer.buffer as ArrayBuffer, 'fsa_export.zip');
    expect(tracts.map(t => t.tractKey)).toEqual(['6418-1417', '7653-12050']);
    expect(tracts[0].collection.features.map(f => f.properties.cluNumber)).toEqual(['11', '12']);
    expect(tracts[1].collection.features.map(f => f.properties.cluNumber)).toEqual(['3']);
  });

  it('keeps features without farm/tract numbers under the filename-derived tract key', async () => {
    const buffer = buildShapefileZip({
      features: [
        { rings: [squareRing(-93.55, 38.47)], attributes: { CLU_NUMBER: '11', CALC_ACRES: 2 } },
      ],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    const tracts = await parseCluZip(buffer.buffer as ArrayBuffer, '4251-9747.zip');
    expect(tracts).toHaveLength(1);
    expect(tracts[0].tractKey).toBe('4251-9747');
  });

  it('supports MultiPolygon CLUs from multi-ring shapefile records', async () => {
    const buffer = buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47), squareRing(-93.50, 38.50)],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '13', CALC_ACRES: 5 },
      }],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    const [tract] = await parseCluZip(buffer.buffer as ArrayBuffer, 'tract.zip');
    expect(tract.collection.features).toHaveLength(1);
    expect(tract.collection.features[0].geometry.type).toBe('MultiPolygon');
    expect(tract.collection.features[0].geometry.coordinates).toHaveLength(2);
  });

  it('converts UTM shapefiles to WGS84 when the PRJ is present', async () => {
    const buffer = buildShapefileZip({
      features: [{
        rings: [[[500000, 4255000], [500100, 4255000], [500100, 4255100], [500000, 4255100], [500000, 4255000]]],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 2 },
      }],
      prj: UTM_ZONE_15N_PRJ,
    });

    const [tract] = await parseCluZip(buffer.buffer as ArrayBuffer, 'tract.zip');
    const ring = tract.collection.features[0].geometry.coordinates[0] as number[][];
    expect(ring[0][0]).toBeCloseTo(-93, 1);
    expect(ring[0][1]).toBeCloseTo(38.44, 1);
  });

  it('accepts comma-formatted acreage and falls back to geometry when acres are missing', async () => {
    const withCommas = await parseCluFile(shapefileZipFile(buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47)],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: '1,234.5' },
      }],
      prj: GEOGRAPHIC_WGS84_PRJ,
    })));
    expect(withCommas[0].collection.features[0].properties.acres).toBe(1234.5);

    const withoutAcres = await parseCluFile(shapefileZipFile(buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47, 0.01)],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '12' },
      }],
      prj: GEOGRAPHIC_WGS84_PRJ,
    })));
    expect(withoutAcres[0].collection.features[0].properties.acres).toBeGreaterThan(0);
  });

  it('fails closed when no CLU numbers are present', async () => {
    const buffer = buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47)],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CALC_ACRES: 1 },
      }],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    await expect(parseCluZip(buffer.buffer as ArrayBuffer, 'tract.zip')).rejects.toThrow('could not find FSA field or CLU numbers');
  });

  it('fails clearly when projection information is missing or cannot be converted', async () => {
    const buffer = buildShapefileZip({
      features: [{
        rings: [[[500000, 4255000], [500100, 4255000], [500100, 4255100], [500000, 4255100], [500000, 4255000]]],
        attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 1 },
      }],
    });

    await expect(parseCluZip(buffer.buffer as ArrayBuffer, 'tract.zip')).rejects.toThrow('map coordinate system');
  });

  it('fails clearly when the ZIP has geometry but no attribute file', async () => {
    const buffer = buildShapefileZip({
      features: [{
        rings: [squareRing(-93.55, 38.47)],
        attributes: {},
      }],
      includeDbf: false,
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    await expect(parseCluZip(buffer.buffer as ArrayBuffer, 'tract.zip')).rejects.toThrow('does not contain a complete shapefile');
  });

  it('fails clearly on an unreadable ZIP', async () => {
    await expect(parseCluZip(new Uint8Array([1, 2, 3, 4]).buffer, 'broken.zip')).rejects.toThrow('does not contain a complete shapefile');
  });

  it('rejects invalid JSON files without producing tracts', async () => {
    const file = new File(['not json at all'], 'bad.json', { type: 'application/json' });
    await expect(parseCluFile(file)).rejects.toThrow('not valid JSON');
  });

  it('separates multiple tracts in one GeoJSON file', async () => {
    const multiTractJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { clu_number: '11', clu_acres: 10.5, farm_num: '4251', tract_num: '9747' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
          properties: { clu_number: '12', clu_acres: 8.2, farm_num: '4251', tract_num: '9747' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[4, 4], [5, 4], [5, 5], [4, 4]]] },
          properties: { clu_number: '3', clu_acres: 4.1, farm_num: '6418', tract_num: '1417' },
        },
      ],
    });

    const tracts = await parseCluFile(new File([multiTractJson], 'fsa_export.geojson', { type: 'application/json' }));
    expect(tracts.map(t => t.tractKey)).toEqual(['4251-9747', '6418-1417']);
    expect(tracts[0].collection.features.map(f => f.properties.cluNumber)).toEqual(['11', '12']);
    expect(tracts[1].collection.features.map(f => f.properties.cluNumber)).toEqual(['3']);
  });

  it('keeps GeoJSON features without farm/tract numbers under the filename key', () => {
    const json = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { clu_number: '11', clu_acres: 5 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
          properties: { clu_number: '12', clu_acres: 6 },
        },
      ],
    });

    const tracts = parseCluGeoJsonTracts(json, '4251-9747.geojson');
    expect(tracts).toHaveLength(1);
    expect(tracts[0].tractKey).toBe('4251-9747');
    expect(tracts[0].collection.features.map(f => f.properties.cluNumber)).toEqual(['11', '12']);
  });

  it('ignores non-polygon features without rejecting the file on the strict path', () => {
    const json = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { clu_number: '5', clu_acres: 1 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { clu_number: '6', clu_acres: 2 },
        },
      ],
    });

    const tracts = parseCluGeoJsonTracts(json, '4251-9747.json');
    expect(tracts).toHaveLength(1);
    expect(tracts[0].collection.features).toHaveLength(1);
    expect(tracts[0].collection.features[0].properties.cluNumber).toBe('5');
  });

  it('rejects a GeoJSON file when only some boundaries have CLU numbers', async () => {
    const partialClu = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { clu_number: '11', clu_acres: 5, farm_num: '4251', tract_num: '9747' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
          properties: { clu_acres: 6, farm_num: '4251', tract_num: '9747' },
        },
      ],
    });

    await expect(parseCluFile(new File([partialClu], '4251-9747.json', { type: 'application/json' })))
      .rejects.toThrow('missing the field or CLU number on 1 of 2 field boundaries');
    await expect(parseCluFile(new File([partialClu], '4251-9747.json', { type: 'application/json' })))
      .rejects.toThrow('Ask FSA for a complete file');
  });

  it('rejects a shapefile ZIP when only some boundaries have CLU numbers', async () => {
    const buffer = buildShapefileZip({
      features: [
        { rings: [squareRing(-93.55, 38.47)], attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 1 } },
        { rings: [squareRing(-93.50, 38.47)], attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CALC_ACRES: 2 } },
      ],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    await expect(parseCluZip(buffer.buffer as ArrayBuffer, 'tract.zip'))
      .rejects.toThrow('missing the field or CLU number on 1 of 2 field boundaries');
  });

  it('rejects a generic ZIP filename when boundaries carry no farm and tract numbers', async () => {
    const buffer = buildShapefileZip({
      features: [
        { rings: [squareRing(-93.55, 38.47)], attributes: { CLU_NUMBER: '11', CALC_ACRES: 1 } },
      ],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    await expect(parseCluFile(shapefileZipFile(buffer, 'fields.zip')))
      .rejects.toThrow('could not tell which FSA farm and tract');
  });

  it('rejects a generic GeoJSON filename when boundaries carry no farm and tract numbers', async () => {
    const json = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { clu_number: '11', clu_acres: 5 },
        },
      ],
    });

    await expect(parseCluFile(new File([json], 'export.geojson', { type: 'application/json' })))
      .rejects.toThrow('could not tell which FSA farm and tract');
    await expect(parseCluFile(new File([json], 'export.geojson', { type: 'application/json' })))
      .rejects.toThrow('Please rename the file to include the farm and tract number');
  });

  it('rejects placeholder farm or tract property values instead of inventing a tract number', async () => {
    const json = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { clu_number: '11', clu_acres: 5, farm_num: 'TBD', tract_num: 'N/A' },
        },
      ],
    });

    await expect(parseCluFile(new File([json], 'download.json', { type: 'application/json' })))
      .rejects.toThrow('could not tell which FSA farm and tract');
  });

  it('still imports from a generic filename when the boundaries identify their farm and tract', async () => {
    const buffer = buildShapefileZip({
      features: [
        { rings: [squareRing(-93.55, 38.47)], attributes: { FARM_NUM: '6418', TRACT_NUM: 1417, CLU_NUMBER: '11', CALC_ACRES: 1 } },
      ],
      prj: GEOGRAPHIC_WGS84_PRJ,
    });

    const tracts = await parseCluFile(shapefileZipFile(buffer, 'fields.zip'));
    expect(tracts).toHaveLength(1);
    expect(tracts[0].tractKey).toBe('6418-1417');
  });
});
