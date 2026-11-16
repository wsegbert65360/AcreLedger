# Task Progress Checklist — UI/UX Implementation

**Repo:** `C:\Projects\AcreLedger` · **Branch:** `main` (uncommitted) · **Date:** 2026-06-23
**Source:** live `git diff`/`git status` + `UI_UX_AUDIT/REPORT.md`
**Plan:** `implementation_plan.md` · **Narrative:** `walkthrough.md`

Legend: `[x]` done · `[~]` partial / has a known regression · `[ ]` not started

---

## Audit Recommendation 1 — Dashboard filters out of floating footer (`Index.tsx`)

- [x] Remove sticky `bottom-[calc(4.5rem+...)]` glass footer
- [x] Add static filter container below `WeatherBar` (`rounded-2xl`, `h-9` pills)
- [x] Preserve total-acres label, `toggleCrop`, `cropTotals`, `formatMeasurement`
- [x] Adjust mobile bottom padding
  - [x] **Fix A (done):** restored `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8`

## Audit Recommendation 3 — Mobile card-stack report tables

### Engine (`ReportTable.tsx` + `index.css`)
- [x] Add `mobile-cards` class to `ReportTable` wrapper
- [x] Implement `@media (max-width:768px)` card-stack CSS in `@layer utilities`
- [x] Robustness — `colSpan` rows no longer break
  - [x] **Fix B.1 (done):** added `tr:has(td[colspan])` + `td[colspan]` + `td[colspan]::before{display:none}` rules in `src/index.css`

### Per-table `data-label` wiring (`Reports.tsx`)
- [x] Fertilizer table — 4 cols labeled (`:642`)
- [x] FSA Fall Production — 10 cols labeled (`:695`)
- [x] FSA-578 Acreage — 15 cols labeled (`:475`, headers↔labels 1:1) — **Fix B.2 (done)**
- [x] Hay Production — 5 cols labeled (`:733`) — **Fix B.2 (done)**

### `colSpan` rows now full-width (7 total, all four `ReportTable` tables) — via Fix B.1 CSS
- [x] `:494` FSA-578 readiness banner (`colSpan={15}`)
- [x] `:532` FSA-578 empty state (`colSpan={15}`)
- [x] `:652` Fertilizer empty state (`colSpan={4}`)
- [x] `:709` FSA Fall empty state (`colSpan={10}`)
- [x] `:716` FSA Fall red error banner (`colSpan={10}`)
- [x] `:723` FSA Fall amber warning banner (`colSpan={10}`)
- [x] `:769` Hay empty state (`colSpan={5}`)
- *(Note: `:857` Landlord `colSpan={5}` is in the standalone table — no `mobile-cards`, no action.)*

## Verification — all passing

- [x] ESLint clean on `Index.tsx`, `Reports.tsx`, `ReportTable.tsx`, `index.css`
- [x] `npm run build` succeeds (58 modules transformed)
- [x] `git diff --stat` shows only the 4 intended files

### Awaiting manual / dev-server confirmation (≤768px)
- [ ] Dashboard: last field card clears `BottomNav`; filter bar scrolls (not floating)
- [ ] Reports ≤768px: FSA-578, Fertilizer, FSA Fall, Hay render as labeled cards
- [ ] Reports ≤768px: banner/empty-state rows span full card width
- [ ] Reports: Landlord unchanged (horizontal scroll)

## Tracked follow-up (not a blocker)

- [ ] **Make `mobile-cards` opt-in** — `ReportTable` applies it globally; any future
  consumer that forgets `data-label` will render blank card labels on mobile.
  Currently a theoretical risk only: `ReportTable` is used exclusively in
  `Reports.tsx` (4 instances, all fully labeled). Consider a `cardView?: boolean`
  prop, default off. *(implementation_plan.md §3, Option 2)*

## Out of scope this branch (tracked, not blocking)

- [ ] Rec 2 — multi-step wizard for `SprayModal.tsx`
- [ ] Spray GO/WAIT decision matrix (`WIND_ALERT_MPH=10`, <3 mph inversion, Delta-T)
- [ ] Offline sync HUD / queue count
- [ ] Grain bin fill-level visualizer (`Logistics.tsx`)
- [ ] Custom domain + `vercel.json` CSP headers
- [ ] Pre-existing `tsc` errors in untouched files

---

## Status summary

| Area | State |
|------|-------|
| Rec 1 (dashboard filters) | **Done** — Fix A landed |
| Rec 3 engine | **Done** — Fix B.1 landed |
| Rec 3 table wiring | **Done** — all 4 `ReportTable` tables labeled (Fix B.2) |
| Rec 2 + features | Not started (expected) |
| Commit-ready? | **Yes** — all fixes verified; ESLint + build green |
