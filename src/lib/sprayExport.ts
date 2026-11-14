import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { REPORT_PAGE_FORMAT, drawAcreLedgerNote, drawPageFooters } from '@/lib/complianceReports/pdfBranding';
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
  sanitizeFilename,
  normalizeTreatedArea,
  areaForProductTotal,
  effectiveTreatedAreaUnit,
  convertFahrenheitToCelsius,
  convertMphToKmh
} from './sprayExportFormatters';
import { cleanName } from '@/utils/text';
import { formatSprayProductTotal, getUnitLabel } from '@/utils/unitConversion';
import { Capacitor } from '@capacitor/core';
import { native } from '@/lib/native';
import { farmNameForPdf, knownFarmName } from '@/lib/farmDisplayName';
import { getEffectiveSprayTreatedAcres } from '@/lib/fieldAcreage';
import { resolveComplianceProfileId } from '@/lib/compliance/profiles';
import type { ComplianceProfileId } from '@/lib/compliance/profiles';
import { missingComplianceFields, sprayProductsNeedReview } from '@/lib/sprayCompliance';

interface ExportOptions {
  filename?: string;
  startDate?: string;
  endDate?: string;
  fields?: Field[];
  cluAssignments?: FieldCluAssignment[];
  profile?: ComplianceProfileId;
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
 * Supports both single and multiple records with profile-aware formatting.
 */
export function generateSprayPDF(
  records: SprayRecord[],
  farmName: string | null,
  options: ExportOptions = {}
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: REPORT_PAGE_FORMAT
  });
  // Layout is measured from the page edges so it holds on US Letter.
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const RIGHT = pageWidth - 14;
  const BOTTOM = pageHeight - 22;

  const profileId = resolveComplianceProfileId(options.profile);
  const isAu = profileId === 'au-apvma';
  const isMulti = records.length > 1;
  const now = new Date().toLocaleDateString();
  const displayFarmName = farmNameForPdf(farmName);
  const filenameFarmName = knownFarmName(farmName) || 'Farm';
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
    const headerTitle = isAu ? 'AcreLedger Spray Record (AU)' : 'AcreLedger Spray Log';
    doc.text(`${headerTitle} - ${displayFarmName}`, 14, 10);
    if (rangeStart || rangeEnd) {
      doc.text(`${formatReportDate(rangeStart)} to ${formatReportDate(rangeEnd)}`, RIGHT, 10, { align: 'right' });
    }
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 13, RIGHT, 13);
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
  const titleText = isMulti ? 'AcreLedger Spray Log Export' : 'AcreLedger Spray Record';
  const displayTitle = isAu ? `${titleText} (AU)` : titleText;
  doc.text(displayTitle, 14, 20);

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
    const treatedAreaUnit = effectiveTreatedAreaUnit(record);
    const productRows = Math.max(record.products?.length || 0, 1);
    const estimatedRecordHeight = 60 + productRows * 11 + (record.notes ? 12 : 0);
    if (yPos + estimatedRecordHeight > BOTTOM) {
      yPos = addContentPage();
    }

    if (isMulti) {
      // Divider for multi-record
      if (index > 0) {
        doc.setDrawColor(200, 200, 200);
        doc.line(14, yPos, RIGHT, yPos);
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

    let detailsLeft: string[];
    let detailsRight: string[];
    let detailsFarRight: string[];

    if (isAu) {
      const areaValue = treatedArea ? normalizeTreatedArea(treatedArea, treatedAreaUnit, 'ha') : undefined;
      const areaDisplay = areaValue ? `${formatNumber(areaValue)} ha` : '-';
      const tempDisplay = record.temperature != null ? `${convertFahrenheitToCelsius(record.temperature)} °C` : '-';
      const windKmh = record.windSpeed != null ? convertMphToKmh(record.windSpeed) : undefined;
      const windDisplay = joinParts([windKmh, 'km/h', record.windDirection]);

      detailsLeft = [
        `Applicator: ${record.applicatorName || '-'}`,
        `PIC: ${record.pic || '-'}`,
        `Date: ${formatReportDate(record.sprayDate)}`,
        `Time: ${formatTime(record.startTime)} to ${formatTime(record.endTime)}`,
      ];

      detailsRight = [
        `Crop/Site: ${record.cropOrSiteTreated || '-'}`,
        `Target Pest: ${record.targetPest || '-'}`,
        `Area: ${areaDisplay}`,
        `Method: ${record.applicationMethod || '-'}`,
      ];

      detailsFarRight = [
        `Equipment: ${record.equipmentId || '-'}`,
        `Water Rate: ${record.waterRate ? `${record.waterRate} ${record.waterRateUnit || 'L/ha'}` : '-'}`,
        `Wind: ${windDisplay}`,
        `Temp: ${tempDisplay} / RH: ${record.relativeHumidity != null ? record.relativeHumidity + '%' : '-'}`,
      ];
    } else {
      detailsLeft = [
        `Applicator: ${record.applicatorName || '-'}`,
        `License #: ${record.licenseNumber || '-'}`,
        `Date: ${formatReportDate(record.sprayDate)}`,
        `Time: ${formatTime(record.startTime)} to ${formatTime(record.endTime)}`,
      ];

      detailsRight = [
        `Crop/Site: ${record.cropOrSiteTreated || '-'}`,
        `Target Pest: ${record.targetPest || '-'}`,
        `Area: ${formatNumber(treatedArea)} ${formatUnit(treatedAreaUnit) || 'ac'}`,
        `Method: ${record.applicationMethod || '-'}`,
      ];

      detailsFarRight = [
        `Equipment: ${record.equipmentId || '-'}`,
        `REI: ${record.rei || '-'}`,
        `Wind: ${joinParts([record.windSpeed, 'MPH', record.windDirection])}`,
        `Temp: ${record.temperature != null ? record.temperature + ' F' : '-'} / RH: ${record.relativeHumidity != null ? record.relativeHumidity + '%' : '-'}`,
      ];
    }

    const detailY = yPos;
    const detailColumns = [
      { items: detailsLeft, x: 14, width: 56 },
      { items: detailsRight, x: 75, width: 60 },
      { items: detailsFarRight, x: 140, width: 56 },
    ];
    // Long values wrap inside their column instead of being cut off; a row is
    // as tall as its longest cell.
    let rowY = detailY;
    for (let i = 0; i < detailsLeft.length; i += 1) {
      const cells = detailColumns.map(({ items, width }) => doc.splitTextToSize(items[i] || '-', width) as string[]);
      cells.forEach((lines, columnIndex) => doc.text(lines, detailColumns[columnIndex].x, rowY));
      rowY += 5 + (Math.max(...cells.map(lines => lines.length), 1) - 1) * 4;
    }
    yPos = rowY + 5;

    // 2a. Sprayer setup and end-of-application conditions, when recorded.
    const setupParts: string[] = [];
    const nozzle = [record.nozzleType, record.nozzleSize].filter(Boolean).join(' ');
    if (nozzle) setupParts.push(`Nozzle: ${nozzle}`);
    if (record.pressurePsi != null) setupParts.push(`Pressure: ${record.pressurePsi} psi`);
    if (record.windSpeedEnd != null) {
      setupParts.push(isAu
        ? `End wind: ${joinParts([convertMphToKmh(record.windSpeedEnd), 'km/h', record.windDirectionEnd])}`
        : `End wind: ${joinParts([record.windSpeedEnd, 'MPH', record.windDirectionEnd])}`);
    }
    if (record.tempEnd != null) {
      setupParts.push(isAu ? `End temp: ${convertFahrenheitToCelsius(record.tempEnd)} °C` : `End temp: ${record.tempEnd} F`);
    }
    if (setupParts.length > 0) {
      doc.setFontSize(8);
      const setupLines = doc.splitTextToSize(`Setup & end conditions: ${setupParts.join('  |  ')}`, RIGHT - 14) as string[];
      doc.text(setupLines, 14, yPos);
      yPos += setupLines.length * 4 + 3;
    }

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

      const mixLines = doc.splitTextToSize(mixParts.join('  |  '), RIGHT - 55) as string[];
      doc.text(mixLines, 55, yPos);
      yPos += 7 + (mixLines.length - 1) * 4;
    }

    // 3. Products Table
    if (record.products && record.products.length > 0) {
      const regNumHeader = isAu ? 'APVMA Permit #' : 'EPA Reg #';
      autoTable(doc, {
        startY: yPos,
        head: [['Product / Active Ingredients', regNumHeader, 'Rate', 'Total Applied']],
        body: record.products.map(p => {
          return [
            {
              content: `${p.product}${p.activeIngredients ? '\n' + p.activeIngredients : ''}`,
              styles: { fontStyle: p.activeIngredients ? 'normal' : 'bold' }
            },
            p.epaRegNumber || '-',
            // getUnitLabel marks dry oz and fluid oz so the rate cannot be misread.
            `${p.rate || '-'} ${p.rateUnit ? getUnitLabel(p.rateUnit) : ''}`.trim(),
            formatSprayProductTotal(p, areaForProductTotal(treatedArea, treatedAreaUnit, p.rateUnit, profileId))
          ];
        }),
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
    if (yPos > BOTTOM - 15) {
      yPos = addContentPage();
    }

    doc.setFontSize(8);
    const { cleanNotes, attachmentDataUri } = splitAttachmentFromNotes(record.notes);
    if (cleanNotes) {
      const splitNotes = doc.splitTextToSize(`Notes: ${cleanNotes}`, RIGHT - 14);
      doc.text(splitNotes, 14, yPos);
      yPos += (splitNotes.length * 4);
    }

    if (attachmentDataUri) {
      if (yPos > BOTTOM - 55) {
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
    // Same checks the in-app review queue uses, so the PDF never says
    // "Complete" for a record the app flags, and it names what is missing.
    const exportOmissions = getRecordOmissions(record, treatedArea ?? undefined, profileId, treatedAreaUnit);
    const missingFields = missingComplianceFields(record, profileId).map(label => label.toLowerCase());
    const productGap = record.products?.length && sprayProductsNeedReview(record.products, profileId)
      ? [isAu ? 'a product name or rate' : 'a product name, EPA Reg # or rate']
      : [];
    const omissions = [...new Set([...exportOmissions, ...missingFields, ...productGap])];
    const needsReview = Boolean(record.nonCompliant || omissions.length);
    doc.setFont('helvetica', needsReview ? 'bold' : 'normal');
    if (needsReview) {
      doc.setTextColor(200, 0, 0);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    const statusText = record.nonCompliant && omissions.length > 0
      ? `${getComplianceStatus(true)} Missing: ${omissions.join(', ')}.`
      : getComplianceStatus(record.nonCompliant, omissions);
    const statusLines = doc.splitTextToSize(statusText, RIGHT - 14) as string[];
    doc.text(statusLines, 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    yPos += 12 + (statusLines.length - 1) * 4;
  });

  // AcreLedger note after the last record, then the shared footer on every page.
  const pagesBeforeNote = doc.getNumberOfPages();
  drawAcreLedgerNote(doc, 'spray', yPos);
  if (doc.getNumberOfPages() > pagesBeforeNote) drawRunningHeader();
  drawPageFooters(doc);

  // Filename Generation (NEW)
  let finalFilename = options.filename;
  if (!finalFilename) {
    if (isMulti) {
      const start = rangeStart || 'Start';
      const end = rangeEnd || 'End';
      finalFilename = `SprayLog_${sanitizeFilename(filenameFarmName)}_${start}_to_${end}.pdf`;
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
