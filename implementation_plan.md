# UI/UX Implementation Plan

**Repo:** `C:\Projects\AcreLedger`
**Branch:** `main` (working tree, uncommitted)
**Date:** 2026-06-23
**Baseline artifact:** `UI_UX_AUDIT/REPORT.md` (+ `UI_UX_AUDIT/WIREFRAMES/`)
**Status reference:** `task.md` (progress checklist)

---

## 1. Goal

Land the previous session's UI/UX work — Audit **Rec 1** (dashboard filters out of
the floating footer) and **Rec 3** (mobile card-stack report tables) — in a state that
is internally consistent and free of regressions, so the branch is commit-safe.

## 2. Current state (as inspected via `git diff` / `git status`)

Four files modified (`+90 / -45`):

| File | Change | Audit | Healthy? |
|------|--------|-------|----------|
| `src/pages/Index.tsx` | Crop-filter bar moved from sticky footer into dashboard body | Rec 1 | ⚠️ padding regression |
| `src/components/ReportTable.tsx` | Added `mobile-cards` class globally | Rec 3 | ⚠️ global side effects |
| `src/pages/Reports.tsx` | `data-label` added to 2 of 5 tables | Rec 3 | ⚠️ incomplete |
| `src/index.css` | Card-stack CSS engine (`@media ≤768px` in `@layer utilities`) | Rec 3 | ⚠️ breaks `colSpan` rows |

## 3. Required fixes (P0 — must resolve before commit)

### Fix A — Restore mobile bottom padding so content clears `BottomNav`

- **Symptom:** `Index.tsx:69` reduced padding from `4.5rem` to `1.5rem`. `BottomNav`
  uses `.touch-target` (`min-height: 64px ≈ 4rem`) plus
  `pb-[env(safe-area-inset-bottom)]`. Last field cards now scroll under the tab bar.
- **Fix:** restore the original mobile padding.

```diff
- <div className="min-h-screen bg-background pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
+ <div className="min-h-screen bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
```

- **Files:** `src/pages/Index.tsx` (1 line).
- **Risk:** none — reverts to the prior, known-good clearance value; the footer it
  was sized for is gone, but `4.5rem` still clears the nav with breathing room.

### Fix B — Make mobile card conversion complete and robust

The `mobile-cards` engine in `src/index.css` is sound, but two things are broken:

1. **Unlabeled data cells:** FSA-578 (15 cols) and Hay (5 cols) tables have no
   `data-label`, so each cell renders right-aligned with a blank left half.
2. **`colSpan` rows** are squished by `padding-left: 50% !important;
   text-align: right !important`. This affects **7 `<td colSpan>` cells across all
   four `ReportTable` tables** (empty states + readiness/warning/error banners):
   `Reports.tsx` lines `494`, `532`, `652`, `709`, `716`, `723`, `769`.

**Fix B.1 — Add an opt-out class for full-width rows, then apply it to colSpan rows.**

In `src/index.css`, inside the `@media (max-width: 768px)` block, add:

```css
.mobile-cards .mobile-cards-full-row,
.mobile-cards tr:has(td[colspan]) td {
  padding-left: 0.5rem !important;
  text-align: left !important;
  display: block;
  width: 100%;
}
```

(The `:has()` selector is the automatic path; the explicit class is the fallback for
older WebView/Safari. Use both for safety in the Capacitor iOS wrapper.)

Then tag the 7 colSpan `<td>` cells with `mobile-cards-full-row` (optional belt-and-
suspenders given the `:has()` rule). Locations in `src/pages/Reports.tsx`:
`494, 532, 652, 709, 716, 723, 769`.

**Fix B.2 — Add `data-label` to the two unlabeled tables.**

- **FSA-578 Acreage** (`Reports.tsx:475`), headers → labels (15):
  `FARM #, TRACT #, CLU/FIELD #, FIELD, LAND USE, CROP, SEQ, TYPE/VARIETY, PATTERN,
  ACRES, PLANT DATE, USE, IRR, SHARE %, STATUS`.
  Add matching `data-label="…"` to each of the 15 `<td>` in the row map at `:475–:525`.
- **Hay Production** (`Reports.tsx:733`), headers → labels (5):
  `FIELD, CUTTING #1, CUTTING #2, CUTTING #3+, TOTAL`.
  Add to the 5 `<td>` in the row map at `:740–:762`.

**Decision point — keep `mobile-cards` global or make it opt-in?**

- **Option 1 (less churn):** keep it global, apply B.1 + B.2 as above.
- **Option 2 (safer long-term):** make `mobile-cards` an opt-in prop on
  `ReportTable` (e.g. `cardView?: boolean`), default off, set on explicitly per
  table. Avoids the generic-wrapper footgun where any future consumer that forgets
  `data-label` silently renders broken cards.

Recommend **Option 1** for this branch (matches existing intent, smallest diff),
and file Option 2 as a follow-up note.

## 4. Verification

After applying A + B:

1. `npx eslint src/pages/Index.tsx src/pages/Reports.tsx src/components/ReportTable.tsx src/index.css` — expect clean.
2. `npm run build` — expect success (build is `vite build`, esbuild; ignores the
   pre-existing `tsc` errors in untouched files).
3. Manual / dev server (`npm run dev`) at ≤768px:
   - Dashboard: last field card fully visible above `BottomNav`; filter bar scrolls with content (not floating).
   - Reports → each tab: FSA-578, Fertilizer, FSA Fall, Hay all render as labeled
     cards; empty-state and banner rows span full card width (not squished right).
   - Reports → Landlord: unchanged (horizontal scroll, no card layout).
4. `git diff --stat` — expect only the intended files changed.

## 5. Out of scope for this branch (audit items not yet implemented)

Tracked separately, not blockers:

- **Rec 2** — multi-step wizard for `SprayModal.tsx` (Core → Chemical → Conditions → Review).
- **Proposed feature** — Spray GO/WAIT decision matrix (`WIND_ALERT_MPH = 10`,
  plus <3 mph inversion risk and Delta-T band).
- **Proposed feature** — Offline sync HUD / queue count in `OfflineBanner` or header.
- **Proposed feature** — Grain bin fill-level visualizer on `Logistics.tsx`.
- **Infra** — custom domain (`app.acreledger.com`) + strict `vercel.json` CSP headers.
- **Separate cleanup** — pre-existing `tsc` errors in untouched files
  (`ActivityFeed.tsx`, `TractAssignmentFlow.tsx`, `use-toast.ts`, test files).

## 6. Rollback

All changes are uncommitted. If a fix misbehaves:
`git checkout -- src/pages/Index.tsx src/pages/Reports.tsx src/index.css`
to restore a known file; or `git stash` the whole working set.

## 7. Sequence

1. Apply **Fix A** (1 line) → verify dashboard.
2. Apply **Fix B.1** (CSS opt-out) → verify banners/empty states render full-width.
3. Apply **Fix B.2** (`data-label` on FSA-578 + Hay) → verify those two tabs.
4. Run verification (§4).
5. Commit with a message referencing Rec 1 + Rec 3 and the two fixes.
