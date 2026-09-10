import { strToU8, zipSync } from 'fflate';

/**
 * Builds real ESRI shapefile ZIP fixtures (SHP + DBF + optional PRJ) in memory
 * so CLU import tests exercise the actual local conversion path instead of a
 * mocked parser. Geometry is lon/lat or projected pairs depending on the caller.
 */

export interface ShapefileFeatureFixture {
  /** One entry per polygon part; each ring is a list of [x, y] points (closed or not). */
  rings: number[][][];
  attributes: Record<string, string | number>;
}

export interface ShapefileZipOptions {
  features: ShapefileFeatureFixture[];
  /** WKT projection text written to the .prj file. Omit to simulate a missing PRJ. */
  prj?: string;
  /** Set false to omit the .dbf (simulates an incomplete shapefile ZIP). */
  includeDbf?: boolean;
}

const WGS84_WKT = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.25722293]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';

const UTM15N_WKT = 'PROJCS["NAD83 / UTM zone 15N",GEOGCS["NAD83",DATUM["North_American_Datum_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-93],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["Meter",1]]';

export const GEOGRAPHIC_WGS84_PRJ = WGS84_WKT;
export const UTM_ZONE_15N_PRJ = UTM15N_WKT;

function buildShpPolygonRecord(recordNumber: number, rings: number[][][]): Uint8Array {
  const numParts = rings.length;
  const numPoints = rings.reduce((sum, ring) => sum + ring.length, 0);
  const contentBytes = 4 + 32 + 4 + 4 + numParts * 4 + numPoints * 16;
  const buffer = new ArrayBuffer(8 + contentBytes);
  const view = new DataView(buffer);

  view.setInt32(0, recordNumber, false);
  view.setInt32(4, contentBytes / 2, false);

  let offset = 8;
  view.setInt32(offset, 5, true); // shape type 5 = Polygon
  offset += 4;

  const allPoints = rings.flat();
  const xs = allPoints.map(pt => pt[0]);
  const ys = allPoints.map(pt => pt[1]);
  view.setFloat64(offset, Math.min(...xs), true);
  view.setFloat64(offset + 8, Math.min(...ys), true);
  view.setFloat64(offset + 16, Math.max(...xs), true);
  view.setFloat64(offset + 24, Math.max(...ys), true);
  offset += 32;

  view.setInt32(offset, numParts, true);
  offset += 4;
  view.setInt32(offset, numPoints, true);
  offset += 4;

  let pointIndex = 0;
  for (const ring of rings) {
    view.setInt32(offset, pointIndex, true);
    offset += 4;
    pointIndex += ring.length;
  }
  for (const ring of rings) {
    for (const [x, y] of ring) {
      view.setFloat64(offset, x, true);
      view.setFloat64(offset + 8, y, true);
      offset += 16;
    }
  }

  return new Uint8Array(buffer);
}

function buildShp(features: ShapefileFeatureFixture[]): Uint8Array {
  const records = features.map((feature, index) => buildShpPolygonRecord(index + 1, feature.rings));
  const bodyBytes = records.reduce((sum, record) => sum + record.byteLength, 0);
  const buffer = new ArrayBuffer(100 + bodyBytes);
  const view = new DataView(buffer);

  view.setInt32(0, 9994, false); // file code
  view.setInt32(24, (100 + bodyBytes) / 2, false); // total length in 16-bit words
  view.setInt32(28, 1000, true); // version
  view.setInt32(32, 5, true); // shape type

  const allPoints = features.flatMap(feature => feature.rings.flat());
  const xs = allPoints.map(pt => pt[0]);
  const ys = allPoints.map(pt => pt[1]);
  view.setFloat64(36, Math.min(...xs), true);
  view.setFloat64(44, Math.min(...ys), true);
  view.setFloat64(52, Math.max(...xs), true);
  view.setFloat64(60, Math.max(...ys), true);

  let offset = 100;
  const bytes = new Uint8Array(buffer);
  for (const record of records) {
    bytes.set(record, offset);
    offset += record.byteLength;
  }

  return bytes;
}

function buildDbf(features: ShapefileFeatureFixture[]): Uint8Array {
  const keys = Array.from(new Set(features.flatMap(feature => Object.keys(feature.attributes))));
  const fields = keys.map(name => {
    const values = features.map(feature => String(feature.attributes[name] ?? ''));
    const numeric = features.every(feature => typeof feature.attributes[name] === 'number');
    return {
      name,
      type: numeric ? 'N' as const : 'C' as const,
      length: Math.max(1, ...values.map(value => value.length)),
    };
  });

  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const buffer = new ArrayBuffer(headerLength + features.length * recordLength + 1);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const encoder = new TextEncoder();

  view.setUint8(0, 0x03); // dBase III version
  const now = new Date();
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, features.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);

  let offset = 32;
  for (const field of fields) {
    const nameBytes = encoder.encode(field.name.slice(0, 10));
    bytes.set(nameBytes, offset);
    bytes[offset + 11] = field.type.charCodeAt(0);
    bytes[offset + 16] = field.length;
    offset += 32;
  }
  bytes[offset] = 0x0d;
  offset += 1;

  for (const feature of features) {
    bytes[offset] = 0x20; // active record flag
    offset += 1;
    for (const field of fields) {
      const value = String(feature.attributes[field.name] ?? '').padEnd(field.length, ' ');
      bytes.set(encoder.encode(value.slice(0, field.length)), offset);
      offset += field.length;
    }
  }
  bytes[offset] = 0x1a; // EOF

  return bytes;
}

/** Builds a genuine ESRI shapefile ZIP fixture in memory. */
export function buildShapefileZip({ features, prj, includeDbf = true }: ShapefileZipOptions): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'fields.shp': buildShp(features),
  };
  if (includeDbf) {
    entries['fields.dbf'] = buildDbf(features);
  }
  if (prj !== undefined) {
    entries['fields.prj'] = strToU8(prj);
  }
  return zipSync(entries);
}

export function shapefileZipFile(bytes: Uint8Array, filename = 'fields.zip'): File {
  // Copy into a fresh exact-size buffer so jsdom's Blob/File accepts it as a BlobPart.
  return new File([new Uint8Array(bytes)], filename, { type: 'application/zip' });
}

/** A small square ring around (x, y), ~100 m on a side at Missouri latitudes. */
export function squareRing(x: number, y: number, size = 0.001): number[][] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}
