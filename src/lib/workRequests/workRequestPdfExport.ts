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
 *   - Compact atomic field blocks: map on the left, location/road/overrides on
 *     the right. Multiple fields share a page when they fit; a field block is
 *     never split across pages.
 *   - Every page repeats a running header (farm/crop year/request #) and
 *     `Page X of Y` footer.
 *   - Every page footer includes the required verification disclaimer.
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

  // Compact customer / provider / work-details row.
  const summaryColumnGap = 6;
  const summaryColumnWidth = (pageWidth - 2 * margin - summaryColumnGap * 2) / 3;
  const summaryX = [
    margin,
    margin + summaryColumnWidth + summaryColumnGap,
    margin + (summaryColumnWidth + summaryColumnGap) * 2,
  ];
  const wrapSummaryLines = (lines: string[]) =>
    lines.flatMap(line => doc.splitTextToSize(line, summaryColumnWidth) as string[]);
  const customerLines = wrapSummaryLines([
    request.customerName,
    request.customerPhone ? `Phone: ${request.customerPhone}` : '',
    request.customerBillingAddress ? request.customerBillingAddress : '',
  ].filter(Boolean));
  const providerLines = wrapSummaryLines([
    request.providerName ? request.providerName : '—',
    request.providerEmail ? request.providerEmail : '',
  ].filter(Boolean));
  const workLines = wrapSummaryLines([
    `Type: ${workTypeLabel(request.workType)}`,
    `Due: ${formatDate(request.requestedCompletionDate)}`,
    request.crop ? `Crop: ${request.crop}` : '',
    request.currentCropStage ? `Stage: ${request.currentCropStage}` : '',
    request.previousCrop ? `Previous: ${request.previousCrop}` : '',
    request.nextPlannedCrop ? `Next: ${request.nextPlannedCrop}` : '',
  ].filter(Boolean));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40);
  doc.text('Customer', summaryX[0], y);
  doc.text('Provider', summaryX[1], y);
  doc.text('Work details', summaryX[2], y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70);
  y += 4.5;
  doc.text(customerLines, summaryX[0], y);
  doc.text(providerLines, summaryX[1], y);
  doc.text(workLines, summaryX[2], y);
  y += Math.max(customerLines.length, providerLines.length, workLines.length) * 3.6 + 5;

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

  // ── Compact, non-splitting field blocks ───────────────────────────────────
  const contentTop = 20;
  const contentBottom = pageHeight - 20;
  const mapSize = 46;
  const columnGap = 6;
  const detailsX = margin + mapSize + columnGap;
  const detailsWidth = pageWidth - margin - detailsX;
  const blockGap = 3;
  const wrap = (value: string, width: number): string[] =>
    doc.splitTextToSize(value, width) as string[];

  const measureFieldBlock = (entry: WorkRequestFieldEntry, index: number) => {
    const titleLines = wrap(`Field ${index + 1} of ${request.fields.length}: ${entry.fieldName}`, pageWidth - 2 * margin);
    const headerHeight = titleLines.length * 4.2 + 6;
    const navLat = entry.navigationLat;
    const navLng = entry.navigationLng;
    const gpsLabel = entry.gpsLat != null && entry.gpsLng != null
      ? `${entry.gpsLat.toFixed(5)}, ${entry.gpsLng.toFixed(5)}`
      : 'Coordinates unavailable';
    const gpsLines = wrap(`Field GPS: ${gpsLabel}`, detailsWidth);
    const navLines = wrap(`Navigation: ${formatNavigationCoords(navLat, navLng)}`, detailsWidth);
    const roadLines = wrap(`Nearby road: ${display(entry.nearbyRoad)}`, detailsWidth);
    const fieldProducts = effectiveProducts(entry, request);
    const hasProductOverride = fieldProducts.length > 0 && fieldProducts !== request.products;
    const productLines = hasProductOverride ? wrap(productSummary(fieldProducts), detailsWidth) : [];
    const fieldNotes = effectiveNotes(entry, request);
    const noteLines = fieldNotes ? wrap(fieldNotes, detailsWidth) : [];
    let detailsHeight = 5;
    detailsHeight += gpsLines.length * 3.5;
    detailsHeight += navLines.length * 3.5;
    detailsHeight += roadLines.length * 3.5 + 1;
    if (navLat != null && navLng != null) detailsHeight += 4.5;
    if (hasProductOverride) detailsHeight += 4 + productLines.length * 3.4;
    if (noteLines.length > 0) detailsHeight += 4 + noteLines.length * 3.4;

    const mapHeight = mapSize + 1;
    return {
      titleLines,
      headerHeight,
      gpsLines,
      navLines,
      roadLines,
      productLines,
      noteLines,
      hasProductOverride,
      navLat,
      navLng,
      height: headerHeight + Math.max(mapHeight, detailsHeight) + 2,
    };
  };

  const drawFieldBlock = (
    entry: WorkRequestFieldEntry,
    index: number,
    startY: number,
    layout: ReturnType<typeof measureFieldBlock>,
  ) => {
    doc.setDrawColor(205);
    doc.line(margin, startY, pageWidth - margin, startY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(35, 64, 28);
    doc.text(layout.titleLines, margin, startY + 4);

    const subtitleY = startY + layout.titleLines.length * 4.2 + 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(70);
    doc.text(
      `${entry.farmName} · ${entry.acreage} ac · Crop: ${display(effectiveCrop(entry, request))}`,
      margin,
      subtitleY,
    );

    const bodyY = startY + layout.headerHeight;
    const dataUri = fieldMaps[index];
    if (dataUri) {
      doc.addImage(dataUri, 'PNG', margin, bodyY, mapSize, mapSize);
    } else {
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text('Map image unavailable.', margin + mapSize / 2, bodyY + mapSize / 2, { align: 'center' });
    }

    let detailY = bodyY + 3.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(40);
    doc.text('Location & navigation', detailsX, detailY);
    detailY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(70);
    for (const lines of [layout.gpsLines, layout.navLines, layout.roadLines]) {
      doc.text(lines, detailsX, detailY);
      detailY += lines.length * 3.5;
    }
    detailY += 1;

    if (layout.navLat != null && layout.navLng != null) {
      const navUrl = buildNavigationUrl(layout.navLat, layout.navLng, 'pdf');
      doc.setTextColor(30, 90, 200);
      doc.textWithLink('Tap to navigate (opens maps)', detailsX, detailY, { url: navUrl });
      doc.setTextColor(70);
      detailY += 4.5;
    }

    if (layout.hasProductOverride) {
      doc.setFont('helvetica', 'bold');
      doc.text('Products for this field (override)', detailsX, detailY);
      detailY += 3.7;
      doc.setFont('helvetica', 'normal');
      doc.text(layout.productLines, detailsX, detailY);
      detailY += layout.productLines.length * 3.4;
    }
    if (layout.noteLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes', detailsX, detailY);
      detailY += 3.7;
      doc.setFont('helvetica', 'normal');
      doc.text(layout.noteLines, detailsX, detailY);
    }
  };

  let fieldY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  request.fields.forEach((entry, index) => {
    const layout = measureFieldBlock(entry, index);
    layout.height = Math.min(layout.height, contentBottom - contentTop);

    if (fieldY + layout.height > contentBottom) {
      doc.addPage('letter', 'portrait');
      drawRunningHeader(false);
      fieldY = contentTop;
    }

    drawFieldBlock(entry, index, fieldY, layout);
    fieldY += layout.height + blockGap;
  });

  // ── Footer + page numbers on every page ───────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(190);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(110);
    doc.text(WORK_REQUEST_DISCLAIMER, margin, pageHeight - 16);
    doc.setFontSize(5);
    doc.text(ESRI_STREET_MAP_ATTRIBUTION, margin, pageHeight - 12.5);
    doc.text(NOMINATIM_ATTRIBUTION, margin, pageHeight - 9.5);
    doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);
    doc.setFontSize(7);
    const footerLeft = `AcreLedger | ${request.requestNumber} | ${farms.length > 0 ? farms.join(', ') : 'Farm'} | Crop year ${request.cropYear}`;
    doc.text(footerLeft, margin, pageHeight - 4);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: 'right' });
  }

  return doc;
}

/** Build the canonical filename for a work request PDF. */
export function workRequestFileName(request: WorkRequest): string {
  const safeNumber = request.requestNumber.replace(/[^A-Za-z0-9-]/g, '_');
  return `${safeNumber}.pdf`;
}
