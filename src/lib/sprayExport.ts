import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Field, SprayRecord } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import {
  formatNumber,
  formatUnit,
  getComplianceStatus,
  getChronologicalDateRange,
  getRecordOmissions,
  formatTime,
  formatReportDate,
  joinParts,
  sanitizeFilename
} from './sprayExportFormatters';
import { cleanName } from '@/utils/text';
import { formatSprayProductTotal } from '@/utils/unitConversion';
import { Capacitor } from '@capacitor/core';
import { native } from '@/lib/native';
import { getEffectiveSprayTreatedAcres } from '@/lib/fieldAcreage';

interface ExportOptions {
  filename?: string;
  startDate?: string;
  endDate?: string;
  fields?: Field[];
  cluAssignments?: FieldCluAssignment[];
}

function splitAttachmentFromNotes(notes?: string): { cleanNotes: string; attachmentDataUri: string | null } {
  if (!notes) return { cleanNotes: '', attachmentDataUri: null };

  const match = notes.match(/\[ATTACHMENT:(data:image\/[^;]+;base64,[^\]]+)\]/);
  return {
    cleanNotes: notes.replace(/\s*\[ATTACHMENT:[^\]]+\]\s*/g, ' ').trim(),
    attachmentDataUri: match?.[1] ?? null,
  };
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
  const displayFarmName = farmName || '-';
  const chronologicalRecords = [...records].sort((a, b) =>
    (a.sprayDate || '').localeCompare(b.sprayDate || '') || a.timestamp - b.timestamp
  );
  const derivedRange = getChronologicalDateRange(chronologicalRecords);
  const rangeStart = options.startDate || derivedRange.start;
  const rangeEnd = options.endDate || derivedRange.end;

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`AcreLedger Spray Log - ${displayFarmName}`, 14, 10);
    if (rangeStart || rangeEnd) {
      doc.text(`${formatReportDate(rangeStart)} to ${formatReportDate(rangeEnd)}`, 196, 10, { align: 'right' });
    }
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 13, 196, 13);
    doc.setTextColor(0, 0, 0);
  };

  const addContentPage = () => {
    doc.addPage();
    drawRunningHeader();
    return 22;
  };

  // 1. Report Header
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(isMulti ? 'AcreLedger Spray Log Export' : 'AcreLedger Spray Record', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Farm: ${displayFarmName}`, 14, 28);

  if (isMulti && (rangeStart || rangeEnd)) {
    const range = `${formatReportDate(rangeStart)} to ${formatReportDate(rangeEnd)}`;
    doc.text(`Date Range: ${range}`, 14, 33);
    doc.text(`Applications: ${records.length}`, 14, 38);
    doc.text(`Generated: ${now}`, 14, 43);
  } else {
    doc.text(`Generated: ${now}`, 14, 33);
  }

  let yPos = isMulti ? 50 : 40;

  // 2. Records
  chronologicalRecords.forEach((record, index) => {
    const field = options.fields?.find(candidate => candidate.id === record.fieldId);
    const treatedArea = getEffectiveSprayTreatedAcres(record, field, options.cluAssignments);
    const productRows = Math.max(record.products?.length || 0, 1);
    const estimatedRecordHeight = 60 + productRows * 11 + (record.notes ? 12 : 0);
    if (yPos + estimatedRecordHeight > 275) {
      yPos = addContentPage();
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
      doc.text(`${formatReportDate(record.sprayDate)} - ${cleanName(record.fieldName)}`, 14, yPos);
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
      `Applicator: ${record.applicatorName || '-'}`,
      `License #: ${record.licenseNumber || '-'}`,
      `Date: ${formatReportDate(record.sprayDate)}`,
      `Time: ${formatTime(record.startTime)} to ${formatTime(record.endTime)}`,
    ];

    const detailsRight = [
      `Crop/Site: ${record.cropOrSiteTreated || '-'}`,
      `Target Pest: ${record.targetPest || '-'}`,
      `Area: ${formatNumber(treatedArea)} ${formatUnit(record.treatedAreaUnit) || 'ac'}`,
      `Method: ${record.applicationMethod || '-'}`,
    ];

    const detailsFarRight = [
      `Equipment: ${record.equipmentId || '-'}`,
      `REI: ${record.rei || '-'}`,
      `Wind: ${joinParts([record.windSpeed, 'MPH', record.windDirection])}`,
      `Temp: ${record.temperature != null ? record.temperature + ' F' : '-'} / RH: ${record.relativeHumidity != null ? record.relativeHumidity + '%' : '-'}`,
    ];

    const detailY = yPos;
    const detailColumns = [
      { items: detailsLeft, x: 14, width: 56 },
      { items: detailsRight, x: 75, width: 60 },
      { items: detailsFarRight, x: 140, width: 56 },
    ];
    detailColumns.forEach(({ items, x, width }) => items.forEach((text, i) => {
      const clipped = doc.splitTextToSize(text, width)[0] || '-';
      doc.text(clipped, x, detailY + i * 5);
    }));

    yPos += 25;

    // 2b. Mix & Personnel Details (NEW)
    const hasMixDetails = record.mixtureRate || record.totalMixtureVolume || record.involvedTechnicians || record.sensitiveAreaCheck;
    if (hasMixDetails) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Mix & Personnel Details:', 14, yPos);
      doc.setFont('helvetica', 'normal');

      const mixParts = [];
      if (record.mixtureRate) mixParts.push(`Rate: ${record.mixtureRate}`);
      if (record.totalMixtureVolume) mixParts.push(`Total Vol: ${record.totalMixtureVolume}`);
      if (record.involvedTechnicians) mixParts.push(`Personnel: ${record.involvedTechnicians}`);
      if (record.sensitiveAreaCheck) {
        let checkStr = 'Sensitive Area Check: PERFORMED';
        if (record.sensitiveAreaNotes) checkStr += ` (${record.sensitiveAreaNotes})`;
        mixParts.push(checkStr);
      }

      doc.text(mixParts.join('  |  '), 55, yPos);
      yPos += 7;
    }

    // 3. Products Table
    if (record.products && record.products.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Product / Active Ingredients', 'EPA Reg #', 'Rate', 'Total Applied']],
        body: record.products.map(p => [
          {
            content: `${p.product}${p.activeIngredients ? '\n' + p.activeIngredients : ''}`,
            styles: { fontStyle: p.activeIngredients ? 'normal' : 'bold' }
          },
          p.epaRegNumber || '-',
          `${p.rate || '-'} ${p.rateUnit || ''}`.trim(),
          formatSprayProductTotal(p, treatedArea)
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 80 }
        },
        margin: { left: 14, right: 14 },
        pageBreak: 'avoid',
        rowPageBreak: 'avoid',
        didDrawPage: (data) => {
          yPos = data.cursor?.y || yPos;
        }
      });
      // @ts-expect-error - autoTable adds lastAutoTable to doc
      yPos = doc.lastAutoTable.finalY + 8;
    } else {
      doc.text('No products recorded for this application.', 14, yPos);
      yPos += 10;
    }

    // 4. Notes & Compliance
    // Page break safety for notes
    if (yPos > 260) {
      yPos = addContentPage();
    }

    doc.setFontSize(8);
    const { cleanNotes, attachmentDataUri } = splitAttachmentFromNotes(record.notes);
    if (cleanNotes) {
      const splitNotes = doc.splitTextToSize(`Notes: ${cleanNotes}`, 180);
      doc.text(splitNotes, 14, yPos);
      yPos += (splitNotes.length * 4);
    }

    if (attachmentDataUri) {
      if (yPos > 220) {
        yPos = addContentPage();
      }
      doc.text('Attached Ticket / Label:', 14, yPos);
      yPos += 4;
      try {
        const imageFormat = attachmentDataUri.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(attachmentDataUri, imageFormat, 14, yPos, 70, 52);
        yPos += 57;
      } catch {
        doc.text('Attachment image could not be embedded in this export.', 14, yPos);
        yPos += 5;
      }
    }

    if (record.siteAddress) {
      doc.text(`Field/Site: ${record.siteAddress}`, 14, yPos);
      yPos += 5;
    }

    // Compliance line
    const omissions = getRecordOmissions(record, treatedArea);
    const needsReview = Boolean(record.nonCompliant || omissions.length);
    doc.setFont('helvetica', needsReview ? 'bold' : 'normal');
    if (needsReview) {
      doc.setTextColor(200, 0, 0);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.text(getComplianceStatus(record.nonCompliant, omissions), 14, yPos);
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
    if (isMulti) {
      const start = rangeStart || 'Start';
      const end = rangeEnd || 'End';
      finalFilename = `SprayLog_${sanitizeFilename(displayFarmName)}_${start}_to_${end}.pdf`;
    } else {
      const rec = records[0];
      finalFilename = `SprayRecord_${sanitizeFilename(rec.fieldName)}_${rec.sprayDate || 'NoDate'}.pdf`;
    }
  }
  if (!finalFilename.endsWith('.pdf')) finalFilename += '.pdf';

  if (Capacitor.isNativePlatform()) {
    native.sharePdf(finalFilename, doc);
  } else {
    doc.save(finalFilename);
  }
}
