# FSA tracts, CLU, and acreage worksheets

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/lib/complianceReports/fsaReports.ts, src/lib/complianceReports/fsa578PdfExport.ts, src/lib/complianceReports/pdfBranding.ts, src/components/HarvestModal.tsx. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [FSA Tracts and CLU Assignments](#fsa-tracts-and-clu-assignments)
<!-- contents:end -->

## FSA Tracts and CLU Assignments

Canonical detail: [BLUEPRINT → FsaTractImport](../../BLUEPRINT.md#fsatractimport), [FieldCluAssignment](../../BLUEPRINT.md#fieldcluassignment), [Field](../../BLUEPRINT.md#field), [FSA-578 Acreage Reporting Worksheet](../../BLUEPRINT.md#fsa-578-acreage-reporting-worksheet), and [Report Readiness](../../BLUEPRINT.md#report-readiness-and-mobile-export-workspace).

Data and assignments:

- FSA tract imports and CLU assignments are farm-owned: farm scoping, mapper discipline (`mapFsaTractFromDb`/`mapFsaTractToDb`, `mapFieldCluAssignmentFromDb`/`mapFieldCluAssignmentToDb`), optimistic updates, and soft delete all apply. `npm run lint` (`scripts/check-farm-writes.mjs`) rejects `.delete()` on these tables in `src/` and `supabase/functions/`.
- Changes usually touch the whole stack together: `types/fsaTract.ts`, `mappers.ts`, `useFsaTracts.ts`, Supabase services, migrations/RLS, backup schema, bundled tract helpers, assignment UI, and FSA reports/tests.
- CLU parsing, map rendering, and centroids must support `Polygon` and `MultiPolygon`; use `@/lib/geoHelpers.ts`.
- `parseCluFile` is the only import entry point (GeoJSON and ESRI shapefile ZIP). Do not add a component-only parser or unzip path.
- Preserve the FSA office request sheet's accepted-format statement, farmers.gov/service-center guidance, operator/contact blanks, and "not an official USDA form" disclaimer.
- Soft-deleting a field also soft-deletes its active CLU assignments, through the batched offline queue or the online RPC described under [Optimistic Update Pattern](./data-safety.md#optimistic-update-pattern) — never a per-record loop.
- Assignment toggles sync only the field's `cluNumbers` (`syncFieldAcreageAndClus`). Never overwrite boundary/manual acreage with a CLU total; `mapFieldToDb` omits `operational_acreage` when `boundaryAcreage` is unknown instead of writing zero.
- CLU totals and assigned/unassigned counts compare against the same CLU universe being displayed and exclude soft-deleted assignments. Imported-only counts are labeled imported-only unless the UI says it includes bundled tracts.
- Acreage is positive throughout the stack (backup schema, and `field_clu_assignments.acres > 0` in the database); field `acreage` may be `0` for an unmeasured new field. Never mutate source CLU feature acres.

Reports:

- FSA-578 and fall production worksheets are supporting worksheets, not official USDA forms. Preserve the disclaimer wording, include the farm name in header subtitles (preview and PDF), and keep CSV and PDF describing the same facts.
- The FSA-578 PDF uses `exportFsa578WorksheetPdf` (never the generic `exportToPdf`) with the canonical four-section order. Non-cropland CLUs never appear in the crop-entry table.
- Row-construction rules (multiple plantings per field/CLU, CLU-derived acreage, review rows, hay/pasture labeling, status display) live in BLUEPRINT; change them there and in `fsaReports.ts` together.
- Readiness findings are advisory and never disable export. Authoritative FSA validation stays in `validateFsa578Rows` / `validateFsaFallProductionRows`; `reportReadiness.ts` only adapts it.
- Reports are export-first on mobile (`MobileReportExportPanel` below `lg`). Do not reintroduce large previews as the default mobile experience.
- Plant FSA status fields (`Planted`, `Prevented Planting`, `Failed`, `Volunteer`, `Cover Crop`) change across types, mappers, backup schema, migrations, UI, reports, and tests together. Prevented planting may omit seed variety.
- Every report PDF uses `REPORT_PAGE_FORMAT` (US Letter) and `pdfBranding.ts`: `drawPageFooters` after all pages exist, so pages added after a table get a footer, and `drawAcreLedgerNote` on the last page. The branding carries no price, trial, or sign-up wording because the same PDFs are generated on iOS.
- The one title is "FSA-578 Acreage Reporting Worksheet" on screen, preview, CSV, and PDF. The FSA-578 PDF includes Type/Variety.
- Fall production totals are per crop and unit (`buildFsaFallCropTotals`); never print one bushel total across crops. A scale ticket is optional: do not flag a blank ticket/evidence reference, and show the ticket field only for town loads.
- Fall production includes farm-number totals plus County → farm number → tract totals in preview, CSV and PDF (`buildFsaFallGroupedTotals`). Counties are the saved physical counties from [county.md](./county.md), never field notes or the FSA office; production for a field in several counties is allocated by mapped share and labeled estimated, and unknown counties show as County unknown and stay in every total.
- Numeric columns in `exportToPdf` are right-aligned with `rightAlignColumns`, not by matching header text.
