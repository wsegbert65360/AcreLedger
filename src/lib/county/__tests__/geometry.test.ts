import { describe, expect, it } from 'vitest';
import {
  geometryAcres, hashGeometry, normalizeGeometry, intersectWithCounties, countiesContainingPoint,
} from '../geometry';
import { ACROSS_LINE, BENTON, COUNTIES, HENRY, IN_HENRY, rect } from './fixtures';

describe('geodesic area', () => {
  it('uses spherical area, not degrees', () => {
    // 0.002 deg x 0.002 deg at lat 38.4: ~174.6 m x ~222.4 m
    const acres = geometryAcres(normalizeGeometryOrThrow(IN_HENRY));
    expect(acres).toBeGreaterThan(9.3);
    expect(acres).toBeLessThan(9.9);
  });

  it('subtracts holes', () => {
    const outer = rect(-93.70, 38.40, -93.69, 38.41)[0];
    const hole = rect(-93.698, 38.402, -93.692, 38.408)[0];
    const solid = geometryAcres(normalizeGeometryOrThrow({ type: 'Polygon', coordinates: [outer] }));
    const holed = geometryAcres(normalizeGeometryOrThrow({ type: 'Polygon', coordinates: [outer, hole] }));
    expect(holed).toBeLessThan(solid);
    expect(holed / solid).toBeGreaterThan(0.55);
    expect(holed / solid).toBeLessThan(0.7);
  });
});

function normalizeGeometryOrThrow(input: unknown) {
  const result = normalizeGeometry(input);
  if (!result.ok) throw new Error(result.reason);
  return result.value.geometry;
}

describe('normalizeGeometry', () => {
  it('accepts Feature wrappers and closes open rings', () => {
    const open = rect(-93.7, 38.4, -93.69, 38.41)[0].slice(0, 4);
    const result = normalizeGeometry({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [open] } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ring = (result.value.geometry as { coordinates: number[][][] }).coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });

  it('collapses a single-part MultiPolygon and keeps multipart ones', () => {
    const one = normalizeGeometry({ type: 'MultiPolygon', coordinates: [rect(-93.7, 38.4, -93.69, 38.41)] });
    expect(one.ok && one.value.geometry.type).toBe('Polygon');
    const two = normalizeGeometry({
      type: 'MultiPolygon',
      coordinates: [rect(-93.7, 38.4, -93.69, 38.41), rect(-93.5, 38.4, -93.49, 38.41)],
    });
    expect(two.ok && two.value.geometry.type).toBe('MultiPolygon');
  });

  it('reports missing, empty, wrong-type and out-of-range geometry as unusable', () => {
    expect(normalizeGeometry(null).ok).toBe(false);
    expect(normalizeGeometry({}).ok).toBe(false);
    expect(normalizeGeometry({ type: 'Point', coordinates: [-93, 38] }).ok).toBe(false);
    expect(normalizeGeometry({ type: 'Polygon', coordinates: [] }).ok).toBe(false);
    expect(normalizeGeometry({ type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] }).ok).toBe(false);
    expect(normalizeGeometry({ type: 'Polygon', coordinates: rect(-300, 38, -299, 39) }).ok).toBe(false);
    expect(normalizeGeometry({ type: 'Polygon', coordinates: [[[NaN, 1], [2, 2], [3, 3], [NaN, 1]]] }).ok).toBe(false);
  });

  it('drops degenerate parts of a MultiPolygon but keeps the good part', () => {
    const result = normalizeGeometry({
      type: 'MultiPolygon',
      coordinates: [rect(-93.7, 38.4, -93.69, 38.41), [[[1, 1], [1, 1], [1, 1], [1, 1]]]],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.warnings.join(' ')).toMatch(/unusable polygon part/);
  });

  it('repairs a bow-tie (self-intersecting) polygon instead of guessing or crashing', () => {
    const bowtie = [[[-93.70, 38.40], [-93.69, 38.41], [-93.69, 38.40], [-93.70, 38.41], [-93.70, 38.40]]];
    const result = normalizeGeometry({ type: 'Polygon', coordinates: bowtie });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings.join(' ')).toMatch(/self-intersecting/);
      expect(geometryAcres(result.value.geometry)).toBeGreaterThan(0);
    }
  });
});

describe('county intersection', () => {
  it('splits a polygon that crosses the county line', () => {
    const geom = normalizeGeometryOrThrow(ACROSS_LINE);
    const overlaps = intersectWithCounties(geom, COUNTIES);
    expect(overlaps.map(o => o.county.fips).sort()).toEqual(['29015', '29083']);
    const total = geometryAcres(geom);
    const henry = overlaps.find(o => o.county === HENRY)!.acres;
    const benton = overlaps.find(o => o.county === BENTON)!.acres;
    expect(henry + benton).toBeCloseTo(total, 1);
    expect(henry / total).toBeCloseTo(0.75, 1);
  });

  it('finds only the one county for a contained polygon', () => {
    const overlaps = intersectWithCounties(normalizeGeometryOrThrow(IN_HENRY), COUNTIES);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].county).toBe(HENRY);
  });

  it('handles multipart subjects spanning both counties', () => {
    const multi = normalizeGeometryOrThrow({
      type: 'MultiPolygon',
      coordinates: [rect(-93.7010, 38.40, -93.6990, 38.402), rect(-93.5010, 38.40, -93.4990, 38.402)],
    });
    expect(intersectWithCounties(multi, COUNTIES).map(o => o.county.fips).sort()).toEqual(['29015', '29083']);
  });

  it('looks a point up in a county', () => {
    expect(countiesContainingPoint(38.401, -93.70, COUNTIES).map(c => c.fips)).toEqual(['29083']);
    expect(countiesContainingPoint(38.401, -93.50, COUNTIES).map(c => c.fips)).toEqual(['29015']);
    expect(countiesContainingPoint(10, 10, COUNTIES)).toEqual([]);
  });
});

describe('hashGeometry', () => {
  it('is stable for the same shape and changes when the shape moves', () => {
    const a = hashGeometry(IN_HENRY);
    expect(hashGeometry(JSON.parse(JSON.stringify(IN_HENRY)))).toBe(a);
    const moved = { ...IN_HENRY, coordinates: rect(-93.7011, 38.40, -93.6990, 38.402) };
    expect(hashGeometry(moved)).not.toBe(a);
  });
});
