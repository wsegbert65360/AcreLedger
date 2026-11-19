# Spray, compliance, and the Australia pilot

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/utils/unitConversion.ts, src/hooks/useSprayForm.ts, src/lib/sprayExport.ts, src/lib/compliance/profiles.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [Spray Compliance](#spray-compliance)
- [Regional Settings and the Australia Pilot](#regional-settings-and-the-australia-pilot)
- [Custom (Outside-Party) Spray Records](#custom-outside-party-spray-records)
- [Spray Wizard Pattern](#spray-wizard-pattern)
<!-- contents:end -->

## Spray Compliance

Canonical detail: [BLUEPRINT → SprayRecord](../../BLUEPRINT.md#sprayrecord-2026-standards).

- Multiple products per application; tank-mix UI rows key on a temporary `ui_id`, never the array index.
- **Compliance is profile-driven, not US-only.** `@/lib/compliance/profiles.ts` owns the required-field set and product checks for each profile (`us-epa`, `au-apvma`). Resolve a record's profile with `resolveComplianceProfileId()` / `getComplianceProfileFor()` and check it with `getMissingComplianceFields(record, profileId)` — never branch on a raw `complianceProfile` string, and never hard-code the US field list into shared code. Legacy values (`'universal'`, `''`, null) resolve to `us-epa`.
- **US behavior is frozen.** Do not change the `us-epa` field set or its product checks to make another region work; add or amend a profile instead. Under `us-epa`, a missing `epaRegNumber`, or a missing, zero, negative, or unitless product rate, marks the record for compliance review. Under `au-apvma`, the registration-number check is off (APVMA numbers are "when relevant") and PIC, water rate, paddock, and treated area in hectares are required instead. Derive review status for legacy rows at read time; do not rewrite historical records to change the flag.
- `mapSprayToDb` writes `pic`, `water_rate`, and `water_rate_unit` on **every** spray save, US included, so `20261005162141_add_spray_water_rate_unit_pic.sql` is load-bearing for all users — likewise `fields.pic` (`20261005013057`) on every field write. Confirm both columns are live in prod before shipping a build that writes them.
- Per-product totals are canonical and recalculated synchronously before save. `totalAmountApplied` is a legacy first-product value; never sum unlike units into it.
- Keep spray terminology state-neutral unless a specific legal report requires state wording.
- Import `WIND_ALERT_MPH` from `@/lib/weatherHelpers.ts`; do not re-declare it.
- Treated-area defaults and every report/export fallback go through `getEffectiveSprayTreatedAcres(record, field, cluAssignments)`, never a raw `field.acreage` read. An explicitly stored `treatedAreaSize` is always preserved.
- New tank-mix products and recipe rows default to `DEFAULT_SPRAY_RATE_UNIT` (`fl oz/ac`) from `@/utils/unitConversion`; do not hardcode `'oz/ac'`, which is a dry weight unit and totals in pounds. Unit pickers use `SPRAY_RATE_UNIT_OPTIONS` with `rateUnitOptionLabel`, and the mix step keeps its live total preview and dry-weight note. Existing records keep their stored unit.
- The spray log PDF status line uses the review-queue checks (`missingComplianceFields`, `sprayProductsNeedReview`) and names what is missing; it must never print "Complete" for a record the app flags. Detail values wrap, never clip.
- The spray log PDF is an official record. The heuristic review prompts (`buildReviewFlags`: night spraying, light or high wind, odd rate, repeated record) print only with `includeReviewFlags: true`, which no caller sets. By default no "Check:" lines print and "Records to check" counts only missing details and compliance flags.

## Regional Settings and the Australia Pilot

Canonical detail: [BLUEPRINT → Compliance Profiles and Regional Settings](../../BLUEPRINT.md#compliance-profiles-and-regional-settings-australia-pilot).

- Region preferences are `{ country: 'US' | 'AU', locale: 'en-US' | 'en-AU', unitSystem: 'imperial' | 'metric' }` in `@/store/useAppPreferences.ts`, defaulting to US/imperial. They are **device-local and scoped by user id**.
- **Always pass the user id**: `useAppPreferences(session?.user?.id)`. Calling it bare writes the unscoped `al_app_prefs` key that the spray form never reads — the exact defect that made the AU setting inert. Hook instances do not share state, so a change lands on the next remount.
- **The Region card is gated.** Mount `RegionManager` only behind `isAuPilotEnabled(identity, env)` from `@/lib/auPilot.ts`: `VITE_AU_PILOT_ENABLED === 'true'`, or the signed-in email (case-insensitive) or user id (exact) on the comma-separated `VITE_AU_PILOT_ALLOWLIST`. Never mount it unconditionally — picking Australia switches a production US user to the APVMA profile, metric units, and paddock terminology. Hiding the card must not reset a region an existing AU user already chose.
- `country` selects the default compliance profile through `defaultProfileForCountry()`; it does not rewrite existing records.
- **Terminology** comes from `@/lib/locale/terms.ts` `term(key, locale)` (AU: paddock/paddocks); numbers from `@/lib/locale/numbers.ts` `formatNumber()`. Both take the locale explicitly. This is a deliberately small helper set, not a string catalog — do not start a full i18n extraction inside the pilot.
- **Convert area at the boundary.** `treatedAreaSize` is stored in the unit named by `treatedAreaUnit` (`'ac'`, `'ha'`, `'sqft'`). Rate math goes through `normalizeAreaForRate(value, areaUnit, rateUnit)` and duration math through `normalizeTreatedArea(...)` in `@/lib/sprayExportFormatters.ts`; `acresToHectares()` in `@/utils/unitConversion.ts` is the only approved conversion. Never pass a raw acre figure into an `L/ha` or `kg/ha` calculation — that is a silent 2.47× overstatement on a compliance record.

## Custom (Outside-Party) Spray Records

Canonical detail: [BLUEPRINT → CustomSprayRecord](../../BLUEPRINT.md#customsprayrecord) and [Spray Entry Chooser](../../BLUEPRINT.md#spray-entry-chooser-spraytypechoosertsx).

- Custom sprays are a lightweight log for outside applicators, not compliance `SprayRecord`s. They are excluded from the universal spray-log PDF and the non-compliant review queue.
- The Spray button opens `SprayTypeChooser`; keep both interception points (`FieldDetailScreen.tsx` and `QuickAddDialog.tsx`) in sync.
- `CustomSprayModal` never auto-fetches weather. **Pull historical weather** is explicit, and a failed lookup preserves manual values.
- CRUD follows the same farm-scope, season-stamp, soft-delete, optimistic-update, sync-queue, and backup/restore rules as the other activity hooks.
- `ActivityRecord` in `@/types/farm` is a **discriminated union** (`{ type: '<literal>'; data: <RecordType> }`), so mismatched pairs are a compile error. Feed consumers use `Exclude<ActivityRecord, { type: 'grain' }>`. Do not loosen it to `{ type: string; data: SomeUnion }`.

## Spray Wizard Pattern

`SprayModal` is refactored into a 5-file wizard pattern:
- `src/components/spray/SprayWizardNav.tsx` — step progress bar and Prev/Next/Save buttons.
- `src/components/spray/SprayWizardCoreStep.tsx` — field, date, applicator, equipment, site info.
- `src/components/spray/SprayWizardMixStep.tsx` — tank mix, products, rates, recipe loading.
- `src/components/spray/SprayWizardConditionsStep.tsx` — weather, wind, conditions.
- `src/components/spray/SprayWizardReviewStep.tsx` — summary and save.
- `src/hooks/useSprayForm.ts` — shared form state (products, weather, conditions, review data) consumed by all step components.

Keep each step component under ~150 lines. All form state lives in `useSprayForm`; step components are pure presenters. `SprayModal` owns only the step routing, navigation callbacks, and save dispatch.

Spray also has an in-cab quick mode controlled by `useSprayForm.isQuickMode`; preserve both the quick path and full wizard path when changing validation, save behavior, or field prefills. Quick mode is optimized for glove-friendly spray logging and still writes through the same `handleSubmit` path.

Spray photo capture is gone. The form has no camera or photo-library control, and nothing in the wizard renders an attachment image. Legacy `notes` may still contain one `[ATTACHMENT:data:image/<type>;base64,<payload>]` token. `useSprayForm` parses that token when a record is opened, keeps the bytes in component state (not shown), and writes the same token back on save so an edit does not drop it. Duplicate mode clears those bytes and does not copy the token. `src/lib/sprayExport.ts` strips the token from PDF note text and embeds the image. Ask the Book replaces it with `[image attachment present; binary omitted]` before the model sees the note. Do not display or export the raw token or base64 text. iOS camera and photo-library usage strings stay for a possible later Pro photo feature; this build does not collect photos. Do not add a capture control.

After a successful new spray with a novel mix, `useSprayForm` may prompt to save the mix as a spray recipe. Keep that recipe dialog mounted until the user confirms or cancels, even if the spray record itself has already saved. Recipe duplicate checks should compare product name, rate, rate unit, and EPA registration number, not product names alone.
