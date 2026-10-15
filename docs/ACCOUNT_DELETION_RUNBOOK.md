# Account deletion

For an owner-authorized operator only. This document grants no service access or permission to run these actions. The app accepts requests and blocks pending accounts; it cannot complete or cancel requests.

Farms currently have one user. Verify the request ID, original requested_by UUID, requested_email snapshot, user ID and farm ID against the exact project before acting. Retain the audit row. If more than one profile belongs to the farm, stop and obtain a reviewed plan.

1. Cancel the Stripe subscription. Verify cancellation and record the result before deleting farm data.
2. Delete the requested farm's data and attachments using the separately approved tenant-deletion procedure. Do not delete the account_deletion_requests audit row. Verify only this farm was affected; its audit farm_id becomes null.
3. Revoke sessions and delete the auth user using the approved administrative procedure. Existing JWTs can remain valid until expiry. Verify deletion; the request user_id becomes null while requested_by and requested_email remain.
4. Mark the request completed by its stable request ID and set completed_at in the same update. Notify the requester using the retained email snapshot through an authorized channel.

If any step fails, leave the request pending and record the failure; resume from the first unverified step. Never mark completion before farm and auth deletion are verified. Cancellation requires an authorized operator; no client cancellation RPC/policy currently exists. Users should contact acreledgerapp@gmail.com.

The migration preserving these snapshots is a draft until separately approved and applied. No database, Stripe, or auth administration was performed when writing it.
