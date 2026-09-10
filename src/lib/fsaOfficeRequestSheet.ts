import jsPDF from 'jspdf';

import { parseTractKeys } from '@/lib/tractLookup';
import type { Field } from '@/types/farm';

/**
 * The canonical FSA boundary request wording. The on-screen request, the
 * copy-to-clipboard action, and the printable PDF all render this exact text.
 */
export const FSA_BOUNDARY_REQUEST_TEXT = 'I use AcreLedger for my farm records. Please give me the digital file or files containing my current FSA Common Land Unit field boundaries for every farm and tract I operate. GeoJSON or ESRI shapefile ZIP files are both okay. Please include the farm number, tract number, field or CLU number, and calculated acres when available.';

const PAGE_WIDTH = 215.9;
const LEFT = 16;
const RIGHT = PAGE_WIDTH - 16;

/** Keeps a runaway tract list from pushing the sheet past one page. */
const MAX_PRINTED_TRACT_ENTRIES = 14;

export interface FsaOfficeRequestSheetOptions {
  operatorName?: string;
  farmName?: string;
  countyState?: string;
  contact?: string;
  /** Deduplicated farm-tract keys (e.g. "6418-1417") already recorded on fields. */
  knownTracts?: string[];
  save?: boolean;
}

/** Farm/tract keys recorded on active (non-deleted) fields, deduplicated and sorted. */
export function collectKnownFsaTracts(
  fields: ReadonlyArray<Pick<Field, 'fsaFarmNumber' | 'fsaTractNumber' | 'deleted_at'>>,
): string[] {
  const keys = new Set<string>();
  for (const field of fields) {
    if (field.deleted_at) continue;
    for (const key of parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber)) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
}

function addWriteInLine(doc: jsPDF, label: string, value: string, x: number, y: number, width: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(label, x, y);
  const labelWidth = doc.getTextWidth(label);
  if (value) {
    let size = 9.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const maxWidth = width - labelWidth - 4;
    while (doc.getTextWidth(value) > maxWidth && size > 7) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.text(value, x + labelWidth + 4, y);
  }
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.25);
  doc.line(x + labelWidth + 2, y + 0.8, x + width, y + 0.8);
}

function addCheckbox(doc: jsPDF, text: string, y: number): number {
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.3);
  // Top edge places the box's vertical center at ~y-1.2mm, matching the visual
  // center of 10pt cap-height label text drawn with its baseline at y.
  doc.rect(LEFT, y - 2.95, 3.5, 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, RIGHT - LEFT - 7) as string[];
  doc.text(lines, LEFT + 6, y);
  return y + Math.max(6, lines.length * 4.5);
}

/** Creates the plain-language, one-page request sheet operators can take to FSA. */
export function createFsaOfficeRequestSheet({
  operatorName = '',
  farmName = '',
  countyState = '',
  contact = '',
  knownTracts = [],
  save = true,
}: FsaOfficeRequestSheetOptions = {}): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  doc.setFillColor(31, 78, 48);
  doc.rect(0, 0, PAGE_WIDTH, 27, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FSA FIELD FILE REQUEST', LEFT, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text('Please help me get my field boundaries into AcreLedger.', LEFT, 20);

  doc.setTextColor(30, 30, 30);

  let y = 36;
  addWriteInLine(doc, 'Operator name:', operatorName, LEFT, y, 82);
  addWriteInLine(doc, 'Farm or business:', farmName, 105, y, RIGHT - 105);
  y += 8;
  addWriteInLine(doc, 'County and state:', countyState, LEFT, y, 82);
  addWriteInLine(doc, 'Phone or email:', contact, 105, y, RIGHT - 105);
  y += 8;

  // Main request
  const requestLines = doc.splitTextToSize(FSA_BOUNDARY_REQUEST_TEXT, RIGHT - LEFT - 10) as string[];
  const requestBoxHeight = 13 + requestLines.length * 4.5;
  doc.setFillColor(237, 244, 239);
  doc.roundedRect(LEFT, y + 1, RIGHT - LEFT, requestBoxHeight, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('What I need from FSA', LEFT + 5, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(requestLines, LEFT + 5, y + 16);
  y += requestBoxHeight + 7;

  // Please include (required details)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Please include:', LEFT, y);
  y += 7.5;
  y = addCheckbox(doc, 'Farm number', y);
  y = addCheckbox(doc, 'Tract number', y);
  y = addCheckbox(doc, 'Field or CLU number', y);
  y = addCheckbox(doc, 'Calculated acres', y);
  y += 2.5;

  // Also helpful (optional reports)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Also helpful:', LEFT, y);
  y += 7.5;
  y = addCheckbox(doc, 'Current farm and tract map', y);
  y = addCheckbox(doc, 'Current FSA-156EZ farm record', y);
  y = addCheckbox(doc, 'Most recent FSA-578 acreage report', y);
  y += 2.5;

  // How to send it
  const sendLines = doc.splitTextToSize(
    'Please email the boundary file(s) to the operator listed above, or place them on a USB drive they provide.',
    RIGHT - LEFT - 10,
  ) as string[];
  const warningLines = doc.splitTextToSize(
    'A paper map or picture alone cannot be imported. AcreLedger needs the digital boundary file.',
    RIGHT - LEFT - 10,
  ) as string[];
  const sendBoxHeight = 13 + (sendLines.length + warningLines.length) * 4.5 + 2;
  doc.setFillColor(247, 247, 247);
  doc.roundedRect(LEFT, y, RIGHT - LEFT, sendBoxHeight, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('How to send it', LEFT + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(sendLines, LEFT + 5, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(warningLines, LEFT + 5, y + 15 + sendLines.length * 4.5);
  y += sendBoxHeight + 7;

  // Known farm/tract numbers (capped so the sheet always stays one page)
  if (knownTracts.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Farm and tract numbers already in AcreLedger', LEFT, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const overflow = Math.max(0, knownTracts.length - MAX_PRINTED_TRACT_ENTRIES);
    const printed = overflow > 0 ? knownTracts.slice(0, MAX_PRINTED_TRACT_ENTRIES) : knownTracts;
    const listText = overflow > 0
      ? `${printed.join(', ')} (plus ${overflow} more)`
      : printed.join(', ');
    const tractLines = doc.splitTextToSize(listText, RIGHT - LEFT) as string[];
    doc.text(tractLines, LEFT, y + 3);
    y += 3 + tractLines.length * 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text('From your AcreLedger field records. This may not be a complete list.', LEFT, y + 3);
    doc.setTextColor(30, 30, 30);
    y += 8;
  }

  // FSA office notes (anchored toward the bottom, but never overlapping content)
  const officeY = Math.max(y + 2, 208);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('FSA office notes', LEFT, officeY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setDrawColor(150, 150, 150);
  const noteLines = Math.max(3, Math.min(4, Math.floor((250 - officeY) / 7)));
  for (let i = 0; i < noteLines; i += 1) {
    doc.line(LEFT, officeY + 7 + (i * 7), RIGHT, officeY + 7 + (i * 7));
  }

  doc.setDrawColor(31, 78, 48);
  doc.setLineWidth(0.5);
  doc.line(LEFT, 258, RIGHT, 258);
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(8.5);
  doc.text('AcreLedger accepts GeoJSON (.json or .geojson) and ESRI shapefile ZIP files directly.', LEFT, 264);
  doc.text('Questions or file help: support@acreledger.com', LEFT, 269);

  if (save) doc.save('AcreLedger_FSA_Field_File_Request.pdf');
  return doc;
}
