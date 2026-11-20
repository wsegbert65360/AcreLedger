import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { farmNameForPdf } from '@/lib/farmDisplayName';
import { native } from '@/lib/native';
import { roundTo } from '@/utils/numbers';
import { isSupplementalCrop } from './fsaReports';
import { buildFsa578FormSheets } from './fsa578FormLayout';
import type { Fsa578FormSheet } from './fsa578FormLayout';
import { REPORT_PAGE_FORMAT, drawAcreLedgerNote, drawPageFooters } from './pdfBranding';
import type { Fsa578ReportRow, Fsa578ValidationIssue, Fsa578WorksheetMetadata } from './fsaReports';

interface Fsa578PdfOptions {
  metadata: Fsa578WorksheetMetadata;
  rows: Fsa578ReportRow[];
  issues: Fsa578ValidationIssue[];
  fileName: string;
}

type SummaryRow = { label: string; acres: number };

export interface Fsa578Reconciliation {
  cropTotals: SummaryRow[];
  tractTotals: SummaryRow[];
  totalReportedAcres: number;
}

function sumBy(rows: Fsa578ReportRow[], getLabel: (row: Fsa578ReportRow) => string): SummaryRow[] {
  const totals = new Map<string, number>();
  rows.forEach(row => totals.set(getLabel(row), (totals.get(getLabel(row)) || 0) + row.acreage));
  return [...totals.entries()]
    .map(([label, acres]) => ({ label, acres: roundTo(acres, 2) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function cluBoundaryKey(row: Fsa578ReportRow): string {
  const cluNumber = row.fieldNumber.trim();
  const boundaryId = cluNumber || `field:${row.fieldName.trim()}`;
  return [row.farmNumber.trim(), row.tractNumber.trim(), boundaryId].join('|');
}

export function buildFsa578Reconciliation(rows: Fsa578ReportRow[]): Fsa578Reconciliation {
  const reportingRows = rows.filter(row => row.landUse === 'Cropland');
  const uniqueCluRows = [...new Map(reportingRows.map(row => [cluBoundaryKey(row), { ...row, acreage: row.cluAcres ?? row.acreage }])).values()];

  return {
    cropTotals: sumBy(reportingRows, row => `${display(row.crop)} / ${display(row.intendedUse)}${isSupplementalCrop(row) ? ` (${row.cropStatus})` : ''}`),
    tractTotals: sumBy(uniqueCluRows, row => `Farm ${display(row.farmNumber)} / Tract ${display(row.tractNumber)}`),
    totalReportedAcres: roundTo(uniqueCluRows.reduce((sum, row) => sum + row.acreage, 0), 2),
  };
}

function display(value: string | undefined): string {
  return value?.trim() || '-';
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

const SHEET_LEFT = 12;
const SHEET_TABLE_TOP = 63;
const SHEET_CONTINUED_TOP = 24;
const PAGE_BOTTOM = 16;

export const FSA578_SECTION1_TITLE = 'SECTION 1 - REPORT OF ACREAGE (one sheet per FSA farm)';
export const FSA578_CERTIFICATION_NOTE = 'Worksheet only. Certify on the official FSA-578 at your county FSA office. Use this sheet to check that each crop, practice, status, share, and acreage line is complete and correct before you sign there.';
export const FSA578_PRACTICE_LEGEND = '1/ Practice: I = Irrigated   N = Non-irrigated   O = Other (honey or maple sap)';
export const FSA578_STATUS_LEGEND = '2/ Status: I = Initial  P = Prevented  F = Failed  S = Subsequent  D = Double crop  R = Repeat  V = Volunteer  E = Experimental  IF = Initial failed  IP = Initial prevented  SF = Subsequent failed  DF = Double-cropped failed  DP = Double-cropped prevented';

function acresText(value: number): string {
  return roundTo(value, 2).toFixed(2);
}

function sheetTitle(sheet: Fsa578FormSheet): string {
  return sheet.unassigned ? 'NO FSA FARM / TRACT ASSIGNED' : `FARM ${sheet.farmNumber}`;
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value?: string | string[]): void {
  doc.setDrawColor(60);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(70);
  doc.text(label, x + 1, y + 2.6);
  if (value == null || value === '') return;
  const lines = Array.isArray(value) ? value : [value];
  doc.setFontSize(8.5);
  doc.setTextColor(20);
  const firstY = y + h - 2 - (lines.length - 1) * 3.6;
  lines.forEach((line, i) => doc.text(line, x + 1.5, firstY + i * 3.6));
}

function drawSheetTitle(doc: jsPDF, metadata: Fsa578WorksheetMetadata, sheet: Fsa578FormSheet, continued: boolean): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(35, 64, 28);
  doc.text('FSA-578 ACREAGE REPORTING WORKSHEET', SHEET_LEFT, 10);
  doc.setFontSize(8.5);
  doc.setTextColor(40);
  doc.text(`${FSA578_SECTION1_TITLE}${continued ? ' (continued)' : ''} - ${sheetTitle(sheet)}  |  Farm: ${farmNameForPdf(metadata.farmName)}  |  Crop year: ${metadata.cropYear}`, SHEET_LEFT, 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(80);
  doc.text('Not an official USDA form. Laid out like the FSA-578 Report of Acreage to help you check and copy acreage. Verify all entries with the county FSA office before certification.', SHEET_LEFT, 18);
}

function drawSheetHeader(doc: jsPDF, metadata: Fsa578WorksheetMetadata, sheet: Fsa578FormSheet): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - SHEET_LEFT;
  drawSheetTitle(doc, metadata, sheet, false);

  // Left block: boxes 1-6 and 11.
  const top = 20;
  const assigned = !sheet.unassigned;
  drawBox(doc, 12, top, 33, 10, '1. FARM NO.', assigned ? sheet.farmNumber : 'Not assigned');
  drawBox(doc, 45, top, 33, 10, '2. FARMLAND (CLU total)', assigned ? acresText(sheet.farmlandAcres) : '');
  drawBox(doc, 78, top, 33, 10, '3. CROPLAND (CLU total)', assigned ? acresText(sheet.croplandAcres) : '');
  drawBox(doc, 111, top, 32, 10, '4. PROGRAM YR.', String(metadata.cropYear));

  const operator = metadata.producerName?.trim();
  const county = [metadata.county, metadata.state].filter(Boolean).join(', ');
  drawBox(doc, 12, top + 10, 91, 18, 'KEY 1   5. OPERATOR NAME AND ADDRESS', [
    operator || 'Name: ______________________________',
    'Address: ___________________________',
    county ? `County/State: ${county}` : 'County/State: ______________________',
  ]);
  const otherFarms = doc.splitTextToSize(sheet.otherFarms.join(', ') || '-', 38) as string[];
  drawBox(doc, 103, top + 10, 40, 18, '6. OTHER FARMS', otherFarms.slice(0, 3));
  drawBox(doc, 12, top + 28, 131, 11, '11. PHOTO NO. - LEGAL DESCRIPTION', '');

  // Right block: boxes 7-10, producers other than the operator.
  const x0 = 147;
  const widths = [12, 62, 26, right - x0 - 100];
  const labels = ['7. KEY', '8. NAMES OF OTHER PRODUCERS', '9. ID NUMBER', '10. OTHER FARMS'];
  let x = x0;
  labels.forEach((label, i) => {
    drawBox(doc, x, top, widths[i], 7, label);
    x += widths[i];
  });
  const others = sheet.producers.filter(producer => producer.key > 1);
  const maxRows = 4;
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const producer = others[rowIndex];
    const y = top + 7 + rowIndex * 8;
    const overflow = rowIndex === maxRows - 1 && others.length > maxRows;
    x = x0;
    const values = producer
      ? [String(producer.key), overflow ? `+${others.length - maxRows + 1} more - see remarks` : producer.name, '', '']
      : ['', '', '', ''];
    values.forEach((value, i) => {
      drawBox(doc, x, y, widths[i], 8, '', value);
      x += widths[i];
    });
  }
}

function drawCertification(doc: jsPDF, metadata: Fsa578WorksheetMetadata, startY: number, sheet: Fsa578FormSheet): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - SHEET_LEFT * 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const note = doc.splitTextToSize(`22. CERTIFICATION - ${FSA578_CERTIFICATION_NOTE}`, width - 4) as string[];
  const status = doc.splitTextToSize(FSA578_STATUS_LEGEND, width - 4) as string[];
  const blockHeight = 6 + note.length * 3.4 + 12 + 4 + status.length * 3.4;

  let y = startY;
  if (y + blockHeight > pageHeight - PAGE_BOTTOM) {
    doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
    drawSheetTitle(doc, metadata, sheet, true);
    y = SHEET_CONTINUED_TOP;
  }

  doc.setDrawColor(60);
  doc.rect(SHEET_LEFT, y, width, blockHeight);
  doc.setTextColor(30);
  note.forEach((line, i) => doc.text(line, SHEET_LEFT + 2, y + 4 + i * 3.4));
  let lineY = y + 6 + note.length * 3.4 + 8;
  const slot = width / 3;
  for (let i = 0; i < 3; i += 1) {
    const x = SHEET_LEFT + 2 + i * slot;
    doc.line(x, lineY, x + slot * 0.6, lineY);
    doc.line(x + slot * 0.64, lineY, x + slot - 6, lineY);
    doc.setFontSize(6);
    doc.text(i === 0 ? 'A. PRODUCER SIGNATURE' : 'A. SIGNATURE (BY)', x, lineY + 2.8);
    doc.text('B. DATE (MM-DD-YYYY)', x + slot * 0.64, lineY + 2.8);
  }
  doc.setFontSize(6.6);
  lineY += 7;
  doc.text(FSA578_PRACTICE_LEGEND, SHEET_LEFT + 2, lineY);
  status.forEach((line, i) => doc.text(line, SHEET_LEFT + 2, lineY + 3.4 + i * 3.4));
  return y + blockHeight;
}

function drawRemarks(doc: jsPDF, metadata: Fsa578WorksheetMetadata, startY: number, sheet: Fsa578FormSheet): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - SHEET_LEFT * 2;
  const others = sheet.producers.filter(producer => producer.key > 1);
  const remarks = [
    ...(sheet.unassigned ? ['These fields have no FSA farm or tract. Assign them to an FSA farm/tract before your office visit.'] : []),
    ...(others.length > 4 ? others.map(producer => `Key ${producer.key}: ${producer.name}`) : []),
    ...sheet.remarks,
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const lines = remarks.flatMap(remark => doc.splitTextToSize(`- ${remark}`, width - 4) as string[]);

  let y = startY + 4;
  const ensureRoom = () => {
    if (y > pageHeight - PAGE_BOTTOM - 4) {
      doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
      drawSheetTitle(doc, metadata, sheet, true);
      y = SHEET_CONTINUED_TOP + 2;
    }
  };
  ensureRoom();
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40);
  doc.text('23. REMARKS', SHEET_LEFT, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  (lines.length ? lines : ['None.']).forEach(line => {
    ensureRoom();
    doc.text(line, SHEET_LEFT + 2, y);
    y += 3.4;
  });
}

/**
 * Section 1: one "Report of Acreage" sheet per FSA farm, laid out like the
 * manual FSA-578 (boxes 1-23). Each sheet starts on a new page; "Sheet X of Y"
 * is numbered per farm after all pages exist.
 */
function drawReportOfAcreageSheets(doc: jsPDF, metadata: Fsa578WorksheetMetadata, sheets: Fsa578FormSheet[]): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - SHEET_LEFT * 2;
  const ranges: Array<{ start: number; end: number }> = [];

  if (sheets.length === 0) {
    drawSheetTitle(doc, metadata, { farmNumber: '', unassigned: false } as Fsa578FormSheet, false);
    doc.setFontSize(9);
    doc.setTextColor(40);
    doc.text('No cropland lines to report. See Section 4 for all CLUs.', SHEET_LEFT, 30);
    return;
  }

  sheets.forEach((sheet, index) => {
    if (index > 0) doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
    const start = doc.getNumberOfPages();
    drawSheetHeader(doc, metadata, sheet);

    const n = sheet.cropColumns.length;
    const fixed = [14, 14, 52, 12, 13];
    const tail = [10, 14];
    const cropWidth = (usable - fixed.reduce((a, b) => a + b, 0) - tail.reduce((a, b) => a + b, 0)) / Math.max(n, 1);
    const columnStyles: Record<number, { cellWidth: number; halign?: 'right' | 'center' }> = {
      0: { cellWidth: fixed[0] }, 1: { cellWidth: fixed[1] }, 2: { cellWidth: fixed[2] },
      3: { cellWidth: fixed[3], halign: 'center' }, 4: { cellWidth: fixed[4], halign: 'center' },
      [5 + n]: { cellWidth: tail[0], halign: 'center' }, [6 + n]: { cellWidth: tail[1], halign: 'right' },
    };
    for (let i = 0; i < n; i += 1) columnStyles[5 + i] = { cellWidth: cropWidth, halign: 'right' };

    const span = (content: string, extra: Record<string, unknown> = {}) => ({ content, ...extra });
    const head = [
      [
        span('12\nTRACT NO.', { rowSpan: 2 }), span('13\nFIELD NO.', { rowSpan: 2 }), span('14\nCROP OR LAND USE', { rowSpan: 2 }),
        span('15\nPRAC-\nTICE 1/', { rowSpan: 2 }), span('16\nSTATUS 2/', { rowSpan: 2 }),
        span('17. CROP OR LAND USE SUMMARY (acres)', { colSpan: n }),
        span('18\nKEY', { rowSpan: 2 }), span('19\nSHARE', { rowSpan: 2 }),
      ],
      sheet.cropColumns,
    ];
    const body = sheet.lines.map(line => [
      line.tractNumber || (line.primary ? '-' : ''),
      line.fieldNumber || (line.primary ? '-' : ''),
      line.primary ? [line.cropOrLandUse, line.detail].filter(Boolean).join('\n') : '',
      line.practice,
      line.status,
      ...sheet.cropColumns.map((_, i) => (i === line.cropColumn && line.acres != null ? acresText(line.acres) : '')),
      String(line.key),
      line.share,
    ]);
    const foot = [
      [span('20. TOTAL OPERATOR REPORT', { colSpan: 5 }), ...sheet.totals.map(acresText), '', ''],
      [span('21. TOTAL DETERMINED ACREAGE (FSA use)', { colSpan: 5 }), ...sheet.cropColumns.map(() => ''), '', ''],
    ];

    autoTable(doc, {
      theme: 'grid',
      startY: SHEET_TABLE_TOP,
      margin: { left: SHEET_LEFT, right: SHEET_LEFT, top: SHEET_CONTINUED_TOP, bottom: PAGE_BOTTOM },
      styles: { fontSize: 7, cellPadding: 1.1, overflow: 'linebreak', valign: 'middle', lineColor: 90, lineWidth: 0.15, textColor: 20 },
      headStyles: { fillColor: [236, 240, 233], textColor: 30, fontStyle: 'bold', halign: 'center', fontSize: 6.3 },
      footStyles: { fillColor: [255, 255, 255], textColor: 20, fontStyle: 'bold' },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      head,
      body,
      foot,
      columnStyles,
      didParseCell: data => {
        const cropCell = data.column.index >= 5 && data.column.index < 5 + n;
        if (data.section === 'foot' && cropCell) {
          data.cell.styles.halign = 'right';
          if (data.row.index === 1) data.cell.styles.fillColor = [200, 200, 200];
        }
      },
      willDrawPage: data => {
        if (data.pageNumber > 1) drawSheetTitle(doc, metadata, sheet, true);
      },
    });

    const tableEnd = (doc as DocWithTable).lastAutoTable?.finalY || SHEET_TABLE_TOP;
    const certEnd = drawCertification(doc, metadata, tableEnd + 4, sheet);
    drawRemarks(doc, metadata, certEnd, sheet);
    ranges.push({ start, end: doc.getNumberOfPages() });
  });

  ranges.forEach(({ start, end }, index) => {
    const label = sheetTitle(sheets[index]);
    for (let page = start; page <= end; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(40);
      doc.text(`${label} - SHEET ${page - start + 1} OF ${end - start + 1}`, pageWidth - SHEET_LEFT, 10, { align: 'right' });
    }
  });
  doc.setPage(doc.getNumberOfPages());
}

export function exportFsa578WorksheetPdf({ metadata, rows, issues, fileName }: Fsa578PdfOptions): void {
  const doc = new jsPDF({ orientation: 'landscape', format: REPORT_PAGE_FORMAT });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { cropTotals, tractTotals, totalReportedAcres } = buildFsa578Reconciliation(rows);

  const drawHeader = (section: string, firstPage = false) => {
    doc.setTextColor(35, 64, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(firstPage ? 15 : 10);
    doc.text(firstPage ? 'FSA-578 ACREAGE REPORTING WORKSHEET' : 'FSA-578 WORKSHEET', 12, firstPage ? 14 : 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(firstPage ? 8.5 : 7.5);
    doc.setTextColor(70);
    const identity = `Farm: ${farmNameForPdf(metadata.farmName)}  |  Crop year: ${metadata.cropYear}  |  Producer: ${metadata.producerName || '________________'}  |  County/State: ${[metadata.county, metadata.state].filter(Boolean).join(', ') || '________________'}`;
    doc.text(identity, 12, firstPage ? 20 : 15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text(section, 12, firstPage ? 27 : 21);
  };

  const tableDefaults = {
    theme: 'striped' as const,
    margin: { left: 12, right: 12, top: 26, bottom: 14 },
    styles: { fontSize: 7.2, cellPadding: 1.25, overflow: 'linebreak' as const, valign: 'middle' as const },
    headStyles: { fillColor: [45, 90, 27] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [244, 247, 242] as [number, number, number] },
  };

  drawReportOfAcreageSheets(doc, metadata, buildFsa578FormSheets(rows));

  doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
  const reconciliationStartPage = doc.getNumberOfPages();
  drawHeader('SECTION 2 - RECONCILIATION TOTALS');
  autoTable(doc, {
    ...tableDefaults,
    startY: 26,
    head: [['CROP / INTENDED USE', 'REPORTABLE ACRES']],
    body: [...cropTotals.map(row => [row.label, row.acres]), ['TOTAL CROPLAND REPORTED', totalReportedAcres]],
    tableWidth: 120,
    columnStyles: { 0: { cellWidth: 85 }, 1: { cellWidth: 35, halign: 'right' } },
    willDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber > reconciliationStartPage) {
        drawHeader('SECTION 2 - RECONCILIATION TOTALS (continued)');
      }
    },
  });
  const cropFinalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 26;
  autoTable(doc, {
    ...tableDefaults,
    startY: cropFinalY + 7,
    head: [['FARM / TRACT', 'CROPLAND ACRES']],
    body: tractTotals.map(row => [row.label, row.acres]),
    tableWidth: 120,
    columnStyles: { 0: { cellWidth: 85 }, 1: { cellWidth: 35, halign: 'right' } },
    willDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber > reconciliationStartPage) {
        drawHeader('SECTION 2 - RECONCILIATION TOTALS (continued)');
      }
    },
  });

  doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
  const reviewStartPage = doc.getNumberOfPages();
  drawHeader('SECTION 3 - ITEMS TO REVIEW BEFORE FSA ENTRY');
  autoTable(doc, {
    ...tableDefaults,
    startY: 26,
    head: [['PRIORITY', 'FIELD / CLU', 'ITEM TO VERIFY']],
    body: issues.length
      ? issues.map(issue => {
          const row = rows.find(candidate => candidate.id === issue.rowId);
          return [issue.severity.toUpperCase(), row ? `${row.fieldName} / CLU ${display(row.fieldNumber)}` : '-', issue.message];
        })
      : [['READY', '-', 'No missing required reporting data was detected. FSA office review is still required.']],
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 60 } },
    willDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber > reviewStartPage) {
        drawHeader('SECTION 3 - ITEMS TO REVIEW BEFORE FSA ENTRY (continued)');
      }
    },
  });
  let reviewY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 26) + 10;
  if (reviewY > pageHeight - 55) {
    doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
    drawHeader('SECTION 3 - FSA OFFICE REVIEW NOTES');
    reviewY = 30;
  }
  doc.setFontSize(9);
  doc.setTextColor(40);
  doc.text('FSA office corrections / notes:', 12, reviewY);
  for (let i = 1; i <= 4; i += 1) doc.line(12, reviewY + i * 9, pageWidth - 12, reviewY + i * 9);
  doc.text('Reviewed with: ______________________________   Review date: ______________   Producer initials: __________', 12, reviewY + 48);

  doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
  const cluReferenceStartPage = doc.getNumberOfPages();
  drawHeader('SECTION 4 - ALL CLU REFERENCE (cropland and non-cropland boundary reconciliation)');
  autoTable(doc, {
    ...tableDefaults,
    startY: 26,
    styles: { ...tableDefaults.styles, fontSize: 7, cellPadding: 1.05 },
    head: [['FARM', 'TRACT', 'CLU', 'LAND USE', 'ACRES', 'FIELD', 'CROP / USE', 'REPORTING NOTE']],
    body: rows.map(row => [
      display(row.farmNumber), display(row.tractNumber), display(row.fieldNumber), row.landUse, row.acreage,
      row.fieldName, row.landUse === 'Cropland' ? `${display(row.crop)} / ${display(row.intendedUse)}` : 'Non-crop',
      row.landUse === 'Cropland' ? 'Included in Section 1' : 'Reference only - do not report as planted crop',
    ]),
    columnStyles: {
      0: { cellWidth: 16 }, 1: { cellWidth: 18 }, 2: { cellWidth: 14 }, 3: { cellWidth: 24 },
      4: { cellWidth: 16, halign: 'right' }, 5: { cellWidth: 50 }, 6: { cellWidth: 45 },
    },
  });

  // AcreLedger note under the last table. Placed on a fresh page (below the
  // continuation header) when it will not fit above the footer.
  let noteY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 26) + 6;
  if (noteY + 20 > pageHeight - 16) {
    doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
    noteY = 30;
  }
  drawAcreLedgerNote(doc, 'fsa', noteY);

  const cluReferenceEndPage = doc.getNumberOfPages();
  for (let page = cluReferenceStartPage + 1; page <= cluReferenceEndPage; page += 1) {
    doc.setPage(page);
    drawHeader('SECTION 4 - ALL CLU REFERENCE (continued)');
  }

  drawPageFooters(doc, `${farmNameForPdf(metadata.farmName)} | Crop year ${metadata.cropYear} | Generated ${metadata.reportDate}`);

  if (Capacitor.isNativePlatform()) native.sharePdf(fileName, doc);
  else doc.save(fileName);
}
