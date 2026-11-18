# Landlord and farm-owner reports

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/lib/complianceReports/generateLandlordSummary.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [Landlord Summary](#landlord-summary)
<!-- contents:end -->

## Landlord Summary

Canonical detail: [BLUEPRINT → Landlord Summary Report](../../BLUEPRINT.md#landlord-summary-report).

- Reports > Landlord offers Landlord Summary and Farm Owner Summary. The per-landlord mode uses field-level `Field.landlordName`, not the legacy `HarvestRecord.landlordName`; only landlords with at least one non-deleted field are selectable.
- Farm Owner Summary includes all active fields in the current farm, including owned/unassigned land, and only current-farm, non-deleted activity for the selected `viewingSeason`. No landlord selection is required.
- Farm Owner Summary PDF is built by `exportOwnerSummaryPdf` (`ownerSummaryPdf.ts`) from the `buildOwnerSummaryLayout` view-model (`ownerSummaryLayout.ts`): one tile and one table per grain crop (Share %, Your bu, planted/harvested dates, variety), a hay table, a not-harvested list, then the owner sign-off. A Reports switch (default on) adds the condensed activity timeline: identical work within 3 days shares a line and harvest loads roll up per field and crop. Off gives the summary-only PDF (`_No_Timeline` filename). The per-landlord Landlord Summary PDF uses the same generator with `audience: 'landlord'`: prepared for the landlord, Tenant bu column, tenant and landlord signature lines, and the landlord AcreLedger note.
- Both modes provide CSV and Detailed PDF exports. Farm Owner Summary exports require a current `farm_id`, use the Farm Owner Summary title/filename, and track export history separately from the per-landlord report.
- Acreage uses `getDisplayFieldAcres`; dates use `parseLocalDate` (see [Date Parsing and Sorting](./ui.md#date-parsing-and-sorting)); every `ReportTable` cell carries `data-label`.
- Hay bales stay separate from bushels, with no inferred landlord bale share.
- One row per field per crop, with per-crop totals in `LandlordSummary.cropTotals`; never add bushels of different crops together, on screen, in CSV, or in the PDF. `totals.acres` counts each field once. Harvests with no crop-share percent after the `getLandlordSplitPercent` fallback are counted in `missingShareHarvests` and called out on screen and in the PDF.
- Keep the retired `LandlordStatementReport` / `generateLandlordStatement` until its test coverage is migrated.
- Grain delivered-vs-owed is out of scope until grain movements gain a field/landlord link (a schema change).
