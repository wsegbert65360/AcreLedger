# Android Support (Capacitor WebView Wrapper) — Implementation Plan

**Status:** Plan only — nothing in this document has been implemented.
**Date:** 2026-10-08
**Requested by:** William, via Muse
**Scope:** Add an Android build of the existing AcreLedger web app using the same Capacitor wrapper
used for iOS, build and sign it in Codemagic, and publish to the Google Play **internal** testing track.
No feature changes to the web app beyond what Android parity and Play policy require.

---

## 0. Findings from the current repo (read before starting)

| Finding | Impact |
|---|---|
| `@capacitor/android ^6.2.2` is already added to `package.json` as an **uncommitted** change (`package-lock.json` also modified). | Confirm with William/Muse who made it and whether it should be kept. Do not overwrite; build on it. |
| `.gitignore` line 21 ignores `android/`. | Must be removed, otherwise the generated native project (Manifest, Gradle config, signing wiring) is never committed and Codemagic has nothing to build. iOS commits `ios/` the same way. |
| `package.json` scripts are iOS-only: `cap:sync`, `cap:open`, `cap:build` all hard-code `ios`. | Add Android equivalents; keep the iOS scripts unchanged so the iOS workflow is unaffected. |
| `patches/@capacitor+cli+6.2.2.patch` fixes the CLI's `tar` import, and AGENTS.md forbids a global `tar` override. | `npx cap add android` extracts the Android template through the same patched code path; verify it works before anything else. Do not "fix" tar differently. |
| `capacitor.config.ts` already has `CapacitorSQLite.androidIsEncryption: true`; `server.iosScheme: 'https'`. | Android's Capacitor 6 default `androidScheme` is already `https`; set it explicitly for symmetry and so cookies/storage origin never silently changes. |
| Capacitor **6** template targets/compiles against **API 34**. Google Play requires new apps and updates to target a recent API level (API 35 since 2025-08-31; check Play Console for the 2026 requirement, which is expected to be API 36). | **Decision required** — see §1.2. An API-34 AAB will be rejected for upload. |
| Native plugins in use: SQLite (encrypted), `capacitor-secure-storage-plugin` (Keystore), Geolocation, Speech Recognition, Text-to-Speech, Filesystem + Share (PDF export), Haptics, Status Bar, Splash, Network, Preferences, App (deep links). | Each needs an Android check (permissions, manifest entries, behavior). |
| Native password recovery uses `com.wsegbert.acreledger://auth/recovery` (`src/lib/authDeepLinks.ts`). | Needs an Android `<intent-filter>`. Same URL as iOS, so the Supabase redirect allowlist should not need to change — verify it rather than assume. |
| Billing is hidden on native via `Capacitor.isNativePlatform()` (`src/lib/billing.ts`, `Landing.tsx`, `Settings`). | Already covers Android, and is required by Play's Payments policy. Add Android tests so it stays covered. |
| `VersionFooter.tsx` has an iOS-only store update check (`getPlatform() === 'ios'`). | On Android it stays hidden. Acceptable for v1; optional follow-up. |

---

## 1. `npx cap add android` setup

### 1.1 Steps

1. Start from a clean understanding of the working tree: `git status`. Leave every unrelated
   untracked/modified file (patch files, equipment plans, the spray migration, Grok's recovery work)
   alone. Work on a feature branch, e.g. `feat/android-capacitor`.
2. Resolve the `@capacitor/android` dependency (§0). Pin it to the same minor as `@capacitor/core`
   (`^6.2.x`) and run `npm install` so the lockfile is consistent. Confirm `patch-package` still applies.
3. Remove `android/` from `.gitignore`. Add Android-specific ignores instead (Capacitor's template
   `android/.gitignore` already covers `build/`, `.gradle/`, `local.properties`, and
   `app/src/main/assets/public`). Add `*.jks`, `*.keystore`, `keystore.properties` to the root ignore.
4. `npm run build -- --mode capacitor` (i.e. `vite build --mode capacitor`, which keeps `base: "./"`), then
   `npx cap add android`.
5. Add scripts (do not modify the iOS ones):
   ```json
   "cap:sync:android": "npx cap sync android",
   "cap:open:android": "npx cap open android",
   "cap:build:android": "vite build --mode capacitor && npx cap sync android"
   ```
6. `capacitor.config.ts`: add `server.androidScheme: 'https'`; consider `android.allowMixedContent: false`
   (default) and `android.webContentsDebuggingEnabled: false` for release.
7. `android/app/build.gradle`:
   - `applicationId "com.wsegbert.acreledger"` (same as iOS bundle ID; Play package names are permanent).
   - `versionName` from `package.json` (strip `-AcreLedger`, as the iOS workflow does);
     `versionCode` from a Gradle property / env var injected by Codemagic (§3).
   - `minSdkVersion` 23 (Capacitor 6 default) unless a plugin requires higher.
   - Release `signingConfigs` reading from env vars (`CM_KEYSTORE_PATH`, `CM_KEYSTORE_PASSWORD`,
     `CM_KEY_ALIAS`, `CM_KEY_PASSWORD`), falling back to debug signing locally when absent.
   - `minifyEnabled` stays off for v1 (WebView wrapper; avoids R8 breaking plugin reflection).
8. App icon and splash: generate adaptive icons and splash from the existing iOS/brand assets
   (`assets/`) with `@capacitor/assets` (dev-only, run once; commit the outputs, not a new runtime dep).
   Splash background `#09090b` to match config.

### 1.2 Decision required: target API level

> **Decided 2026-10-09: option B.** Capacitor 8.5.3 is applied in the working tree per
> [2026-10-09-capacitor-8-upgrade.md](./2026-10-09-capacitor-8-upgrade.md) (minSdk 24, AGP 8.13.0,
> Gradle 8.14.3, Java 21, `SystemBars` insets). The Capacitor 6 findings below are kept for history.

Play rejects AABs whose `targetSdkVersion` is below the current requirement. Options:

- **A. Stay on Capacitor 6, raise `compileSdkVersion`/`targetSdkVersion` in `android/variables.gradle`.**
  Smallest change, iOS untouched. Risks: Capacitor 6 / its plugins aren't tested against API 35+;
  Android 15 enforces edge-to-edge, so the WebView draws under the status/navigation bars and needs
  safe-area/inset handling (check `env(safe-area-inset-*)` behavior and `@capacitor/status-bar`
  `overlaysWebView`). May need a newer AGP/Gradle than the template ships.
- **B. Upgrade Capacitor to the current major (and all `@capacitor/*` + community plugins) first.**
  The supported route to the current target API, but it also changes the iOS build (CocoaPods/SPM,
  Xcode minimums, Java 21 for Android), the `tar` patch, and needs a full iOS regression pass.
  Should be its own PR before Android work.

**Recommendation:** try A first in a spike (a few hours). If the build, plugins, and edge-to-edge
layout are clean on API 35/36 emulators, ship A; otherwise do B as a separate, iOS-verified PR.
Confirm the exact current Play target-API deadline in Play Console before choosing.

### 1.3 AndroidManifest.xml changes

- Permissions (declare only what is used):
  - `INTERNET` (template default)
  - `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` (Geolocation — weather/field coordinates; foreground only, **no** background location)
  - `RECORD_AUDIO` (Ask the Book voice input)
  - `ACCESS_NETWORK_STATE` (Network plugin)
  - `VIBRATE` if Haptics requires it on the chosen plugin version
- `<queries>` entries for `android.speech.RecognitionService` (speech recognition) and
  `android.intent.action.TTS_SERVICE` (text-to-speech) — required on Android 11+ package visibility.
- Password-recovery deep link on `MainActivity`:
  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.wsegbert.acreledger" android:host="auth" android:pathPrefix="/recovery" />
  </intent-filter>
  ```
  The JS listener remains the authority on accepting only `auth/recovery` with a PKCE `code` or
  `token_hash` + `type=recovery` (AGENTS.md). Keep `launchMode="singleTask"` (template default) so the
  link reaches the running app via `appUrlOpen`.
- **Backup:** set `android:allowBackup="false"` (or `dataExtractionRules`/`fullBackupContent` excluding
  the SQLite DB and secure-storage prefs). Android Keystore keys are never restored, so an
  auto-restored encrypted DB on a new phone would be undecryptable and could lock sign-out — the same
  failure class the `iosIsEncryption` comment in `capacitor.config.ts` describes.
- FileProvider: Capacitor's template provides it; confirm PDF share (`native.sharePdf`) works with
  `@capacitor/filesystem` paths.

### 1.4 App code touch points (minimal)

- Android hardware **back button**: register `App.addListener('backButton', …)` to close open
  dialogs / navigate back, and only exit at the root route. Without this, Back exits the app from any
  screen — a common Play reviewer complaint.
- Status bar: `@capacitor/status-bar` `style: 'Dark'` behaves differently on Android; set
  `backgroundColor` and verify contrast in light and dark themes.
- Keep all `Capacitor.isNativePlatform()` guards (billing, sign-in-only landing, native storage).
  Grep for any iOS-only `getPlatform() === 'ios'` assumptions (currently only `VersionFooter`).

### 1.5 Documentation updates (same PR)

AGENTS.md (Project Summary "native iOS wrapper", CI/CD index, Native/iOS release rules), BLUEPRINT.md
native section, CODEMAGIC.md (Android section), a new `ANDROID_RELEASE.md` mirroring `IOS_RELEASE.md`,
and run `npm run verify:docs` / `npm run docs:toc`.

---

## 2. Signing config for Codemagic

1. **Play App Signing (required for AAB):** Google holds the app-signing key; we hold an
   **upload key**.
2. William generates the upload keystore locally (never in the repo, never sent through chat):
   ```
   keytool -genkey -v -keystore acreledger-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias acreledger-upload
   ```
   Store the keystore and passwords in his password manager; losing it requires a Play upload-key reset.
3. Upload it in Codemagic: **Team settings → Code signing identities → Android keystores**,
   reference name e.g. `acreledger_upload`.
4. The workflow uses `android_signing: [acreledger_upload]`, which exposes `CM_KEYSTORE_PATH`,
   `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`, `CM_KEY_PASSWORD` to Gradle (read in `build.gradle`, §1.1.7).
5. **Google Play API access:** in Google Cloud, create a service account, grant it access in
   Play Console → Users and permissions (release to testing tracks for this app only), create a JSON key,
   and store it in a new Codemagic env group `google_play` as secure var
   `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.
6. Create a `android_build` (or reuse `appstore`) env group for `VITE_*` vars. Recommendation: a
   separate shared group (e.g. `web_build`) for `VITE_*` used by both workflows, so App Store
   credentials are not exposed to the Android workflow. Changing the iOS workflow's groups is optional
   and can be deferred.

---

## 3. `acreledger-android` workflow (codemagic.yaml)

Added alongside `acreledger-ios`, which is left unchanged. Draft:

```yaml
  acreledger-android:
    name: AcreLedger Android
    max_build_duration: 60
    instance_type: linux_x2

    triggering:
      events:
        - push
      branch_patterns:
        - pattern: main
          include: true
      cancel_previous_builds: true

    environment:
      android_signing:
        - acreledger_upload
      groups:
        - web_build          # VITE_* (or appstore initially)
        - google_play        # GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
      node: 22
      java: 21              # option B chosen: Capacitor 8 requires Java 21
      vars:
        PACKAGE_NAME: "com.wsegbert.acreledger"
        VITE_AI_ASSISTANT_URL: "https://acreledger.vercel.app"

    cache:
      cache_paths:
        - $HOME/.npm
        - $HOME/.gradle/caches
        - node_modules
        - infrastructure/owner-backup/node_modules
        - scripts/recovery/node_modules

    scripts:
      - name: Install npm dependencies
        script: |
          npm ci --prefer-offline
          npm ci --prefer-offline --prefix infrastructure/owner-backup
          npm ci --prefer-offline --prefix scripts/recovery

      - name: Lint
        script: npm run lint

      - name: Typecheck
        script: |
          npm run typecheck
          npm run typecheck:api

      - name: Unit tests
        script: npm run test

      - name: Build web bundle and sync to Android
        script: |
          case "$VITE_AI_ASSISTANT_URL" in
            https://*) ;;
            *) echo "VITE_AI_ASSISTANT_URL must be a non-empty HTTPS URL" >&2; exit 1 ;;
          esac
          npm run cap:build:android
          if ! grep -Rqs "acreledger.vercel.app" dist/assets; then
            echo "Capacitor bundle is missing the Ask the book endpoint" >&2
            exit 1
          fi
          node -e '
            const config = require("./android/app/src/main/assets/capacitor.config.json");
            if (config.plugins?.CapacitorSQLite?.androidIsEncryption !== true) {
              throw new Error("Generated Android config must enable CapacitorSQLite encryption");
            }
          '

      - name: Validate Android manifest and target SDK
        script: |
          grep -q 'android:scheme="com.wsegbert.acreledger"' android/app/src/main/AndroidManifest.xml
          grep -q 'android:allowBackup="false"' android/app/src/main/AndroidManifest.xml
          if grep -q ACCESS_BACKGROUND_LOCATION android/app/src/main/AndroidManifest.xml; then
            echo "Background location must not be requested" >&2; exit 1
          fi
          TARGET=$(grep -E 'targetSdkVersion *=' android/variables.gradle | grep -oE '[0-9]+')
          [ "$TARGET" -ge 35 ] || { echo "targetSdkVersion $TARGET is below Play minimum" >&2; exit 1; }

      - name: Set version code
        script: |
          LATEST=$(google-play get-latest-build-number --package-name "$PACKAGE_NAME" --tracks internal || echo 0)
          echo "VERSION_CODE=$((LATEST + 1))" >> $CM_ENV

      - name: Build release AAB
        script: |
          PKG_VERSION=$(node -p "require('./package.json').version.split('-')[0]")
          cd android
          ./gradlew bundleRelease \
            -PversionCode="$VERSION_CODE" \
            -PversionName="$PKG_VERSION"

    artifacts:
      - android/app/build/outputs/bundle/release/*.aab
      - android/app/build/outputs/mapping/release/mapping.txt

    publishing:
      google_play:
        credentials: $GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
        track: internal
        submit_as_draft: false
      email:
        recipients:
          - wsegbert@gmail.com
        notify:
          success: true
          failure: true
```

Notes:
- `bundleRelease` (AAB), not APK — Play requires AAB for new apps.
- The **first** AAB must be uploaded manually in Play Console (the API cannot publish to an app that has
  never had a build). Download it from the first Codemagic run's artifacts.
- `-PversionCode/-PversionName` are read in `android/app/build.gradle`
  (`versionCode (project.findProperty('versionCode') ?: 1) as int`).
- Consider `when: changeset` path filters later so a docs-only push doesn't build both platforms.
- Run `npm run verify:docs` locally if the workflow is referenced from docs.

---

## 4. Play Store compliance checklist

**Account & listing**
- [ ] Play Console developer account verified (identity, D-U-N-S if registered as an organization).
- [ ] If this is a *personal* account created after Nov 2023: production access requires a closed test
      with ≥12 testers opted in for 14 continuous days. Internal testing is not affected; plan the closed
      test early.
- [ ] App created with package `com.wsegbert.acreledger`, default language en-US, category
      Business or Productivity, free.
- [ ] Store listing: title (≤30), short description (≤80), full description (≤4000) adapted from
      `docs/app-store/metadata.en-US.json`; 512×512 icon; 1024×500 feature graphic; ≥2 phone screenshots
      (plus 7" and 10" tablet if tablets are supported) from a real release build with the fictional review dataset.
- [ ] Contact email and privacy policy URL (`/privacy` on the public site).

**Policy declarations (App content)**
- [ ] Privacy policy: update `src/pages/Privacy.tsx` to mention Android/Google Play where it names iOS.
- [ ] **Data safety form** consistent with actual behavior and the iOS privacy manifest: account
      info (email), farm records (user content), approximate/precise location (app functionality, not
      shared), audio (voice input — note whether processed on-device or by the platform recognizer),
      crash/diagnostics only if collected; data encrypted in transit; deletion available.
- [ ] **Account deletion:** in-app path exists (`accountDeletion.ts`); Play additionally requires a
      **web URL** where users can request deletion without the app. Confirm one exists or add it before submission.
- [ ] App access: provide review-account credentials in Play Console only (never committed).
- [ ] Ads: none. Content rating questionnaire (IARC). Target audience: 18+, not designed for children.
- [ ] Government apps: no. Financial features: none. Health: none.
- [ ] **Payments policy:** no purchase, price, trial, or external-payment links in the Android app —
      verify the native guards hide billing on Android exactly as on iOS.
- [ ] **Permissions:** location and microphone requested at point of use with an in-app rationale;
      no background location; no `QUERY_ALL_PACKAGES`, SMS, call log, or photo/video permissions.
- [ ] **Minimum functionality / WebView policy:** app must provide more than a website — offline
      records, encrypted local storage, GPS field lookup, voice, native share/PDF export qualify; make
      sure the first-launch experience doesn't look like a bare website (sign-in-only native landing).
- [ ] Target API level meets the current requirement (§1.2); 64-bit (WebView app, automatic).
- [ ] `webContentsDebuggingEnabled` false and no cleartext traffic in the release build.

---

## 5. Test plan

**Automated (local + CI)**
1. `npm run lint`, `typecheck`, `typecheck:api`, `npm run test` — unchanged pass counts.
2. New unit tests:
   - `Landing` and `Settings` native-path tests parameterized for `getPlatform() === 'android'`
     (no pricing/checkout surfaces).
   - `authDeepLinks` with Android-style `appUrlOpen` URLs (accepted: exact scheme/host/path with
     `code` or `token_hash`+`type=recovery`; rejected: other hosts/paths, raw token fragments).
   - Back-button handler: closes dialog → navigates back → exits only at root.
3. iOS regression: `npm run cap:build` + iOS Codemagic build still green (proves Android changes did
   not affect the iOS workflow, the `tar` patch, or CocoaPods).
4. Android CI: workflow builds a signed AAB; manifest/target-SDK/SQLite-encryption gates pass.

**Manual — emulator (API 23 minimum, API 34, and target API 35/36) and at least one physical device**
1. Install, launch, splash → sign-in-only landing (no pricing).
2. Sign in; data loads; switch farms/seasons.
3. Offline: airplane mode → create spray/plant/harvest records → relaunch app → records persist →
   reconnect → sync queue drains with no duplicates.
4. Encrypted storage: force-stop and relaunch, still signed in; sign out succeeds and clears the queue.
5. Password recovery: request reset from the app, open email link on the device → app opens on the
   set-password screen; expired/used link shows the expected error.
6. Location: permission prompt at point of use; deny → graceful fallback; allow → nearest field and weather work.
7. Voice (Ask the Book): mic permission prompt, recognition works, TTS reads answer; deny path is graceful.
8. PDF export (FSA-578, spray log, equipment CSV) → Android share sheet → save to Drive / email.
9. Back button behavior on every top-level screen and in open dialogs.
10. Edge-to-edge/safe areas: no content under status or gesture-nav bars, light and dark themes,
    3-button and gesture navigation, small phone and tablet.
11. Rotation / process death: data is preserved after rotating and after "Don't keep activities".
12. Reinstall/new device: no crash from restored encrypted data (allowBackup off).
13. Account deletion flow completes.

**Play pipeline**
1. First AAB uploaded manually to the internal track; William and testers install via the opt-in link.
2. Next push to `main` → Codemagic publishes automatically to internal with an incremented versionCode.
3. Review the Play Console **pre-launch report** (crashes, accessibility, security warnings) and fix
   blocking items before promoting to closed testing.

---

## Suggested PR sequence

1. (Only if §1.2 picks option B) Capacitor major upgrade + full iOS regression.
2. Android project: `.gitignore`, `npx cap add android`, manifest, gradle signing/versioning, icons,
   scripts, back button, tests, docs.
3. `codemagic.yaml` Android workflow + CODEMAGIC.md / ANDROID_RELEASE.md.
4. Play Console setup and listing (manual, William), first manual upload, then CI publishing.

## Open questions for William

1. Who added the uncommitted `@capacitor/android` dependency, and should it stay?
2. Personal or organization Play developer account? (Determines the 12-tester closed-test requirement.)
3. Option A (Capacitor 6 + raised target SDK) vs. option B (Capacitor upgrade first)?
4. Phones only, or tablets as well (affects screenshots and layout testing)?
5. Is there an existing public web URL for account deletion requests?
