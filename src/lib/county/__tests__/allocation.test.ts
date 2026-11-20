import { describe, expect, it } from 'vitest';
import {
  allocateByLargestRemainder, allocateProduction, compareMappedToRecorded, deriveCountyStatus,
  validateManualSplit, sharesFromRows,
} from '../allocation';
import { row } from './fixtures';

describe('allocateByLargestRemainder', () => {
  it('always adds back to the exact total', () => {
    for (const [total, weights] of [
      [100, [1, 1, 1]], [0.07, [1, 1]], [55.55, [33.3, 33.3, 33.4]], [1234.56, [0.1, 0.2, 0.7, 1e-9]], [10, [3, 0, 7]],
    ] as [number, number[]][]) {
      const parts = allocateByLargestRemainder(total, weights, 2);
      expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(total * 100));
      expect(parts.every(p => p >= 0)).toBe(true);
    }
  });

  it('gives zero-weight slots nothing and handles all-zero weights', () => {
    expect(allocateByLargestRemainder(10, [3, 0, 7], 2)).toEqual([3, 0, 7]);
    expect(allocateByLargestRemainder(10, [0, 0], 2)).toEqual([10, 0]);
  });

  it('allocates whole units for bales', () => {
    const parts = allocateByLargestRemainder(101, [0.5, 0.5], 0);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(101);
    expect(parts.every(Number.isInteger)).toBe(true);
  });
});

describe('compareMappedToRecorded', () => {
  it('flags only substantial differences', () => {
    expect(compareMappedToRecorded(54.1, 55).needsReview).toBe(false);
    expect(compareMappedToRecorded(40, 55).needsReview).toBe(true);
    expect(compareMappedToRecorded(10.2, 10).needsReview).toBe(false); // under 0.5 ac
    expect(compareMappedToRecorded(55.1, 55).matches).toBe(true);
  });
});

describe('validateManualSplit', () => {
  it('requires the split to equal the recorded acreage', () => {
    expect(validateManualSplit([{ countyFips: '29083', acres: 45 }, { countyFips: '29015', acres: 10 }], 55).valid).toBe(true);
    const bad = validateManualSplit([{ countyFips: '29083', acres: 45 }, { countyFips: '29015', acres: 12 }], 55);
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/57 ac but the recorded acreage is 55/);
  });
  it('rejects duplicate, empty, non-positive and malformed entries', () => {
    expect(validateManualSplit([], 10).valid).toBe(false);
    expect(validateManualSplit([{ countyFips: '29083', acres: 5 }, { countyFips: '29083', acres: 5 }], 10).valid).toBe(false);
    expect(validateManualSplit([{ countyFips: '29083', acres: 0 }], 0).valid).toBe(false);
    expect(validateManualSplit([{ countyFips: '29', acres: 10 }], 10).valid).toBe(false);
    expect(validateManualSplit([{ countyFips: '29083', acres: -1 }, { countyFips: '29015', acres: 11 }], 10).valid).toBe(false);
  });
});

describe('deriveCountyStatus', () => {
  const two = [
    row({ id: 'a', countyFips: '29083', countyName: 'Henry', mappedAcres: 41.25, proportion: 0.75 }),
    row({ id: 'b', countyFips: '29015', countyName: 'Benton', mappedAcres: 13.75, proportion: 0.25 }),
  ];
  it('is automatic for one county and estimated for a split that differs from recorded acres', () => {
    expect(deriveCountyStatus([row()], 10).status).toBe('automatic');
    expect(deriveCountyStatus(two, 55.4).status).toBe('estimated'); // 0.4 ac off: allocated, not equal
    expect(deriveCountyStatus(two, 55).status).toBe('automatic'); // measurements agree
  });
  it('is needs_review for a large mapped/recorded gap and unresolved without a county', () => {
    const gap = deriveCountyStatus(two, 80);
    expect(gap.status).toBe('needs_review');
    expect(gap.reasons.join(' ')).toMatch(/Mapped 55 ac vs recorded 80 ac/);
    expect(deriveCountyStatus([], 10).status).toBe('unresolved');
    expect(deriveCountyStatus([row({ countyFips: null, method: 'unresolved', reviewReason: 'Missing geometry' })], 10).reasons).toEqual(['Missing geometry']);
  });
  it('is manual, and flags a manual split that no longer matches recorded acreage', () => {
    const manual = [
      row({ id: 'a', method: 'manual', manualAcres: 45, proportion: 0.8182 }),
      row({ id: 'b', countyFips: '29015', method: 'manual', manualAcres: 10, proportion: 0.1818 }),
    ];
    expect(deriveCountyStatus(manual, 55).status).toBe('manual');
    expect(deriveCountyStatus(manual, 60).status).toBe('needs_review');
  });
  it('is estimated for provisional point results and honors a reviewer acknowledgement', () => {
    expect(deriveCountyStatus([row({ method: 'centroid', reviewStatus: 'needs_review', reviewReason: 'x' })], 10).status).toBe('needs_review');
    const reviewed = two.map(r => ({ ...r, reviewStatus: 'reviewed' as const }));
    expect(deriveCountyStatus(reviewed, 80).status).toBe('estimated');
  });
});

describe('allocateProduction', () => {
  const shares = sharesFromRows([
    row({ id: 'a', countyFips: '29083', countyName: 'Henry', proportion: 0.8333333 }),
    row({ id: 'b', countyFips: '29015', countyName: 'Benton', proportion: 0.1666667 }),
  ]);
  it('splits proportionally, reconciles exactly, and labels parts estimated', () => {
    const parts = allocateProduction(3333.33, shares);
    expect(Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100)).toBe(333333);
    expect(parts.every(p => p.estimated)).toBe(true);
  });
  it('does not label a single-county or unknown record estimated', () => {
    expect(allocateProduction(100, sharesFromRows([row()]))[0].estimated).toBe(false);
    const unknown = allocateProduction(100, sharesFromRows([]));
    expect(unknown[0].countyFips).toBeNull();
    expect(unknown[0].estimated).toBe(false);
  });
  it('uses county-specific production when it adds up, otherwise falls back to allocation', () => {
    const explicit = [{ countyFips: '29083', amount: 2500 }, { countyFips: '29015', amount: 833.33 }];
    const used = allocateProduction(3333.33, shares, { explicit });
    expect(used.map(p => p.amount)).toEqual([2500, 833.33]);
    expect(used.every(p => !p.estimated)).toBe(true);
    const mismatch = allocateProduction(3333.33, shares, { explicit: [{ countyFips: '29083', amount: 1 }] });
    expect(mismatch.every(p => p.estimated)).toBe(true);
  });
  it('allocates integer bales', () => {
    const parts = allocateProduction(101, shares, { decimals: 0 });
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(101);
  });
});
