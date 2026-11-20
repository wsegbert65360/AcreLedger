import { describe, expect, it } from 'vitest';
import { calculateCountyAssignment } from '../calculate';
import { ACROSS_LINE, BENTON, COUNTIES, HENRY, IN_BENTON, IN_HENRY, rect } from './fixtures';

describe('calculateCountyAssignment', () => {
  it('assigns a tract/field wholly inside one county at 100%', () => {
    const calc = calculateCountyAssignment({ geometry: IN_HENRY, counties: COUNTIES });
    expect(calc.kind).toBe('resolved');
    if (calc.kind !== 'resolved') return;
    expect(calc.rows).toHaveLength(1);
    expect(calc.rows[0].county.fips).toBe('29083');
    expect(calc.rows[0].proportion).toBe(1);
    expect(calc.needsReview).toBe(false);
    expect(calc.method).toBe('geometry');
  });

  it('splits a polygon crossing two counties with proportions summing to exactly 1', () => {
    const calc = calculateCountyAssignment({ geometry: ACROSS_LINE, counties: COUNTIES });
    expect(calc.kind).toBe('resolved');
    if (calc.kind !== 'resolved') return;
    expect(calc.rows.map(r => r.county.fips)).toEqual(['29083', '29015']);
    expect(calc.rows[0].proportion).toBeCloseTo(0.75, 2);
    expect(calc.rows[1].proportion).toBeCloseTo(0.25, 2);
    expect(calc.rows.reduce((s, r) => s + r.proportion, 0)).toBeCloseTo(1, 10);
    expect(calc.rows[0].mappedAcres + calc.rows[1].mappedAcres).toBeCloseTo(calc.totalAcres, 2);
  });

  it('handles MultiPolygon geometry spread over both counties', () => {
    const calc = calculateCountyAssignment({
      geometry: { type: 'MultiPolygon', coordinates: [IN_HENRY.coordinates, IN_BENTON.coordinates] },
      counties: COUNTIES,
    });
    expect(calc.kind === 'resolved' && calc.rows.map(r => r.county.fips).sort()).toEqual(['29015', '29083']);
    if (calc.kind === 'resolved') expect(calc.rows[0].proportion).toBeCloseTo(0.5, 2);
  });

  it('handles holes: the hole area is not counted toward any county', () => {
    const outer = rect(-93.6045, 38.40, -93.5985, 38.4095)[0];
    const hole = rect(-93.603, 38.402, -93.601, 38.407)[0]; // entirely in Henry
    const solid = calculateCountyAssignment({ geometry: { type: 'Polygon', coordinates: [outer] }, counties: COUNTIES });
    const holed = calculateCountyAssignment({ geometry: { type: 'Polygon', coordinates: [outer, hole] }, counties: COUNTIES });
    if (solid.kind !== 'resolved' || holed.kind !== 'resolved') throw new Error('expected resolved');
    expect(holed.totalAcres).toBeLessThan(solid.totalAcres);
    expect(holed.rows[0].proportion).toBeLessThan(solid.rows[0].proportion);
  });

  it('ignores a sliver that only grazes a neighbouring county', () => {
    // 0.00001 deg (~1 m) over the line across a 222 m edge: a few hundredths of an acre at most
    const grazing = { type: 'Polygon' as const, coordinates: rect(-93.7010, 38.40, -93.59999, 38.402) };
    const calc = calculateCountyAssignment({ geometry: grazing, counties: COUNTIES });
    expect(calc.kind).toBe('resolved');
    if (calc.kind !== 'resolved') return;
    expect(calc.rows.map(r => r.county.fips)).toEqual(['29083']);
    expect(calc.warnings.join(' ')).toMatch(/sliver/);
    expect(calc.rows[0].proportion).toBe(1);
  });

  it('absorbs a small gap in county coverage but flags a larger one', () => {
    // Half the polygon is over open space no county covers
    const half = { type: 'Polygon' as const, coordinates: rect(-93.8005, 38.40, -93.7995, 38.402) };
    const calc = calculateCountyAssignment({ geometry: half, counties: COUNTIES });
    expect(calc.kind).toBe('resolved');
    if (calc.kind === 'resolved') {
      expect(calc.coverage).toBeLessThan(0.98);
      expect(calc.needsReview).toBe(true);
      expect(calc.rows).toHaveLength(1);
    }
  });

  it('marks a polygon outside all counties unresolved instead of guessing', () => {
    const far = { type: 'Polygon' as const, coordinates: rect(-100, 40, -99.99, 40.01) };
    const calc = calculateCountyAssignment({ geometry: far, counties: COUNTIES });
    expect(calc.kind).toBe('unresolved');
  });

  it('marks missing and invalid geometry unresolved', () => {
    expect(calculateCountyAssignment({ geometry: null, point: null, counties: COUNTIES }).kind).toBe('unresolved');
    const invalid = calculateCountyAssignment({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] }, counties: COUNTIES });
    expect(invalid.kind).toBe('unresolved');
    // Unusable geometry is detected even when no boundary data is loaded
    const noData = calculateCountyAssignment({ geometry: { type: 'Polygon', coordinates: [] }, counties: [] });
    expect(noData.kind).toBe('unresolved');
  });

  it('defers (saves nothing) when boundary data is not available', () => {
    expect(calculateCountyAssignment({ geometry: IN_HENRY, counties: [] }).kind).toBe('deferred');
    expect(calculateCountyAssignment({ point: { lat: 38.4, lng: -93.7 }, counties: [] }).kind).toBe('deferred');
  });

  it('gives a point-only subject a provisional single county flagged for review', () => {
    const calc = calculateCountyAssignment({ point: { lat: 38.4, lng: -93.7 }, counties: COUNTIES });
    expect(calc.kind).toBe('resolved');
    if (calc.kind !== 'resolved') return;
    expect(calc.method).toBe('centroid');
    expect(calc.rows).toHaveLength(1);
    expect(calc.rows[0].county).toBe(HENRY);
    expect(calc.needsReview).toBe(true);
    expect(calc.reviewReason).toMatch(/provisional/i);
  });

  it('does not use a point when a polygon exists, even if the polygon is invalid', () => {
    const calc = calculateCountyAssignment({
      geometry: { type: 'Polygon', coordinates: [] }, point: { lat: 38.4, lng: -93.7 }, counties: COUNTIES,
    });
    expect(calc.kind).toBe('unresolved');
  });

  it('treats a 0,0 location as no location', () => {
    expect(calculateCountyAssignment({ point: { lat: 0, lng: 0 }, counties: COUNTIES }).kind).toBe('unresolved');
  });

  it('flags a point on the county line as ambiguous', () => {
    const calc = calculateCountyAssignment({ point: { lat: 38.4, lng: -93.60 }, counties: [HENRY, BENTON] });
    expect(calc.kind).toBe('resolved');
    if (calc.kind === 'resolved') expect(calc.reviewReason).toMatch(/county line|provisional/i);
  });
});
