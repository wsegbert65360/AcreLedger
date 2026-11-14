
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { native } from '@/lib/native';
import {
  REPORT_PAGE_FORMAT,
  drawAcreLedgerNote,
  drawPageFooters,
  type AcreLedgerNoteVariant,
} from './pdfBranding';

/** A second table drawn under the main table (e.g. the landlord activity timeline). */
export interface ExportPdfSecondaryTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  rightAlignColumns?: number[];
}

interface ExportPdfOptions {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  fileName: string;
  summaryText?: string;
  summaryValue?: string;
  footerText?: string[];
  orientation?: 'portrait' | 'landscape';
  tableCellPadding?: number;
  tableFontSize?: number;
  /** Zero-based column indexes to right-align (numeric columns). Falls back to a header-name match when omitted. */
  rightAlignColumns?: number[];
  /** Totals rows drawn as the table foot (bold, shaded). */
  footRows?: (string | number)[][];
  /** Extra lines printed under the table, before the summary (e.g. data-quality warnings). */
  noticeLines?: string[];
  secondaryTable?: ExportPdfSecondaryTable;
  /** Adds the boxed "made with AcreLedger" note after all content. */
  brandNote?: AcreLedgerNoteVariant;
}

const LEGACY_NUMERIC_HEADERS = [
  'ACRES', 'BUSHELS', 'MOIST %', 'LL %', 'SHARE %', 'TOTAL', 'BALES', 'BALE COUNT', 'YOUR SHARE',
  'SPLIT %', 'TOTAL BU.', 'BU/ACRE', 'LANDLORD SHARE', 'PROD.', 'CUTTING #1', 'CUTTING #2', 'CUTTING #3+',
];

function columnAlignment(
  headers: string[],
  rightAlignColumns: number[] | undefined,
): Record<number, { halign: 'right' }> {
  const styles: Record<number, { halign: 'right' }> = {};
  headers.forEach((header, index) => {
    const isRight = rightAlignColumns
      ? rightAlignColumns.includes(index)
      : LEGACY_NUMERIC_HEADERS.includes(header.toUpperCase());
    if (isRight) styles[index] = { halign: 'right' };
  });
  return styles;
}

/** Right-aligns header and totals cells of numeric columns (columnStyles only reach body cells). */
function alignNumericHeadAndFoot(columnStyles: Record<number, { halign: 'right' }>) {
  return (data: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
    if (data.section !== 'body' && columnStyles[data.column.index]) {
      data.cell.styles.halign = 'right';
    }
  };
}

export function exportToPdf({
  title,
  subtitle,
  headers,
  rows,
  fileName,
  summaryText,
  summaryValue,
  footerText,
  orientation = 'portrait',
  tableCellPadding = 3,
  tableFontSize = 8,
  rightAlignColumns,
  footRows,
  noticeLines,
  secondaryTable,
  brandNote,
}: ExportPdfOptions) {
  const doc = new jsPDF({ orientation, format: REPORT_PAGE_FORMAT });

  // Add Title
  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text(title.toUpperCase(), 14, 22);

  // Add Subtitle
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(subtitle, 14, 30);

  const tableStyles = {
    styles: {
      fontSize: tableFontSize,
      cellPadding: tableCellPadding,
    },
    headStyles: {
      fillColor: [45, 90, 27] as [number, number, number], // bg-primary equivalent (#2D5A1B)
      textColor: 255,
      halign: 'left' as const,
    },
    footStyles: {
      fillColor: [232, 238, 228] as [number, number, number],
      textColor: 40,
      fontStyle: 'bold' as const,
    },
  };

  // Add Table
  const mainColumnStyles = columnAlignment(headers, rightAlignColumns);
  autoTable(doc, {
    head: [headers],
    body: rows,
    ...(footRows?.length ? { foot: footRows, showFoot: 'lastPage' as const } : {}),
    startY: 35,
    ...tableStyles,
    columnStyles: mainColumnStyles,
    didParseCell: alignNumericHeadAndFoot(mainColumnStyles),
  });

  const pageHeightOf = () => doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
  const pageWidthOf = () => doc.internal.pageSize.width;
  let finalY = ((doc as any).lastAutoTable?.finalY || 35) + 10;

  // Data-quality / explanatory lines directly under the table
  if (noticeLines?.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(150, 90, 0);
    noticeLines.forEach(line => {
      const wrapped = doc.splitTextToSize(line, pageWidthOf() - 28) as string[];
      wrapped.forEach(part => {
        if (finalY + 5 > pageHeightOf() - 20) {
          doc.addPage();
          finalY = 20;
        }
        doc.text(part, 14, finalY);
        finalY += 5;
      });
    });
    finalY += 3;
  }

  // Add Summary if provided
  if (summaryText && summaryValue) {
    if (finalY + 10 > pageHeightOf() - 20) {
      doc.addPage();
      finalY = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text(summaryText.toUpperCase(), 14, finalY);

    doc.setTextColor(45, 90, 27); // text-primary equivalent
    const valueWidth = doc.getTextWidth(summaryValue);
    const pageWidth = pageWidthOf();
    doc.text(summaryValue, pageWidth - valueWidth - 14, finalY);
    finalY += 10;
  }

  if (secondaryTable && secondaryTable.rows.length > 0) {
    if (finalY + 30 > pageHeightOf() - 20) {
      doc.addPage();
      finalY = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(secondaryTable.title.toUpperCase(), 14, finalY);
    const secondaryColumnStyles = columnAlignment(secondaryTable.headers, secondaryTable.rightAlignColumns ?? []);
    autoTable(doc, {
      head: [secondaryTable.headers],
      body: secondaryTable.rows,
      startY: finalY + 4,
      ...tableStyles,
      columnStyles: secondaryColumnStyles,
      didParseCell: alignNumericHeadAndFoot(secondaryColumnStyles),
    });
    finalY = ((doc as any).lastAutoTable?.finalY || finalY) + 10;
  }

  if (footerText?.length) {
    const pageHeight = pageHeightOf();
    const pageWidth = pageWidthOf();
    // Right margin mirrors the left (14) so text never runs off the page.
    const maxWidth = pageWidth - 28;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40);
    // `splitTextToSize` wraps each source line to the page width; each wrapped
    // line becomes its own entry so long footers (e.g. signature blocks)
    // paginate correctly instead of overflowing the right edge.
    const wrappedLines = footerText.flatMap(line => doc.splitTextToSize(line, maxWidth));
    if (finalY + wrappedLines.length * 6 > pageHeight - 20) {
      doc.addPage();
      finalY = 20;
    }
    wrappedLines.forEach((line) => {
      if (finalY + 6 > pageHeight - 20) {
        doc.addPage();
        finalY = 20;
      }
      doc.text(line, 14, finalY);
      finalY += 6;
    });
  }

  if (brandNote) {
    drawAcreLedgerNote(doc, brandNote, finalY + 4);
  }

  // Footer on every page, including pages added after the table.
  drawPageFooters(doc);

  if (Capacitor.isNativePlatform()) {
    native.sharePdf(fileName, doc);
  } else {
    doc.save(fileName);
  }
}
