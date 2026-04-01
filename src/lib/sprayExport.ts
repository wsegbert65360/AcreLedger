import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SprayRecord } from '@/types/farm';
import { 
  formatNumber, 
  formatUnit, 
  getComplianceStatus, 
  formatTime, 
  formatReportDate,
  joinParts,
  sanitizeFilename 
} from './sprayExportFormatters';
import { cleanName } from '@/utils/text';

interface ExportOptions {
  filename?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Main entry point for generating a Spray Log PDF.
 * Supports both single and multiple records.
 */
export function generateSprayPDF(
  records: SprayRecord[], 
  farmName: string | null, 
  options: ExportOptions = {}
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const isMulti = records.length > 1;
  const now = new Date().toLocaleDateString();
  const displayFarmName = farmName || '—';

  // 1. Report Header
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(isMulti ? 'AcreLedger Spray Log Export' : 'AcreLedger Spray Record', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Farm: ${displayFarmName}`, 14, 28);
  
  if (isMulti && (options.startDate || options.endDate)) {
    const range = `${formatReportDate(options.startDate)} to ${formatReportDate(options.endDate)}`;
    doc.text(`Date Range: ${range}`, 14, 33);
    doc.text(`Generated: ${now}`, 14, 38);
  } else {
    doc.text(`Generated: ${now}`, 14, 33);
  }

  let yPos = isMulti ? 45 : 40;

  // 2. Records
  records.forEach((record, index) => {
    // Add page if needed (simplified check)
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    if (isMulti) {
      // Divider for multi-record
      if (index > 0) {
        doc.setDrawColor(200, 200, 200);
        doc.line(14, yPos, 196, yPos);
        yPos += 10;
      }
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`${formatReportDate(record.sprayDate)} — ${cleanName(record.fieldName)}`, 14, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 7;
    } else {
      // Single record sub-header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(cleanName(record.fieldName), 14, yPos);
      yPos += 8;
    }

    // Application Details Grid
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    const detailsLeft = [
      `Applicator: ${record.applicatorName || '—'}`,
      `License #: ${record.licenseNumber || '—'}`,
      `Date: ${formatReportDate(record.sprayDate)}`,
      `Time: ${formatTime(record.startTime)} to ${formatTime(record.endTime)}`,
    ];

    const detailsRight = [
      `Crop/Site: ${record.cropOrSiteTreated || '—'}`,
      `Target Pest: ${record.targetPest || '—'}`,
      `Area: ${formatNumber(record.treatedAreaSize)} ${formatUnit(record.treatedAreaUnit) || 'ac'}`,
      `Method: ${record.applicationMethod || '—'}`,
    ];

    const detailsFarRight = [
      `Equipment: ${record.equipmentId || '—'}`,
      `REI: ${record.rei || '—'}`,
      `Wind: ${joinParts([record.windSpeed, 'MPH', record.windDirection])}`,
      `Temp: ${record.temperature ? record.temperature + '°F' : '—'} / RH: ${record.relativeHumidity ? record.relativeHumidity + '%' : '—'}`,
    ];

    let detailY = yPos;
    detailsLeft.forEach((text, i) => doc.text(text, 14, detailY + i * 5));
    detailsRight.forEach((text, i) => doc.text(text, 75, detailY + i * 5));
    detailsFarRight.forEach((text, i) => doc.text(text, 140, detailY + i * 5));
    
    yPos += 25;

    // 2b. Mix & Personnel Details (NEW)
    const hasMixDetails = record.mixtureRate || record.totalMixtureVolume || record.involvedTechnicians;
    if (hasMixDetails) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Mix & Personnel Details:', 14, yPos);
      doc.setFont('helvetica', 'normal');
      
      const mixParts = [];
      if (record.mixtureRate) mixParts.push(`Rate: ${record.mixtureRate}`);
      if (record.totalMixtureVolume) mixParts.push(`Total Vol: ${record.totalMixtureVolume}`);
      if (record.involvedTechnicians) mixParts.push(`Personnel: ${record.involvedTechnicians}`);
      
      doc.text(mixParts.join('  |  '), 55, yPos);
      yPos += 7;
    }

    // 3. Products Table
    // Ensure enough room for at least the table header + a few rows before rendering
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }
    if (record.products && record.products.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Product / Active Ingredients', 'EPA Reg #', 'Rate', 'Total Applied']],
        body: record.products.map(p => [
          { 
            content: `${p.product}${p.activeIngredients ? '\n' + p.activeIngredients : ''}`, 
            styles: { fontStyle: p.activeIngredients ? 'normal' : 'bold' } 
          },
          p.epaRegNumber || '—',
          `${p.rate || '—'} ${p.rateUnit || ''}`.trim(),
          `${p.totalProductAmount || '—'} ${p.totalProductUnit || ''}`.trim()
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 80 }
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
          yPos = data.cursor?.y || yPos;
        }
      });
      yPos = (doc.lastAutoTable && doc.lastAutoTable.finalY) || yPos;
    } else {
      doc.text('No products recorded for this application.', 14, yPos);
      yPos += 10;
    }

    // 4. Notes & Compliance
    // Page break safety — estimate space needed for notes + site address + compliance line
    const estimatedNotesHeight = record.notes
      ? Math.ceil(record.notes.length / 90) * 4 + 5
      : 0;
    const estimatedSectionHeight = estimatedNotesHeight + (record.siteAddress ? 10 : 0) + 12;
    if (yPos + estimatedSectionHeight > 280) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(8);
    if (record.notes) {
      const splitNotes = doc.splitTextToSize(`Notes: ${record.notes}`, 180);
      doc.text(splitNotes, 14, yPos);
      yPos += (splitNotes.length * 4);
    }

    if (record.siteAddress) {
      doc.text(`Site Address: ${record.siteAddress}`, 14, yPos);
      yPos += 5;
    }

    // Compliance line
    doc.setFont('helvetica', record.nonCompliant ? 'bold' : 'normal');
    if (record.nonCompliant) {
      doc.setTextColor(200, 0, 0);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.text(getComplianceStatus(record.nonCompliant), 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    yPos += 12;
  });

  // Footer / Page Numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, 196, 285, { align: 'right' });
    doc.text('Generated by AcreLedger', 14, 285);
  }

  // Filename Generation (NEW)
  let finalFilename = options.filename;
  if (!finalFilename) {
    if (isMulti && records.length > 0) {
      const start = options.startDate || records[records.length - 1].sprayDate || 'Start';
      const end = options.endDate || records[0].sprayDate || 'End';
      finalFilename = `SprayLog_${sanitizeFilename(displayFarmName)}_${start}_to_${end}.pdf`;
    } else if (records.length > 0) {
      const rec = records[0];
      finalFilename = `SprayRecord_${sanitizeFilename(rec.fieldName)}_${rec.sprayDate || 'NoDate'}.pdf`;
    } else {
      finalFilename = `SprayRecord_${sanitizeFilename(displayFarmName)}_Empty.pdf`;
    }
  }
  if (!finalFilename.endsWith('.pdf')) finalFilename += '.pdf';

  doc.save(finalFilename);
}
