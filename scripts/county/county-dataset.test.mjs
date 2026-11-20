import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBoundaryRows, toSql } from './county-dataset.mjs';

const square = (minLng, minLat, maxLng, maxLat) => ({
  type: 'Polygon', coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
});
const feature = (statefp, countyfp, name, geometry) => ({
  type: 'Feature', properties: { STATEFP: statefp, COUNTYFP: countyfp, GEOID: statefp + countyfp, NAME: name }, geometry,
});
const collection = {
  type: 'FeatureCollection',
  features: [
    feature('29', '083', 'Henry', square(-93.8, 38.3, -93.6, 38.5)),
    feature('29', '015', "O'Benton", square(-93.6, 38.3, -93.4, 38.5)),
    feature('19', '001', 'Adair', square(-94.6, 41.3, -94.3, 41.5)),
  ],
};
const options = { version: 'test-1', source: 'Test dataset' };

test('builds rows with FIPS, state, bounds, version and source', () => {
  const { rows } = buildBoundaryRows(collection, options);
  assert.equal(rows.length, 3);
  const henry = rows.find(r => r.fips === '29083');
  assert.deepEqual([henry.name, henry.state_abbr, henry.state_fips, henry.dataset_version, henry.dataset_source], ['Henry', 'MO', '29', 'test-1', 'Test dataset']);
  assert.deepEqual([henry.min_lng, henry.max_lng, henry.min_lat, henry.max_lat], [-93.8, -93.6, 38.3, 38.5]);
});

test('filters by state', () => {
  const { rows } = buildBoundaryRows(collection, { ...options, states: ['29'] });
  assert.deepEqual(rows.map(r => r.fips).sort(), ['29015', '29083']);
});

test('skips features without usable identifiers or geometry', () => {
  const bad = { type: 'FeatureCollection', features: [feature('99', '001', 'Nowhere', square(0, 0, 1, 1)), feature('29', '001', '', square(0, 0, 1, 1)), feature('29', '002', 'Pt', { type: 'Point', coordinates: [0, 0] })] };
  const { rows, skipped } = buildBoundaryRows(bad, options);
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 3);
});

test('requires a version and a source, and rejects duplicate counties', () => {
  assert.throws(() => buildBoundaryRows(collection, { source: 'x' }), /version/);
  assert.throws(() => buildBoundaryRows(collection, { version: 'v' }), /source/);
  assert.throws(() => buildBoundaryRows({ features: [collection.features[0], collection.features[0]] }, options), /Duplicate/);
});

test('emits one transaction that loads as not-current and then switches the current version', () => {
  const { rows } = buildBoundaryRows(collection, options);
  const sql = toSql(rows, { version: 'test-1', batchSize: 2 });
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;$/);
  assert.equal((sql.match(/INSERT INTO public\.county_boundaries/g) ?? []).length, 2);
  assert.match(sql, /ON CONFLICT \(dataset_version, fips\) DO NOTHING/);
  assert.match(sql, /SET is_current = false WHERE is_current AND fips IN/);
  assert.match(sql, /SET is_current = true WHERE dataset_version = 'test-1'/);
  assert.ok(sql.includes("'O''Benton'"), 'quotes are escaped');
  assert.throws(() => toSql([], { version: 'x' }), /No county rows/);
});
