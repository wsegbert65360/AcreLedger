import { describe, expect, it } from 'vitest';

import { resolveFieldRainfallLocation } from '@/lib/fieldLocation';
import type { TractFeatureCollection } from '@/lib/tractLookup';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';

const tractGeojson: TractFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { cluNumber: '7', acres: 8.13 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-93.5, 38.46],
          [-93.54, 38.46],
          [-93.54, 38.48],
          [-93.5, 38.48],
          [-93.5, 38.46],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { cluNumber: '8', acres: 4.25 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-94, 39],
          [-94.1, 39],
          [-94.1, 39.1],
          [-94, 39.1],
          [-94, 39],
        ]],
      },
    },
  ],
};

const tractImport: FsaTractImport = {
  id: 'tract-import-1',
  farmId: 'farm-1',
  tractKey: '6418-9423',
  filename: '6418-9423.geojson',
  featureCount: 2,
  geojson: tractGeojson,
  importedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
};

const baseField: Field = {
  id: 'field-1',
  farm_id: 'farm-1',
  name: 'Pasture Twyman corner',
  acreage: 8,
  lat: null,
  lng: null,
  deleted_at: null,
};

const assignment: FieldCluAssignment = {
  id: 'assignment-1',
  farmId: 'farm-1',
  fieldId: 'field-1',
  tractKey: '6418-9423',
  cluNumber: '7',
  acres: 8.13,
  landUse: 'cropland',
  assignedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
};

describe('resolveFieldRainfallLocation', () => {
  it('uses rounded field coordinates first', async () => {
    const location = await resolveFieldRainfallLocation(
      { ...baseField, lat: 38.46274, lng: -93.53744 },
      [assignment],
      [tractImport],
    );

    expect(location).toMatchObject({
      lat: 38.4627,
      lng: -93.5374,
      source: 'field_coordinates',
    });
  });

  it('keeps a valid drawn field boundary when coordinates are missing', async () => {
    const boundary = {
      type: 'Polygon' as const,
      coordinates: [[
        [-93.5, 38.46],
        [-93.54, 38.46],
        [-93.54, 38.48],
        [-93.5, 38.48],
        [-93.5, 38.46],
      ]],
    };

    const location = await resolveFieldRainfallLocation(
      { ...baseField, boundary },
      [assignment],
      [tractImport],
    );

    expect(location).toMatchObject({
      lat: 38.468,
      lng: -93.516,
      boundary: null,
      source: 'field_boundary',
    });
  });

  it('falls back to assigned CLU geometry when field coordinates and boundary are missing', async () => {
    const location = await resolveFieldRainfallLocation(baseField, [assignment], [tractImport]);

    expect(location).toMatchObject({
      lat: 38.468,
      lng: -93.516,
      boundary: null,
      source: 'assigned_clu',
    });
  });

  it('falls back to legacy CLU numbers when no active assignment exists', async () => {
    const location = await resolveFieldRainfallLocation(
      {
        ...baseField,
        fsaFarmNumber: '6418',
        fsaTractNumber: '9423',
        cluNumbers: ['7'],
      },
      [],
      [tractImport],
    );

    expect(location).toMatchObject({
      lat: 38.468,
      lng: -93.516,
      boundary: null,
      source: 'legacy_clu',
    });
  });
});
