import 'jspdf-autotable';

declare module 'jspdf' {
  interface jsPDF {
    /**
     * Set by jspdf-autotable after each table render.
     * Contains the most recently rendered table metadata including
     * `finalY` (the Y position after the last row).
     * Defaults to `false` before any table is drawn.
     */
    lastAutoTable:
      | {
          finalY: number;
        }
      | false;
  }
}
