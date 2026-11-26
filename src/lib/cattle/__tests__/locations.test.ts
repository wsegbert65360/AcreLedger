import { describe, expect, it } from 'vitest';

import { buildLocationOptions, currentLocationKind, isStalkSeason, locationKind, locationOptionLabel, type LocationContext } from '../locations';

const fields = [
  { id: 'p', name: 'North pasture', intendedUse: 'Pasture' },
  { id: 'h', name: 'Hay 40', intendedUse: 'Hay' },
  { id: 'c', name: 'Corn 80', intendedUse: 'Row crop' },
  { id: 's', name: 'Bean 60', intendedUse: 'Row crop' },
];

const base = (today: string): LocationContext => ({
  plantings: [
    { fieldId: 'c', crop: 'Corn', seasonYear: 2026 },
    { fieldId: 's', crop: 'Soybeans', seasonYear: 2026 },
  ],
  harvests: [{ fieldId: 'c', crop: 'Corn', harvestDate: '2026-10-20', seasonYear: 2026 }],
  hay: [{ fieldId: 'h', date: '2026-06-15', cuttingNumber: 1, seasonYear: 2026 }],
  moves: [],
  today,
  season: 2026,
});

describe('cattle locations', () => {
  it('classifies fields by intended use', () => {
    expect(locationKind({ intendedUse: 'Pasture' })).toBe('pasture');
    expect(locationKind({ intendedUse: 'Hay' })).toBe('hay');
    expect(locationKind({ intendedUse: 'Row crop' })).toBe('crop');
    expect(locationKind({})).toBe('crop');
  });

  it('offers stalks from September through March', () => {
    expect(isStalkSeason('2026-08-31')).toBe(false);
    expect(isStalkSeason('2026-09-01')).toBe(true);
    expect(isStalkSeason('2027-03-31')).toBe(true);
    expect(isStalkSeason('2027-04-01')).toBe(false);
  });

  it('orders pasture, hay, then crop and describes each', () => {
    const options = buildLocationOptions(fields, base('2026-11-26'));
    expect(options.map(item => item.id)).toEqual(['p', 'h', 's', 'c']);
    expect(options[1].detail).toBe('cut Jun 15 (cutting 1)');
    expect(options[3].detail).toBe('Corn stalks · harvested Oct 20');
    expect(options[2].detail).toBe('Soybeans stubble · not harvested yet');
    expect(locationOptionLabel(options[3])).toBe('Corn 80 — Crop field · Corn stalks · harvested Oct 20');
  });

  it('flags unharvested crop fields and offers crop fields in fall', () => {
    const fall = buildLocationOptions(fields, base('2026-11-26'));
    expect(fall.find(item => item.id === 's')).toMatchObject({ unharvested: true, suggested: true });
    expect(fall.find(item => item.id === 'c')).toMatchObject({ unharvested: false, suggested: true });
  });

  it('hides unharvested crop fields in summer, but not harvested ones', () => {
    const summer = buildLocationOptions(fields, base('2026-07-10'));
    expect(summer.find(item => item.id === 's')?.suggested).toBe(false);
    expect(summer.find(item => item.id === 'c')?.suggested).toBe(true);
  });

  it('reports the kind of a herd’s current field', () => {
    expect(currentLocationKind('c', fields)).toBe('crop');
    expect(currentLocationKind(undefined, fields)).toBeNull();
    expect(currentLocationKind('missing', fields)).toBeNull();
  });
});
