# Stripe test-mode billing validation — 2026-09-19

## Decision

The local AcreLedger billing flow is ready for a credentialed Stripe/Supabase
test-sandbox drill, but not for live billing. The validated offer is one farm,
122 days free, then $299 per year. Billing remains web-only, allowlist-gated,
hidden by default, and unenforced.

`BILLING_LIVE_CHARGES` was absent from the local environment during this
validation. The only tracked environment template sets it to `false`. No
Stripe or Supabase billing credentials were present, and Stripe CLI was not
installed, so no external API request, charge, deploy, or production mutation
was attempted.

## Local proof

The focused command below passed 8 files and 88 tests:

```text
npm run test:unit -- --run \
  src/test/billingServer.test.ts \
  src/test/billingCheckoutApi.test.ts \
  src/test/billingPortalApi.test.ts \
  src/test/stripeWebhook.test.ts \
  src/test/billingEntitlement.test.ts \
  src/test/BillingManager.test.tsx \
  src/pages/__tests__/Landing.test.tsx \
  src/pages/__tests__/Settings.test.tsx
```

Coverage demonstrated by those tests:

- Landing and settings copy present four free months followed by $299/year.
- Checkout sends the configured test Price ID as one subscription line item,
  collects a payment method, applies `trial_period_days: 122`, stamps farm and
  owner metadata, and uses a farm/subscription-state idempotency key.
- Missing/empty allowlists fail closed on both client and server; a non-owner
  cannot start Checkout or open Customer Portal.
- Billing clicks resolve the current session at click time. A token inside the
  60-second expiry margin must refresh successfully; a failed refresh no longer
  sends the nearly expired token.
- Webhooks require a valid Stripe signature over the raw body, skip only
  completed ledger events, retry incomplete/failed events, retrieve current
  Stripe subscription state instead of trusting stale event snapshots, and
  reject stale replacement subscriptions.
- Portal sessions use the mirrored customer ID and a trusted HTTPS return URL.
- `past_due` access ends after the locked three-day grace period.
- Billing renders neither when `VITE_BILLING_UI_ENABLED` is not exactly `true`
  nor in a Capacitor/native build.
- Missing or soft-deleted subscriptions remain `unmanaged` with access because
  production enforcement is still off. No production call site passes
  `enforce: true`.
- Server configuration rejects live Stripe secret keys and any
  `BILLING_LIVE_CHARGES` value other than absent or `false`.

Broader regression proof:

```text
npm run test:unit       # 125 files, 1191 tests passed
npm run typecheck       # passed
npm run typecheck:api   # passed
npm run lint            # 0 errors; 73 pre-existing warnings
```

## Defect fixed

The settings billing action previously fell back to a nearly expired access
token when explicit refresh failed. It now fails closed, asks the user to sign
in again, and makes no billing request.

## Unvalidated external seams

The configured Stripe Price object's currency, `unit_amount`, recurrence, and
active state cannot be proven from its opaque `price_...` identifier by local
mocks. Hosted Checkout rendering, webhook delivery through Stripe's network,
Customer Portal behavior, and Supabase RLS/service-role writes also remain
unvalidated against real test infrastructure.

To run that drill, the next owner must provide all of the following for a
non-production environment:

1. A restricted Stripe `sk_test_...` key and a test `price_...` known to be
   active, USD 29,900 cents, recurring yearly.
2. A Stripe test webhook signing secret (`whsec_...`) or permission to install
   and authenticate Stripe CLI against the test account.
3. A disposable Supabase test project URL, anon key, and service-role key with
   the billing migrations applied.
4. An allowlisted disposable owner account/JWT with a profile and farm.
5. Explicit approval to create and later clean up disposable Stripe test-mode
   Checkout, customer, subscription, invoice, and webhook ledger records.

The drill must keep `BILLING_LIVE_CHARGES=false`, use only `sk_test_...`, and
must not deploy or alter production state.

## Remaining risks and next owner

- Risk: the real Stripe Price may not match the public $299/year promise until
  its test-account object is inspected.
- Risk: network-level redirects, webhook retries, and RLS interactions are
  represented by mocks, not a full sandbox round trip.
- Existing lint warnings are outside this billing work item; none occur in the
  changed files.

Next owner: the AcreLedger release/billing owner with access to the isolated
Stripe and Supabase test projects. Their acceptance threshold is one successful
test-mode 122-day annual Checkout plus signed webhook mirror and owner Portal
round trip, with no live key accepted and enforcement still off.
