# AcreLedger — Product Description and SaaS Model

## Executive summary

AcreLedger is a farm record book and compliance reporting app built for working
row-crop farms. It replaces the notebook, camera roll, whiteboard, and
spreadsheet pile that most small operations use to track what happened in every
field. Farmers log planting, spraying, fertilizing, harvest, hay, and grain
movements as the work happens — from the cab, with or without a signal — and
later export the PDFs and CSVs their landlords, applicators, co-ops, and FSA
office visits demand.

Business model in one line: **a per-farm SaaS subscription (web-billed, Stripe),
preceded by a 4-month full-product trial, with a free iOS companion app that
contains no purchase flow.**

---

## 1. The point of the application

### Who it is for

Row-crop farmers and small operations — independent growers who run a handful to
a few hundred acres, farm with their own equipment, deal with landlords and
custom applicators, and have to answer to county FSA offices. These operators do
not want farm-management ERP software; they want a field book that lives in
their pocket and produces the paperwork they are asked for.

### The problem it solves

- **Records are scattered.** Planting notes live in a notebook, spray tickets in
  a camera roll, bin numbers on a whiteboard, landlord numbers in a spreadsheet.
  Nothing connects a field's acreage to what was actually done to it.
- **Compliance paperwork is a scramble.** FSA acreage reporting (FSA-578), spray
  logs, fertilizer and hay records, and landlord statements get assembled by
  hand at the last minute, missing details (variety, rates, EPA numbers,
  weather at application time) and forcing trips back to the field.
- **The cab has no signal.** Field work happens offline by default, so any
  cloud-only tool that requires connectivity is dead weight in the field.

### What it does

**Records every field and every operation.** Fields carry boundary maps,
acreage, crop, season, and FSA data. Every activity type — planting (with FSA
status and planting patterns), spraying (multi-product tank mixes with EPA
registration numbers, per-product rates, and weather at application), custom
(outside-applicator) sprays, fertilizing, tillage, harvest, hay — is logged one
field at a time, so dates, rates, products, weather, applicator details, and
photos (spray tickets, product labels) stay with the right acres.

**Works offline first.** Records save without a signal into an encrypted local
store (encrypted SQLite on native iOS, encrypted local storage on web) and sync
through a transaction retry queue when connectivity returns. Sign-out is blocked
until pending changes are safely queued, so field work is never silently lost.

**Turns the book into reports.** AcreLedger generates the documents farmers
actually hand to people:

- **FSA-578 acreage worksheet** — a cropland-entry table per farm/tract/CLU
  with reconciliation totals, built to be handed to an FSA employee for entry,
  plus a Fall FSA production worksheet.
- **Spray audit log** — a universal spray-log PDF including photo attachments,
  the record used to answer applicator and compliance questions.
- **Fertilizer, hay, and landlord reports** — per-field and per-landlord
  summaries with crop-share math, activity timelines, and CSV/PDF exports.
- **Report readiness** — each report tells you what is missing (unassigned
  CLUs, missing EPA numbers, missing rates) *before* you get to the office, and
  tracks whether records changed since the last export.

**Knows the government acreage.** Farmers can import FSA tract and CLU boundary
data (GeoJSON or ESRI shapefile ZIPs, or a generated request worksheet for the
local FSA office) so report acreage comes from the official cropland layer — not
a guess — and fields show their CLU numbers automatically.

**Tracks grain like it is.** Grain bins, continuous (season-independent)
inventory, in/out movements including negative estimate corrections, and
crop-share splits for landlords. A bin's real total is never hidden by the
viewing season.

**Answers questions about the book.** "Ask the Book" is a read-only assistant:
type a plain-language question (or use optional on-device voice input) and it
answers from the farm's own saved records. It cannot add, edit, or delete
anything — it is a search companion, not an agent.

**Keeps farms separate.** Multi-tenant by design: every record is scoped and
protected by its farm through row-level security; one account can hold multiple
farms, and no farm's data leaks into another's screens or exports.

### How it is built

Mobile-first, PWA-ready React 18 (TypeScript strict) app wrapped in a native iOS
app via Capacitor 6; Supabase Postgres/Auth/RLS for the backend; shadcn/ui +
Tailwind for UI; Visual Crossing for field-level weather and IEM Stage IV for
rainfall; Vercel Functions for the weather proxy, the read-only AI assistant,
and billing; Stripe for subscriptions; CodeMagic CI/CD for TestFlight and App
Store. The same codebase ships as a web app **and** an iOS app.

---

## 2. The SaaS model

### What is sold

A **per-farm subscription** to the full AcreLedger product. The unit of purchase
is the farm, not the seat or the device: one subscription covers the farm's
records, exports, AI assistant, and all signed-in devices on that farm. The
product is sold as an **annual subscription (currently priced at $299/year on the
web landing page)**.

### The funnel: trial → subscribe

- **Free sign-up, full product.** New farms get the complete product for a
  **4-month (122-day) full-product trial** — a locked product decision. There is
  no crippled free tier during trial; the entire feature set (reports, exports,
  FSA, grain, Ask the Book) is available.
- **Conversion at trial end.** After trial, continued access requires an active
  subscription. Checkout happens through **Stripe Checkout** (annual price),
  subscription management through the **Stripe Customer Portal**.

### Web-billed, free native app

Billing is deliberately **web-only for v1**:

- The iOS app is a free, stand-alone companion client: it contains **no
  purchase flow, no subscription price, and no link or call to purchase
  outside the app** (Apple's rule for a free companion to a paid web tool).
- Sign-up, trial, and payment happen on the web; the signed-in app then unlocks
  the farm. This keeps App Store review clean and avoids 30% in-app-purchase
  economics while the core product is validated.

### Entitlement and enforcement

- The **source of truth is a server-mirrored `farm_subscriptions` row** fed by a
  signed Stripe webhook — never client-reported state.
- Access phases: `trialing` (full access) → `active` (full access) → `past_due`
  (full access through a **3-day grace window**) → `canceled`/`unpaid` (access
  continues only until `current_period_end`) → `incomplete` (abandoned checkout,
  locked). Missing or soft-deleted subscription rows follow the enforcement
  flag.
- **Paywall enforcement is currently OFF** (`BILLING_ENFORCE` unset): until the
  product owner flips it on, a farm without a subscription row keeps full access
  rather than being locked. This is deliberate — the enforcement lever exists
  and is tested, but has not been pulled yet.
- **Live charges are disabled.** All billing runs in Stripe **test mode**
  (`sk_test_` keys, `BILLING_LIVE_CHARGES` must be false) until the owner
  approves final legal copy. The billing UI is behind environment flags and an
  **internal rollout allowlist** (emails/user IDs); everyone else sees "Billing
  coming soon."

### Why this model fits

- **The buyer is the farmer, and the value is the paperwork.** Farmers pay for
  things that save them office time and keep them compliant — exactly what the
  report engine, FSA acreage wiring, and grain tracking deliver. An annual,
  per-farm price matches how they already spend (seed, chemical, custom work
  are all annual cycles) and is simple enough for a small operation to approve.
- **The trial is the demo.** A 4-month trial covers a full season arc (plant
  through harvest), so a farmer who logs a real year in AcreLedger has their
  entire field book in the product before they are asked to pay — conversion
  happens when the book becomes irreplaceable.
- **Offline and native build product trust.** Free iOS app + offline-first
  design remove the two biggest adoption objections in ag tech (connectivity in
  the cab, and downloading software onto the one device that works in the
  field).
- **Low support surface of the model.** One annual price point, farm-scoped,
  web-billed — no per-seat complexity, no enterprise sales cycle, no in-app
  purchases.

### Current status (as of the latest documentation)

- Stripe test-mode checkout, portal, and signed webhook mirror are implemented
  and validated end-to-end; enforcement is armed but off.
- The iOS app is at version 3.6.0 and packaged for App Store submission
  (screenshots, privacy manifest, review notes prepared); the native build
  contains no purchase or pricing surface.
- Production Go-live of charging requires: approved legal copy, flipping live
  charges on, and the product owner deciding when to enable paywall
  enforcement and the public trial-to-paid funnel.

---

*Sources: `AGENTS.md`, `BLUEPRINT.md` billing/entitlement rules, `src/lib/billing.ts`,
`server/billing.ts`, `api/*` billing endpoints, and the App Store submission
package under `docs/app-store/`.*