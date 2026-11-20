#!/usr/bin/env node
// Builds the county_boundaries load from Census TIGER/Line counties. Writes SQL; it never connects
// to a database. Review the SQL, run it against staging first, then production.
//
//   1. Download tl_2025_us_county.zip from https://www2.census.gov/geo/tiger/TIGER2025/COUNTY/
//   2. Convert to GeoJSON in EPSG:4326, for example:
//        ogr2ogr -f GeoJSON -t_srs EPSG:4326 counties.geojson tl_2025_us_county.shp
//   3. node scripts/county/build-county-boundaries.mjs --input counties.geojson \
//        --version tiger-2025 --source "US Census Bureau TIGER/Line 2025 (tl_2025_us_county)" \
//        --out county-boundaries-tiger-2025.sql [--states 29,19,17] [--tolerance 0.00003]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildBoundaryRows, toSql, DEFAULT_TOLERANCE_DEGREES } from './county-dataset.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const input = arg('input');
const out = arg('out');
if (!input || !out || !arg('version') || !arg('source')) {
  console.error('Usage: build-county-boundaries.mjs --input counties.geojson --version tiger-2025 --source "<dataset name>" --out file.sql [--states 29,19] [--tolerance 0.00003]');
  process.exit(2);
}

const collection = JSON.parse(readFileSync(input, 'utf8'));
const { rows, skipped } = buildBoundaryRows(collection, {
  version: arg('version'),
  source: arg('source'),
  states: arg('states')?.split(',').map(s => s.trim().padStart(2, '0')),
  tolerance: arg('tolerance') ? Number(arg('tolerance')) : DEFAULT_TOLERANCE_DEGREES,
});
const sql = toSql(rows, { version: arg('version') });
writeFileSync(out, sql);
console.log(`${rows.length} counties written to ${out} (${(sql.length / 1e6).toFixed(1)} MB, tolerance ${arg('tolerance') ?? DEFAULT_TOLERANCE_DEGREES} degrees).`);
if (skipped.length > 0) console.warn(`${skipped.length} features skipped:`, skipped.slice(0, 10));
