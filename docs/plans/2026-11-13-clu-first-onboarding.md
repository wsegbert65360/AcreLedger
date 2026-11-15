# Onboarding that leads with CLU import

Plan only. No code in this change.

## Current behavior

`src/pages/Onboarding.tsx` asks for the farm name, then mounts `TractAssignmentFlow`. That flow (`src/components/TractAssignmentFlow.tsx`) can import a CLU file (`parseCluFile` only), request an FSA file, or add a field by hand. The first screen the farmer sees is the name, not the import.

## Goal

After the farm name, the next screen is the CLU file import (or the FSA request sheet if they do not have a file), with manual field entry as a secondary action. Do not add a second parser. Keep `parseCluFile` as the only import entry.

## Files

- `src/pages/Onboarding.tsx` and `src/pages/Onboarding.test.tsx`
- `src/components/TractAssignmentFlow.tsx` (an `initialTab` or `leadWithImport` prop so Settings and field edit keep today's layout)
- `src/components/FsaTractImporter.tsx`, `src/components/FsaRequestSheetDialog.tsx`
- `src/hooks/useCoachmarks.ts` if the "add your first field" coachmark should point at import instead. That hook only runs when `onboardingComplete` is set, so it is the post-setup hint, not the wizard itself.

## Risks

- Skipping import must still call `completeOnboarding`. A farmer with no CLU file cannot get stuck.
- Import writes `fsa_tract_imports` and assignments through the existing upsert conflict keys. Do not replace those with inserts.
- Acreage defaults for later plant, spray, and fertilizer records use CLU acres once assignments exist. Leading with import changes what those defaults are. That is intended. Do not backfill old rows.
- FSA tract entry is a Pro feature when `ENTITLEMENTS_MODE` is `enforce`. The flag stays `off`. Do not gate onboarding on Pro while it is off, and do not flip the flag.

## Size

Small to medium. The import UI exists. The work is step order, copy, and tests, not a new importer.
