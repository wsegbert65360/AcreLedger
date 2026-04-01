import area from '@turf/area';

/**
 * Calculates the acreage of a polygon using Turf.js
 * @param geojson GeoJSON Polygon or MultiPolygon
 * @returns acreage rounded to 2 decimal places
 */
export function calculateAcreage(geojson: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }): number {
    try {
        const areaSqMeters = area(geojson as any); // area in square meters
        const acreage = areaSqMeters * 0.000247105; // convert to acres
        return parseFloat(acreage.toFixed(2));
    } catch (error) {
        console.error('Error calculating acreage:', error);
        return 0;
    }
}
