import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { farmNameForPdf } from '@/lib/farmDisplayName';
import { native } from '@/lib/native';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { isEstablishedForageLabel, isSupplementalCrop } from './fsaReports';
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

function formatDate(value: string): string {
  return value ? formatIsoDate(value) : '-';
}

function displayStatus(row: Fsa578ReportRow): string {
  if (row.cropStatus) return row.cropStatus;
  if (row.date) return 'Planted';
  if (isEstablishedForageLabel(row.crop, row.intendedUse)) return 'Existing stand';
  return '-';
}

export function exportFsa578WorksheetPdf({ metadata, rows, issues, fileName }: Fsa578PdfOptions): void {
  const doc = new jsPDF({ orientation: 'landscape', format: REPORT_PAGE_FORMAT });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const reportingRows = rows.filter(row => row.landUse === 'Cropland');
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

  drawHeader('SECTION 1 - CROPLAND REPORTING ROWS (use these rows to enter crop acreage)', true);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Not an official USDA form. Verify acreage, crop/use, status, dates, shares, and practices with the county FSA office before certification.', 12, 32);
  autoTable(doc, {
    ...tableDefaults,
    startY: 36,
    margin: { ...tableDefaults.margin, top: 26 },
    head: [['FARM', 'TRACT', 'CLU', 'FIELD', 'CROP', 'TYPE / VARIETY', 'STATUS', 'ACRES', 'PLANT DATE', 'USE', 'IRR', 'SHARE', 'SEQ', 'PRACTICE / NOTES']],
    body: reportingRows.map(row => [
      display(row.farmNumber), display(row.tractNumber), display(row.fieldNumber), row.fieldName,
      display(row.crop), display(row.seedVariety), displayStatus(row), row.acreage, formatDate(row.date), display(row.intendedUse),
      display(row.irrigationCode), display(row.producerShare), display(row.cropSequence),
      [row.plantingPattern, row.notes].filter(Boolean).join(' - ') || '-',
    ]),
    columnStyles: {
      0: { cellWidth: 12 }, 1: { cellWidth: 14 }, 2: { cellWidth: 11 }, 3: { cellWidth: 28 },
      4: { cellWidth: 18 }, 5: { cellWidth: 22 }, 6: { cellWidth: 20 }, 7: { cellWidth: 13, halign: 'right' },
      8: { cellWidth: 20 }, 9: { cellWidth: 17 }, 10: { cellWidth: 9 }, 11: { cellWidth: 12, halign: 'right' },
      12: { cellWidth: 17 }, // last column takes the remaining width
    },
    willDrawPage: data => {
      if (data.pageNumber > 1) drawHeader('SECTION 1 - CROPLAND REPORTING ROWS (continued)');
    },
  });

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
