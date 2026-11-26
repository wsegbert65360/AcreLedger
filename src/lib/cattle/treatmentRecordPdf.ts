import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';

import { REPORT_PAGE_FORMAT, drawAcreLedgerNote, drawPageFooters } from '@/lib/complianceReports/pdfBranding';
import { native } from '@/lib/native';
import type { CattleGroup, CattleTreatment } from '@/types/cattle';
import { formatIsoDate } from '@/utils/dates';
import { COUNT_TITLES } from './counts';
import { describeDose, ROUTE_SHORT, TREATMENT_KIND_LABELS } from './health';

/**
 * Yearly cattle treatment and vaccine record (US Letter, landscape): one row per
 * treatment with product, dose, route, lot and the withdrawal date, in the order a
 * beef quality assurance record asks for them. Herd totals, not animal IDs.
 */

export interface TreatmentRecordRow {
  date: string;
  herd: string;
  product: string;
  type: string;
  cattle: string;
  dose: string;
  route: string;
  lot: string;
  givenBy: string;
  withdrawalDays: string;
  withdrawalUntil: string;
}

export interface TreatmentRecordPdfOptions {
  treatments: CattleTreatment[];
  groups: Pick<CattleGroup, 'id' | 'name' | 'deleted_at'>[];
  /** Printable farm name, or '' when unknown. */
  farmName: string;
  year: string;
  reportDate: string;
  fileName: string;
}

const MARGIN = 14;
const GREEN: [number, number, number] = [45, 90, 27];
const BOTTOM_LIMIT = 20;

/** Years that have at least one live treatment, newest first. */
export function treatmentYears(treatments: Pick<CattleTreatment, 'treatedOn' | 'deleted_at'>[]): string[] {
  return [...new Set(treatments.filter(item => !item.deleted_at).map(item => item.treatedOn.slice(0, 4)))]
    .sort((a, b) => b.localeCompare(a));
}

/** The year's treatments as printable rows, oldest first (a log reads forward in time). */
export function buildTreatmentRecordRows(
  treatments: CattleTreatment[],
  groups: Pick<CattleGroup, 'id' | 'name' | 'deleted_at'>[],
  year: string,
): TreatmentRecordRow[] {
  const nameById = new Map(groups.filter(group => !group.deleted_at).map(group => [group.id, group.name]));
  return treatments
    .filter(item => !item.deleted_at && item.treatedOn.startsWith(year) && nameById.has(item.groupId))
    .sort((a, b) => a.treatedOn.localeCompare(b.treatedOn) || a.createdAt.localeCompare(b.createdAt))
    .map(item => ({
      date: formatIsoDate(item.treatedOn),
      herd: nameById.get(item.groupId) ?? '',
      product: item.product,
      type: TREATMENT_KIND_LABELS[item.kind],
      cattle: `${item.headTreated} ${item.cattleClass ? COUNT_TITLES[item.cattleClass].toLowerCase() : 'head'}`,
      dose: describeDose(item).replace(` ${ROUTE_SHORT[item.route]}`, ''),
      route: ROUTE_SHORT[item.route],
      lot: item.lotNumber ?? '',
      givenBy: item.givenBy ?? '',
      withdrawalDays: String(item.withdrawalDays),
      withdrawalUntil: item.withdrawalDays > 0 ? formatIsoDate(item.withdrawalUntil) : '—',
    }));
}

export function buildTreatmentRecordPdf(opts: TreatmentRecordPdfOptions): jsPDF {
  const rows = buildTreatmentRecordRows(opts.treatments, opts.groups, opts.year);
  const doc = new jsPDF({ orientation: 'landscape', format: REPORT_PAGE_FORMAT });
  const width = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREEN);
  doc.text(`CATTLE TREATMENT RECORD · ${opts.year}`, MARGIN, 15);
  doc.setFontSize(18);
  doc.setTextColor(30);
  doc.text(opts.farmName || 'Cattle Treatment Record', MARGIN, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Generated ${opts.reportDate}`, width - MARGIN, 15, { align: 'right' });
  doc.text(`${rows.length} treatment${rows.length === 1 ? '' : 's'} recorded`, width - MARGIN, 20, { align: 'right' });

  autoTable(doc, {
    head: [['DATE', 'HERD', 'PRODUCT', 'TYPE', 'CATTLE', 'DOSE', 'ROUTE', 'LOT', 'GIVEN BY', 'WITHDRAWAL', 'HOLD UNTIL']],
    body: rows.length > 0
      ? rows.map(row => [
        row.date, row.herd, row.product, row.type, row.cattle, row.dose, row.route, row.lot, row.givenBy,
        `${row.withdrawalDays} d`, row.withdrawalUntil,
      ])
      : [['No treatments were recorded this year.', '', '', '', '', '', '', '', '', '', '']],
    startY: 30,
    margin: { left: MARGIN, right: MARGIN, bottom: BOTTOM_LIMIT },
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [215, 220, 212], lineWidth: 0.1 },
    headStyles: { fillColor: GREEN, textColor: 255, halign: 'left' },
  });
  const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40);
  const signY = tableEnd + 14;
  doc.text('Recorded by: _______________________________     Date: ___________________', MARGIN, signY);
  drawAcreLedgerNote(doc, 'report', signY + 6);
  drawPageFooters(doc, [opts.farmName, `Cattle Treatment Record ${opts.year}`].filter(Boolean).join(' · '));
  return doc;
}

export function exportTreatmentRecordPdf(opts: TreatmentRecordPdfOptions): void {
  const doc = buildTreatmentRecordPdf(opts);
  if (Capacitor.isNativePlatform()) {
    native.sharePdf(opts.fileName, doc);
  } else {
    doc.save(opts.fileName);
  }
}
