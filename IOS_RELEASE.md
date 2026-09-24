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
- [x] Owner assigned: **Will Egbert** (confirmed September 23, 2026) reviews
  `account_deletion_requests` at least weekly, completes each request within
  30 days, removes account-associated data unless legally required to retain
  it, and notifies the requester when complete. Operational execution remains
  subject to ongoing review; this checkbox records ownership.
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

- 2026-09-23 — Will Egbert accepted account-deletion ownership. TestFlight
  3.6.0 (185) installed and launched on the paired iPhone. Device testing
  initially exposed an unavailable offline store: the legacy on-device database
  was plaintext while the current build expected SQLCipher encryption. A local
  device build converted the database in place and confirmed its file is no
  longer readable as SQLite. A second defect then surfaced: the app called the
  plugin's nonexistent `isOpened()` method. After changing both paths to
  `isDBOpen()`, the signed device build opened the encrypted store, cleared eight
  cached items during normal sign-out, and returned to the signed-out screen
  without the emergency warning. The disposable account remains signed out.
- 2026-09-23 — Password-recovery request submitted on the iPhone for the
  disposable test account; the app confirmed that the reset email was sent.
  Opening the email link, changing the password, and signing back in remain to
  be completed by the account owner because they change an authentication
  credential.
- 2026-09-23 — App Store Connect verified for app ID `6772299437`, bundle
  `com.wsegbert.acreledger`: TestFlight build 3.6.0 (185) is Validated and Ready
  to Submit, uses no non-exempt encryption, includes symbols, targets iOS 15+,
  and is assigned to internal group `mine`. Version 1.0 is still Prepare for
  Submission with no selected build or screenshots. Listing text, support and
  marketing URLs, copyright, review contact/account fields, privacy answers,
  age rating, content rights, and category remain incomplete. An updated Apple
  Developer Program License Agreement must be accepted by October 1, 2026 and
  currently blocks submission; acceptance requires the account holder's express
  confirmation. DSA trader status also remains outstanding for EU distribution.
- 2026-09-23 — CodeMagic's app page rendered blank after reload, so production
  variable-group values and stage-by-stage logs could not be inspected directly.
  App Store Connect independently confirms build 185 was uploaded and validated.
  The workflow now fails the build if the generated iOS configuration omits
  `CapacitorSQLite.iosIsEncryption: true`.
