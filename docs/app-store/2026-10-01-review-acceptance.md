# App Review acceptance — screenshots and sample farm

Decision date: September 27, 2026. Launch target: October 1. This file is the
acceptance bar for the review account, the 12 final screenshots, and the
separate October 1 public-web rollout promise. Listing copy, privacy answers,
and the version record stay in
[`2026-10-01-submission-package.md`](./2026-10-01-submission-package.md).

This is preparation only. It does not authorize Add for Review, Submit for
Review, or a public release.

## Outcome

A reviewer who installs the selected 3.6.0 build can sign in to one disposable
farm and see a working record book: fields on a map, a season of activity,
grain in bins, and a report that is ready to export. The same farm, on that
same build, is what the six App Store scenes show. The iOS app stays a free
companion. It does not sell anything and does not send the reviewer to buy on
the web.

Draft simulator captures are not this outcome. TestFlight build 185 is not
this outcome.

## Decisions

- Version record and marketing version are **3.6.0**. Do not select TestFlight
  build 185. The selected build's Git history must contain `a8e7c23` and the
  native landing change that hides pricing, trial, signup, and purchase calls
  to action.
- Release type stays **manual**. Owner approval is required before Add for
  Review and again before the public release.
- Screenshots ship as clean UI. Do not burn caption text into the pixels for
  this submission. The caption concepts in the submission package are internal
  only.
- The review dataset is a small invented farm named **Sample Creek Farm**,
  season **2026**. It is not the developer generator in
  `src/test/generateTestData.ts`, not a production backup, and not bundled
  real CLU geometry.
- The captured Reports scene is the default **FSA-578** tab. It must read
  **Ready to export**, with every sample field ready. Other report tabs may be
  empty. They may not show a warning or error state.
- Ask the Book is shown as one typed, read-only question with a visible answer
  that matches the sample bins. No voice recording in the screenshot.

## October 1 public-web rollout promise

**Decision (September 28, 2026): conditionally accepted for the limited
rollout; this is not release approval. Every gate below must pass.**

The farmer-facing promise is: account creation costs **$0**, no payment method
is collected, and AcreLedger remains free to use for the duration of this
limited rollout. Billing is not active. The intended later price is presented
only as a plan: **$299 per farm per year, billed annually**. No four-month term
or other fixed free period is promised. Farmers keep ownership of their
records and can export them.

The approved public-web wording is the combination now used on the landing
page: **Limited rollout**, **No charge today**, **Billing coming soon**, and
**Planned price: $299 per farm, billed annually**, plus the pricing note that
no payment method is collected at account creation. This wording does not
authorize charging, starting a subscription, or announcing a billing date.

Accept the October 1 web rollout only when all of these are true:

- Public signup completes without a checkout, card, bank account, invoice, or
  trial-expiration date. The amount due at signup is `$0.00`.
- No page or signup step reachable by a rollout farmer promises "four free
  months," "4 months," or any other fixed free period.
- The feature-flagged internal Stripe test surface is excluded from the
  production rollout. `VITE_BILLING_UI_ENABLED` is not `true`, client and server
  billing allowlists are empty, and `BILLING_LIVE_CHARGES` is absent or `false`.
  The retained `BillingManager` four-month-trial copy and checkout are not
  reachable by a rollout farmer.
- Every `$299` statement visible before signup calls the amount **planned** and
  states that it is per farm per year, billed annually. It is not shown as an
  amount currently due.
- Existing rollout accounts cannot be charged automatically or retroactively.
  A paid launch requires a separate owner decision, advance farmer notice,
  clear effective terms, and the farmer's affirmative choice to subscribe.
- A farmer who does not subscribe when billing becomes available can export
  their records; the rollout copy's ownership and export promise remains true.
- The native app remains price-free: no `$299`, limited-rollout, billing,
  trial, signup, subscribe, checkout, or external-purchase wording or control
  appears in the native signed-out experience or App Store screenshots.
- The landing-page tests pass in both web and mocked-native modes, including
  removal of the four-month claim and suppression of all rollout and pricing
  copy in native mode.

Reject or pause the rollout if signup collects payment information, a fixed
free-period claim or internal test checkout is reachable by a rollout farmer,
`$299` is represented as currently due, production billing flags or allowlists
are enabled, or a native build exposes the web pricing/signup experience.

## 1. Review-account sample data

Accept the account only when every row below is true on a clean install of the
selected build.

### Account

- One disposable sign-in used only for App Review. It is not a customer, not
  the owner's working farm, and not a shared developer login.
- Username and password are entered only in App Store Connect. The password is
  not committed, logged, or pasted into this repository.
- Signing in opens Sample Creek Farm directly. No onboarding empty state, no
  second real farm, and no farm switcher entry for a real operation.
- The owner can recreate this exact fictional dataset if Review uses Delete
  Account. Deletion itself stays available; do not hide it.
- Password reset for this account has been completed once on the selected
  build before submission. That completion is an owner action.

### What the farm contains

Use only the rows in this table. Do not add people, contacts, photos, work
requests, or extra farms.

| Record | Required content | Must not contain |
| --- | --- | --- |
| Farm | Name `Sample Creek Farm`. Season 2026. | A real farm name, email, phone, or street address. |
| Fields | Exactly four: `North Forty` (corn, about 80 ac), `Creek Bottom` (soybeans, about 60 ac), `East Pivot` (corn, about 40 ac), `South Ridge` (wheat, about 30 ac). Each has a closed invented polygon, acreage that matches the card, crop, intended use Grain, crop status Planted, a 2026 plant date, producer share 100, irrigation practice, and FSA farm `1001`, tract `2001`, field `1` through `4`. | Real CLU polygons, bundled tract geometry, production coordinates, home or shop pins, customer field names. |
| Spray | One complete spray on `Creek Bottom`: fictional product `Sample Herbicide`, a non-empty sample EPA value `SAMPLE-000`, rate, treated acres, date, applicator `Sample Applicator`, license `SAMPLE-0000`. | Real product brands, real EPA numbers, real license numbers, a site street address. |
| Harvest and grain | One corn harvest from `North Forty` into `North Bin`, with bushels and moisture. One soybean harvest from `Creek Bottom` into `East Bin`. | A real elevator, buyer, scale ticket, or landlord name. No sale is required. |
| Bins | `North Bin` and `East Bin`, each with capacity above the stored bushels and at least one inbound movement. Storage shows a non-zero amount in both. | Prices, real bin sites, or a sale destination. |
| Reports | FSA-578 status is Ready to export and `4 of 4` fields ready. Spray Audit is Ready to export for its one record. Fertilizer, Fall FSA, Hay, Landlord, and Work Reqs are empty, not warning states. | Readiness copy that says Review recommended, a missing-data list, or a real landlord. |
| Ask the Book | Typed question `How much grain is in each bin?` The visible answer names `North Bin` and `East Bin` with the same bushels shown on Storage. | An error, an empty answer, a claim that records were changed, or voice audio. |
| Map center | A non-customer point chosen by the owner so the boundary is readable. | The owner's home, a customer's farm, or any production field export. |

Weather may appear on the dashboard. If it errors or shows a street address,
the capture fails. Declining location is acceptable only if the dashboard
still looks complete without an error.

### Reject the dataset if

- It was produced by `generateTestData.ts` or any other bulk generator.
- It was restored from a customer, owner, or disaster-recovery backup.
- Any name, email, phone, license, photo, coordinate, or boundary belongs to a
  real person or farm.
- FSA-578 is anything other than Ready to export.
- The signed-in app shows `$299`, a trial, signup, subscribe, or a control
  that leads to purchase.

## 2. Screenshot acceptance

Twelve final PNGs, six scenes on each device, in this order:

1. Fields dashboard for Sample Creek Farm: season 2026, crop filters, acreage,
   and the four field cards. Weather is clean or absent, never an error.
2. `North Forty` field detail: the whole invented boundary and the quick-log
   actions are visible.
3. Activity: planting, the sample spray, and harvest are all visible without
   opening a record. No debug row.
4. Reports on FSA-578: **Ready to export** and **4 of 4** fields ready.
5. Storage: both bins, a non-zero amount in each, and one recent inbound
   movement. No price and no buyer.
6. Ask the Book: the grain question and the matching answer, fully readable.

Device files:

| Device | Pixel size | Color |
| --- | --- | --- |
| iPhone 6.9-inch | 1320 × 2868 | 8-bit RGB PNG, no alpha |
| iPad 13-inch | 2064 × 2752 | 8-bit RGB PNG, no alpha |

Name them `iphone-01-fields.png` through `iphone-06-ask.png` and
`ipad-01-fields.png` through `ipad-06-ask.png`.

Every file must also pass these checks:

- Captured from the selected 3.6.0 build, after sign-in to Sample Creek Farm.
  The September 27 draft pipeline proves dimensions only. Those PNGs are not
  uploadable.
- Same farm, season, dark mode, and data on both devices.
- The full viewport is in frame, including the tab bar (Fields, Storage,
  Activity, Reports, Setup) on screens that use it.
- No browser chrome, TestFlight dialog or banner, permission prompt, debug or
  developer tools, API error, email address, phone number, or street address.
- No price, trial, signup, subscribe, or external-purchase wording anywhere in
  the image.
- No text overlay and no cropped edge used to hide a defect.
- Pixel dimensions and no-alpha are rechecked on all 12 files after export.

Upload to App Store Connect only after the owner approves submission. Uploading
assets is not the same as submitting the version.

## 3. What Product still needs

### From Engineering

- A reviewed way to load the table above into the disposable review tenant.
  Do not use the bulk test generator, a production backup, or bundled real CLU
  data.
- Confirmation on the selected build that FSA-578 is Ready to export, Spray
  Audit is Ready, the other report tabs are empty, Storage matches Ask the
  Book, and a clean install signs in to this farm only.
- The native shell still has no in-app purchase and no pricing, trial, signup,
  or external-purchase call to action, including the signed-out screen and
  Setup.
- The build SHA, the TestFlight build number, and proof that `a8e7c23` is an
  ancestor. Version must already be 3.6.0.

### From Platform

- GitLab, GitHub, and Codeberg on that same reviewed SHA.
- A CodeMagic TestFlight build from that SHA that is Validated and Ready to
  Submit. Build 185 does not qualify.
- The Xcode privacy report for that build matches the eight categories in the
  submission package before privacy answers are published.
- The 12 PNGs captured from that build on the Mac, with dimensions and
  no-alpha rechecked. Leave the files for Product to accept. Do not upload them
  as final until the owner approves.

### From the owner

- Approve this fictional dataset before it is loaded.
- Choose the non-customer map center.
- Create the disposable review login. Enter the username, password, and a
  monitored review phone only in App Store Connect.
- Finish password reset once on the selected build.
- Accept the Apple Developer Program agreement.
- Resolve DSA trader status or exclude EU distribution.
- Give an explicit approval before anyone uses Add for Review or Submit for
  Review. After Apple approves, the owner releases manually.

Product accepts the dataset and the 12 images against this file. Product does
not submit the app and does not store the review password.

## 4. Not allowed

- In-app purchase, a subscription price, a free-trial offer, or any link,
  button, or sentence in the iOS app that tells someone to buy outside the app.
  The web marketing page may keep its price. That page must not appear inside
  the iOS shell.
- Real farm data, customer photos, production backups, real CLU geometry, the
  owner's home location, or the bulk developer generator as the review dataset.
- Treating the September 27 draft captures as the release screenshots.
- Selecting TestFlight build 185, any build that is not 3.6.0, or any build
  whose history does not contain `a8e7c23`.
- Putting the review password in Git, docs, logs, or chat.
- Add for Review, Submit for Review, or a public release without an explicit
  owner approval.
- Contacting customers about this review account or asking them for sample data.

## Remaining risks

- Apple can still reject the companion-app exception if any purchase wording
  returns in the binary, screenshots, or review notes.
- Review can delete the demo account. The owner must be able to recreate the
  fictional farm during the review window.
- Ask the Book needs the network. A failed answer during capture or review
  misses the scene.
- Agreement, DSA, and password-reset completion can block submission after the
  screenshots are otherwise ready.
- October 1 is the target, not permission to submit.

## Next owner

Growth owns the reviewed landing-copy/test change and hands it to Platform.
Platform owns the October 1 production configuration and deployed smoke check:
billing UI not enabled, billing allowlists empty, live charges disabled, signup
at `$0`, and no four-month claim reachable by a rollout farmer. Product accepts
the deployed web outcome against this file before the owner authorizes release.

The owner owns the review account, agreement, DSA, password reset, App Store
submit decision, and public-release decision. Engineering owns the dataset load
and the qualifying SHA. Platform owns the TestFlight build and the 12 captures.
Product reviews both against this file before recommending that the owner
decide.
