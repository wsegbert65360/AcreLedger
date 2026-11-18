import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';

import { native } from '@/lib/native';

import { LANDLORD_ACTIVITY_LABELS, type LandlordSummary } from './generateLandlordSummary';
import { REPORT_PAGE_FORMAT, drawAcreLedgerNote, drawPageFooters } from './pdfBranding';
import {
  buildOwnerSummaryLayout,
  formatOwnerDateRange,
  OWNER_TIMELINE_GROUP_DAYS,
  type OwnerSummaryLayout,
} from './ownerSummaryLayout';

/**
 * Farm Owner Summary and per-landlord Landlord Summary PDF (US Letter, landscape).
 *
 * Page 1 opens with one tile per crop, then one table per grain crop, the hay
 * table, and the fields with no production. With `includeTimeline` the
 * condensed activity timeline follows on a new page; without it the report
 * ends at the notes and signature line.
 */

/** `owner`: the whole farm for the farm owner. `landlord`: one landlord's fields, for that landlord. */
export type SummaryPdfAudience = 'owner' | 'landlord';

export interface OwnerSummaryPdfOptions {
  summary: LandlordSummary;
  /** Defaults to `owner`. */
  audience?: SummaryPdfAudience;
  /** Required for the `landlord` audience: who the report is prepared for. */
  landlordName?: string;
  /** Printable farm name, or '' when unknown. */
  farmName: string;
  seasonYear: number;
  reportDate: string;
  includeTimeline: boolean;
  fileName: string;
}

const MARGIN = 14;
const GREEN: [number, number, number] = [45, 90, 27];
const TILE_FILL: [number, number, number] = [240, 244, 237];
const FOOT_FILL: [number, number, number] = [232, 238, 228];
/** Space kept clear above the page footer. */
const BOTTOM_LIMIT = 20;

export const OWNER_SUMMARY_NOTE =
  'Bushels and shares are computed from harvest loads logged in AcreLedger; scale tickets are not shown. Share % is landlord bushels divided by total bushels.';

type AudienceText = {
  kicker: string;
  /** Header for the operator's bushels after the landlord share. */
  keptColumn: string;
  keptTile: string;
  signatures: string[];
};

function audienceText(audience: SummaryPdfAudience): AudienceText {
  return audience === 'landlord'
    ? {
      kicker: 'LANDLORD SUMMARY',
      keptColumn: 'TENANT BU',
      keptTile: 'Tenant',
      signatures: [
        'Tenant signature: _______________________________     Date: ___________________',
        'Landlord signature: _____________________________     Date: ___________________',
      ],
    }
    : {
      kicker: 'FARM OWNER SUMMARY',
      keptColumn: 'YOUR BU',
      keptTile: 'Yours',
      signatures: ['Owner signature: _______________________________     Date: ___________________'],
    };
}

function audienceOf(opts: OwnerSummaryPdfOptions): SummaryPdfAudience {
  return opts.audience ?? 'owner';
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmt0 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
}

function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
}

/** Starts a new page when `needed` mm will not fit above the footer. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > pageHeight(doc) - BOTTOM_LIMIT) {
    doc.addPage();
    return 18;
  }
  return y;
}

function lastY(doc: Doc, fallback: number): number {
  return doc.lastAutoTable?.finalY ?? fallback;
}

function rightAligned(indexes: number[]): Record<number, { halign: 'right' }> {
  return Object.fromEntries(indexes.map(i => [i, { halign: 'right' as const }]));
}

function sectionTitle(doc: jsPDF, title: string, y: number, note?: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(title, MARGIN, y);
  if (note) {
    // Measure the title in its own font before switching to the note's.
    const titleWidth = doc.getTextWidth(title);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(95);
    doc.text(note, MARGIN + titleWidth + 4, y);
  }
  return y + 3;
}

function table(
  doc: Doc,
  startY: number,
  head: string[],
  body: (string | number)[][],
  options: { right?: number[]; foot?: (string | number)[][]; columnWidths?: Record<number, number> } = {},
): number {
  const columnStyles: Record<number, { halign?: 'right'; cellWidth?: number }> = { ...rightAligned(options.right ?? []) };
  Object.entries(options.columnWidths ?? {}).forEach(([index, width]) => {
    columnStyles[Number(index)] = { ...columnStyles[Number(index)], cellWidth: width };
  });
  const right = new Set(options.right ?? []);
  autoTable(doc, {
    head: [head],
    body,
    ...(options.foot?.length ? { foot: options.foot, showFoot: 'lastPage' as const } : {}),
    startY,
    margin: { left: MARGIN, right: MARGIN, bottom: BOTTOM_LIMIT },
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [215, 220, 212], lineWidth: 0.1 },
    headStyles: { fillColor: GREEN, textColor: 255, halign: 'left' },
    footStyles: { fillColor: FOOT_FILL, textColor: 40, fontStyle: 'bold' },
    columnStyles,
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
      if (data.section !== 'body' && right.has(data.column.index)) data.cell.styles.halign = 'right';
    },
  });
  return lastY(doc, startY) + 7;
}

function drawHeader(doc: jsPDF, opts: OwnerSummaryPdfOptions, layout: OwnerSummaryLayout): number {
  const width = pageWidth(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREEN);
  const forLandlord = audienceOf(opts) === 'landlord';
  doc.text(`${audienceText(audienceOf(opts)).kicker} · ${opts.seasonYear} CROP YEAR`, MARGIN, 15);

  doc.setFontSize(18);
  doc.setTextColor(30);
  doc.text(
    forLandlord ? `Prepared for ${opts.landlordName ?? ''}` : opts.farmName || 'Farm Owner Summary',
    MARGIN,
    23,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  const generated = forLandlord && opts.farmName ? `${opts.farmName} · Generated ${opts.reportDate}` : `Generated ${opts.reportDate}`;
  doc.text(generated, width - MARGIN, 15, { align: 'right' });
  doc.text(
    opts.includeTimeline ? 'Full report · with activity timeline' : 'Summary · no activity timeline',
    width - MARGIN,
    20,
    { align: 'right' },
  );
  if (layout.latestHarvestDate) {
    doc.text(`Latest harvest load: ${layout.latestHarvestDate}`, width - MARGIN, 25, { align: 'right' });
  }

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 28, width - MARGIN, 28);
  doc.setLineWidth(0.2);
  return 32;
}

type Tile = { label: string; value: string; lines: string[] };

/** One tile per grain crop plus hay. Bushels of different crops are never summed into one tile. */
function buildTiles(layout: OwnerSummaryLayout, text: AudienceText): Tile[] {
  const tiles: Tile[] = layout.grainSections.map(section => ({
    label: section.crop.toUpperCase(),
    value: `${fmt0(section.total.totalBushels)} bu`,
    lines: [
      `${section.total.buPerAcre != null ? fmt1(section.total.buPerAcre) : '—'} bu/ac · ${fmt(section.total.acres)} ac`,
      `Landlord ${fmt0(section.total.landlordShareBushels)} · ${text.keptTile} ${fmt0(section.total.ownerBushels)}`,
    ],
  }));
  if (layout.hayTotal) {
    tiles.push({
      label: 'HAY',
      value: `${fmt0(layout.hayTotal.totalBales)} bales`,
      lines: [
        `${layout.hayRows.length} field${layout.hayRows.length === 1 ? '' : 's'} · ${fmt(layout.hayTotal.acres)} ac`,
        `${layout.hayTotal.cuttings} cutting${layout.hayTotal.cuttings === 1 ? '' : 's'}`,
      ],
    });
  }
  return tiles;
}

function drawTiles(doc: jsPDF, tiles: Tile[], y: number): number {
  if (tiles.length === 0) return y;
  const perRow = Math.min(tiles.length, 4);
  const gap = 4;
  const tileWidth = (pageWidth(doc) - MARGIN * 2 - gap * (perRow - 1)) / perRow;
  const tileHeight = 22;
  let top = y;
  tiles.forEach((tile, i) => {
    const col = i % perRow;
    if (i > 0 && col === 0) top += tileHeight + gap;
    const x = MARGIN + col * (tileWidth + gap);
    doc.setFillColor(...TILE_FILL);
    doc.rect(x, top, tileWidth, tileHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80);
    doc.text(tile.label, x + 3, top + 5);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(tile.value, x + 3, top + 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(70);
    tile.lines.forEach((line, n) => doc.text(line, x + 3, top + 16 + n * 3.5));
  });
  return top + tileHeight + 7;
}

function drawProduction(
  doc: Doc,
  layout: OwnerSummaryLayout,
  summary: LandlordSummary,
  text: AudienceText,
  startY: number,
): number {
  let y = startY;

  for (const section of layout.grainSections) {
    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, section.crop, y);
    y = table(
      doc,
      y,
      ['FIELD', 'ACRES', 'BUSHELS', 'BU/AC', 'SHARE %', 'LANDLORD BU', text.keptColumn, 'PLANTED', 'HARVESTED', 'VARIETY'],
      section.rows.map(row => [
        row.fieldName,
        fmt(row.acres),
        fmt(row.totalBushels),
        row.buPerAcre != null ? fmt1(row.buPerAcre) : '—',
        row.owned ? 'Owned' : row.sharePercent != null ? `${fmt1(row.sharePercent)}%` : '—',
        row.owned ? '—' : fmt(row.landlordShareBushels),
        fmt(row.ownerBushels),
        row.plantedDate ?? '—',
        formatOwnerDateRange(row.harvestStart, row.harvestEnd),
        row.variety ?? '—',
      ]),
      {
        right: [1, 2, 3, 4, 5, 6],
        foot: [[
          `Total ${section.crop}`,
          fmt(section.total.acres),
          fmt(section.total.totalBushels),
          section.total.buPerAcre != null ? fmt1(section.total.buPerAcre) : '—',
          section.total.sharePercent != null ? `${fmt1(section.total.sharePercent)}%` : '—',
          fmt(section.total.landlordShareBushels),
          fmt(section.total.ownerBushels),
          '',
          '',
          '',
        ]],
      },
    );
  }

  if (layout.hayTotal) {
    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, 'Hay', y, 'Bales only; no landlord bale share is inferred.');
    y = table(
      doc,
      y,
      ['FIELD', 'ACRES', 'CUTTINGS', 'LAST CUT', 'BALES', 'BALES/AC'],
      layout.hayRows.map(row => [
        row.fieldName,
        fmt(row.acres),
        String(row.cuttings),
        row.lastCutDate ?? '—',
        fmt0(row.totalBales),
        row.balesPerAcre != null ? fmt1(row.balesPerAcre) : '—',
      ]),
      {
        right: [1, 2, 4, 5],
        foot: [[
          'Total hay',
          fmt(layout.hayTotal.acres),
          String(layout.hayTotal.cuttings),
          '',
          fmt0(layout.hayTotal.totalBales),
          layout.hayTotal.balesPerAcre != null ? fmt1(layout.hayTotal.balesPerAcre) : '—',
        ]],
      },
    );
  }

  if (layout.idleRows.length > 0) {
    // A short wrapped list, not a table: these fields have nothing to total but acres.
    const heading = `${layout.idleRows.length} field${layout.idleRows.length === 1 ? '' : 's'} · ${fmt(layout.idleAcres)} ac`;
    const list = layout.idleRows.map(row => `${row.fieldName} (${fmt(row.acres)} ac)`).join(' · ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(list, pageWidth(doc) - MARGIN * 2) as string[];
    y = ensureSpace(doc, y, 8 + lines.length * 4);
    y = sectionTitle(doc, 'Not harvested', y, heading);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(50);
    lines.forEach((line, i) => doc.text(line, MARGIN, y + 2 + i * 4));
    y += 2 + lines.length * 4 + 6;
  }

  if (summary.missingShareHarvests > 0) {
    y = ensureSpace(doc, y, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(150, 90, 0);
    doc.text(
      `${summary.missingShareHarvests} harvest record(s) have no crop-share percent and are counted as 0 share.`,
      MARGIN,
      y,
    );
    y += 7;
  }

  return y;
}

function drawTimeline(doc: Doc, layout: OwnerSummaryLayout): number {
  doc.addPage();
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text('Activity timeline', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80);
  doc.text(
    `The same product or pass on the same type of work within ${OWNER_TIMELINE_GROUP_DAYS} days is grouped on one line. Harvest loads are rolled up by field.`,
    MARGIN,
    y + 5,
  );
  y += 12;

  const detailHeader: Record<string, string> = {
    plant: 'SEED',
    tillage: 'PASS',
    fertilizer: 'BLEND',
    spray: 'PRODUCTS & RATES',
    customSpray: 'PRODUCTS',
  };
  for (const section of layout.timeline) {
    const records = section.groups.reduce((sum, g) => sum + g.recordCount, 0);
    y = ensureSpace(doc, y, 24);
    y = sectionTitle(
      doc,
      LANDLORD_ACTIVITY_LABELS[section.activityType],
      y,
      `${records} record${records === 1 ? '' : 's'} · ${section.groups.length} line${section.groups.length === 1 ? '' : 's'}`,
    );
    y = table(
      doc,
      y,
      ['DATE', 'FIELDS', '#', detailHeader[section.activityType] ?? 'DETAIL'],
      section.groups.map(group => [
        formatOwnerDateRange(group.startDate, group.endDate),
        group.fieldNames.join(', '),
        String(group.fieldNames.length),
        group.detail,
      ]),
      { right: [2], columnWidths: { 0: 42, 1: 95, 2: 9 } },
    );
  }

  if (layout.harvestRollups.length > 0) {
    const loads = layout.harvestRollups.reduce((sum, r) => sum + r.loads, 0);
    y = ensureSpace(doc, y, 24);
    y = sectionTitle(
      doc,
      'Harvest by field',
      y,
      `${loads} load${loads === 1 ? '' : 's'} rolled up to ${layout.harvestRollups.length} line${layout.harvestRollups.length === 1 ? '' : 's'} · hay cuttings are in the Hay table`,
    );
    y = table(
      doc,
      y,
      ['FIELD', 'CROP', 'DATES', 'DAYS', 'LOADS', 'BUSHELS', 'AVG LOAD'],
      layout.harvestRollups.map(r => [
        r.fieldName,
        r.crop ?? '—',
        formatOwnerDateRange(r.startDate, r.endDate),
        String(r.days),
        String(r.loads),
        fmt(r.bushels),
        r.loads > 0 ? fmt0(r.bushels / r.loads) : '—',
      ]),
      { right: [3, 4, 5, 6] },
    );
  }

  return y;
}

function drawSignOff(doc: jsPDF, text: AudienceText, y: number): number {
  let top = ensureSpace(doc, y, 14 + text.signatures.length * 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70);
  const noteLines = doc.splitTextToSize(OWNER_SUMMARY_NOTE, pageWidth(doc) - MARGIN * 2) as string[];
  noteLines.forEach((line, i) => doc.text(line, MARGIN, top + i * 4));
  top += noteLines.length * 4 + 8;
  doc.setTextColor(40);
  doc.setFontSize(9);
  text.signatures.forEach((line, i) => doc.text(line, MARGIN, top + i * 9));
  return top + (text.signatures.length - 1) * 9 + 6;
}

export function exportOwnerSummaryPdf(opts: OwnerSummaryPdfOptions): void {
  const audience = audienceOf(opts);
  const text = audienceText(audience);
  const layout = buildOwnerSummaryLayout(opts.summary);
  const doc = new jsPDF({ orientation: 'landscape', format: REPORT_PAGE_FORMAT }) as Doc;

  let y = drawHeader(doc, opts, layout);
  y = drawTiles(doc, buildTiles(layout, text), y);
  y = drawProduction(doc, layout, opts.summary, text, y);
  if (opts.includeTimeline) {
    y = drawTimeline(doc, layout);
  }
  y = drawSignOff(doc, text, y);
  drawAcreLedgerNote(doc, audience === 'landlord' ? 'landlord' : 'report', y + 4);

  const identity = audience === 'landlord'
    ? [opts.farmName, `Landlord Summary ${opts.seasonYear}`, opts.landlordName].filter(Boolean).join(' · ')
    : [opts.farmName, `Farm Owner Summary ${opts.seasonYear}`].filter(Boolean).join(' · ');
  drawPageFooters(doc, identity);

  if (Capacitor.isNativePlatform()) {
    native.sharePdf(opts.fileName, doc);
  } else {
    doc.save(opts.fileName);
  }
}
