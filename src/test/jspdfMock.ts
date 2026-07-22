import { vi } from 'vitest';

/**
 * Capture harness for jsPDF + jspdf-autotable.
 *
 * Semantic assertions only: records every text/image/table/save call made by
 * production PDF generators so tests can verify document content and section
 * ordering without a real renderer. It cannot prove real pagination,
 * continuation-page headers, or clipping — use a real jsPDF generation test
 * (see fsa578WorksheetPdf.real.test.ts) for those invariants.
 *
 * Canonical lifecycle (mirrors supabaseMock):
 *
 *   const pdf = createJsPdfMock();
 *   vi.doMock('jspdf', () => ({ default: pdf.JsPdf }));
 *   vi.doMock('jspdf-autotable', () => ({ default: pdf.autoTable }));
 *   vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
 *   vi.doMock('@/lib/native', () => ({ native: { sharePdf: pdf.sharePdf } }));
 *
 *   let generate: typeof import('../sprayExport').generateSprayPDF;
 *   beforeAll(async () => { ({ generateSprayPDF: generate } = await import('../sprayExport')); });
 *   beforeEach(() => pdf.reset());
 */

export interface CapturedTextCall {
  text: string;
  x: number;
  y: number;
}

export interface CapturedImageCall {
  dataUri: string;
  format: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturedAutoTableCall {
  head: unknown[][];
  body: unknown[][];
  startY?: number;
}

type SplitTextBehavior = (text: string, maxWidth: number) => string[];

export interface JsPdfMock {
  /** Fake jsPDF class — register as `{ default: mock.JsPdf }`. */
  JsPdf: new (options?: { orientation?: 'portrait' | 'landscape' }) => unknown;
  /** Fake autoTable function — register as `{ default: mock.autoTable }`. */
  autoTable: ReturnType<typeof vi.fn>;
  /** Spy standing in for native.sharePdf (web-path tests should never see it called). */
  sharePdf: ReturnType<typeof vi.fn>;
  /** Override splitTextToSize wrapping behavior (default: no wrapping). */
  setSplitTextBehavior: (behavior: SplitTextBehavior) => void;
  /** Every text line drawn, in call order (string[] inputs are flattened). */
  texts: () => string[];
  /** All drawn text joined with newlines, for `toContain` assertions. */
  allText: () => string;
  images: () => CapturedImageCall[];
  autoTables: () => CapturedAutoTableCall[];
  savedAs: () => string[];
  addPageCount: () => number;
  reset: () => void;
}

export function createJsPdfMock(): JsPdfMock {
  let textCalls: CapturedTextCall[] = [];
  let imageCalls: CapturedImageCall[] = [];
  let tableCalls: CapturedAutoTableCall[] = [];
  let saveCalls: string[] = [];
  let addedPages = 0;
  let splitTextBehavior: SplitTextBehavior = (text) => [text];

  class FakeJsPdf {
    lastAutoTable?: { finalY: number };
    private currentPage = 1;
    private pageCount = 1;
    readonly internal: { pageSize: { width: number; height: number; getWidth: () => number; getHeight: () => number } };

    constructor(options?: { orientation?: 'portrait' | 'landscape' }) {
      const landscape = options?.orientation === 'landscape';
      const width = landscape ? 297 : 210;
      const height = landscape ? 210 : 297;
      this.internal = {
        pageSize: {
          width,
          height,
          getWidth: () => width,
          getHeight: () => height,
        },
      };
    }

    setFont(): void {}
    setFontSize(): void {}
    setTextColor(): void {}
    setDrawColor(): void {}
    line(): void {}

    text(text: string | string[], x: number, y: number): void {
      const lines = Array.isArray(text) ? text : [text];
      lines.forEach((line, i) => textCalls.push({ text: String(line), x, y: y + i * 4 }));
    }

    addPage(): void {
      this.pageCount += 1;
      this.currentPage = this.pageCount;
      addedPages += 1;
    }

    setPage(page: number): void {
      this.currentPage = page;
    }

    getNumberOfPages(): number {
      return this.pageCount;
    }

    getCurrentPageInfo(): { pageNumber: number } {
      return { pageNumber: this.currentPage };
    }

    getTextWidth(text: string): number {
      return String(text).length;
    }

    splitTextToSize(text: string, maxWidth: number): string[] {
      return splitTextBehavior(text, maxWidth);
    }

    addImage(dataUri: string, format: string, x: number, y: number, width: number, height: number): void {
      imageCalls.push({ dataUri, format, x, y, width, height });
    }

    save(fileName: string): void {
      saveCalls.push(fileName);
    }
  }

  const autoTable = vi.fn((doc: FakeJsPdf, config: {
    head?: unknown[][];
    body?: unknown[][];
    startY?: number;
    didDrawPage?: (data: { cursor: { x: number; y: number }; pageNumber: number; settings: { margin: { left: number } } }) => void;
  }) => {
    tableCalls.push({ head: config.head ?? [], body: config.body ?? [], startY: config.startY });
    const finalY = (config.startY ?? 30) + 10;
    doc.lastAutoTable = { finalY };
    // Fire didDrawPage once so footer callbacks (page numbers, attribution)
    // execute. Continuation-page behavior (willDrawPage) is intentionally NOT
    // simulated — that requires the real renderer.
    config.didDrawPage?.({
      cursor: { x: 14, y: finalY },
      pageNumber: 1,
      settings: { margin: { left: 14 } },
    });
  });

  const sharePdf = vi.fn();

  return {
    JsPdf: FakeJsPdf as unknown as JsPdfMock['JsPdf'],
    autoTable,
    sharePdf,
    setSplitTextBehavior: (behavior) => { splitTextBehavior = behavior; },
    texts: () => textCalls.map(call => call.text),
    allText: () => textCalls.map(call => call.text).join('\n'),
    images: () => [...imageCalls],
    autoTables: () => [...tableCalls],
    savedAs: () => [...saveCalls],
    addPageCount: () => addedPages,
    reset: () => {
      textCalls = [];
      imageCalls = [];
      tableCalls = [];
      saveCalls = [];
      addedPages = 0;
      splitTextBehavior = (text) => [text];
      autoTable.mockClear();
      sharePdf.mockClear();
    },
  };
}
