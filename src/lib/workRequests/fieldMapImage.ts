import { hasValidGeometry, type GeoJSONGeometry } from '@/lib/geoHelpers';

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface FieldMapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const ESRI_STREET_MAP_ATTRIBUTION =
  'Road map sources: Esri, HERE, Garmin, USGS, OpenStreetMap contributors, and the GIS user community.';

const ESRI_STREET_MAP_EXPORT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/export';

export interface BuildFieldMapSvgOptions {
  geometry: GeoJSONGeometry | null | undefined;
  /** Chosen navigation point to mark on the map. */
  navPoint?: GpsPoint | null;
  /** Nearby road label text to render as a caption. */
  roadLabel?: string;
  /** SVG viewBox size in user units (square). Default 400. */
  size?: number;
  /** Padding inside the viewBox reserved around the boundary. Default 40. */
  padding?: number;
  /** Extra padding reserved at the top for the road label. Default 28. */
  labelPadding?: number;
}

/**
 * Build a self-contained SVG string showing a field boundary (highlighted),
 * an optional navigation-point marker, and an optional nearby-road caption.
 *
 * Generalizes the pure projection in `fieldThumbnail.ts` to a configurable
 * canvas size with padding, so the boundary fits with room for a readable label
 * and marker. The SVG is fully self-contained (no external refs), so it can be
 * rasterized to PNG via a canvas without tainting it.
 */
export function buildFieldMapSvg({
  geometry,
  navPoint,
  roadLabel,
  size = 400,
  padding = 40,
  labelPadding = 28,
}: BuildFieldMapSvgOptions): string {
  const valid = hasValidGeometry(geometry ?? undefined);
  const topPad = roadLabel ? labelPadding : 0;
  const effectivePadding = padding;
  const drawableSize = size - 2 * effectivePadding;

  // No geometry: render an empty placeholder map with the label only.
  if (!valid || !geometry) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
      `<rect x="0" y="0" width="${size}" height="${size}" fill="#f4f7f2" stroke="#cbd5d8" stroke-width="2" rx="8"/>`,
      `<text x="${size / 2}" y="${size / 2}" font-family="sans-serif" font-size="16" fill="#64748b" text-anchor="middle">No field boundary available</text>`,
      roadLabel ? `<text x="${size / 2}" y="${size - 16}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1e3a2b" text-anchor="middle">${escapeXml(roadLabel)}</text>` : '',
      `</svg>`,
    ].join('');
  }

  const polygons: number[][][][] =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  // Compute bounds over all rings.
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let pointCount = 0;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        pointCount += 1;
      }
    }
  }

  const hasBounds = pointCount >= 3 && (maxLng - minLng) > 0 && (maxLat - minLat) > 0;
  if (!hasBounds) {
    return buildFieldMapSvg({ geometry: null, navPoint, roadLabel, size, padding, labelPadding });
  }

  const lngRange = maxLng - minLng;
  const latRange = maxLat - minLat;
  const scale = drawableSize / Math.max(lngRange, latRange);

  // Reserve label space at top; center the drawable region below it.
  const drawableTop = effectivePadding + topPad;
  const offsetX = effectivePadding + (drawableSize - lngRange * scale) / 2;
  const offsetY = drawableTop + (drawableSize - latRange * scale) / 2;

  const project = (lng: number, lat: number): [number, number] => {
    const x = offsetX + (lng - minLng) * scale;
    const y = offsetY + (latRange - (lat - minLat)) * scale;
    return [x, y];
  };

  // Build boundary subpaths (outer + inner rings → holes).
  const subpaths: string[] = [];
  for (const poly of polygons) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const [fx, fy] = project(ring[0][0], ring[0][1]);
      let d = `M ${fx.toFixed(2)} ${fy.toFixed(2)}`;
      for (let i = 1; i < ring.length; i += 1) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      d += ' Z';
      subpaths.push(d);
    }
  }
  const boundaryPath = subpaths.join(' ');

  const elements: string[] = [];
  elements.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`);
  // Background + border (mimics a clean printable map frame).
  elements.push(`<rect x="0" y="0" width="${size}" height="${size}" fill="#ffffff" stroke="#cbd5d8" stroke-width="2" rx="8"/>`);
  // Light grid for a "map" feel without tiles.
  for (let g = effectivePadding; g < size - effectivePadding; g += 40) {
    elements.push(`<line x1="${effectivePadding}" y1="${g}" x2="${size - effectivePadding}" y2="${g}" stroke="#eef2f0" stroke-width="1"/>`);
    elements.push(`<line x1="${g}" y1="${drawableTop}" x2="${g}" y2="${size - effectivePadding}" stroke="#eef2f0" stroke-width="1"/>`);
  }
  // Boundary: highlighted fill + triple-stroked outline (matches FieldBoundaryMap emphasis).
  elements.push(`<path d="${boundaryPath}" fill="#2d7a4e" fill-opacity="0.35" stroke="#1e5e3a" stroke-width="3" stroke-linejoin="round" fill-rule="evenodd"/>`);

  // Navigation marker (drop pin).
  if (navPoint) {
    const [mx, my] = project(navPoint.lng, navPoint.lat);
    const r = 8;
    elements.push(`<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="${r + 4}" fill="#21294f" fill-opacity="0.2"/>`);
    elements.push(`<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="${r}" fill="#d4441f" stroke="#ffffff" stroke-width="2"/>`);
    elements.push(`<text x="${mx.toFixed(2)}" y="${(my - r - 6).toFixed(2)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e3a2b" text-anchor="middle">Navigate</text>`);
  }

  // Road caption (top label).
  if (roadLabel) {
    elements.push(`<text x="${size / 2}" y="${effectivePadding + 14}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1e3a2b" text-anchor="middle">${escapeXml(roadLabel)}</text>`);
  }

  elements.push('</svg>');
  return elements.join('');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function svgToDataUri(svg: string): string {
  const encoded = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(svg)))
    : typeof Buffer !== 'undefined'
      ? Buffer.from(svg).toString('base64')
      : encodeURIComponent(svg);
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Return a square, padded geographic extent with enough surrounding context
 * for nearby road names to be useful. The source geometry remains the only
 * highlighted acreage.
 */
export function getFieldMapBounds(
  geometry: GeoJSONGeometry | null | undefined,
): FieldMapBounds | null {
  if (!hasValidGeometry(geometry ?? undefined) || !geometry) return null;

  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }
  }

  if (![west, south, east, north].every(Number.isFinite)) return null;

  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  // Roughly double the field extent so adjacent named roads stay visible.
  // The minimum span is about 440m north/south at Missouri latitudes.
  const span = Math.max(east - west, north - south, 0.004) * 2;
  return {
    west: centerLng - span / 2,
    south: centerLat - span / 2,
    east: centerLng + span / 2,
    north: centerLat + span / 2,
  };
}

export function buildStreetMapExportUrl(
  bounds: FieldMapBounds,
  pixelSize = 1000,
): string {
  const size = Math.max(256, Math.min(Math.round(pixelSize), 2000));
  const params = new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${size},${size}`,
    format: 'png32',
    transparent: 'false',
    f: 'image',
  });
  return `${ESRI_STREET_MAP_EXPORT_URL}?${params.toString()}`;
}

export interface RasterizeFieldMapOptions {
  geometry: GeoJSONGeometry | null | undefined;
  navPoint?: GpsPoint | null;
  roadLabel?: string;
  pixelWidth?: number;
}

/**
 * Create the PDF map PNG from Esri's labeled street-map export, then draw only
 * the supplied crop geometry and navigation point over it. If the basemap is
 * unavailable, retain the printable self-contained boundary-map fallback.
 */
export async function rasterizeFieldMapToPng({
  geometry,
  navPoint,
  roadLabel,
  pixelWidth = 1000,
}: RasterizeFieldMapOptions): Promise<string> {
  const bounds = getFieldMapBounds(geometry);
  if (!bounds || typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    return rasterizeSvgToPng(buildFieldMapSvg({ geometry, navPoint, roadLabel }), pixelWidth);
  }

  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  if (isJsdom) {
    return rasterizeSvgToPng(buildFieldMapSvg({ geometry, navPoint, roadLabel }), pixelWidth);
  }

  try {
    const image = await loadCorsImage(buildStreetMapExportUrl(bounds, pixelWidth));
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelWidth;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.drawImage(image, 0, 0, pixelWidth, pixelWidth);
    drawMapOverlay(ctx, bounds, geometry!, navPoint ?? null, roadLabel, pixelWidth);
    return canvas.toDataURL('image/png');
  } catch {
    return rasterizeSvgToPng(buildFieldMapSvg({ geometry, navPoint, roadLabel }), pixelWidth);
  }
}

function loadCorsImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => reject(new Error('Map image timed out')), 10000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Map image failed to load'));
    };
    image.src = src;
  });
}

function drawMapOverlay(
  ctx: CanvasRenderingContext2D,
  bounds: FieldMapBounds,
  geometry: GeoJSONGeometry,
  navPoint: GpsPoint | null,
  roadLabel: string | undefined,
  size: number,
) {
  const project = (lng: number, lat: number): [number, number] => [
    ((lng - bounds.west) / (bounds.east - bounds.west)) * size,
    ((bounds.north - lat) / (bounds.north - bounds.south)) * size,
  ];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  ctx.save();
  ctx.beginPath();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach(([lng, lat], index) => {
        const [x, y] = project(lng, lat);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  ctx.fillStyle = 'rgba(34, 197, 94, 0.32)';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = Math.max(4, size / 160);
  ctx.lineJoin = 'round';
  ctx.fill('evenodd');
  ctx.stroke();

  if (navPoint) {
    const [x, y] = project(navPoint.lng, navPoint.lat);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(9, size / 70), 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, size / 250);
    ctx.stroke();
  }

  const footerHeight = Math.max(34, size / 20);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(0, size - footerHeight, size, footerHeight);
  ctx.fillStyle = '#1e3a2b';
  ctx.font = `bold ${Math.max(14, size / 45)}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(roadLabel || 'Crop acres', size / 45, size - footerHeight / 2);
  ctx.restore();
}

/**
 * Rasterize a self-contained SVG string to a PNG data URI via an off-DOM Image
 * + canvas. Safe from canvas tainting because the SVG has no external refs.
 *
 * `pixelWidth` sets the raster width (height follows the SVG aspect - square by
 * default). Returns a `data:image/png;base64,...` URI suitable for jsPDF
 * `addImage`. Falls back to a valid transparent PNG when SVG decoding is
 * unavailable, because jsPDF cannot embed SVG without an extra plugin.
 */
export function rasterizeSvgToPng(svg: string, pixelWidth = 800): Promise<string> {
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  if (isJsdom || typeof window === 'undefined' || typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(transparentPngDataUri());
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const fallback = () => {
      if (!settled) {
        settled = true;
        // jsPDF cannot add SVG images without an extra plugin. Return a tiny
        // valid PNG instead so a slow or unsupported SVG decode never aborts
        // the entire work-request PDF.
        resolve(transparentPngDataUri());
      }
    };

    try {
      const img = new Image();

      const cleanup = () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      };

      img.onload = () => {
        if (settled) return;
        try {
          const aspect = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
          const canvas = document.createElement('canvas');
          canvas.width = pixelWidth;
          canvas.height = Math.round(pixelWidth * aspect);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            fallback();
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          cleanup();
          settled = true;
          resolve(dataUrl);
        } catch {
          cleanup();
          fallback();
        }
      };

      img.onerror = () => {
        cleanup();
        fallback();
      };

      // A data URI is more reliable than a blob URL in iOS WKWebView and does
      // not require an asynchronous object-URL fetch before the 5-second guard.
      img.src = svgToDataUri(svg);
      timeoutId = setTimeout(fallback, 5000);
    } catch {
      fallback();
    }
  });
}

/** 1x1 transparent PNG used only when SVG decoding is unavailable. */
function transparentPngDataUri(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvnXAAAAAElFTkSuQmCC';
}
