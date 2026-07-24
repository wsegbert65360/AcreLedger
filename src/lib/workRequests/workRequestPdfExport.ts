import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WorkRequest, WorkRequestFieldEntry, WorkRequestProduct } from '@/types/farm';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { buildNavigationUrl, formatNavigationCoords } from './navigation';
import {
  ESRI_STREET_MAP_ATTRIBUTION,
  rasterizeFieldMapToPng,
} from './fieldMapImage';
import { workTypeLabel, farmNamesForRequest } from './workRequestEmail';
import { NOMINATIM_ATTRIBUTION } from './roadLookup';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';

/** Required disclaimer printed at the end of every work request PDF/email. */
export const WORK_REQUEST_DISCLAIMER =
  'Field boundaries, locations, maps, roads, and acreages should be verified before application.';

interface FieldGeometryProvider {
  (fieldId: string): GeoJSONGeometry | null | undefined;
}

export interface ExportWorkRequestPdfOptions {
  request: WorkRequest;
  /** Resolve the live boundary geometry for a field id (for map rendering). */
  getGeometry?: FieldGeometryProvider;
}

function display(value: string | undefined | null): string {
  return value?.trim() || '—';
}

function formatDate(value?: string | null): string {
  return value ? formatIsoDate(value) : '—';
}

function productSummary(products: WorkRequestProduct[]): string {
  if (products.length === 0) return '—';
  return products.map(p => {
    const rate = [p.applicationRate, p.rateUnit].filter(Boolean).join(' ');
    return rate ? `${p.productName} @ ${rate}` : p.productName;
  }).join('; ');
}

function effectiveProducts(field: WorkRequestFieldEntry, request: WorkRequest): WorkRequestProduct[] {
  return field.overrides?.products ?? request.products;
}

function effectiveCrop(field: WorkRequestFieldEntry, request: WorkRequest): string {
  return field.overrides?.crop ?? field.crop ?? request.crop ?? '';
}

function effectiveNotes(field: WorkRequestFieldEntry, request: WorkRequest): string {
  return field.overrides?.notes ?? request.notes ?? '';
}

/**
 * Generate a multi-page work request PDF.
 *
 * Layout (modeled on fsa578PdfExport.ts):
 *   - Page 1+: branding header, request #/created date/status, customer/provider,
 *     work details, products autotable, summary line, acreage-breakdown autotable.
 *   - One page per field: field header, map PNG, GPS coords, clickable nav link,
 *     nearby road, per-field overrides.
 *   - Every page repeats a running header (farm/crop year/request #) and
 *     `Page X of Y` footer.
 *   - Final line: the required verification disclaimer.
 *
 * Map images use a labeled Esri street-map export with the crop geometry
 * highlighted. A self-contained boundary image remains the offline fallback.
 */
export async function exportWorkRequestPdf({
  request,
  getGeometry,
}: ExportWorkRequestPdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const farms = farmNamesForRequest(request);
  const totalAcres = roundTo(request.fields.reduce((sum, f) => sum + (f.acreage || 0), 0), 2);

  // Pre-rasterize field maps so the summary page can flow without async gaps.
  const fieldMaps = await Promise.all(request.fields.map(async (entry) => {
    const geometry = getGeometry?.(entry.fieldId) ?? null;
    const navPoint = entry.navigationLat != null && entry.navigationLng != null
      ? { lat: entry.navigationLat, lng: entry.navigationLng }
      : null;
    const roadLabel = entry.nearbyRoad ? `Nearby road: ${entry.nearbyRoad}` : 'Field boundary';
    try {
      const image = await rasterizeFieldMapToPng({
        geometry,
        navPoint,
        roadLabel,
        pixelWidth: 1000,
      });
      return image.startsWith('data:image/png') ? image : null;
    } catch {
      return null;
    }
  }));

  const drawRunningHeader = (firstPage = false) => {
    doc.setTextColor(35, 64, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(firstPage ? 18 : 9);
    doc.text(firstPage ? 'AcreLedger — Work Request' : 'AcreLedger Work Request', margin, firstPage ? 16 : 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(firstPage ? 9 : 7.5);
    doc.setTextColor(70);
    const identity = `Request: ${request.requestNumber}  |  Status: ${request.status}  |  Created: ${formatDate(request.createdAt)}  |  Crop year: ${request.cropYear}`;
    doc.text(identity, margin, firstPage ? 22 : 15);
  };

  const tableDefaults = {
    theme: 'striped' as const,
    margin: { left: margin, right: margin, top: 24, bottom: 16 },
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' as const, valign: 'middle' as const },
    headStyles: { fillColor: [45, 90, 27] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [244, 247, 242] as [number, number, number] },
  };

  // ── Summary page ──────────────────────────────────────────────────────────
  drawRunningHeader(true);

  let y = 30;

  // Customer / provider block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text('Customer', margin, y);
  doc.text('Provider', pageWidth / 2, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70);
  y += 5;
  const customerLines = [
    request.customerName,
    request.customerPhone ? `Phone: ${request.customerPhone}` : '',
    request.customerBillingAddress ? request.customerBillingAddress : '',
  ].filter(Boolean);
  const providerLines = [
    request.providerName ? request.providerName : '—',
    request.providerEmail ? request.providerEmail : '',
  ].filter(Boolean);
  doc.text(customerLines, margin, y);
  doc.text(providerLines, pageWidth / 2, y);
  y += Math.max(customerLines.length, providerLines.length) * 5 + 4;

  // Work details block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text('Work details', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70);
  y += 5;
  const workLines = [
    `Work type: ${workTypeLabel(request.workType)}`,
    `Requested completion: ${formatDate(request.requestedCompletionDate)}`,
    request.crop ? `Crop: ${request.crop}` : '',
    request.currentCropStage ? `Current stage: ${request.currentCropStage}` : '',
    request.previousCrop ? `Previous crop: ${request.previousCrop}` : '',
    request.nextPlannedCrop ? `Next planned crop: ${request.nextPlannedCrop}` : '',
  ].filter(Boolean);
  doc.text(workLines, margin, y);
  y += workLines.length * 5 + 4;

  // Products autotable
  if (request.products.length > 0) {
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['PRODUCT', 'RATE', 'CARRIER', 'METHOD', 'SUPPLIED BY']],
      body: request.products.map(p => [
        p.productName,
        [p.applicationRate, p.rateUnit].filter(Boolean).join(' ') || '—',
        [p.carrierVolume, p.carrierVolumeUnit].filter(Boolean).join(' ') || '—',
        p.applicationMethod || '—',
        p.supplier ? (p.supplier === 'farmer' ? 'Farmer' : 'Applicator') : '—',
      ]),
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { cellWidth: 40 },
      },
    });
    y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  }

  // Summary line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text(`Summary: ${farms.length} farm${farms.length !== 1 ? 's' : ''} · ${request.fields.length} field${request.fields.length !== 1 ? 's' : ''} · ${totalAcres} total acres`, margin, y);
  y += 6;

  // Acreage breakdown autotable
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['FARM', 'FIELD', 'CROP', 'ACRES']],
    body: request.fields.map(f => [
      f.farmName,
      f.fieldName,
      display(effectiveCrop(f, request)),
      f.acreage,
    ]),
    foot: [['', '', 'TOTAL', totalAcres]],
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 50 },
      2: { cellWidth: 40 },
      3: { cellWidth: 30, halign: 'right' },
    },
    footStyles: { fillColor: [45, 90, 27] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
  });

  // ── One page per field ────────────────────────────────────────────────────
  request.fields.forEach((entry, index) => {
    doc.addPage('letter', 'portrait');
    drawRunningHeader(false);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(35, 64, 28);
    doc.text(`Field ${index + 1} of ${request.fields.length}: ${entry.fieldName}`, margin, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70);
    doc.text(`${entry.farmName} · ${entry.acreage} ac · Crop: ${display(effectiveCrop(entry, request))}`, margin, 30);

    // Map image — fixed size so it never splits across pages.
    const dataUri = fieldMaps[index];
    if (dataUri) {
      const imgSize = 120;
      const imgX = (pageWidth - imgSize) / 2;
      const format = dataUri.startsWith('data:image/svg') ? 'SVG' : 'PNG';
      doc.addImage(dataUri, format, imgX, 36, imgSize, imgSize);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(105);
      doc.text(ESRI_STREET_MAP_ATTRIBUTION, pageWidth / 2, 158.5, {
        align: 'center',
        maxWidth: pageWidth - 2 * margin,
      });
    } else {
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text('Map image unavailable.', margin, 50);
    }

    let fieldY = 164;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text('Location & navigation', margin, fieldY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70);
    fieldY += 6;

    const navLat = entry.navigationLat;
    const navLng = entry.navigationLng;
    const gpsLabel = entry.gpsLat != null && entry.gpsLng != null
      ? `${entry.gpsLat.toFixed(5)}, ${entry.gpsLng.toFixed(5)}`
      : 'Coordinates unavailable';
    doc.text(`Field GPS: ${gpsLabel}`, margin, fieldY);
    fieldY += 5;
    doc.text(`Navigation point: ${formatNavigationCoords(navLat, navLng)}`, margin, fieldY);
    fieldY += 5;
    doc.text(`Nearby road: ${display(entry.nearbyRoad)}`, margin, fieldY);
    fieldY += 7;

    // Clickable navigation link
    if (navLat != null && navLng != null) {
      const navUrl = buildNavigationUrl(navLat, navLng, 'pdf');
      doc.setTextColor(30, 90, 200);
      doc.textWithLink('Tap to navigate (opens maps)', margin, fieldY, { url: navUrl });
      doc.setTextColor(70);
      fieldY += 7;
    }

    // Per-field overrides
    const fieldProducts = effectiveProducts(entry, request);
    const fieldNotes = effectiveNotes(entry, request);
    if (fieldProducts.length > 0 && fieldProducts !== request.products) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(40);
      doc.text('Products for this field (override)', margin, fieldY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70);
      fieldY += 5;
      doc.text(productSummary(fieldProducts), margin, fieldY, { maxWidth: pageWidth - 2 * margin });
      fieldY += 7;
    }
    if (fieldNotes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(40);
      doc.text('Notes for this field', margin, fieldY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70);
      fieldY += 5;
      const wrapped = doc.splitTextToSize(fieldNotes, pageWidth - 2 * margin);
      doc.text(wrapped, margin, fieldY);
    }
  });

  // ── Disclaimer page ───────────────────────────────────────────────────────
  doc.addPage('letter', 'portrait');
  drawRunningHeader(false);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text('Verification', margin, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(70);
  const disclaimerWrapped = doc.splitTextToSize(WORK_REQUEST_DISCLAIMER, pageWidth - 2 * margin);
  doc.text(disclaimerWrapped, margin, 38);
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(NOMINATIM_ATTRIBUTION, margin, 50);

  // ── Footer + page numbers on every page ───────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(190);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    const footerLeft = `AcreLedger | ${request.requestNumber} | ${farms.length > 0 ? farms.join(', ') : 'Farm'} | Crop year ${request.cropYear}`;
    doc.text(footerLeft, margin, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  return doc;
}

/** Build the canonical filename for a work request PDF. */
export function workRequestFileName(request: WorkRequest): string {
  const safeNumber = request.requestNumber.replace(/[^A-Za-z0-9-]/g, '_');
  return `${safeNumber}.pdf`;
}
