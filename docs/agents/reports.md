# Landlord and farm-owner reports

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/lib/complianceReports/generateLandlordSummary.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
<!-- contents:end -->

## Landlord Summary

Canonical detail: [BLUEPRINT → Landlord Summary Report](../../BLUEPRINT.md#landlord-summary-report).

- Reports > Landlord offers Landlord Summary and Farm Owner Summary. The per-landlord mode uses field-level `Field.landlordName`, not the legacy `HarvestRecord.landlordName`; only landlords with at least one non-deleted field are selectable.
- Farm Owner Summary includes all active fields in the current farm, including owned/unassigned land, and only current-farm, non-deleted activity for the selected `viewingSeason`. No landlord selection is required.
- Both modes provide CSV and Detailed PDF exports. Farm Owner Summary exports require a current `farm_id`, use the Farm Owner Summary title/filename, and track export history separately from the per-landlord report.
- Acreage uses `getDisplayFieldAcres`; dates use `parseLocalDate` (see [Date Parsing and Sorting](./ui.md#date-parsing-and-sorting)); every `ReportTable` cell carries `data-label`.
- Hay bales stay separate from bushels, with no inferred landlord bale share.
- One row per field per crop, with per-crop totals in `LandlordSummary.cropTotals`; never add bushels of different crops together, on screen, in CSV, or in the PDF. `totals.acres` counts each field once. Harvests with no crop-share percent after the `getLandlordSplitPercent` fallback are counted in `missingShareHarvests` and called out on screen and in the PDF.
- Keep the retired `LandlordStatementReport` / `generateLandlordStatement` until its test coverage is migrated.
- Grain delivered-vs-owed is out of scope until grain movements gain a field/landlord link (a schema change).
