
## 2024-04-10 - Missing ARIA Labels on List Item Actions
**Learning:** In list views (like RecipeManager, SeedManager), icon-only action buttons like delete/remove commonly miss `aria-label`s, rendering them inaccessible to screen readers. This is a recurring pattern in standard settings screens across the app.
**Action:** When adding list management features, ensure standard delete/edit icon buttons have `aria-label` attributes to maintain baseline accessibility.
