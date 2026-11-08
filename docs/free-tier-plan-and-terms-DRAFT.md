# AcreLedger free-tier plan and terms — DRAFT (not published)

**Status:** Draft only. Written 2026-11-08 (America/Chicago) so Claude and the team can check work against the adopted plan and draft wording. Nothing here is live. Do not change the live app, landing page, signup, legal pages, docs, App Store listing, or marketing until Will separately says so. Legal wording goes to Will and his attorney before any publish. Stripe stays in test mode until January; live billing still needs Will’s explicit OK. Will releases the iPhone app himself; bots do not publish it.

This file is the combined source for:

1. The adopted product plan (from the decision record of November 8, 2026)
2. The customer-facing wording packet (Copy Humanizer pass, 2026-11-08)
3. Legal replacement drafts for Terms of Service, Refund Policy, and Privacy Policy (not humanized)

The live AcreLedger repo and website still describe a 3-month free trial that later becomes read-only. Those pages are unchanged.

---

## Part 1 — Adopted plan (November 8, 2026)

Will adopted a permanent free record book instead of a trial. New farms start on free entitlements from day one. Existing trial farms finish their three months and then land on free, not a locked or read-only book.

### What Will decided

| Topic | Decision | Status |
| --- | --- | --- |
| Pricing direction | Permanent free record book with Premium at $299 per farm per year. | Adopted |
| Trial period | New farms get no trial. They start on the free entitlements from day one, so nothing is taken away later. | Decided |
| Free rainfall | Two automatic rainfall fields from day one. | Decided |
| Free field cap | 50 active fields. | Decided |
| Upsell | Look for ways to upsell Premium that do not make the free version less useful. The upgrade hook stays full rainfall, prepared FSA reports, and business tools, not crippling the record book. History, sync, and backup stay part of the free record book. | Decided |
| Trial language | Public landing, signup, new-farm wording, legal pages, docs, and marketing should have no trial language. Farms already on a trial still get a plain in-app note until those three months end. | Decided |
| Build and publish | A build estimate and wording drafts are authorized. Do not change the live app or publish landing or legal wording until Will says so. | Drafts only |

### The adopted plan in detail

| Topic | The plan |
| --- | --- |
| Premium | $299 per farm per year (Australia: A$299 where shown) for rainfall on every supported field, prepared FSA reports, and the business tools (including grain, equipment, landlords, and related paperwork). |
| What free includes | A regular record book: 50 active fields and rainfall on two fields, plus history, sync, and backup. No ads and no public Ask the Book. |
| History, sync, and backup | Stay part of the free record book. Do not upsell by thinning everyday use. |
| Report preview | A watermarked or first-page preview of the farm’s own FSA or landlord report, with the upgrade button on that screen. It must be enforced on the server so a free farm cannot pull the full file. Do not publish preview copy until the preview exists. |
| Upgrade reminder | An in-app note for US farms in the weeks before the July 15 FSA acreage deadline, after the preview exists. Do not use that date for Australia, and do not send email unless Will asks. |
| Fields over the cap | Stay readable and are never deleted. Extra fields go read-only. |
| After a cancel or downgrade | Premium lasts through the paid-through date. After that, grain, equipment, landlord records, extra fields, and attachments stay readable and exportable. New Premium edits stop. Entries already queued offline finish syncing. The farm returns to the free record book, not a locked book. |
| Default rainfall slots | Start rainfall on the two largest eligible fields once, tell the farmer which ones, and let them change the pair. Do not reshuffle them when acreage changes. |
| Unused farms | Pause rainfall only for unused free farms after 60 days with no sign-in, app open, or saved record. Background collection and silent or automatic sync do not reset the clock. Paying and Premium farms keep collecting. Returning users should see when collection stopped and where coverage is incomplete (labeled gaps, not silent zeros). |
| Photos | Move spray photos into file storage now, while there are none to migrate. Start the cap at 25 MB and enforce it against what is actually stored. Do not raise the cap or advertise 100 MB or 2 GB until pictures live in file storage. Do not invent an unlimited Premium photo allowance until that is decided. |
| Where rainfall is promised | Do not promise automatic field rainfall outside the contiguous United States (MRMS). |
| Headline | Keep: “Keep field work and FSA paperwork in one place.” Social headline remains “Field records in. FSA paperwork out.” Free recordkeeping, with prepared FSA reports in Premium. Do not imply that prepared FSA worksheets are free. |
| Cost language | Treat about $45 to $70 a month as an initial budget to test, not a promise through 1,000 farms. Upgrade hosting from measured usage. |
| Complimentary farms | Stay on the full product. Complimentary Premium is limited to one already-decided owner farm, with no expiry. Check by farm id. Do not name that farm in public copy or legal wording. |
| Existing trial farms | They finish their three calendar months (about 92 days), then land on free instead of going read-only. Until that stored end date they get a plain in-app note, including on iPhone (today’s trial banner is hidden there). After the date, the server falls back to Free automatically — no cron “conversion” and no view-only lock. New-farm provisioning must stop issuing trial dates; leave existing trial history alone. |
| Existing-trial in-app note | “Your current access continues through {date}. After that, your farm moves to the free record book, and you can keep using it.” |
| Hero / signup line | “Free record book. No card needed. Premium is $299 per farm per year.” Do not use “Free to start,” which can read like a trial. |
| Stale 122-day wording | Take it out of the project description and docs if this is built. Checkout already copies the farm’s three-month `trial_ends_at`. |
| Enforcement | Rainfall and paid-tool caps must be enforced on the server in the collector, the backfill, and the separate Rain API, not only in the app. App rain requests currently pass coordinates without an Authorization header; the Rain API needs tenant and entitlement checks. The report preview must be enforced on the server too. Prepared reports are built in the client today, so hiding a button is not enough. |
| Why someone would upgrade | Rainfall on more than two fields, prepared FSA reports, and the business tools — not the field list. |
| What stays out | Do not put back a 10-field trial rainfall cap: there is no trial. Do not add a 30-day money-back guarantee to this plan as a new marketing promise. The existing 30-day full refund on a paid charge is already in the attorney-approved refund policy and stays; do not lead with it as the trial replacement. No ads. No public Ask the Book. |
| Do not use as upgrade pressure | Cutting the free field list below 50; hiding history, sync, backup, or exports; making the whole farm read-only after they decline Premium; watermarking the everyday record book. |

### Facts that shape the plan

- The running code sets `trial_ends_at` to now plus 3 months (about 92 days) via `ensure_user_farm()` on farm create. Checkout copies that farm deadline into Stripe. It does not start a 122-day Stripe trial. 122 days is leftover from the old 4-month trial and still appears in some docs.
- There is no trial for new farms. Trial language comes out of the app, landing, signup, legal pages, docs, and marketing before anything goes live.
- Spray photos are saved today as base64 inside the notes field, not in the file-storage bucket. As of the last Ops check there were 46 current spray records and none with an embedded photo.
- As of the last Ops check the database was about 27 MB of the 500 MB free limit, with 8 farms and 46 active fields out of 52. No live farm was over 50 fields.
- Supabase is still on the free plan, which has no automatic platform backups. Recovery is the nightly copies on Will’s PC plus Google Drive, keeping the last 14, with a monthly test restore.
- PR #89 is a client-only whole-farm view-only gate behind `VITE_BILLING_ENFORCE`. After a trial ends it would block planting, spraying, harvesting, fields, recipes, and backup restore. That conflicts with landing on free. Do not enable `VITE_BILLING_ENFORCE` or merge #89 as a post-trial lock. Feature-level Free/Premium entitlements are needed instead.
- PR #90 accepts a Sentry DSN and stays inactive until that value is set. The privacy policy currently says crash reports are not sent; update privacy text and App Store Connect privacy answers before setting a DSN.
- A 14-day past-due grace after a failed renewal is current code behavior, not a new pricing decision.

### Still open (do not invent an answer)

- A new 30-day money-back marketing promise is held out of the adopted plan. Keep the existing 30-day refund on a paid charge as already approved.
- Specific upsell tactics beyond the hooks above are not all locked yet. Do not cripple the free record book to create them.
- If a farm is already over 50 fields when it lands on free, do not silently pick which 50 stay writable. The working recommendation is to tell the farmer and let them choose, the same way they can change the rainfall pair; extras stay readable and are never deleted. This is not yet locked by Will.
- An unlimited Premium photo allowance is not decided. Do not invent one.
- Live billing remains a later January decision and still needs Will’s explicit OK.

### Standing rules that still apply

- Will releases the iPhone app himself from App Store Connect (manual release). Bots do not publish it.
- Stripe stays in test mode until January. Turning on live billing still needs his explicit OK at that time.
- Questions for Will go through CEO, one at a time, each with a recommendation.
- Complimentary access stays as already set: one owner farm only, with no expiry. Do not name that farm in public copy.

### Hold until Will says so

- No free-tier or Premium feature gates in the live app until he approves them.
- No published landing, signup, or legal wording changes until he approves them.
- No switch from Stripe test mode, and no real charges.
- Do not put the iPhone “What’s new” line on the website before he releases the app.

### Attorney should review before any legal publish

- Replacing the old trial-then-read-only language with the free record book and optional Premium.
- Farms already on a trial keep current access through their stored end date, then land on free.
- After cancel or a lapsed payment the farm returns to free, not a locked book.
- Keep the existing 30-day refund on a paid charge (already approved — do not market it as a new promise).
- The unused-rainfall pause.
- Complimentary Premium wording without naming a farm.
- The privacy photo sentence if photos move to file storage.
- Leave the AI “Ask” wording and the cookie-free Vercel analytics sentences as they are.
- GST stays out.

---

## Part 2 — Customer-facing wording packet

# AcreLedger free-tier wording — HUMANIZED DRAFT (not published)

*Copy Humanizer pass, 2026-11-08. Source: `free-tier-copy-2026-11-08-DRAFT.md`. Same sections and rows as the source. Internal notes, locked facts, attorney list (§7), and coordination (§8) are unchanged. Legal FREE-TIER-DRAFT files were not touched. After Humanizer, Growth aligned three locked-fact lines: rainfall starts on the two largest fields and the farmer can change the pair; customer copy says “50 active fields” when stating the cap; and “Free to start” became “Free record book. No card needed.” (or “Each farm starts on the free record book”) so it does not read like a trial. Changes list at the end.*

**Status:** Draft only. Written 2026-11-08 (America/Chicago) after Will adopted the permanent free tier instead of a trial. Nothing here is live. Do not publish landing, legal, docs, in-app, App Store, or marketing changes until Will separately says so. Legal wording goes to Will and his attorney before any publish. Customer-facing lines still go through Copy Humanizer, then to Will through CEO.

**This packet replaces** the 3-month trial copy in `trial-3mo-copy-HUMANIZED.md` and the stale pricing line in `OCT1-FINAL.md` (`$299/year after a 4-month trial`). Approved Oct 1 strings that are not about price or trial stay as they are unless noted.

**Facts locked by Will (via CEO, 2026-11-08):**
- Permanent free recordkeeping, not a trial.
- New farms start free from day one: 50 active fields, automatic rainfall on two fields.
- Premium is $299 per farm per year (Australia: A$299) for rainfall on every supported field, prepared FSA reports, and the business tools (grain, equipment, and landlord features where offered).
- Existing trial farms finish their three months, then land on free, not read-only.
- Complimentary access stays on one already-decided owner farm only and does not expire. Do not name that farm in public copy.
- Stripe stays in test mode until January. Live billing still needs Will’s explicit OK.
- Upsell without making the free record book less useful. The hook is full rainfall, prepared reports, and business tools — not a smaller field list or a locked book.
- Remove trial language from the app, landing, signup, legal pages, docs, and marketing.
- Ask the Book stays out of public marketing.
- Do not say the iPhone app is available until Will releases it himself.
- GST wording stays out.
- Do not advertise photo storage as 100 MB or 2 GB. Working cap starts at 25 MB after photos move to file storage.
- Automatic rainfall is for fields in the contiguous United States. Do not promise it outside that area, including Australia.
- No ads. No mass email unless Will asks.

---

## 1. Upsell ideas that do not hurt free usefulness

These are the upgrade hooks. They do not shrink the record book.

1. **Show them their own report, not a blank lock.** When someone opens a prepared FSA or landlord report on a free farm, show a watermarked or first-page preview built from *their* records, with an upgrade button on that screen. Do not publish this line until the preview actually exists and is enforced on the server so a free farm cannot download the finished file. This is the stand-in for “try Premium first.”
2. **Let them pick which two fields get rain.** Start rainfall on the two largest eligible fields, tell them which ones, and let them change the pair. If they try to add a third, explain they can swap which two are automatic, or upgrade for every field. Do not reshuffle the pair when acreage changes.
3. **One in-app note before the US acreage deadline.** For US farms only, a single note in the weeks before July 15, and only after the report preview exists. Do not use that date for Australia. No email unless Will asks.
4. **Keep the prepared-reports area visible.** Farmers should see that FSA worksheets and landlord summaries exist, preview them, and understand they are Premium — not hunt for a hidden menu.
5. **After someone cancels Premium,** they keep it through the date they already paid for, then return to the free record book. Extra fields stay readable and exportable and are never deleted. Queued offline saves still finish.

Do not use these as upgrade pressure:
- Cutting the free field list below 50
- Hiding history, sync, backup, or exports
- Making the whole farm read-only after they decline Premium
- Ads
- Watermarking the everyday record book
- Ask the Book or any public AI feature
- A new “30-day money-back” marketing promise (see attorney flags: a 30-day refund on paid charges is already in the attorney-approved policy; do not lead with it as the trial replacement)

---

## 2. Landing page

Live site (www.acreledger.app, checked 2026-11-08) still says “3-month free trial, no card needed. Then $299 per farm per year” in the hero, the price block, and the cost FAQ. It also lists FSA-578 worksheets, grain bins, landlord summaries, and “PDF and CSV compliance exports” as included in every book. That over-promises Premium tools. Drafts below split free recordkeeping from Premium reports.

**Headline (keep):** Keep field work and FSA paperwork in one place

**Subhead:** AcreLedger is the field book that rides in the truck. Log planting, spraying, fertilizer, harvest, and hay by field, even with no signal. Prepared FSA reports, landlord summaries, and rainfall on every supported field are part of Premium.

**Platform line:** Works in any web browser.
*(Do not say “iPhone and any web browser” on the landing until Will releases the iPhone app. After he releases it, this can become: “iPhone app and any web browser.”)*

**Hero price line:** Free record book. No card needed. Premium is $299 per farm per year.

**Ribbon:** Free recordkeeping · 50 active fields · Rain on two fields · Premium $299/year

**What you can do (three bullets):**
1. Log planting, spraying, fertilizer, harvest, and hay by field
2. Add fields by hand the same day, or import FSA tracts when you have them
3. Keep history, sync, and a full backup on the free book. Prepared FSA reports and landlord summaries are part of Premium.

**Feature cards (rewrite the live “every book” list):**

- **The field book, kept current.** Planting, spraying, fertilizer, harvest, and hay stay with each field instead of in a notebook and a camera roll.
- **Spray records that match the work.** Each field keeps its own product, EPA number, rate, acreage, and weather.
- **Works where signal doesn’t.** Save the entry on your phone. It syncs when you’re back in range.
- **Rainfall on two fields, free.** We’ll start automatic rainfall on your two largest fields in the contiguous US and tell you which ones. You can change that pair any time. Rainfall on every supported field is part of Premium.
- **Paperwork for the office.** You can preview a prepared FSA or landlord report from your own records. The finished worksheet is part of Premium.
  *(Hold the preview sentence until that preview ships.)*
- **Your records stay yours.** Export what you logged, or download a complete backup, on the free book or on Premium.

**Free vs Premium block**

*The free record book*
- Field records on up to 50 active fields
- Add fields by hand or import FSA tracts when you have them
- Automatic rainfall on two fields in the contiguous US — we start with your two largest, and you can change the pair
- History, offline entry, and cloud sync
- Export and a full farm backup
- No ads, and no card needed

*Premium — $299 per farm per year*
- Automatic rainfall on every supported field
- Prepared FSA reports
- Landlord summaries and the business tools (grain, equipment, and landlord features)
- You can preview a prepared report from your own records before you subscribe
  *(Hold the preview sentence until that preview ships.)*

**Price card:** Free record book. Premium is $299.00 per farm / year, billed annually.
**Australia note (where AU pricing is shown):** Free record book. Premium is A$299 per farm per year.

**Ticket / details note:** Your farm starts on the free record book the day you set it up, and you don’t need a card. Premium is $299 per farm per year, billed annually, for rainfall on every supported field, prepared FSA reports, and the business tools. Internet service, third-party services, and professional or government filing fees cost extra.

**CTA:** Create account (primary) / Sign in (secondary)

**Optional footer (keep):** Working documents for your records and appointments — not a guarantee of FSA acceptance. Follow labels and your county office.

### Landing FAQ (trial language removed)

**Do I need FSA boundary files before I start?**
No. Add fields by hand and start recording the same day. Import FSA tract and CLU boundary files whenever your office provides them. Your earlier records stay with their fields.

**Does AcreLedger replace official USDA or product-label requirements?**
No. AcreLedger creates working documents from the information you enter. Follow product labels and confirm filing requirements with your county FSA office or other authority.

**What does AcreLedger cost?**
Each farm starts on the free record book. You can keep records on up to 50 active fields, with automatic rainfall on two of them, and no card is needed. Premium is $299 per farm per year (A$299 in Australia) for rainfall on every supported field, prepared FSA reports, and the business tools. If you never upgrade, you keep the free record book. You can export your records any time, and skipping Premium never deletes anything.

**Does it work without cell service?**
Yes. Entries save on your phone first and sync when you are back in range.

**Who owns the records I keep here?**
You do. Export PDFs and CSVs whenever you need them, or download a complete backup of your farm’s data. AcreLedger keeps the book; the records stay yours.

**Does automatic rainfall work everywhere?**
Automatic rainfall is for fields in the contiguous United States. It isn’t available for fields outside that area, including Australia. You can still log weather by hand.

Do not put the existing-trial transition, complimentary owner-farm access, or the July 15 reminder on the public landing.

---

## 3. Signup, sign-in, and first-run

These Oct 1 strings stay:

- **Signup subtitle:** Set up your farm records
- **Under-logo:** Farm records & compliance
- **Sign-in subtitle:** Sign in to your farm
- **Post-signup next step:** Next: name your farm, add a field (by hand is fine), and log a planting. You can import FSA tracts later.

**Optional add under the next-step line (only if the signup screen currently mentions the trial):** You start on the free record book: records on up to 50 active fields, and rainfall on two of them.

**Signup agreement line (if the live line mentions a trial, replace it):** By creating an account you agree to the Terms of Service, Privacy Policy, and Refund Policy.

Flag the live agreement line for attorney review if we change it. Do not publish a new agreement line until that review.

---

## 4. In-app wording (replaces the 3-month trial table)

Public landing, signup, and new-farm screens have no trial language. The only place “trial” should still appear is a plain in-app note for farms that already started their three months: they keep current access until the original end date, then land on free — not a view-only lock, and not silence.

| Location | Proposed text |
|---|---|
| Billing / plan status | This farm is on the free record book: up to 50 active fields, with rainfall on two of them. Premium adds rainfall on every supported field, prepared FSA reports, and the business tools. |
| Subscribe button | Subscribe ($299/year) |
| Subscribe details | Premium is $299 per farm per year. If you don’t upgrade, or you cancel later, you keep the free record book. |
| After they pick a plan / checkout (test mode until Will turns on live billing) | You’ll go to checkout to start Premium. Your records stay on this farm either way. |
| Trial countdown banners (14 / 7 / 1 days) | Remove. Do not replace with a fake countdown. |
| Existing trial farm, while the trial is still running (web **and iPhone**; today's trial banner is hidden on iPhone, so this note must be shown there too) | Your current access continues through {date}. After that, your farm moves to the free record book, and you can keep using it. |
| Existing trial farm over 50 fields when it lands on free | PLACEHOLDER: chooser copy not written yet. Don't silently pick which 50 fields stay editable. Tell the farmer and let them choose. |
| Existing trial farm, after the trial ends | Your trial is over. This farm is now on the free record book. Your records are safe, and you can keep adding field work. Subscribe to Premium for rainfall on every supported field, prepared FSA reports, and the business tools. |
| Prepared-report gate (after preview exists) | This is a preview of your report. The finished file is part of Premium. |
| Third rainfall field | Rainfall on the free book covers two fields. You can change which two, or subscribe to Premium for every supported field. |
| Rainfall auto-pick notice | We started automatic rainfall on {field A} and {field B}, your two largest fields. You can change that pair any time. |
| Unused-farm rainfall pause | We paused automatic rainfall because nobody signed in, opened the app, or saved a record for 60 days. Premium farms keep collecting. Collection stopped on {date}, so rainfall may be missing for some dates. |
| Payment failed | Your payment didn’t go through. Update your card in the next {n} days to keep Premium. Your records stay safe either way, and you’ll still have the free record book. |
| After cancel, still in the paid-through period | Premium stays on through {date}, the end of the year you’ve paid for. After that, this farm goes back to the free record book. |
| After Premium ends | This farm is back on the free record book. Extra fields stay visible and you can export them. They aren’t deleted. |
| Extra field over the 50-field cap | This field is view-only because this farm is over the free field limit. You can still see and export it. Subscribe to Premium to keep editing every field, or archive another field to free up a spot. |
| Native iOS, view-only field or Premium feature | You can still see and export these records. Manage Premium on the web. |
| US acreage-deadline note (only after the preview exists; US farms only) | Acreage reporting for FSA is due around July 15. You can preview a prepared report from your records, or subscribe to Premium for the finished worksheet. |
| Payment-failed banner switch | Leave this off until live billing is turned on (already Will’s decision). |

Australia: use A$299 wherever a price is shown. Do not show the July 15 note to Australian farms.

---

## 5. Help / docs

Public Wave 1 help was already on hold. When help is published, use the FAQ answers above and add these plain-language notes. Do not publish help until Will says so.

**Which two fields get rain?**
On the free book we start automatic rainfall on your two largest fields and tell you which ones. You can change that pair. The pair does not change just because a field’s acreage later changes.

**What if I go over 50 fields?**
You can still see and export the extra fields. They aren’t deleted. New work goes on the fields within the free limit, unless you subscribe to Premium or archive a field you no longer need.

**My farm started on the old free trial. What happens now?**
If your farm started during the old 3-month trial, your current access continues through that original end date. After that, your farm moves to the free record book, not a locked, read-only book, and you can keep using it.

**Why did rainfall stop?**
On a free farm, if nobody signs in, opens the app, or saves a record for 60 days, we pause automatic rainfall so we aren’t pulling weather for a book nobody’s using. A phone that syncs in the background, or rainfall being collected, does not count as activity. When you come back you’ll see when collection stopped and where coverage is incomplete.

Help files checked in this Growth folder that still mention a trial: `OCT1-FINAL.md` (old 4-month price line), `trial-3mo-copy-DRAFT.md`, `trial-3mo-copy-HUMANIZED.md`, `STATUS-2026-11-01.md`, and the legal FINAL/HUMANIZED/DRAFT files. Those should be marked superseded by this packet once Will approves the new wording. I asked Launch Marketing to stop circulating trial language in marketing drafts.

---

## 6. App Store listing

Checked 2026-11-08: there is no public App Store listing for this AcreLedger (search did not return an Egbert Farms / farm-records / FSA listing). That matches Will releasing the iPhone app himself; it does not appear to be public yet.

Only Will can edit or publish App Store Connect. Suggested listing copy for when he is ready — do not paste this into the store until he decides, and do not say on the website that the app is available until he releases it.

**Name:** AcreLedger

**Subtitle (30 characters max):** Field records and FSA paperwork

**Promotional text (optional, 170 characters):** Keep field work in one book. Free recordkeeping, with rainfall on two fields. Premium adds rainfall on every supported field and prepared FSA reports.

**Description:**
AcreLedger is a farm record book for row-crop operators. Log planting, spraying, fertilizer, harvest, and hay by field, even when you don’t have signal. Your entries sync when you’re back in range.

The free book includes records on up to 50 active fields, automatic rainfall on two fields in the contiguous United States, history, and export. Premium is $299 per farm per year for rainfall on every supported field, prepared FSA reports, and the business tools.

AcreLedger creates working documents from the information you enter. It is not a guarantee of FSA acceptance. Follow product labels and confirm filing requirements with your county office.

Subscriptions are managed on the web, not as an in-app purchase. Your farm records belong to you.

**What’s new (first public version):** First public release of the AcreLedger iPhone app.

**Keywords to avoid:** trial, free trial, 3-month, 90 days, 122 days, read-only after trial.

If the current App Store Connect draft still mentions a trial (Growth cannot see that draft from here), replace those lines with the text above. Will would need to open App Store Connect to confirm.

---

## 7. What the attorney needs to review

The Oct 25 attorney-approved FINAL pages still describe a 3-month trial and then a read-only farm. Those pages must be rewritten before publish. Proposed replacement language is in the matching files under `/workspace/acreledger-growth/legal-drafts/` with the suffix `-FREE-TIER-DRAFT.md`. Effective dates stay blank until publish.

Review these changes:

1. **Terms §3 (Free trial)** — replace with the free record book and optional Premium. Include the transition for farms that already started a 3-month trial (they finish that trial, then land on free, not read-only).
2. **Terms §5 (Failed payments and read-only mode)** — a farm that is not on Premium stays on the free record book. It is not locked read-only. Extra fields over the cap stay readable and are never deleted. After someone cancels Premium they keep it through the paid-through date, then return to free. The 14-day grace period after a failed renewal can stay.
3. **Terms §6–7 and the Refund Policy** — wherever they say the farm becomes read-only after a trial ends or a paid year ends, say it returns to the free record book instead. Keep the existing 30-day full refund on any charge (already attorney-approved). Do not present that refund as a new marketing promise. Flag the risk that someone could take a finished Premium report and then ask for a 30-day refund; the report preview must stay server-enforced so a free or just-refunded farm cannot download the finished file.
4. **Privacy, “Keeping and deleting data”** — it now says unpaid farms stay read-only and that a trial ending never deletes data, it only makes the farm read-only. Unpaid farms should be described as staying on the free record book. A trial ending or a subscription lapsing still never deletes data.
5. **Privacy, photos** — it still says spray photos are saved in the database, not a separate file store. If photos move to file storage, that sentence needs an update.
6. **Signup agreement line** if we change it.
7. **Unused-farm rainfall pause (60 days)** — new operational practice. Decide whether it needs a sentence in Terms (weather/outside data) or Privacy.
8. **Complimentary Premium** — described without naming a farm. Confirm that wording.
9. **GST** — still left out, per Will.
10. **AI “Ask” wording** — leave it in Privacy and the Terms weather/outside-data sentence, because Ask the Book still runs only on the already-decided owner farm. Do not add Ask the Book to landing or marketing.
11. **Vercel Web Analytics wording** — leave the cookie-free, website-only sentences as they are (already matched to the live privacy page).
12. **Prices** — US $299 / Australia A$299 per farm per year, billed annually. Renewal reminder 14 to 30 days before each charge. iOS app still does not sell subscriptions.

Do not turn on live billing, and do not publish these legal pages, until Will and his attorney say so.

---

## 8. Coordination

- Launch Marketing has been asked to stop circulating trial, 3-month / 90-day / 122-day, and read-only-after-trial language.
- Copy Humanizer should edit the landing, FAQ, signup, in-app, help, and App Store lines in this packet. Leave prices, field counts, rain-field counts, dates used as facts, and the legal replacement files as close to this wording as possible so the attorney can review a stable draft.
- Developer: these strings are proposed copy for the free-entitlement build. Do not ship them until Will approves.
- Ops: when a build exists, QA should search the app, landing, signup, legal pages, and help for “trial,” “3-month,” “90 day,” “122 day,” and “read-only” after a trial.


---

## Changes

1. Subhead: broke the colon list into two short sentences ("the field book that rides in the truck. Log … by field, even with no signal"). Reads like talk, same facts.
2. Feature card "Rainfall on two fields, on us." → "…, free." "On us" sounds like software marketing; "free" is plain and true.
3. Feature card "Paperwork when you need the office version." → "Paperwork for the office." Shorter, same meaning. Body unchanged.
4. FAQ "What does AcreLedger cost?": "If you don't subscribe… nothing gets deleted because you didn't upgrade" → "If you never upgrade… skipping Premium never deletes anything." Removes the clunky double "subscribe/upgrade."
5. "Rainfall on every field" → "rainfall on every supported field" in customer lines (subhead, feature card, cost FAQ, ticket note, billing status, subscribe/existing-trial rows, third-field row). Matches the locked fact and the contiguous-US limit; "every field" could read as a promise for fields outside coverage.
6. Billing / plan status: "50 fields and rainfall on two fields" → "up to 50 active fields, with rainfall on two of them." Uses the locked "50 active fields" wording and drops the repeated "fields."
7. Subscribe details: reordered to "If you don't upgrade, or you cancel later, you keep the free record book." Condition first, the way people say it.
8. Unused-farm pause: "Paying farms" → "Premium farms" (matches the plan name); joined the last two sentences so the missing dates are tied to the stop date. 60 days and the three activities (sign in, open app, save record) unchanged.
9. After cancel: "returns to" → "goes back to," added a comma.
10. Help question "What happens if I used to be on a trial?" → "My farm started on the old free trial. What happens now?" Closer to how a farmer would ask it. Answer: "not a locked book" → "not a locked, read-only book," so it plainly answers the read-only worry.
11. Help "Why did rainfall stop?": "collecting weather for an unused book" → "pulling weather for a book nobody's using." Background sync exclusion left word for word.
12. Existing-trial wording (Growth's 4:27 PM CT correction): uses the updated source. The §4 top note and the "while the trial is still running" row say the farm keeps its current access until {date}, then lands on the free record book. Both are left word for word. Nothing says the farm "stays on" the free book during the rest of the trial. The help answer uses the updated "keep your current access" sentence, with only change #10 applied.
13. Existing-trial in-app note (Growth's second update, which replaces #12 for this row): now uses Growth's starting point, "Your current access continues through {date}. After that, your farm moves to the free record book, and you can keep using it." It's based on Developer's line, with "the free record book" instead of the product name "Free" (and {date} written to match the other placeholders). I dropped the extra "records stay safe" sentence to keep the note short, since "keep using it" covers it. I marked the row as web and iPhone. The help answer now uses the same "continues through / moves to the free record book" wording.
14. Added a placeholder row for farms over 50 fields when they land on free. No chooser copy yet. The note says not to silently pick which 50 stay editable, and to let the farmer choose.

**Left word for word:** headline, platform line and its iPhone note, hero price line, ribbon, three bullets, the other feature cards, Free vs Premium block, price card, Australia note, footer, all other FAQ answers, every signup/sign-in string (Oct 1 approved) and the signup agreement line, the subscribe button, checkout, report-gate, auto-pick, payment-failed, after-Premium-ends, over-50-field, iOS, July 15 rows, the other help answers, the full App Store section, §1 upsell ideas, §7 attorney list, §8 coordination.

**Aligned after Humanizer (Growth, 2026-11-08):**
- Rainfall copy now matches the locked rule everywhere: we start on the two largest eligible fields, tell the farmer, and they can change the pair.
- Customer lines that state the cap now say “50 active fields.”
- “Free to start” is now “Free record book. No card needed.” (hero, price card, Australia note) or “Each farm starts on the free record book” (cost FAQ), so it does not read like a trial.

**Still for Will / attorney / the team:**
- **Subscribe details/Payment failed** promise "you keep the free record book" after cancel or a failed payment. That's the new model, but it ties to Terms §5 and the refund policy, so it should match whatever the attorney approves.
- **App Store "What's new"** says "First public release of the AcreLedger iPhone app." Fine for the store listing when Will releases it, but it must not be reused on the website before then.
- **Existing trial note must show on iPhone.** Today's trial banner is hidden there, so Developer needs to show it on iPhone too. The source row "Native iOS, view-only field or Premium feature" doesn't cover this.
- **Over-50-field chooser** for trial farms landing on free is still a placeholder and needs final copy once the flow exists.
- **Complimentary access** doesn't appear in any customer line (only the internal facts and §7 item 8). Nothing to name, and no farm is named publicly.


---

## Part 3 — Terms of Service replacement draft

# AcreLedger Terms of Service
> **DRAFT for attorney and Will review (2026-11-08).** Based on the attorney-approved FINAL (Will, Oct 25, 2026). Not published. Do not publish until Will and his attorney say so. GST wording stays out.
>
> **What changed from the Oct 25 FINAL:** Section 3 no longer describes a 3-month free trial. It now describes the free record book and optional Premium. Section 5 no longer makes a farm read-only when a trial ends or someone does not subscribe; the farm stays on (or returns to) the free record book. Extra fields over the free cap stay readable and are never deleted. After a Premium cancel, access lasts through the paid-through date, then returns to free. A sentence was added for farms that already started a 3-month trial. Mentions of a trial ending in section 7 were updated. The existing 30-day refund on charges is unchanged.

Last updated: [effective date, set when published]

These terms are an agreement between you and **Egbert Farms, LLC** ("we", "us"), which provides AcreLedger and is based in Henry County, Missouri, USA. They apply to the AcreLedger web app (acreledger.app, acreledger.vercel.app) and iOS app. By creating an account you agree to these terms. If you don't agree, don't use AcreLedger.

## 1. What AcreLedger is
AcreLedger helps you keep farm records: fields, planting, spraying, fertilizer, harvest, grain bins, rainfall, FSA acreage and related reports. It keeps records. It is **not** agronomic, legal, tax, insurance or government-program advice. You are responsible for checking anything you file with FSA, your crop insurer, a lender, a regulator or anyone else.

## 2. Your account
- You must be at least 18 and able to agree to a contract.
- Keep your login private. You are responsible for anything done under your account.
- Whoever creates a farm is its owner. Owners can invite members, and owners are responsible for who they invite and what access they give.

## 3. Free record book and Premium
- Each new farm starts on the **free record book** the day the farm is created. No card is needed. The free record book includes field records on up to **50 active fields**, automatic rainfall on **two fields**, history, sync, and export.
- **Premium** is optional. It adds automatic rainfall on every supported field, prepared FSA reports and landlord statements, and the business tools we offer (such as grain, equipment, and landlord features).
- Automatic rainfall is for fields in the contiguous United States. It may be late, wrong, or unavailable. You can always log weather by hand.
- We may pause automatic rainfall on a free farm if nobody signs in, opens the app, or saves a record for 60 days. A paying Premium farm keeps collecting. When you come back, you can see when collection stopped.
- We may give a farm complimentary Premium access. Complimentary access does not expire unless we tell that farm otherwise.
- If your farm was created while we offered a 3-month trial, you keep your current access until that trial's original end date. When it ends, the farm moves to the free record book described above. It does not become read-only.

## 4. Price and billing
- **US: $299 per farm per year. Australia: A$299 per farm per year.**
- Billing is yearly, in advance, through our payment processor Stripe. We never see or store your full card number.
- Your subscription renews automatically each year until you cancel. You can cancel any time in Settings → Billing.
- We'll email you a renewal reminder 14 to 30 days before each yearly charge, with the charge date, the amount, and how to cancel.
- If we change the price, we will tell you at least 30 days before your next renewal. The new price starts at that renewal.
- Prices may not include taxes required where you are.
- The iOS app does not sell subscriptions or show prices. Subscriptions are managed on the web.

## 5. Failed payments and what happens without Premium
- If a renewal payment fails, you get a **14-day grace period** with full Premium access while you sort it out.
- If you never subscribe to Premium, or Premium lapses or is cancelled, the farm stays on or returns to the **free record book**. You can still sign in, view everything, export your data, and add or change records within the free limits.
- If you cancel Premium, you keep Premium until the end of the period you have already paid for. After that the farm returns to the free record book.
- Fields above the free active-field limit stay visible and exportable. **We do not delete your farm records because you stopped paying or did not upgrade.** You can't add or change those extra fields unless you subscribe again or bring the farm back under the free limit.
- Prepared reports and other Premium-only files are not available on the free record book. Where we offer a preview of a report, it is a preview of your own records, not the finished file.

## 6. Cancellations and refunds
If you ask within 30 days of any charge, we refund it in full. After 30 days there is no refund for that charge. Duplicate charges, charges made after you cancelled, and billing errors are always refunded. Your rights under the Australian Consumer Law still apply. See the Refund Policy for details.

## 7. Your data
- **Your farm data belongs to you.** The only permission you give us is to store, process and display it so we can run AcreLedger for you and the people you invite.
- You can export your data at any time, including on the free record book and after a subscription ends.
- Our Privacy Policy explains how we handle personal information.
- If you ask us to delete your account, we remove your personal and farm data within 30 days, and it is gone from backups within 90 days. We keep billing records for 7 years for tax purposes. Details are in the Privacy Policy. Ending a past trial, staying on the free record book, or letting a subscription lapse never deletes data.

## 8. Fair use
Don't: break the law with AcreLedger; try to access another farm's data; probe, overload or attack the service; resell it without our permission; or upload anything you don't have the right to upload. We may suspend accounts that do these things. Where reasonable, we will warn you first and still let you export your data.

## 9. Weather, maps and outside data
Weather, rainfall, map imagery, road lookups and AI answers come from outside services or are estimates. They can be wrong, late or missing. Don't rely on them alone for spraying, safety, compliance or financial decisions.

## 10. No guarantees
We work hard to keep AcreLedger running and your data safe, but **we provide it "as is" and "as available."** We don't promise it will always be up, error-free, or that any particular feature will stay the same. We may change, add or remove features. Keep your own exports of any records that matter to you. Nothing here limits rights you have by law that can't be waived (see section 14 for Australia).

## 11. Limit of liability
To the extent the law allows, we aren't liable for indirect or consequential losses (such as lost crops, profits, payments, program benefits or penalties). Our total liability for any claim is limited to **the fees you paid us for AcreLedger in the 12 months before the claim**. This limit doesn't reduce any rights or remedies you have under the Australian Consumer Law or other laws that can't be excluded.

## 12. Ending the agreement
You can stop using AcreLedger and cancel any time. We may stop offering AcreLedger. If we do, we will give you at least **60 days' notice** by email and in the app, and you can export all of your data during that time.

## 13. Law and disputes
These terms are governed by **the laws of the State of Missouri, USA**. Any dispute will be handled in the state or federal courts serving Henry County, Missouri. If you are an Australian consumer, this doesn't take away your rights under the Australian Consumer Law (see section 14). Please email us first at acreledgerapp@gmail.com. Most problems can be fixed that way.

## 14. Australian customers
**For customers in Australia.** Our services come with guarantees that cannot be excluded under the Australian Consumer Law. For major failures with the service, you are entitled to cancel your contract and get a refund for the unused portion, or compensation for its reduced value. You are also entitled to be compensated for any other reasonably foreseeable loss or damage. If a failure does not amount to a major failure, you are entitled to have problems with the service fixed in a reasonable time and, if this is not done, to cancel and get a refund for the unused portion. Nothing in our Terms or Refund Policy limits these rights.

## 15. Changes to these terms
We may update these terms. For important changes we will tell you in the app or by email before they take effect. Using AcreLedger after that means you accept the new terms.

## Contact
acreledgerapp@gmail.com


---

## Part 4 — Refund Policy replacement draft

# AcreLedger Refund Policy
> **DRAFT for attorney and Will review (2026-11-08).** Based on the attorney-approved FINAL (Will, Oct 25, 2026). Not published. Do not publish until Will and his attorney say so. GST wording stays out.
>
> **What changed from the Oct 25 FINAL:** The opening "Try it free first" trial paragraph is now the free record book. After a paid year ends, the farm returns to the free record book instead of becoming fully read-only. The existing 30-day full refund on any charge is unchanged.

Last updated: [effective date, set when published]

AcreLedger is provided by Egbert Farms, LLC ("we").

## Start on the free record book
Every new farm starts on the free record book with no card. You can keep field records on up to 50 active fields, with automatic rainfall on two fields. Premium is optional if you want rainfall on every supported field, prepared FSA reports, and the business tools.

## Cancelling
- **Renewal reminder:** We'll email you a renewal reminder 14 to 30 days before each yearly charge, with the charge date, the amount, and how to cancel.
- You can cancel any time in **Settings → Billing**. You won't be charged again.
- Your farm keeps Premium until the end of the year you've paid for. After that it returns to the free record book. You can always view and export your data. We don't delete it.

## Refunds
- **30-day full refund:** if you ask within 30 days of any charge (your first payment or a yearly renewal), we refund that charge in full.
- **After 30 days:** no refund for that charge. You keep Premium until the end of the paid year, then the farm returns to the free record book.
- **Always refunded, at any time:** duplicate charges, charges made after you cancelled, and billing errors on our side.

## Failed payments
If a renewal payment fails, you have 14 days to update your card before the farm returns to the free record book. There are no late fees.

## Australian customers
Nothing in this policy limits your rights under the Australian Consumer Law. If the service has a major failure, you may be entitled to a refund or other remedy regardless of the 30-day rule above.

## How to ask
Email **acreledgerapp@gmail.com** with your farm name and the email address on your account. Approved refunds go back to the original card through Stripe and usually take 5–10 business days to show.


---

## Part 5 — Privacy Policy replacement draft

# AcreLedger Privacy Policy
> **DRAFT for attorney and Will review (2026-11-08).** Based on the attorney-approved FINAL (Will, Oct 25, 2026), including the cookie-free Vercel Web Analytics wording and the AI “Ask” wording. Not published. Do not publish until Will and his attorney say so. GST wording stays out.
>
> **What changed from the Oct 25 / Nov 1 FINAL:** The data-retention bullets no longer say a trial ending or a lapsed subscription makes the farm read-only. They now say the farm stays on or returns to the free record book, and that this never deletes data. The Vercel analytics sentences and the AI “Ask” section are unchanged. The photo sentence still says photos are saved in the database, not a separate file store — update that sentence if photos move to file storage.

Last updated: [effective date, set when published]

AcreLedger is provided by **Egbert Farms, LLC** ("we"), which runs it from Henry County, Missouri, USA. This policy explains what we collect, why we collect it, and who helps us run the service. Questions: **acreledgerapp@gmail.com**.

## The short version
- Your farm records are yours. We use them only to run AcreLedger for you.
- **We don't sell your data and we don't show ads. On the website only (not the iPhone app), we use Vercel Web Analytics to count page views. It doesn't use cookies, we don't send user IDs, emails, or farm data, and page addresses are cleaned before they're sent.**
- A few outside services help us run the app (listed below). They get only what they need.

## What we collect
**Account info:** your email address, your login details (handled by our login provider), and your name if you enter it.

**Farm records you enter:** farms, fields and boundaries, crops, planting, spraying, fertilizer and input records, harvest and grain bin records, equipment, work requests, notes, and team members you invite.

**FSA and land data you import:** FSA tract and CLU information, farm/tract/field numbers, acreage, and FSA-578-style planting report details that you enter or import (including shapefiles, which are read on your device).

**Location:** field locations and boundaries you draw or import. If you allow it, your device's current location *while the app is open*, to set field coordinates and get local weather. We don't track your location in the background.

**Voice (optional):** if you use "ask by voice," your device's speech recognition (Apple, or your browser) turns speech into text. We receive the text, not the audio.

**Photos (optional):** if you allow camera or photo-library access, you can take or attach photos of spray tickets and product labels. The photos are saved as part of that spray record in our database (not in a separate file store). They are included in your backups and exports. You can turn off camera and photo access in your device settings.

**Error logs:** when something goes wrong, the app logs the error on your device only. We don't send crash reports to anyone. If we ever add a crash-reporting provider, we'll update this policy first.

**Billing:** handled by Stripe. We receive your subscription status, the email on the account and a Stripe customer ID. **We never see or store your full card number.**

**Saved on your device:** the app keeps a copy of your records and settings on your phone, tablet or computer so it works offline.

## Who helps us run AcreLedger
| Service | What it does | What it receives |
|---|---|---|
| Supabase | Login and database where your records are stored (hosted on Amazon Web Services in Oregon, USA) | Account info, all farm records and spray-record photos |
| Vercel | Hosts the website and app servers; counts website page views (cookie-free Vercel Web Analytics) | Normal web request data (e.g. IP address); for analytics, cleaned page addresses with no user IDs, emails, or farm data |
| Stripe | Payments and billing | Email, payment details, farm/user ID |
| Visual Crossing | Weather forecasts and history | Field or device location (coordinates) |
| Rain API (rain-api.vercel.app) | Rainfall totals per field | Field coordinates/boundary and date ranges |
| OpenRouter (and the AI model provider it routes to) | Answers questions in "Ask" | Your question and the farm records needed to answer it |
| Esri (ArcGIS) | Satellite map imagery | Map area being viewed (standard tile requests) |
| OpenStreetMap Nominatim | Looks up nearest road for work requests | Field coordinates |
| Google Fonts | Website fonts | Standard web request data |
| Apple | iOS app delivery; on-device speech recognition | As set by Apple |

**About the AI assistant ("Ask").** Using the assistant is **optional**. When you use it, your question and the farm records needed to answer it are sent through OpenRouter to an outside AI model provider. **That provider may log your question and records, or use them to improve its AI models.** Don't type anything into the assistant that you wouldn't want shared. The assistant can only read your own farm and can't change your records. If you don't use it, nothing is sent to these providers.

## Why we use it
We use your data to run AcreLedger, keep your account secure, sync your devices, show weather and rainfall, produce reports, bill you, answer support emails, and meet our legal duties.

## Sharing
We share data only with the services above, with people you invite to your farm, if the law requires it, or if the business is sold (in which case this policy still applies to your data). We don't sell it.

## Keeping and deleting data
- While your account exists we keep your records, including when your farm is on the free record book or after a subscription ends. Unpaid farms are never deleted.
- When you delete a record, it is first hidden ("soft deleted") so mistakes can be undone.
- **If you ask us to delete your account,** we remove your personal information and farm data within **30 days**. It is gone from our backups within **90 days**. Billing records (such as invoices and payment history) are kept for **7 years** for tax purposes. Export anything you want to keep before you ask.
- Deleting your account is different from a past trial ending, staying on the free record book, or a subscription lapsing. **Those never delete your data;** the farm stays on or returns to the free record book.
- You can export your data any time.

## Where your data is stored
Your account and farm records, including photos, are stored in the United States, in a database hosted on Amazon Web Services in Oregon (us-west-2) by Supabase.

## Security
Your data travels over encrypted connections. In the database, each farm's data is walled off from every other farm. No system is perfect. If a breach affects you, we'll tell you as the law requires.

## Your choices and rights
You can view, export, correct or delete your data in the app, or email us. You can turn off location, camera, photo and microphone access in your device settings. Residents of some US states may have extra rights; email us and we'll honor them.

## Children
AcreLedger is for adults running farm businesses. We don't knowingly collect data from children under 13.

## Australia
**If you are in Australia.** We handle your personal information in line with the Australian Privacy Principles where they apply to us. Your information, including your farm records and photos, is stored overseas in the United States, in a database hosted on Amazon Web Services in Oregon (us-west-2). It is also processed in the United States by the other service providers listed in this policy. You can ask to see or correct your personal information, or complain about how we've handled it, by emailing acreledgerapp@gmail.com. We will reply within 30 days. If you ask us to delete your account, your personal and farm data is removed within 30 days and is gone from backups within 90 days. Billing records are kept for 7 years for tax purposes. If you use the optional AI assistant, your question and the farm records it needs are sent through OpenRouter to AI model providers, which may be outside Australia and may log them or use them to improve their models. If you're not satisfied, you can contact the Office of the Australian Information Commissioner (oaic.gov.au).

## Changes
We'll post updates here and tell you in the app or by email about important changes.
