/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Field } from '@/types/farm';

const farm = vi.hoisted(() => ({
  fields: [] as Field[],
  fsaTracts: [] as unknown[],
  cluAssignments: [] as unknown[],
}));

const loadKeyedTractCollections = vi.hoisted(() =>
  vi.fn(async () => [] as Array<{
    tractKey: string;
    collection: { type: 'FeatureCollection'; features: unknown[] };
  }>),
);

const leaflet = vi.hoisted(() => {
  const polygon = vi.fn((_latlngs: unknown, _options?: unknown) => ({
    addTo: vi.fn().mockReturnThis(),
    bindTooltip: vi.fn().mockReturnThis(),
  }));
  const featureGroup = vi.fn(() => ({
    addTo: vi.fn().mockReturnThis(),
    getBounds: vi.fn(() => ({})),
  }));
  const map = {
    getContainer: () => document.createElement('div'),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    fitBounds: vi.fn(),
  };
  return { polygon, featureGroup, map };
});

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farm,
}));

vi.mock('@/lib/tractLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tractLookup')>();
  return {
    ...actual,
    loadKeyedTractCollections,
  };
});

vi.mock('@/lib/leafletSetup', () => ({}));

vi.mock('leaflet', () => {
  const L = {
    polygon: leaflet.polygon,
    featureGroup: leaflet.featureGroup,
  };
  return { default: L, ...L };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => (
    <div data-testid="map-container">{children as never}</div>
  ),
  TileLayer: () => null,
  Marker: () => <div data-testid="map-marker" />,
  useMap: () => leaflet.map,
}));

import FieldBoundaryMap, { boundaryRings } from '../FieldBoundaryMap';

const polygonCoords = [[
  [-93.5, 38.4],
  [-93.4, 38.4],
  [-93.4, 38.5],
  [-93.5, 38.5],
  [-93.5, 38.4],
]];

const polygonLatLngs = [
  [38.4, -93.5],
  [38.4, -93.4],
  [38.5, -93.4],
  [38.5, -93.5],
  [38.4, -93.5],
];

function makeField(overrides: Partial<Field> = {}): Field {
  return {
    id: 'field-1',
    name: 'Home 40',
    acreage: 40,
    lat: 38.45,
    lng: -93.45,
    farm_id: 'farm-1',
    deleted_at: null,
    ...overrides,
  };
}

describe('FieldBoundaryMap', () => {
  beforeEach(() => {
    farm.fields = [];
    farm.fsaTracts = [];
    farm.cluAssignments = [];
    loadKeyedTractCollections.mockReset();
    loadKeyedTractCollections.mockResolvedValue([]);
    leaflet.polygon.mockClear();
    leaflet.featureGroup.mockClear();
    leaflet.map.fitBounds.mockClear();
    leaflet.map.removeLayer.mockClear();
    leaflet.map.invalidateSize.mockClear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it('draws a saved field boundary and hides the empty label when there are no tract features', async () => {
    farm.fields = [makeField({
      boundary: { type: 'Polygon', coordinates: polygonCoords },
    })];

    render(<FieldBoundaryMap fieldId="field-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading map...')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('No boundary data')).not.toBeInTheDocument();
    expect(leaflet.polygon).toHaveBeenCalled();
    expect(leaflet.polygon.mock.calls[0][0]).toEqual(polygonLatLngs);
    expect(leaflet.map.fitBounds).toHaveBeenCalled();
  });

  it('shows No boundary data when the field has no rings and no features', async () => {
    farm.fields = [makeField()];

    render(<FieldBoundaryMap fieldId="field-1" />);

    await waitFor(() => {
      expect(screen.getByText('No boundary data')).toBeInTheDocument();
    });

    expect(leaflet.polygon).not.toHaveBeenCalled();
    expect(leaflet.map.fitBounds).not.toHaveBeenCalled();
  });

  it('renders tract/CLU features', async () => {
    farm.fields = [makeField({
      fsaFarmNumber: '918',
      fsaTractNumber: '1327',
    })];

    const featureLatLngs = [
      [38.3, -93.6],
      [38.3, -93.5],
      [38.4, -93.5],
      [38.3, -93.6],
    ];

    loadKeyedTractCollections.mockResolvedValue([{
      tractKey: '918-1327',
      collection: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-93.6, 38.3], [-93.5, 38.3], [-93.5, 38.4], [-93.6, 38.3]]],
          },
          properties: { cluNumber: '1', acres: 40 },
        }],
      },
    }]);

    render(<FieldBoundaryMap fieldId="field-1" />);

    await waitFor(() => {
      expect(leaflet.polygon).toHaveBeenCalled();
    });

    expect(screen.queryByText('No boundary data')).not.toBeInTheDocument();
    expect(leaflet.polygon.mock.calls[0][0]).toEqual([featureLatLngs]);
    expect(leaflet.map.fitBounds).toHaveBeenCalled();
  });
});

describe('boundaryRings', () => {
  it('converts Polygon coordinates from lng/lat to lat/lng', () => {
    expect(boundaryRings(makeField({
      boundary: { type: 'Polygon', coordinates: polygonCoords },
    }))).toEqual([polygonLatLngs]);
  });

  it('flattens MultiPolygon rings', () => {
    expect(boundaryRings(makeField({
      boundary: {
        type: 'MultiPolygon',
        coordinates: [
          [[[-94, 39], [-93, 39], [-93, 40], [-94, 39]]],
          [[[-92, 37], [-91, 37], [-91, 38], [-92, 37]]],
        ],
      },
    }))).toEqual([
      [[39, -94], [39, -93], [40, -93], [39, -94]],
      [[37, -92], [37, -91], [38, -91], [37, -92]],
    ]);
  });

  it('returns an empty list when the field has no usable boundary', () => {
    expect(boundaryRings(undefined)).toEqual([]);
    expect(boundaryRings(makeField({ boundary: null }))).toEqual([]);
    expect(boundaryRings(makeField({
      boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] },
    }))).toEqual([]);
  });
});
