# FSA Fall Harvest / Production Report Implementation Plan

> **For Hermes:** Use development-workflow skill to implement this plan task-by-task.

**Goal:** Build a farmer-facing FSA fall harvest / production support report that gives the FSA office the production evidence and harvest summary they need after harvest, complementing the FSA-578 acreage worksheet.

**Architecture:** Keep this in the existing compliance report system. Add pure harvest/hay production report builders and validators in `src/lib/complianceReports/fsaReports.ts`, test them in `src/lib/complianceReports/__tests__/fsaReports.test.ts`, then wire them into the existing Reports page as a renamed/improved FSA fall report. Do not claim to generate an official USDA form; produce a clean support packet/worksheet.

**Tech Stack:** React + TypeScript + Vite, Vitest, existing `jspdf`/`jspdf-autotable` PDF export, existing CSV/native share helpers.

---

## Research Basis and Assumptions

**Source checked:** USDA Farmers.gov crop acreage reporting guidance at `https://www.farmers.gov/working-with-us/crop-acreage-reports`.

USDA says acreage reporting documents crops grown and intended uses, and FSA-578 acreage reporting needs crop/type/variety, intended use, acres, maps/location, planting dates, shares, irrigation practice, and prevented planting where applicable.

For the **fall / harvest / production** side, the exact office ask can vary by program and county. Commonly, the office needs a defensible production summary tied back to the FSA farm/tract/field/CLU and supporting evidence such as scale tickets, elevator/destination, bin/storage records, moisture, and harvest date. AcreLedger should call this a **support report** or **production evidence worksheet**, not an official FSA submission.

**Design assumption:**
- FSA-578 worksheet = acreage and intended use: what is on each acre.
- Fall harvest report = production evidence: what came off those acres.
- Corn / soybeans / wheat should report production in bushels and moisture.
- Hay ground should report bales and/or estimated tons if available.
- Pasture typically has no harvest production unless grazing/forage production records are intentionally captured; include acreage/use context from the FSA-578 worksheet, but do not force production rows for pasture unless there is a record.

---

## Acceptance Criteria

- The report title clearly says `FSA Fall Harvest / Production Evidence Worksheet`.
- CSV and PDF exports exist.
- Corn / soybeans / wheat rows include field, crop, harvest date, FSA farm #, tract #, production bushels, moisture %, destination/bin/elevator, scale ticket #, landlord/share metadata, and notes/evidence status.
- Hay rows are included in the same fall report or a dedicated section with field, crop/use `Hay Ground`/hay type, date/cutting, bale count, bale type, estimated production if available, FSA farm #, tract #, and notes.
- Pasture rows are not treated as missing production; if included, they appear in a non-production acreage/use section or are excluded from production totals.
- Report has validation warnings for missing crop, FSA farm #, tract #, production quantity, harvest date, and evidence fields such as scale ticket/destination.
- Validation does not block export, but visibly warns the farmer before taking the report to the FSA office.
- Existing tests, build, and lint remain green except known existing warnings.

---

## Phase 1: Add the Fall Report Data Model

### Task 1: Add fall report row interfaces

**Objective:** Define production evidence rows separately from FSA-578 acreage rows.

**Files:**
- Modify: `src/lib/complianceReports/fsaReports.ts`
- Test: `src/lib/complianceReports/__tests__/fsaReports.test.ts`

**Step 1: Write failing type/behavior tests**

Add tests that expect a harvest record to become a fall production row with FSA identifiers:

```ts
import { buildFsaFallProductionRows } from '../fsaReports';

it('builds corn soybean wheat production rows with FSA identifiers and evidence fields', () => {
  const field: Field = {
    id: 'field-1',
    name: 'Bottom Field',
    acreage: 40,
    lat: 39,
    lng: -94,
    fsaFarmNumber: '918',
    fsaTractNumber: '1327',
    deleted_at: null,
  };

  const rows = buildFsaFallProductionRows({
    harvestRecords: [{
      id: 'harvest-1',
      fieldId: 'field-1',
      fieldName: 'Bottom Field',
      crop: 'Corn',
      destination: 'town',
      moisturePercent: 16.2,
      landlordSplitPercent: 0,
      bushels: 7200,
      harvestDate: '2026-10-12',
      timestamp: new Date('2026-10-12').getTime(),
      seasonYear: 2026,
      scaleTicketNumber: 'TCK-1001',
      deleted_at: null,
    }],
    hayRecords: [],
    fields: [field],
  });

  expect(rows.grainRows[0]).toMatchObject({
    fieldName: 'Bottom Field',
    crop: 'Corn',
    farmNumber: '918',
    tractNumber: '1327',
    production: 7200,
    productionUnit: 'bu',
    moisturePercent: 16.2,
    evidenceReference: 'TCK-1001',
  });
});
```

**Step 2: Run RED**

Run:

```bash
npm test -- src/lib/complianceReports/__tests__/fsaReports.test.ts
```

Expected: FAIL because `buildFsaFallProductionRows` does not exist.

**Step 3: Implement interfaces and builder skeleton**

Add in `fsaReports.ts`:

```ts
export interface FsaFallProductionRow {
  id: string;
  recordType: 'grain' | 'hay';
  fieldName: string;
  crop: string;
  farmNumber: string;
  tractNumber: string;
  harvestDate: string;
  production: number;
  productionUnit: 'bu' | 'bales' | 'tons';
  moisturePercent?: number;
  destination: string;
  evidenceReference: string;
  landlordSplitPercent?: number;
  landlordName?: string;
  notes: string;
}

export interface FsaFallProductionReport {
  grainRows: FsaFallProductionRow[];
  hayRows: FsaFallProductionRow[];
}
```

**Step 4: Verify GREEN**

Run:

```bash
npm test -- src/lib/complianceReports/__tests__/fsaReports.test.ts
```

Expected: PASS.

---

## Phase 2: Include Hay Production Rows

### Task 2: Convert hay harvest records into fall report rows

**Objective:** Include hay ground as production evidence with bales/cutting details.

**Files:**
- Modify: `src/lib/complianceReports/fsaReports.ts`
- Test: `src/lib/complianceReports/__tests__/fsaReports.test.ts`

**Step 1: Write failing test**

```ts
it('builds hay production rows with bale count and FSA identifiers', () => {
  const field: Field = {
    id: 'hay-field',
    name: 'East Hay Ground',
    acreage: 15,
    lat: 39,
    lng: -94,
    fsaFarmNumber: '123',
    fsaTractNumber: '456',
    intendedUse: 'Hay Ground',
    deleted_at: null,
  };

  const rows = buildFsaFallProductionRows({
    harvestRecords: [],
    hayRecords: [{
      id: 'hay-1',
      fieldId: 'hay-field',
      fieldName: 'East Hay Ground',
      date: '2026-07-01',
      baleCount: 38,
      cuttingNumber: 1,
      baleType: 'Round',
      timestamp: new Date('2026-07-01').getTime(),
      seasonYear: 2026,
      deleted_at: null,
    }],
    fields: [field],
  });

  expect(rows.hayRows[0]).toMatchObject({
    recordType: 'hay',
    crop: 'Hay Ground',
    production: 38,
    productionUnit: 'bales',
    farmNumber: '123',
    tractNumber: '456',
    notes: 'Cutting 1, Round bales',
  });
});
```

**Step 2: Run RED**

Run targeted test. Expected: FAIL until hay logic exists.

**Step 3: Implement hay mapping**

Map `HayHarvestRecord` fields:
- `crop`: `field.intendedUse || 'Hay Ground'`
- `production`: `baleCount`
- `productionUnit`: `'bales'`
- `harvestDate`: `date`
- `notes`: `Cutting ${cuttingNumber}, ${baleType} bales`

**Step 4: Run GREEN**

Run targeted tests. Expected: PASS.

---

## Phase 3: Add Fall Report Validation

### Task 3: Validate missing fall report data

**Objective:** Show readiness warnings before the farmer takes the report to FSA.

**Files:**
- Modify: `src/lib/complianceReports/fsaReports.ts`
- Test: `src/lib/complianceReports/__tests__/fsaReports.test.ts`

**Step 1: Write failing test**

```ts
import { validateFsaFallProductionRows } from '../fsaReports';

it('warns when fall production rows are missing FSA or evidence fields', () => {
  const issues = validateFsaFallProductionRows([{
    id: 'row-1',
    recordType: 'grain',
    fieldName: 'Problem Corn',
    crop: 'Corn',
    farmNumber: '',
    tractNumber: '',
    harvestDate: '',
    production: 0,
    productionUnit: 'bu',
    destination: '',
    evidenceReference: '',
    notes: '',
  }]);

  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: 'error', field: 'farmNumber' }),
    expect.objectContaining({ severity: 'error', field: 'tractNumber' }),
    expect.objectContaining({ severity: 'error', field: 'harvestDate' }),
    expect.objectContaining({ severity: 'error', field: 'production' }),
    expect.objectContaining({ severity: 'warning', field: 'destination' }),
    expect.objectContaining({ severity: 'warning', field: 'evidenceReference' }),
  ]));
});
```

**Step 2: Implement validator**

Add:

```ts
export interface FsaFallValidationIssue {
  rowId: string;
  severity: 'warning' | 'error';
  field: string;
  message: string;
}
```

Rules:
- error if missing crop
- error if missing farm #
- error if missing tract #
- error if missing harvest date
- error if production <= 0
- warning if missing destination
- warning if missing evidence reference / scale ticket

**Step 3: Run GREEN**

Run:

```bash
npm test -- src/lib/complianceReports/__tests__/fsaReports.test.ts
```

Expected: PASS.

---

## Phase 4: Build CSV Export

### Task 4: Add `buildFsaFallProductionCsv`

**Objective:** Create a clean CSV the farmer can email or print for the FSA office.

**Files:**
- Modify: `src/lib/complianceReports/fsaReports.ts`
- Test: `src/lib/complianceReports/__tests__/fsaReports.test.ts`

**CSV metadata rows:**
- `FSA Fall Harvest / Production Evidence Worksheet`
- `Not an official USDA form. Verify program-specific requirements with your county FSA office.`
- Farm name
- Crop year
- Report date

**CSV columns:**

```text
Crop Year
Farm Name
Record Type
Field Name
Farm #
Tract #
Crop / Use
Harvest Date
Production
Unit
Moisture %
Destination / Storage
Evidence / Ticket #
Landlord Name
Landlord Share %
Notes
```

**Step 1: Write failing CSV test**

```ts
it('builds fall production CSV with grain and hay rows', () => {
  const csv = buildFsaFallProductionCsv({
    metadata: {
      farmName: 'AcreLedger Test Farm',
      cropYear: 2026,
      reportDate: '2026-11-01',
    },
    rows: [
      {
        id: 'grain-1',
        recordType: 'grain',
        fieldName: 'Bottom Field',
        crop: 'Corn',
        farmNumber: '918',
        tractNumber: '1327',
        harvestDate: '2026-10-12',
        production: 7200,
        productionUnit: 'bu',
        moisturePercent: 16.2,
        destination: 'Elevator/Sale',
        evidenceReference: 'TCK-1001',
        landlordSplitPercent: 0,
        notes: '',
      },
    ],
  });

  expect(csv).toContain('FSA Fall Harvest / Production Evidence Worksheet');
  expect(csv).toContain('"Corn"');
  expect(csv).toContain('"7200"');
  expect(csv).toContain('"TCK-1001"');
});
```

**Step 2: Implement builder and export function**

Add:

```ts
export function buildFsaFallProductionCsv(...): string
export async function exportFsaFallProductionData(...): Promise<void>
```

**Step 3: Run GREEN**

Run tests.

---

## Phase 5: Build PDF Export Support

### Task 5: Add PDF export from Reports page

**Objective:** Generate the printable handout for the FSA office.

**Files:**
- Modify: `src/pages/Reports.tsx`
- Reuse: `src/lib/complianceReports/pdfExport.ts`

**Step 1: Use existing `exportToPdf`**

In `Reports.tsx`, replace current `handleExportHarvestPdf` implementation with a fall production worksheet using the new rows.

PDF title:

```text
FSA Fall Harvest / Production Evidence Worksheet
```

Subtitle:

```text
Production support report for FSA/crop-program review. Not an official USDA form. Generated ${reportDate}.
```

Headers:

```ts
['DATE', 'FIELD', 'CROP/USE', 'PRODUCTION', 'UNIT', 'MOIST %', 'DEST/STORAGE', 'EVIDENCE #', 'FARM #', 'TRACT #']
```

Footer:

```ts
footerText: [
  'Production Evidence Worksheet',
  'I certify that the production information shown above is accurate to the best of my knowledge.',
  'Producer Signature: _______________________________',
  'Date: ___________________',
  'FSA Office Notes / Corrections:',
  '__________________________________________________',
]
```

**Step 2: Add readiness warning panel**

Compute:

```ts
const fsaFallRows = useMemo(() => buildFsaFallProductionRows({
  harvestRecords,
  hayRecords,
  fields,
}), [harvestRecords, hayRecords, fields]);

const fsaFallIssues = useMemo(
  () => validateFsaFallProductionRows([...fsaFallRows.grainRows, ...fsaFallRows.hayRows]),
  [fsaFallRows],
);
```

Show an amber warning panel like the FSA-578 readiness panel.

**Step 3: Rename UI copy**

Current tab label can remain `FSA Harvest`, or change to:

```ts
label: 'Fall FSA'
```

Recommended title inside the report:

```text
FSA Fall Harvest / Production Evidence Worksheet
```

**Step 4: Verify manually**

Run:

```bash
npm run build
```

Expected: build passes.

---

## Phase 6: Keep Pasture Correct

### Task 6: Ensure pasture is not treated as missing harvest production

**Objective:** Pasture belongs on acreage/use reporting, but not necessarily fall production evidence.

**Files:**
- Modify only if needed: `src/lib/complianceReports/fsaReports.ts`
- Test: `src/lib/complianceReports/__tests__/fsaReports.test.ts`

**Rule:**
- Do not manufacture fall production rows for pasture unless there is a hay/forage/harvest record.
- Pasture can appear in FSA-578 acreage worksheet as crop/use `Pasture`.
- Fall report should focus on actual recorded production.

**Step 1: Add test**

```ts
it('does not create fall production rows for pasture without a production record', () => {
  const pastureField: Field = {
    id: 'pasture-1',
    name: 'South Pasture',
    acreage: 20,
    lat: 39,
    lng: -94,
    intendedUse: 'Pasture',
    fsaFarmNumber: '123',
    fsaTractNumber: '456',
    deleted_at: null,
  };

  const rows = buildFsaFallProductionRows({
    harvestRecords: [],
    hayRecords: [],
    fields: [pastureField],
  });

  expect(rows.grainRows).toEqual([]);
  expect(rows.hayRows).toEqual([]);
});
```

---

## Phase 7: Final Verification

### Task 7: Run the quality gates

**Commands:**

```bash
npm test -- src/lib/complianceReports/__tests__/fsaReports.test.ts
npm run build
npm run lint
git diff --check -- src/lib/complianceReports/fsaReports.ts src/lib/complianceReports/__tests__/fsaReports.test.ts src/pages/Reports.tsx
```

**Expected:**
- Targeted tests pass.
- Build passes.
- Lint exits 0, with existing warnings only.
- Diff check has no output.

---

## Final Report Behavior

When finished, the FSA office packet should have two separate support documents:

1. **FSA-578 Acreage Certification Worksheet**
   - What crop/use is on each acre/CLU.
   - Includes corn, soybeans, wheat, hay ground, pasture, non-cropland use.

2. **FSA Fall Harvest / Production Evidence Worksheet**
   - What production came off those acres.
   - Includes grain bushels, moisture, destination/storage, scale tickets, FSA farm/tract, landlord/share info.
   - Includes hay bale production/cutting info.
   - Does not require pasture production unless there is an actual production/grazing/forage record.

This separation should give the county FSA office the information they need without mixing acreage certification and production evidence.
