# AcreLedger iOS Release Runbook — October 1, 2026

## Release gates

- [x] Apply all pending Supabase migrations, including
  `20260910230451_account_deletion_requests.sql`.
- [x] In Supabase Authentication → URL Configuration, add these redirect URLs:
  - `com.wsegbert.acreledger://auth/recovery`
  - `https://acreledger.vercel.app/auth?mode=recovery`
- [ ] Confirm the production CodeMagic `appstore` environment group provides
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, App Store Connect credentials,
  and signing credentials.
- [ ] Point the App Store privacy URL and support URL at live, non-parked pages.
  The current `acreledger.com` domain must not remain parked at submission.
- [ ] Mirror `ios/App/App/PrivacyInfo.xcprivacy` in the App Store Connect privacy
  questionnaire: email address, user ID, precise location, and other user content;
  linked to the user; app functionality; no tracking.
- [ ] Complete the App Store Connect age-rating questionnaire and export
  compliance answers.
- [ ] Assign an owner to review `account_deletion_requests` at least weekly,
  complete each request within 30 days, remove account-associated data unless
  legally required to retain it, and notify the requester when complete.
- [x] Run a CodeMagic build from `main`; confirm the Xcode 26 gate, tests,
  privacy manifest validation, signed IPA creation, and TestFlight upload pass.

## TestFlight device checks

- [ ] Fresh install: create an account, verify email, and finish onboarding.
- [ ] Sign out and back in; confirm the session survives an app restart.
- [ ] Request a password reset on the iPhone, open the email link, set a new
  password, and sign in with it.
- [ ] Deny and then allow location, microphone, and speech permissions; verify
  the app remains usable after denial.
- [ ] Create records offline, force-quit, reopen, reconnect, and confirm they sync.
- [ ] Confirm reconnecting in the background does not close a form with typed data.
- [ ] Export the main reports and open/share each generated PDF or CSV.
- [ ] Confirm no Stripe checkout, subscription price, or external purchase link
  appears anywhere in the iOS build.
- [ ] In Settings → Account & Display, verify Delete Account is easy to find,
  requires `DELETE`, blocks while offline changes are pending, records the
  request, and signs the user out.

## Submission notes

Provide App Review with a working review account containing representative farm
records. In the review notes, explain that billing is not offered in the iOS app,
voice questions are transcribed by the operating system and sent as text, and
account deletion is initiated under Settings → Account & Display and completed
within 30 days.

## Validation log

- 2026-09-11 — Local macOS validation at `06e8b17` (Xcode 26.5, Node 22.23.2,
  CocoaPods 1.16.2): lint 0 errors, typecheck and typecheck:api clean,
  1128/1128 unit tests, Capacitor bundle built and synced, `pod install` with
  no lockfile change, both plists valid, recovery URL scheme and
  `CapacitorSecureStoragePlugin` present, and a signed Release archive produced
  for `com.wsegbert.acreledger` (team `JZP3Z769P7`).
- 2026-09-11 — CodeMagic `acreledger-ios` for `06e8b17` completed successfully
  (02:07–02:12 UTC), including the App Store Connect publishing step:
  https://codemagic.io/app/6a11efe7ef713f8199f4cf4a/build/6aa36249688764aa17b6f4f7.
  Stage-by-stage log review still requires a CodeMagic dashboard login.
  `acreledger.vercel.app` is live; the weather proxy returns 401 without auth
  and the AI assistant returns 405 on GET, both as designed.
- 2026-09-11 — Blockers confirmed open: `acreledger.com` is still parked
  (HTTP 302 to `acreledger-com.l.ink`), so the App Store support and privacy
  URLs have no live target yet. The CodeMagic `appstore` variable-group values
  (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), the App Store Connect privacy /
  age-rating / export-compliance questionnaires, Beta App Information, and
  TestFlight processing state all still require an owner login to verify.
  Five consecutive `main` pushes have produced successful signed builds with
  App Store Connect uploads, which indicates the ASC credentials, signing
  certificate, provisioning profile, and app record are configured and working.
