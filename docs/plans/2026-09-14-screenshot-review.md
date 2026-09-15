# Screenshot review and implemented changes

## Implementation status — completed September 14, 2026

The focused UI changes in this plan are implemented. The browser check reproduced the public Support and Privacy pages at a 350 × 767 CSS-pixel viewport with no document-level horizontal overflow (`documentWidth` 346px in a 350px viewport), readable wrapping, a visible 44 × 44px back control, meaningful page content, and no Vite error overlay. The original batch's uniform right-edge cuts and missing BottomNav therefore remain capture-framing evidence; app code did not receive a global overflow mask.

The authenticated dashboard and 404 behavior are covered structurally and by focused routing tests. A live authenticated visual pass was not performed because it would require sending the stored test credentials through the browser. The implementation preserves the existing signed-in route behavior and adds a direct assertion that unknown routes omit Quick Add.

## Scope and conclusion

Reviewed all 20 PNGs in `screenshots/2026-09-14`: desktop and mobile Dashboard, Activity, Field Detail, Reports, Storage, Setup, Weather, Support, Privacy, and Not Found. Compared relevant current source and the design-system sections of AGENTS.md and BLUEPRINT.md.

The desktop presentation is cohesive. Preserve the dark palette, crop colors, field map, action grid, bin illustrations, and mobile export-first reports. Prioritize mobile fit and reading comfort over a redesign.

Existing unrelated source changes were present during implementation and were preserved.

## 1. Verify screenshot framing before diagnosing global overflow — high priority

**Evidence:** Nine mobile images are 350 × 767; Not Found is 354 × 767. Desktop images are 1024 × 640. Mobile right edges cut through ordinary cards, header actions, acreage, and weather controls. The fixed Quick Add circle is partly outside the image, and none of the mobile captures shows BottomNav. This pattern may reflect a cropped capture rather than a layout defect. Current App.tsx mounts BottomNav for signed-in pages and positions Quick Add above it.

**Plan:**

- Recapture complete browser viewports at 350, 375, 390, and 430 CSS pixels wide, recording viewport dimensions, device pixel ratio, route, and app revision. Include the entire bottom navigation. Capture a page-bottom state as well as the initial view.
- Compare document scroll width with viewport width; inspect element bounds for anything extending outside it. Distinguish intentional tab/table/map scrolling from page overflow.
- If framing is the cause, correct capture settings. If app overflow is reproduced, fix the responsible flex/grid child or fixed width locally with appropriate shrinking, wrapping, or stacking.
- Do not hide overflow on the whole document as a substitute for fixing inaccessible controls.

**Inspect:** `src/App.tsx`, `src/index.css`, `src/components/BottomNav.tsx`, and the affected page containers. No capture script was found under `scripts/` during this review.

**Acceptance:** Full mobile viewport images show all five navigation tabs and the entire FAB where applicable. Ordinary page content has no horizontal overflow; intended scrollers remain usable.

## 2. Give the dashboard header room — high priority

**Evidence:** In `dashboard-mobile.png`, the season and Add field control overlap visually. Current `Index.tsx` puts the brand, field count, SeasonSelect, and three 44px actions in one row, leaving insufficient room on narrow phones even if the capture is corrected.

**Plan:** Use two rows on narrow screens: brand and action buttons above, field count and the existing SeasonSelect below. Preserve the desktop header. Ensure the title/season group cannot paint beneath the action group.

**Inspect:** `src/pages/Index.tsx`, `src/components/Logo.tsx`, `src/components/SeasonSelect.tsx`.

**Acceptance:** At 350px wide, brand, year, Add field, Ask the book, and Manage remain fully visible and independently tappable with targets at least 44px. Season behavior remains unchanged.

## 3. Improve Privacy and Support reading and navigation — medium priority

**Evidence:** Both pages apply `font-mono` to the entire CardContent, contrary to the project's body-text convention. Privacy's flex-based label/description list makes labels wrap into a cramped column. Both pages use `pb-12` despite signed-in BottomNav. Their back buttons have no explicit accessible name and use the shared 40px icon-button size.

**Plan:**

- Use Inter for prose and section headings; retain monospace only for actual data values.
- Render Privacy category labels above their descriptions on narrow screens, or as ordinary inline bold labels in flowing text.
- Add signed-in bottom clearance for navigation and the device safe area, while preserving the public signed-out layout.
- Give back controls an accessible name and a minimum 44 × 44px target. Provide a sensible home fallback when these public pages are opened directly without an in-app previous page.
- Keep policy meaning and support contact details intact.

**Inspect:** `src/pages/Privacy.tsx`, `src/pages/Support.tsx`; check existing navigation patterns before choosing a direct-entry fallback.

**Acceptance:** Labels and prose read naturally at 350px and enlarged text; email links wrap if needed; final content clears navigation; direct entry has a working exit. Confirm signed-in and signed-out states.

## 4. Make the 404 page a focused recovery screen — medium priority

**Evidence:** `not-found-mobile.png` shows Quick Add on the error page. App.tsx uses a hide list, so unknown routes receive the FAB. NotFound.tsx uses a full muted background and a plain text home link, unlike the surrounding app surfaces.

**Plan:** Suppress Quick Add for unmatched routes, use the normal background with a compact recovery section, and provide a prominent 44px-high “Back to fields” link/button. Reserve bottom-navigation clearance. Preserve routing and the existing error boundary behavior.

**Inspect:** `src/App.tsx`, `src/pages/NotFound.tsx`.

**Acceptance:** An unknown signed-in route offers a clear return to fields without a floating record-creation action. Existing supported routes keep their intended FAB visibility.

## 5. Make horizontal controls easier to discover — lower priority

**Evidence:** Activity and Reports tabs run beyond the visible desktop area; Dashboard crop filters and mobile tabs also extend offscreen. These are intentional scrolling patterns, not evidence by themselves of a broken layout. Dashboard Search sits after all crop chips and can be outside the initial mobile view.

**Plan:** After confirming viewport framing, add a subtle overflow cue or explicit scroll affordance where needed. Keep labels non-wrapping and non-shrinking. Keep Dashboard Search visible outside the scrolling crop-chip strip. Preserve horizontal scrolling for report tables and access to every report column.

**Inspect:** `src/pages/Index.tsx`, `src/pages/Activity.tsx`, `src/pages/Reports.tsx`, and their existing tab/table components.

**Acceptance:** First-time users can discover additional tabs and filters; Search is available without swiping through crops; keyboard focus reveals offscreen controls.

## Verification and implementation order

1. Capture verification, then dashboard header and any reproduced local overflow.
2. Privacy/Support readability, accessibility, and bottom clearance.
3. 404 recovery and overflow affordances.
4. Compare before/after mobile captures and desktop widths of 1024 and 1440px. Check dark, light, and color themes, enlarged text, long field names, page bottoms, and iPhone safe areas.
5. Run `npm run lint`, `npm run typecheck`, and `npm run build` after source edits. Add focused behavior coverage only where routing/FAB visibility or navigation fallback changes; verify visual adjustments in the browser rather than writing tests that merely assert CSS classes.

## Limits of this review

The screenshots show only the initial visible area in one theme. They cannot establish tap behavior, scroll reachability, actual contrast ratios, export correctness, or backend/data correctness. No live app interaction, tests, database operations, or exports were performed. Right-edge clipping and missing navigation require the capture check before being classified as app defects. No database, record, reporting-calculation, or compliance-rule changes are proposed.
