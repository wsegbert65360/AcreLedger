import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  buildFieldMapSvg,
  buildStreetMapExportUrl,
  getFieldMapBounds,
  rasterizeSvgToPng,
} from './fieldMapImage';
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

describe('street map extent', () => {
  it('pads the crop geometry so surrounding roads can be labeled', () => {
    const bounds = getFieldMapBounds(POLYGON);

    expect(bounds).not.toBeNull();
    expect(bounds!.west).toBeLessThan(-93);
    expect(bounds!.east).toBeGreaterThan(-92.9);
    expect(bounds!.south).toBeLessThan(38);
    expect(bounds!.north).toBeGreaterThan(38.1);
    expect(bounds!.east - bounds!.west).toBeCloseTo(bounds!.north - bounds!.south);
  });

  it('builds a labeled Esri street-map PNG export request', () => {
    const bounds = getFieldMapBounds(POLYGON)!;
    const url = new URL(buildStreetMapExportUrl(bounds, 1200));

    expect(url.hostname).toBe('server.arcgisonline.com');
    expect(url.pathname).toContain('/World_Street_Map/MapServer/export');
    expect(url.searchParams.get('bboxSR')).toBe('4326');
    expect(url.searchParams.get('size')).toBe('1200,1200');
    expect(url.searchParams.get('format')).toBe('png32');
    expect(url.searchParams.get('f')).toBe('image');
  });
});

describe('rasterizeSvgToPng', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for a slow SVG decode and returns PNG data instead of SVG', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });

    class SlowImage {
      naturalWidth = 400;
      naturalHeight = 400;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        setTimeout(() => this.onload?.(), 300);
      }
    }

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName !== 'canvas') return realCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toDataURL: () => 'data:image/png;base64,slow-image',
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    vi.stubGlobal('Image', SlowImage);

    const resultPromise = rasterizeSvgToPng(buildFieldMapSvg({ geometry: POLYGON }));
    await vi.advanceTimersByTimeAsync(300);

    await expect(resultPromise).resolves.toBe('data:image/png;base64,slow-image');
  });

  it('uses a valid PNG fallback when SVG decoding fails', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onerror?.();
      }
    }
    vi.stubGlobal('Image', BrokenImage);

    const result = await rasterizeSvgToPng(buildFieldMapSvg({ geometry: POLYGON }));

    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(result).not.toContain('image/svg');
  });
});
