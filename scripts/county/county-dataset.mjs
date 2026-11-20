// Pure helpers for turning a Census TIGER/Line county GeoJSON into county_boundaries rows.
import simplify from '@turf/simplify';
import bbox from '@turf/bbox';

/** TIGER state FIPS to postal abbreviation (50 states, DC and the territories TIGER ships). */
export const STATE_ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
  '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI',
};

/** About 3 m at the equator: well inside the tolerance of the farmer's own boundaries. */
export const DEFAULT_TOLERANCE_DEGREES = 0.00003;

const round = (n) => Math.round(n * 1e6) / 1e6;
const roundCoords = (c) => (typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(roundCoords));

/**
 * @param {{ features: any[] }} collection TIGER counties as GeoJSON (EPSG:4326 / NAD83)
 * @param {{ version: string, source: string, states?: string[], tolerance?: number }} options
 */
export function buildBoundaryRows(collection, options) {
  if (!options.version?.trim()) throw new Error('A dataset version is required (for example tiger-2025)');
  if (!options.source?.trim()) throw new Error('A dataset source is required');
  const wanted = options.states?.length ? new Set(options.states) : null;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE_DEGREES;
  const rows = [];
  const skipped = [];
  for (const feature of collection.features ?? []) {
    const p = feature.properties ?? {};
    const stateFips = String(p.STATEFP ?? '').padStart(2, '0');
    const countyFips = String(p.COUNTYFP ?? '').padStart(3, '0');
    const fips = String(p.GEOID ?? `${stateFips}${countyFips}`);
    if (wanted && !wanted.has(stateFips)) continue;
    const abbr = STATE_ABBR[stateFips];
    const type = feature.geometry?.type;
    if (!/^\d{5}$/.test(fips) || !abbr || !p.NAME || (type !== 'Polygon' && type !== 'MultiPolygon')) {
      skipped.push({ fips, reason: 'missing identifiers or geometry' });
      continue;
    }
    const simplified = simplify(feature, { tolerance, highQuality: true, mutate: false });
    const geometry = { type: simplified.geometry.type, coordinates: roundCoords(simplified.geometry.coordinates) };
    const [minLng, minLat, maxLng, maxLat] = bbox({ type: 'Feature', properties: {}, geometry });
    rows.push({
      dataset_version: options.version, fips, name: String(p.NAME), state_abbr: abbr, state_fips: stateFips,
      geometry, min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat, dataset_source: options.source,
    });
  }
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.fips)) throw new Error(`Duplicate county ${r.fips} in the input`);
    seen.add(r.fips);
  }
  return { rows, skipped };
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * SQL to review and run (staging first). Loads the new version as not-current, then switches the
 * current version for exactly the counties it contains, in one transaction.
 */
export function toSql(rows, { version, batchSize = 20 } = {}) {
  if (rows.length === 0) throw new Error('No county rows to load');
  const lines = ['BEGIN;'];
  for (let i = 0; i < rows.length; i += batchSize) {
    const values = rows.slice(i, i + batchSize).map(r =>
      `(${q(r.dataset_version)}, ${q(r.fips)}, ${q(r.name)}, ${q(r.state_abbr)}, ${q(r.state_fips)}, ${q(JSON.stringify(r.geometry))}::jsonb, ${r.min_lng}, ${r.min_lat}, ${r.max_lng}, ${r.max_lat}, ${q(r.dataset_source)}, false)`);
    lines.push(`INSERT INTO public.county_boundaries (dataset_version, fips, name, state_abbr, state_fips, geometry, min_lng, min_lat, max_lng, max_lat, dataset_source, is_current) VALUES\n${values.join(',\n')}\nON CONFLICT (dataset_version, fips) DO NOTHING;`);
  }
  const fipsList = rows.map(r => q(r.fips)).join(', ');
  lines.push(`UPDATE public.county_boundaries SET is_current = false WHERE is_current AND fips IN (${fipsList}) AND dataset_version <> ${q(version)};`);
  lines.push(`UPDATE public.county_boundaries SET is_current = true WHERE dataset_version = ${q(version)} AND fips IN (${fipsList});`);
  lines.push('COMMIT;');
  return lines.join('\n');
}
