import { describe, it, expect } from 'vitest';
import { getLatLngsFromGeometry, hasValidGeometry, getCentroid, type GeoJSONGeometry } from '../geoHelpers';

describe('geoHelpers', () => {
  const mockPolygon: GeoJSONGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-93.54, 38.47],
        [-93.53, 38.47],
        [-93.53, 38.48],
        [-93.54, 38.48],
        [-93.54, 38.47]
      ]
    ]
  };

  const mockMultiPolygon: GeoJSONGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-93.54, 38.47],
          [-93.53, 38.47],
          [-93.53, 38.48],
          [-93.54, 38.48],
          [-93.54, 38.47]
        ]
      ],
      [
        [
          [-93.56, 38.49],
          [-93.55, 38.49],
          [-93.55, 38.50],
          [-93.56, 38.50],
          [-93.56, 38.49]
        ]
      ]
    ]
  };

  describe('getLatLngsFromGeometry', () => {
    it('should correctly format polygon coordinates as LatLngExpression[][] (reversing lat/lng order)', () => {
      const result = getLatLngsFromGeometry(mockPolygon) as any;
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(5);
      expect(result[0][0]).toEqual([38.47, -93.54]);
    });

    it('should correctly format multipolygon coordinates as LatLngExpression[][][] (reversing lat/lng order)', () => {
      const result = getLatLngsFromGeometry(mockMultiPolygon) as any;
      expect(result).toHaveLength(2);
      expect(result[0][0]).toHaveLength(5);
      expect(result[0][0][0]).toEqual([38.47, -93.54]);
      expect(result[1][0][0]).toEqual([38.49, -93.56]);
    });

    it('should return empty array for undefined or invalid geometry', () => {
      expect(getLatLngsFromGeometry(undefined)).toEqual([]);
      expect(getLatLngsFromGeometry({ type: 'Point', coordinates: [0, 0] } as any)).toEqual([]);
    });
  });

  describe('hasValidGeometry', () => {
    it('should return true for valid Polygon geometries with at least 3 points', () => {
      expect(hasValidGeometry(mockPolygon)).toBe(true);
    });

    it('should return true for valid MultiPolygon geometries', () => {
      expect(hasValidGeometry(mockMultiPolygon)).toBe(true);
    });

    it('should return false for invalid or empty geometries', () => {
      expect(hasValidGeometry(undefined)).toBe(false);
      expect(hasValidGeometry({ type: 'Polygon', coordinates: [] } as any)).toBe(false);
      expect(hasValidGeometry({ type: 'Polygon', coordinates: [[]] } as any)).toBe(false);
      expect(hasValidGeometry({ type: 'Polygon', coordinates: [[[-93.54, 38.47], [-93.53, 38.47]]] } as any)).toBe(false);
    });
  });

  describe('getCentroid', () => {
    it('should calculate the average centroid for Polygon features', () => {
      const features = [{ geometry: mockPolygon }];
      const result = getCentroid(features);
      expect(result[0]).toBeCloseTo(38.474, 3);
      expect(result[1]).toBeCloseTo(-93.536, 3);
    });

    it('should calculate the average centroid for MultiPolygon features', () => {
      const features = [{ geometry: mockMultiPolygon }];
      const result = getCentroid(features);
      // Polygon 1 sumLat = 38.47*2 + 38.48*2 + 38.47 = 192.37
      // Polygon 2 sumLat = 38.49*2 + 38.50*2 + 38.49 = 192.47
      // Total lat = 384.84 / 10 = 38.484
      expect(result[0]).toBeCloseTo(38.48, 2);
    });

    it('should return default center when features array is empty', () => {
      expect(getCentroid([])).toEqual([38.47, -93.54]);
    });
  });
});
