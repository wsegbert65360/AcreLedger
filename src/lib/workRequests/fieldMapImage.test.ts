import { describe, it, expect } from 'vitest';
import { buildFieldMapSvg } from './fieldMapImage';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';

const POLYGON: GeoJSONGeometry = {
  type: 'Polygon',
  coordinates: [[
    [-93.0, 38.0],
    [-92.9, 38.0],
    [-92.9, 38.1],
    [-93.0, 38.1],
    [-93.0, 38.0],
  ]],
};

const MULTIPOLYGON: GeoJSONGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [[[-93.0, 38.0], [-92.95, 38.0], [-92.95, 38.05], [-93.0, 38.05], [-93.0, 38.0]]],
    [[[-92.9, 38.05], [-92.85, 38.05], [-92.85, 38.1], [-92.9, 38.1], [-92.9, 38.05]]],
  ],
};

describe('buildFieldMapSvg', () => {
  it('renders a self-contained SVG with a boundary path for a Polygon', () => {
    const svg = buildFieldMapSvg({ geometry: POLYGON });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<path');
    expect(svg).toContain('fill="#2d7a4e"');
  });

  it('supports MultiPolygon geometry', () => {
    const svg = buildFieldMapSvg({ geometry: MULTIPOLYGON });
    expect(svg).toContain('<path');
    // Both polygons project into one path string (subpaths joined).
    expect(svg).toMatch(/d="M [0-9.]+ [0-9.]+.*Z.*M [0-9.]+ [0-9.]+.*Z/);
  });

  it('renders the road label as a caption when provided', () => {
    const svg = buildFieldMapSvg({ geometry: POLYGON, roadLabel: 'County Road 5' });
    expect(svg).toContain('County Road 5');
  });

  it('renders a navigation marker when a nav point is provided', () => {
    const svg = buildFieldMapSvg({ geometry: POLYGON, navPoint: { lat: 38.0, lng: -92.9 } });
    expect(svg).toContain('Navigate');
    expect(svg).toContain('fill="#d4441f"'); // marker pin color
  });

  it('omits the nav marker when no nav point is given', () => {
    const svg = buildFieldMapSvg({ geometry: POLYGON });
    expect(svg).not.toContain('Navigate');
  });

  it('renders a placeholder when geometry is missing or invalid', () => {
    const svg = buildFieldMapSvg({ geometry: null, roadLabel: 'Unknown field' });
    expect(svg).toContain('No field boundary available');
    expect(svg).toContain('Unknown field');
  });

  it('escapes XML-special characters in the road label', () => {
    const svg = buildFieldMapSvg({ geometry: POLYGON, roadLabel: 'Route <&>"\'5' });
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&apos;');
    expect(svg).not.toContain('<&>');
  });

  it('respects the custom size and padding', () => {
    const svg = buildFieldMapSvg({ geometry: POLYGON, size: 600, padding: 50 });
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="600"');
  });
});
