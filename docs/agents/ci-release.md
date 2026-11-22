# CI, release, and git remotes

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: codemagic.yaml, package.json. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [CI/CD (CodeMagic)](#cicd-codemagic)
- [Git Remotes and Push Hygiene](#git-remotes-and-push-hygiene)
<!-- contents:end -->

## CI/CD (CodeMagic)

- `codemagic.yaml` defines `acreledger-ios` (IPA/TestFlight) and `acreledger-android` (AAB/Play internal) workflows.
- There is no push-to-main trigger. The GitLab nightly schedule requests both workflows when the scheduled main commit matches GitHub main; unchanged successful builds are skipped. Manual starts remain available.
- Nightly requests pass `EXPECTED_BUILD_SHA`; both workflows reject a checkout at a different commit before installing dependencies.
- Android uses the shared `appstore` variables plus the `google_play` group containing `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS`, and the uploaded `acreledger_upload` keystore. Keep credentials in Codemagic, never in the repository.
- Android version codes use the latest build number across all Play tracks plus one; lookup failures stop the build. Initial uploads require a valid lookup or manual versioning.
- GitHub Actions gates pull requests and main pushes with lint, app/API type checks, unit tests, and disposable PGlite database-integrity tests. Codemagic also runs database-integrity tests.
- Code signing uses uploaded certificates and provisioning profiles via `ios_signing`.
- TestFlight publishing uses `auth: integration` with the `appstore` integration.
- Environment variable group `appstore` contains `VITE_*` build secrets and ASC API credentials.
- Confirmed working TestFlight builds require `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_KEY_ID` in the `appstore` group.
- `VITE_RAIN_API_URL` is optional because `RainService` falls back to `https://rain-api.vercel.app` when the variable is missing. If configured, it must be a clean HTTPS URL; do not include quotes, `KEY=`, commas, CLI commands, or duplicate `/rain` path suffixes.
- Native builds require HTTPS `VITE_WEATHER_PROXY_URL`. Do not set `VITE_VISUALCROSSING_KEY` in the `appstore` group. `codemagic.yaml` fails the Capacitor build when the proxy URL is missing and when that key appears in `dist/assets`.
- `VITE_SUPABASE_URL` must be the raw HTTPS project URL, e.g. `https://<project-ref>.supabase.co`; do not include quotes, `KEY=`, commas, CLI commands, or the Postgres connection string in Codemagic values.
- Capacitor iOS builds depend on `npm run cap:build` using `vite build --mode capacitor`; keep `base: "./"` for capacitor mode so bundled JS/CSS load from `capacitor://localhost`.
- **Schema before app.** Apply a new migration to production before pushing the app code that needs it. The production Vercel build ends `ci:vercel-gate` with `verify:prod-schema`, which calls `app_schema_version()` (anon key) and fails the deploy when production's newest applied migration is older than the newest file in `supabase/migrations`. It passes with a warning when the RPC is missing or production can't be reached; set `VERIFY_PROD_SCHEMA=1` to run it locally.
- Native builds include `capacitor-secure-storage-plugin`; keep the lockfile, CocoaPods resolution, and iOS Keychain-backed credential migration aligned.
- **Speech-recognition 7.0.1 on Capacitor 8:** no Capacitor 8.x release exists. Version 7.0.1 has peer `@capacitor/core >=7.0.0` (accepts 8) and uses the Objective-C `CAP_PLUGIN` registration and Android `@ActivityCallback`/`startActivityForResult`. iOS compilation and device tests are pending.
- Preserve the `com.wsegbert.acreledger` recovery URL scheme in `Info.plist` and the privacy manifest declarations in `ios/App/App/PrivacyInfo.xcprivacy`. Use `IOS_RELEASE.md` as the App Store/TestFlight release checklist.
- Keep iOS free of subscription prices, trial offers, Stripe checkout, and in-app purchase. The US App Store storefront website link (`src/lib/storefront.ts`, `src/hooks/useIosUpgradeLink.ts`, `PlanUpgradeLink`) is deliberate and must not change: it shows only for country code `USA` with a valid `VITE_UPGRADE_URL`, and fails closed otherwise. Other storefronts get no link. Landing on Capacitor stays the sign-in path guarded by `Capacitor.isNativePlatform()`. Preserve `src/pages/__tests__/Landing.test.tsx` and `src/pages/__tests__/Settings.test.tsx`.
- App Store metadata is sourced from `docs/app-store/metadata.en-US.json` and the matching submission package. Run `npm run verify:app-store` after changing listing copy, URLs, or the marketing version. Keep the privacy manifest, public privacy page, App Store questionnaire answers, and review notes consistent with actual behavior.
- Final App Store screenshots must come from the exact selected release build using the approved fictional review account/dataset. Simulator or locally staged captures are draft evidence until their build provenance is tied to that release. Required captures must meet Apple's current device-family dimensions and contain no alpha channel. Never commit review-account credentials.
- Capacitor 8 CLI uses `require("tar")` with a named `extract` export and depends on `tar ^7.5.3`. Keep the nested `overrides["@capacitor/cli"].tar = "7.5.22"` to override any transitive `tar@6` requirement; do not add a global `tar` override.
- Do not re-enable automatic external TestFlight submission unless App Store Connect Beta App Information and Beta App Review Information are complete.
- **Marketing version** is read from `package.json` at build time. **Build number** uses CodeMagic's `$BUILD_NUMBER`.
- **Do not** add `app_store_connect` publishing blocks without verifying the integration name exists in CodeMagic.
- The working integration name is `appstore`. Do not rename it without updating the yaml.
- Pushes that touch CI/CD must be synced across all three remotes (GitHub, Codeberg, GitLab) before they count as complete — see Git Remotes and Push Hygiene below.

## Git Remotes and Push Hygiene

- Default workflow: commit and `git push origin main` directly. The owner's account bypasses the GitHub `main` ruleset, so one push lands on GitHub, GitLab and Codeberg together and the nightly sees matching heads. GitHub Actions still runs on the push. Open a pull request only when the owner asks for one.
- Remote topology: `origin` fetches from GitLab and carries **three push URLs** (GitLab, Codeberg, GitHub). A single `git push origin main` fans out to all three remotes at once — do not push each remote separately. The dedicated `github` and `codeberg` remotes exist for fetching and verifying individual hosts.
- Before pushing: `git fetch --all` and compare heads. `main` legitimately gains commits from other machines, GitHub PR merges (which land on GitHub first), and agent sessions. If a remote is ahead, fast-forward, or rebuild on the remote head and cherry-pick only the novel commits; never force-push `main`.
- After pushing: verify every remote head (`git ls-remote <remote> main` for each of `github`, `codeberg`, `origin`) reports the same hash. All three must match before the push is done — mandatory for CI/CD changes, because the nightly GitLab job requires its main commit to match GitHub before requesting CodeMagic builds.
- Codeberg intermittently rejects the fan-out push with `cannot lock ref 'refs/heads/main': is at <new> but expected <old>` **after** the update has already landed. The error text itself names the target hash, which proves success — read it, confirm with `ls-remote`, and never respond with a force-push. Observed with identical behavior on 2026-09-06 and 2026-09-08.
