import type jsPDF from 'jspdf';

/**
 * Shared "made with AcreLedger" branding for report PDFs.
 *
 * Deliberately has no price, trial, or sign-up wording: the same PDFs are
 * generated inside the iOS app, which must stay free of purchase calls to
 * action (see AGENTS.md → CI/CD). Naming the website matches the existing
 * support-contact line on the FSA office request sheet.
 */

/** US Letter: county FSA offices and landlords print on Letter, not A4. */
export const REPORT_PAGE_FORMAT = 'letter' as const;

export const ACRELEDGER_FOOTER = 'Made with AcreLedger · acreledger.com';
/** Plain-ASCII form for CSV title blocks. */
export const ACRELEDGER_CSV_LINE = 'Made with AcreLedger - acreledger.com';

export type AcreLedgerNoteVariant = 'fsa' | 'landlord' | 'spray' | 'report';

export const ACRELEDGER_NOTES: Record<AcreLedgerNoteVariant, string> = {
  fsa: 'This worksheet was made with AcreLedger, a farm record book for your phone. Log planting, spraying, harvest and hay once; get FSA worksheets, spray logs and landlord reports. Start your own at acreledger.com.',
  spray: 'This spray record was made with AcreLedger, a farm record book for your phone. Log each application from the cab and keep the full spray log in one place. Start your own at acreledger.com.',
  report: 'This report was made with AcreLedger, a farm record book for your phone. Start your own at acreledger.com.',
  landlord: 'This report was made with AcreLedger, a farm record book for your phone. Other tenants can send you the same report. acreledger.com',
};

const LEFT = 12;
const FOOTER_RULE_FROM_BOTTOM = 11;
const FOOTER_TEXT_FROM_BOTTOM = 6;
/** Lowest y the note box may reach; keeps clear of the footer rule. */
const NOTE_BOTTOM_LIMIT_FROM_BOTTOM = 16;

function pageSize(doc: jsPDF): { width: number; height: number } {
  const size = doc.internal.pageSize;
  return {
    width: size.width ? size.width : size.getWidth(),
    height: size.height ? size.height : size.getHeight(),
  };
}

/**
 * Draws the footer on every page of the finished document: AcreLedger
 * attribution (plus optional extra identity text) left, "Page X of Y" right.
 * Call once, after all content and pages exist.
 */
export function drawPageFooters(doc: jsPDF, leftExtra?: string): void {
  const { width, height } = pageSize(doc);
  const pageCount = doc.getNumberOfPages();
  const left = leftExtra ? `${ACRELEDGER_FOOTER} | ${leftExtra}` : ACRELEDGER_FOOTER;

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(190);
    doc.line(LEFT, height - FOOTER_RULE_FROM_BOTTOM, width - LEFT, height - FOOTER_RULE_FROM_BOTTOM);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(left, LEFT, height - FOOTER_TEXT_FROM_BOTTOM);
    doc.text(`Page ${page} of ${pageCount}`, width - LEFT, height - FOOTER_TEXT_FROM_BOTTOM, { align: 'right' });
  }
}

/**
 * Draws the boxed AcreLedger note at `y` on the current page, or on a new page
 * when it would not fit above the footer. Returns the y below the note.
 * Never moves content already drawn.
 */
export function drawAcreLedgerNote(doc: jsPDF, variant: AcreLedgerNoteVariant, y: number): number {
  const { width, height } = pageSize(doc);
  const boxWidth = width - LEFT * 2;
  const padding = 3;
  const lineHeight = 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(ACRELEDGER_NOTES[variant], boxWidth - padding * 2) as string[];
  const boxHeight = lines.length * lineHeight + padding * 2;

  let top = y;
  if (top + boxHeight > height - NOTE_BOTTOM_LIMIT_FROM_BOTTOM) {
    doc.addPage();
    top = 20;
  }

  doc.setDrawColor(45, 90, 27);
  doc.setLineWidth(0.3);
  doc.rect(LEFT, top, boxWidth, boxHeight);
  doc.setTextColor(60);
  lines.forEach((line, i) => {
    doc.text(line, LEFT + padding, top + padding + 3 + i * lineHeight);
  });
  doc.setLineWidth(0.2);
  return top + boxHeight;
}
