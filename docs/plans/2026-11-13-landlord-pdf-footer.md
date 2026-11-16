# Optional "Made with AcreLedger" footer

Plan only. No code in this change.

## Goal

An optional line, "Made with AcreLedger", on the landlord summary PDF and the farm owner summary PDF. Off unless the farmer turns it on. Terms call these landlord summaries.

## Files

- `src/pages/Reports.tsx` `handleExportLandlordPdf` (already passes `footerText` for the activity timeline)
- `src/lib/complianceReports/pdfExport.ts` (`footerText` draws after the table; a repeated page footer would be new)
- `src/components/reports/LandlordSummaryReport.tsx` for the toggle
- `src/lib/complianceReports/__tests__/pdfExport.test.ts` and `src/components/reports/LandlordSummaryReport.test.tsx`
- Preference storage only if the choice should stick. A device-local key scoped by user id matches other preferences. Do not put it on the farm row unless both devices must share it.

## Risks

- The activity timeline already uses `footerText`. Appending the brand line must not drop those lines or overflow the page. `pdfExport.ts` wraps and paginates `footerText`.
- A footer on every page needs a jsPDF page loop. The current helper draws once at the end. Keep the first version as one line after the timeline.
- The line is marketing on a document a landlord may see. Default off.
- CSV export has no footer. Do not invent one unless asked.
- Pro report export still goes through `assert_premium`. The footer does not bypass that.

## Size

Small. One checkbox, one extra footer string, two tests.
