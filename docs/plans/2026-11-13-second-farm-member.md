# A second person on a farm

Plan only. No code in this change. The product today is one account per farm. Do not build this unless the owner reverses that.

## Smallest safe option

Do not share the password. A second login needs a membership row that is not a second `profiles.farm_id` write from the client.

Add `public.farm_members` (`farm_id`, `user_id`, `role`, `deleted_at`) and one `SECURITY DEFINER` function, `user_farm_ids()`, that returns farm ids for `auth.uid()` from that table. The owner remains the profile created by `ensure_user_farm`. Clients cannot insert a member for an arbitrary user or move `profiles.farm_id`. An invite is an owner-approved email, stored as a request, not a client update of someone else's profile.

Sharing one login is smaller and is not safe: there is no way to remove one person, and the audit trail is a single user id.

## RLS impact

Policies today are `farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())`, including the loop in `supabase/migrations/20260628100000_revoke_core_hard_deletes.sql` and later per-table policies. Every one of those predicates must use `user_farm_ids()` or the second person sees an empty farm and a bug in the function locks the owner out. `profiles` itself stays "select your own row." Billing, comps, and `assert_premium` stay per farm, so the second person inherits the farm's plan. Ask the Book stays on its one-farm allowlist and does not become a reason to add people.

New table rules: RLS, no client DELETE, no anon grant, `deleted_at IS NULL` on the client SELECT policy (`scripts/farm-table-migration-guard.mjs`), plus `scripts/recovery/tenant-registry.ts`. No hard delete.

## Files

- A new migration after `20261110190000`
- `scripts/recovery/tenant-registry.ts` and its coverage test
- `src/lib/backupSchema.ts` only if members belong in the customer backup. They should not, if the table is an invite ledger. Decide before coding.
- `src/pages/Settings.tsx` for a later invite UI. Not part of the smallest schema step.
- `src/pages/Privacy.tsx` already says "team members you invite" and "people you invite to your farm." That copy is ahead of the product. Align it when the feature exists, not before.

## Risks

- One missed policy is a cross-farm read or a locked owner.
- `ensure_user_farm` currently stamps the caller's profile onto one farm. A second account must not run that and create a second farm by accident.
- Entitlement limits (50 fields, rainfall slots) are per farm. Two people must not double them.
- Offline queue rows are per device and per user. Replay must keep using the caller's JWT and the farm id the server believes they belong to.

## Size

Large. The table and the function are small. Replacing every farm-scoped policy, with disposable PGlite tests for both members, is the whole change. Do not do it as a drive-by.
