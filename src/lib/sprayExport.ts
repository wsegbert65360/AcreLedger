import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SprayRecord } from '@/types/farm';
import { 
  formatNumber, 
  formatUnit, 
  getComplianceStatus, 
  formatTime, 
  formatReportDate,
  joinParts 
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
  farmName: string, 
  options: ExportOptions = {}
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const isMulti = records.length > 1;
  const now = new Date().toLocaleDateString();

  // 1. Report Header
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(isMulti ? 'AcreLedger Spray Log Export' : 'AcreLedger Spray Record', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Farm: ${farmName || '—'}`, 14, 28);
  
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
    if (yPos > 260) {
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

    // Application Details Grid (Simulated with simple text for MVP)
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

    // 3. Products Table
    if (record.products && record.products.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Product', 'EPA Reg #', 'Rate', 'Total Applied']],
        body: record.products.map(p => [
          p.product || '—',
          p.epaRegNumber || '—',
          `${p.rate || '—'} ${p.rateUnit || ''}`.trim(),
          `${p.totalProductAmount || '—'} ${p.totalProductUnit || ''}`.trim()
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
          yPos = data.cursor?.y || yPos;
        }
      });
      // @ts-ignore - autoTable adds lastAutoTable to doc
      yPos = doc.lastAutoTable.finalY + 8;
    } else {
      doc.text('No products recorded for this application.', 14, yPos);
      yPos += 10;
    }

    // 4. Notes & Compliance
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

  // Filename
  let finalFilename = options.filename || (isMulti ? 'SprayLogExport.pdf' : 'SprayRecord.pdf');
  if (!finalFilename.endsWith('.pdf')) finalFilename += '.pdf';

  doc.save(finalFilename);
}
