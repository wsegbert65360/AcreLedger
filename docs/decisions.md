# Decisions

One line each: the date, the decision, and why. Newer first. This log is seeded from Recent Changes and from `docs/plans/`. A plan that has not been built says so.

- **2026-11-19** — County means where the land physically lies, from boundary geometry against Census TIGER counties, never the FSA office and never field notes. Production for a split field is allocated by mapped share and labeled estimated, because no schema field records production per county. Existing farms are filled by a previewed backfill, not silently, and historical reports change only when geometry changes or the farmer recalculates. Not deployed; the boundary load is a reviewed SQL file.
- **2026-11-15** — Cattle events and head transfers call `assert_premium(..., 'cattle_events')`. The cattle CSV is locked only in the client, because the file is built on the device from rows the farm already has. Deleting an event stays available on a free farm.
- **2026-11-14** — Cattle is optional and off by default (`farms.runs_cattle`). Groups, pasture moves, and an explicit head-count edit stay free. Multi-row writes are RPCs so a move or a transfer cannot leave the head count half-updated.
- **2026-11-15** — The farm-write guard also scans `supabase/functions/`. The seven rainfall upserts in `mrms-backfill`, `mrms-daily`, and `mrms-hourly` stay, with an allowlist comment, because they write radar rows on a natural key. No other banned write was found there.
- **2026-11-15** — Ask the Book stays on for the owner's farm only and stays out of marketing. The owner said keep it.
- **2026-11-14** — A harvest scale ticket is asked only for a town load, and a blank ticket is never a fall-worksheet warning. A bin harvest has no ticket to collect (`12450cd`).
- **2026-11-13** — Landlord and farm-owner summaries are one row per field per crop, with totals per crop, because different crops are not one pile of bushels. Report PDFs are US Letter with a shared AcreLedger footer and no price, trial, or sign-up line, because the same PDFs are made on iOS. New tank-mix products default to `fl oz/ac` so a dry ounce is not stored by mistake. Shipped as 3.6.3.
- **2026-11-13** — A free farm at the 50-field cap can still undo a pre-season reset. The field-cap guard does not count a stored field that a restore replays. A rainfall slot whose coordinates were cleared reads empty instead of raising `premium_required:rainfall`. A legacy `trialing` Stripe row displays as Free.
- **2026-11-13** — Do not add a second person to a farm unless the owner reverses that. The product is one account per farm (`docs/plans/2026-11-13-second-farm-member.md`). Not built.
- **2026-11-13** — Activation counts should come from rows the app already stores. Do not add an analytics SDK (`docs/plans/2026-11-13-activation-metrics.md`). Not built.
- **2026-11-13** — Onboarding should lead with CLU import after the farm name, and `parseCluFile` stays the only importer (`docs/plans/2026-11-13-clu-first-onboarding.md`). Not built.
- **2026-11-13** — A shared optimistic-mutation helper is planned, starting with tillage. The eight steps stay in `docs/agents/data-safety.md` until that helper exists. Not built.
- **2026-11-13** — An optional farmer-toggled "Made with AcreLedger" line on the landlord PDF was planned. What shipped in 3.6.3 is a shared footer on every report page, with no price or sign-up wording.
- **2026-11-10** — Free farms can undo the latest pre-season reset for 30 days. Uploading a backup file stays Pro, so a free farm cannot replace the book from a file.
- **2026-11-09** — The product on main is a permanent free record book plus Pro at $299 per farm per year. There is no trial. Spray photo capture is removed. Leave `ENTITLEMENTS_MODE` off until the owner says otherwise.
- **2026-11-01** — `farm_comps` is service-managed complimentary access, and `billing_audit_log` records insert, update, and soft-delete. Clients have no policies on the audit log, and there is no DELETE trigger.
- **2026-10-31** — Ask the Book does not show a standing disclaimer under answers. Provider facts stay in the privacy policy (`docs/plans/2026-08-26-ai-assistant.md`).
- **2026-10-19** — The billing allowlist is server-only (`BILLING_ALLOWLIST`). An empty list fails closed.
- **2026-10-17** — US spray compliance stays the `us-epa` profile. Australia is a separate profile behind the AU pilot gate, so a US farm is not switched by accident.
- **2026-10-15** — Backup restore is gated to the farm owner and admin in the database function. The client check is not the gate.
- **2026-10-13** — Native builds must use the weather proxy. The Visual Crossing key is not shipped in the app.
- **2026-10-07** — Equipment meter writes go through tenant-checked RPCs. Do not replace them with a client read/compare/write.
- **2026-10-02** — Web password recovery exchanges the PKCE code only on `/auth?mode=recovery`. A failed exchange is not treated as the existing session.
- **2026-09-10** — Owner disaster recovery is whole-project tooling, not a customer Drive button. Deployment and the live drills are still unproven (`docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md`).
