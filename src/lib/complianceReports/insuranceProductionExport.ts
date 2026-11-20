import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { farmNameForCsv, farmNameForPdf } from '@/lib/farmDisplayName';
import { native } from '@/lib/native';
import { sanitizeCsvValue } from '@/utils/csv';
import { downloadFile } from './fsaReports';
import type { InsuranceProductionReport, InsuranceUnit } from './insuranceProduction';
import { ACRELEDGER_CSV_LINE, REPORT_PAGE_FORMAT, drawAcreLedgerNote, drawPageFooters } from './pdfBranding';

export const INSURANCE_PRODUCTION_TITLE = 'Crop Insurance Production Worksheet';
export const INSURANCE_PRODUCTION_DISCLAIMER = 'Not an official insurance form. Your agent sets the units and certifies the production report. Production is 100% of all shares, as entered in AcreLedger; keep settlement sheets and bin records as proof.';
export const INSURANCE_UNIT_NOTE = 'Enterprise units: one unit per crop per county. Yield = production / planted acres.';

export interface InsuranceProductionMetadata {
  farmName: string;
  cropYear: number;
  reportDate: string;
}

const num = (value: number | null | undefined, digits = 2): string =>
  value == null ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });

const yieldText = (value: number | null): string => (value == null ? '-' : value.toFixed(1));

function practiceText(unit: InsuranceUnit): string {
  return unit.practices.map(p => p.practice).join(' + ') || '-';
}

export function buildInsuranceProductionCsv({
  metadata,
  report,
}: {
  metadata: InsuranceProductionMetadata;
  report: InsuranceProductionReport;
}): string {
  const line = (cells: Array<string | number>) => cells.map(sanitizeCsvValue).join(',');
  const rows: string[] = [
    line([INSURANCE_PRODUCTION_TITLE]),
    line([INSURANCE_PRODUCTION_DISCLAIMER]),
    line([INSURANCE_UNIT_NOTE]),
    line([ACRELEDGER_CSV_LINE]),
    '',
    line(['Farm Name', metadata.farmName]),
    line(['Crop Year', metadata.cropYear]),
    line(['Report Date', metadata.reportDate]),
    '',
    line(['UNITS']),
    line(['County', 'Crop', 'Practice', 'Types', 'Planted Acres', 'Harvested Acres', 'Prevented Acres', 'Production (bu, 100%)', 'Sold (bu)', 'Stored (bu)', 'Yield (bu/ac)', 'Avg Moisture %', 'Estimated County Split']),
  ];
  for (const unit of report.units) {
    rows.push(line([unit.county, unit.crop, practiceText(unit), unit.types.join('; '), unit.plantedAcres, unit.harvestedAcres, unit.preventedAcres, unit.production, unit.soldBushels, unit.storedBushels, unit.yield ?? '', unit.averageMoisture ?? '', unit.estimated ? 'Yes' : 'No']));
    if (unit.practices.length > 1) {
      for (const p of unit.practices) {
        rows.push(line([unit.county, unit.crop, p.practice, '', p.plantedAcres, p.harvestedAcres, '', p.production, '', '', p.yield ?? '', '', '']));
      }
    }
  }
  rows.push('', line(['BY FSA FARM NUMBER']), line(['County', 'Crop', 'FSA Farm #', 'Tracts', 'Planted Acres', 'Production (bu, 100%)', 'Yield (bu/ac)']));
  for (const unit of report.units) {
    for (const farm of unit.farms) {
      rows.push(line([unit.county, unit.crop, farm.farmNumber || 'No FSA farm', farm.tracts.join('; '), farm.plantedAcres, farm.production, farm.yield ?? '']));
    }
  }
  rows.push('', line(['LOADS']), line(['Date', 'County', 'Crop', 'Field', 'FSA Farm #', 'Tract #', 'Practice', 'Sold / Stored', 'Ticket / Bin', 'Moisture %', 'Bushels', 'Load Bushels', 'Estimated County Split']));
  for (const unit of report.units) {
    for (const load of unit.loads) {
      rows.push(line([load.date, unit.county, load.crop, load.fieldName, load.farmNumber, load.tractNumber, load.practice, load.disposition, load.reference, load.moisturePercent ?? '', load.bushels, load.loadBushels, load.estimated ? 'Yes' : 'No']));
    }
  }
  if (report.issues.length) {
    rows.push('', line(['ITEMS TO CHECK']), line(['Priority', 'Message']));
    report.issues.forEach(issue => rows.push(line([issue.severity.toUpperCase(), issue.message])));
  }
  return rows.join('\n');
}

export async function exportInsuranceProductionCsv(report: InsuranceProductionReport, metadata: Partial<InsuranceProductionMetadata>): Promise<void> {
  const reportDate = metadata.reportDate || new Date().toISOString().slice(0, 10);
  const csv = buildInsuranceProductionCsv({
    metadata: { farmName: farmNameForCsv(metadata.farmName), cropYear: report.cropYear, reportDate },
    report,
  });
  await downloadFile(csv, `Insurance_Production_${report.cropYear}_${reportDate}.csv`, 'text/csv');
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

export function exportInsuranceProductionPdf({
  report,
  metadata,
  fileName,
}: {
  report: InsuranceProductionReport;
  metadata: InsuranceProductionMetadata;
  fileName: string;
}): void {
  const doc = new jsPDF({ orientation: 'landscape', format: REPORT_PAGE_FORMAT });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 12;

  const header = (continued: boolean) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continued ? 10 : 14);
    doc.setTextColor(35, 64, 28);
    doc.text(continued ? `${INSURANCE_PRODUCTION_TITLE.toUpperCase()} (continued)` : INSURANCE_PRODUCTION_TITLE.toUpperCase(), left, continued ? 10 : 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70);
    doc.text(`Insured / farm: ${farmNameForPdf(metadata.farmName)}  |  Crop year: ${report.cropYear}  |  Prepared: ${metadata.reportDate}`, left, continued ? 15 : 19);
  };
  header(false);
  doc.setFontSize(7.2);
  doc.setTextColor(80);
  const disclaimer = doc.splitTextToSize(`${INSURANCE_PRODUCTION_DISCLAIMER} ${INSURANCE_UNIT_NOTE}`, pageWidth - left * 2) as string[];
  disclaimer.forEach((text, i) => doc.text(text, left, 24 + i * 3.4));

  const base = {
    theme: 'grid' as const,
    margin: { left, right: left, top: 20, bottom: 16 },
    styles: { fontSize: 7.2, cellPadding: 1.2, overflow: 'linebreak' as const, valign: 'middle' as const, lineColor: 190, lineWidth: 0.1 },
    headStyles: { fillColor: [45, 90, 27] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    willDrawPage: (data: { pageNumber: number }) => { if (data.pageNumber > 1) header(true); },
  };
  const sectionTitle = (title: string, y: number): number => {
    if (y > pageHeight - 40) {
      doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
      header(true);
      y = 22;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40);
    doc.text(title, left, y);
    return y + 2;
  };
  const finalY = () => (doc as DocWithTable).lastAutoTable?.finalY ?? 30;

  let y = sectionTitle('UNITS (ENTERPRISE: CROP + COUNTY)', 24 + disclaimer.length * 3.4 + 4);
  const unitRows: Array<Array<string>> = [];
  for (const unit of report.units) {
    unitRows.push([unit.county, unit.crop, practiceText(unit), num(unit.plantedAcres), num(unit.harvestedAcres), num(unit.production), num(unit.soldBushels), num(unit.storedBushels), yieldText(unit.yield), unit.averageMoisture == null ? '-' : `${unit.averageMoisture}`, unit.estimated ? 'Yes' : '']);
    if (unit.practices.length > 1) {
      unit.practices.forEach(p => unitRows.push(['', `  ${p.practice}`, '', num(p.plantedAcres), num(p.harvestedAcres), num(p.production), '', '', yieldText(p.yield), '', '']));
    }
  }
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['COUNTY', 'CROP', 'PRACTICE', 'PLANTED AC', 'HARVESTED AC', 'PRODUCTION BU (100%)', 'SOLD BU', 'STORED BU', 'YIELD BU/AC', 'AVG MOIST %', 'EST. SPLIT']],
    body: unitRows.length ? unitRows : [['No planting or harvest records this season', '', '', '', '', '', '', '', '', '', '']],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' }, 9: { halign: 'right' } },
  });

  y = sectionTitle('YIELD BY FSA FARM NUMBER', finalY() + 7);
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['COUNTY', 'CROP', 'FSA FARM #', 'TRACTS', 'PLANTED AC', 'PRODUCTION BU', 'YIELD BU/AC']],
    body: report.units.flatMap(unit => unit.farms.map(farm => [unit.county, unit.crop, farm.farmNumber || 'No FSA farm', farm.tracts.join(', ') || '-', num(farm.plantedAcres), num(farm.production), yieldText(farm.yield)])),
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
  });

  y = sectionTitle('LOADS', finalY() + 7);
  autoTable(doc, {
    ...base,
    startY: y,
    styles: { ...base.styles, fontSize: 6.8 },
    head: [['DATE', 'COUNTY', 'CROP', 'FIELD', 'FARM #', 'TRACT', 'SOLD/STORED', 'TICKET / BIN', 'MOIST %', 'BUSHELS']],
    body: report.units.flatMap(unit => unit.loads.map(load => [load.date, unit.county, load.crop, load.fieldName, load.farmNumber || '-', load.tractNumber || '-', load.disposition, load.reference || '-', load.moisturePercent == null ? '-' : `${load.moisturePercent}`, `${num(load.bushels)}${load.estimated ? ' (est.)' : ''}`])),
    columnStyles: { 8: { halign: 'right' }, 9: { halign: 'right' } },
  });

  if (report.issues.length) {
    y = sectionTitle('ITEMS TO CHECK BEFORE SENDING TO YOUR AGENT', finalY() + 7);
    autoTable(doc, {
      ...base,
      startY: y,
      head: [['PRIORITY', 'ITEM']],
      body: report.issues.map(issue => [issue.severity.toUpperCase(), issue.message]),
      columnStyles: { 0: { cellWidth: 22 } },
    });
  }

  let sigY = finalY() + 12;
  if (sigY > pageHeight - 40) {
    doc.addPage(REPORT_PAGE_FORMAT, 'landscape');
    header(true);
    sigY = 30;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(40);
  doc.text('Insured signature: ________________________________   Date (MM-DD-YYYY): ______________   Agent: ______________________', left, sigY);
  drawAcreLedgerNote(doc, 'report', sigY + 6);
  drawPageFooters(doc, `${farmNameForPdf(metadata.farmName)} | Crop year ${report.cropYear} | Generated ${metadata.reportDate}`);

  if (Capacitor.isNativePlatform()) native.sharePdf(fileName, doc);
  else doc.save(fileName);
}
