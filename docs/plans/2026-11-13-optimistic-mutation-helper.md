# Shared optimistic-mutation helper

Plan only. No code in this change.

## Goal

One helper for the eight-step mutation in AGENTS (farm guard, validate, map before state, rollback snapshot from the render closure, functional optimistic update, await Supabase, success count, rollback on error). Return `Promise<boolean>`.

## Start here

`src/store/useTillageRecords.ts` (about 320 lines, same shape as hay, plant, and custom spray). It has no grain version token, no harvest RPC, and no CLU cascade. Move that hook onto the helper, keep its tests green, then hay, plant, and custom spray. Leave grain, harvest-with-grain, field+CLU delete, equipment RPCs, and FSA upserts until the simple path has been in use.

## Files

- New `src/lib/optimisticMutation.ts` (or `src/store/optimisticMutation.ts`)
- `src/store/useTillageRecords.ts` first
- A hook test on `useStatefulArray` from `src/test/hookTestHarness.tsx`
- Later: the other activity hooks. Do not fold `src/lib/syncQueue.ts` into the first step.

## Risks

- A helper that captures rollback inside the state updater will hide the bug the current rule exists to prevent. The snapshot must come from the render closure.
- Offline batches must stay one `enqueueMutations` call. The helper must not loop `enqueueMutation`.
- Mapper throws must still return `false` before any state write.
- Count checks must stay `{ count: 'exact' }` with no `.select()` after `.update()`. The farm write guard will fail a regression.

## Size

Small for the helper plus tillage. Each later hook is its own change. Grain and field delete are a separate, larger step.
