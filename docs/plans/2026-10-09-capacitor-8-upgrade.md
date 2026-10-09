# Capacitor 6 → 8 Upgrade — Plan

**Status:** Implementation in progress (working tree, uncommitted). Core package upgrades complete, Android native edits applied (minSdk 24, AGP 8.13.0, Gradle 8.14.3, androidx versions, insets Option A), iOS config synced. Physical-device testing and Podfile.lock/pod install pending macOS.
**Date:** 2026-10-09 (revised the same day: the target moved from 7 to 8 on William's instruction via Muse)
**Requested by:** William, via Muse
**Why:** The Android pipeline needs a `@capacitor-community/sqlite` build whose native libraries are
16 KB page-size aligned, for Google Play compliance. That means a modern sqlite, which needs a modern
Capacitor. William wants the newest **stable** major on both iOS and Android. At this date that is **Capacitor 8**:
npm `latest` = 8.5.3, and 9.0.0 is still `next`/alpha.
**Related:** [2026-10-08-android-capacitor-play-store.md](./2026-10-08-android-capacitor-play-store.md)
(§1.2 option B is this upgrade).

---

## 0. Findings from the repo and npm (checked 2026-10-09)

| Finding | Impact |
|---|---|
| Installed: `@capacitor/core` 6.2.1, `cli` 6.2.2, `ios` 6.2.1, `android` 6.2.2 (uncommitted). | Pin all four to one 8.x version. |
| The working tree has uncommitted Android work: `android/` (untracked), `.gitignore`, `capacitor.config.ts` (`androidScheme`), `codemagic.yaml` (Android workflow), `package.json`, and `package-lock.json`. Unrelated untracked files include patches, equipment plans, the spray migration, and Grok's recovery work. | The upgrade must not mix into or overwrite this work. See §4.1. |
| sqlite 6.0.2 on Android links the deprecated `net.zetetic:android-database-sqlcipher:4.5.3`, which is not 16 KB-aligned. sqlite **8.1.1** links `net.zetetic:sqlcipher-android:4.17.0` and ships a `Package.swift`. | Fixes the Play blocker. It requires Java 21, minSdk 24, and compileSdk 36. |
| CLI 8.5.3 has `engines.node >=22.0.0`. | Local Node and Codemagic (`node: 22`) are fine. Any developer machine below 22 will fail. |
| Capacitor 8 Android template: minSdk **24**, compile/target 36, AGP **8.13.0**, Gradle **8.14.3**, google-services 4.4.4, newer androidx versions (activity 1.11, appcompat 1.7.1, core 1.17, fragment 1.8.9, webkit 1.14, coreSplashScreen 1.2.0), and `cordovaAndroidVersion` 14.0.1. Java 21. | Current `android/`: minSdk 22, AGP 8.10.0, Gradle 8.11.1, androidx at Capacitor 6 levels. Everything except compile/target 36 must be raised. |
| Capacitor 8 iOS: the `Capacitor` podspec has a **15.0** deployment target. The CocoaPods template is still shipped (`ios-pods-template`), alongside an SPM template. | The Podfile is already at 15.0, so no change is needed. **Stay on CocoaPods** (see the speech plugin row). |
| `patches/@capacitor+cli+6.2.2.patch` rewrites the CLI `tar` import. CLI 8.5.3 already uses `require("tar")` with a named `extract`, and depends on `tar ^7.5.3`. | **Delete the patch.** Otherwise patch-package fails in `postinstall` and `npm ci` breaks. The nested `overrides["@capacitor/cli"].tar = "7.5.22"` is still compatible. AGENTS.md line 387 must be rewritten. |
| **`@capacitor-community/speech-recognition` has no Capacitor 8 release.** The newest version is 7.0.1, with peer `@capacitor/core >=7.0.0`, so npm accepts 8. It uses the Objective-C `CAP_PLUGIN` registration (`Plugin.m`), has **no `Package.swift`**, and on Android uses `@ActivityCallback`/`startActivityForResult` (still present but `@Deprecated`-adjacent in Capacitor 8's `Plugin.java`). Its Android build is pinned at AGP 8.7.2 / compileSdk 35 defaults. | **Main compatibility risk.** It must be proven in a compile-and-device spike (§4.2). Fallbacks are in §2. |
| Diffs against the app's API surface: the sqlite 8.1.1 method set equals 6.0.2's; secure-storage 0.13.0 `definitions.d.ts` is identical to 0.10.0's; text-to-speech 8.0.2's is identical to 5.1.0's. | No TypeScript changes are expected in `offlineStorage.ts`, `secureStorage.ts`, or `speech.ts`. Verify on device. |
| Capacitor 8 adds a core **`SystemBars`** config whose `insetsHandling` defaults to `"css"` (Android). AcreLedger already has a custom inset handler in `android/.../MainActivity.java`, which Codemagic checks for, and `index.html` has `viewport-fit=cover`. | **Danger of applying the insets twice** (the custom handler pads the WebView and Capacitor also handles the insets). A decision is required (§1, Android). |
| Codemagic Android uses `java: 17`. | Change it to `java: 21`. |

---

## 1. What changes from 6 → 8 (relevant to AcreLedger)

The changes from 6→7 and 7→8 both apply. Read the official guides before you start:
<https://capacitorjs.com/docs/updating/7-0> and <https://capacitorjs.com/docs/updating/8-0>,
plus the 7.0/8.0 changelogs of each official plugin. Items below were checked against the published
packages where marked ✔. The other items come from the release notes and must be confirmed in the guides.

**Tooling**
- ✔ Node.js 22 or newer for the CLI.
- JDK 21 and a current Android Studio (one that supports AGP 8.13).
- A recent Xcode. Capacitor 7 required Xcode 16 or newer, and **check the Xcode minimum in the 8.0 guide**. The
  Codemagic iOS workflow uses `xcode: latest`, so it should be fine. Record the version used.
- `npx cap migrate` automates the native-project edits. Run it on a branch and review every diff.
  Run it once on 8.x. If the 6→8 jump gives a poor diff, go through a 7.x step instead (§4.2).

**iOS**
- ✔ Minimum iOS 15.0 for Capacitor 8 and the updated plugins (sqlite, TTS, secure-storage). AcreLedger
  already targets 15.0.
- CocoaPods is still supported. SPM is the default for *new* projects only. **Do not migrate to SPM
  in this PR.** speech-recognition has no `Package.swift`, so SPM would break voice input.
- `@capacitor/ios` and plugin pods move to 8.x, and `pod install` regenerates `Podfile.lock`.
- `cap migrate` may change `AppDelegate.swift`/`Info.plist` boilerplate. Review it.

**Android**
- ✔ minSdk 24, so Android 6 (API 23) devices are dropped. Android has had no public release, so nobody loses the app.
- ✔ AGP 8.13 / Gradle 8.14.3 / Java 21, plus androidx dependency bumps in `variables.gradle`.
- ✔ **Edge-to-edge / `SystemBars`.** Choose one inset strategy:
  - **Option A (recommended):** remove the custom `MainActivity.java` inset listener and use
    `SystemBars.insetsHandling: 'css'`, which is the default. The app already uses `viewport-fit=cover` and
    `env(safe-area-inset-*)` (App.tsx, BottomNav, AskAcreLedger, RadarEmbed, index.css). This also
    matches iOS behavior. It also handles the IME (keyboard), which the custom handler does now, so verify that.
    Then update the Codemagic grep for `WindowInsetsCompat.Type.systemBars()` to check the config instead.
  - **Option B:** keep the custom handler and set `SystemBars.insetsHandling: 'disable'`.
    This is less change but goes against upstream's recommendation, and the
    Android plan's handler would need a re-review on Chromium 140+.
- The Capacitor 7 `android.adjustMarginsForEdgeToEdge` option is gone in Capacitor 8 (✔ not in the CLI 8 declarations).
  Do not add it.
- `androidScheme: 'https'` is unchanged, so the WebView origin and stored web data survive.

**Plugins**
- Official `@capacitor/*` plugins go to 8.x. `@capacitor/status-bar` 8 still exposes
  `overlaysWebView`/`setOverlaysWebView`. AcreLedger only calls `StatusBar.setStyle` (Dark/Light,
  `@/lib/native.ts`). Check that the style still applies when `SystemBars` also sets a style.

---

## 2. Plugin compatibility matrix

| Package | Now | Target | Peer | Notes |
|---|---|---|---|---|
| `@capacitor/core` / `cli` / `ios` / `android` | 6.2.1 / 6.2.2 / 6.2.1 / 6.2.2 | **8.5.3** (pin `~8.5.3`, all four the same) | ios/android need core `^8.5.0` | Remove the CLI 6.2.2 patch. |
| `@capacitor/app` | 6.0.3 | ^8.1.2 | core ≥8 | Deep link `com.wsegbert.acreledger://auth/recovery`. |
| `@capacitor/filesystem` | 6.0.4 | ^8.1.4 | core ≥8 | PDF export. |
| `@capacitor/geolocation` | 6.1.1 | ^8.2.3 | core ≥8 | Re-test permission prompts on both platforms. |
| `@capacitor/haptics` | 6.0.3 | ^8.0.2 | core ≥8 | |
| `@capacitor/network` | 6.0.4 | ^8.0.1 | core ≥8 | Drives offline/sync replay. |
| `@capacitor/preferences` | 6.0.4 | ^8.0.1 | core ≥8 | Source for the legacy credential migration. |
| `@capacitor/share` | 6.0.4 | ^8.0.3 | core ≥8 | |
| `@capacitor/splash-screen` | 6.0.4 | ^8.0.2 | core ≥8 | |
| `@capacitor/status-bar` | 6.0.3 | ^8.0.4 | core ≥8 | Interacts with `SystemBars`. |
| `@capacitor-community/sqlite` | 6.0.2 | **8.1.1** | core ≥8 | **The upgrade's purpose.** Android uses SQLCipher 4.17 (16 KB). iOS uses the `SQLCipher` pod. Upgrade-in-place risk is in §3. |
| `@capacitor-community/text-to-speech` | 5.1.0 | 8.0.2 | core ≥8 | API is unchanged. |
| `capacitor-secure-storage-plugin` | 0.10.0 (exact) | **0.13.0 (exact)** | core ≥8 | API is unchanged. Keychain/Keystore items must survive. |
| `@capacitor-community/speech-recognition` | 6.0.1 | **7.0.1** (no 8.x exists) | core ≥7 (accepts 8) | **Unverified on Capacitor 8.** It must compile on iOS (CocoaPods) and Android (AGP 8.13/Java 21), and work on device. |

**Fallbacks for speech-recognition, in order:**
1. 7.0.1 works as-is on Capacitor 8. Ship it, and watch upstream for an 8.x release.
2. A small `patch-package` patch for any compile fix (same mechanism as the old CLI patch). Document it
   in AGENTS.md.
3. Switch to a maintained Capacitor 8 alternative such as `@capgo/capacitor-speech-recognition` (8.4.1, peer
   core ≥8). This needs an API diff against `src/lib/speech.ts` and its tests. The adapter is centralized,
   so the change stays contained.
4. Last resort: hide voice input on native until a fix is available. The typed Ask the Book question still works.

Get the exact latest patch versions with `npm view <pkg> version` on the day of execution.

---

## 3. iOS impact (must not regress)

iOS is in production (App Store/TestFlight via Codemagic). It is the higher-risk platform even though
Android drives this upgrade.

1. **Encrypted offline store (highest risk).** Existing devices have an SQLCipher DB at
   `Library/CapacitorDatabase` with a key stored under the Keychain prefix `acreledger`. sqlite 8 must open it **in place**,
   with no re-key and no data loss. Diff `Podfile.lock` before and after for the `SQLCipher` pod version. If
   the major version changes, or the plugin's iOS migration code touches existing DBs, stop and confirm compatibility first.
2. **Pending offline queue.** Test an upgrade-in-place that has unsynced mutations (§5 T3).
3. **Keychain credentials** (secure-storage 0.10 → 0.13) must still read, and the Preferences → Keychain
   legacy migration must still work.
4. **Encryption flags.** `iosIsEncryption: true`, `iosKeychainPrefix`, and `iosDatabaseLocation` must still be copied into
   `ios/App/App/capacitor.config.json`. A missing flag is the known Sign Out lock bug.
5. **Safe areas.** `SystemBars` is a core plugin on iOS too, and it controls the status bar
   style/animation. Re-check the notch, Dynamic Island, and home-indicator padding against the current `StatusBar.style: 'Dark'`.
6. **Voice (speech-recognition 7.0.1 on Capacitor 8).** Microphone and speech permissions, transcription, and the stop/cap behavior.
7. **Password-recovery deep link**, `iosScheme: 'https'`, and native billing staying hidden
   (`Capacitor.isNativePlatform()` tests in Landing/Settings).
8. **Codemagic iOS.** `pod install` succeeds with `xcode: latest`. Stay on CocoaPods.
9. The app version shown on the App Store does not change because of this PR. Bump the build number as usual.

**Rule:** no iOS submission until the §5 iOS pass is fully green on a physical device.

---

## 4. Step-by-step procedure

### 4.1 Preparation (no code changes)
1. Coordinate first. Confirm with Muse/William that nobody (including Grok's recovery work) is editing
   `package.json`, `package-lock.json`, `ios/`, `android/`, `capacitor.config.ts`, or `codemagic.yaml`.
2. **Land the uncommitted Android work first**, on its own branch (`feat/android-capacitor`) as
   Capacitor 6, so it can be reviewed and reverted on its own. Do not stash it. Do not stage unrelated untracked files.
3. Baseline on the current code:
   `npm ci && npm run lint && npm run typecheck && npm run typecheck:api && npm run test && npm run cap:build`.
   Save `ios/App/Podfile.lock`, and record the Android `./gradlew assembleDebug` result.
4. Keep the current production iOS build installed on a test iPhone with real data and a
   pending offline queue. This is the upgrade-in-place fixture.

### 4.2 Speech-recognition spike (time-box ½ day, before the full upgrade)
5. On a throwaway branch, bump only core/cli/ios/android to 8.5.3 plus speech-recognition 7.0.1, then
   `cap sync`, `pod install`, an iOS build, and Android `assembleDebug`. If it compiles, run voice on one
   iOS device and one Android device. Pick the fallback from §2 based on the result. This keeps the main
   upgrade from stalling on that plugin.

### 4.3 Upgrade branch
6. Create `chore/capacitor-8` from the branch in step 2.
7. Bump all JS packages to the §2 targets in a single `npm install` command. Pin core/cli/ios/android to the same
   version, and pin secure-storage exactly.
8. Delete `patches/@capacitor+cli+6.2.2.patch`. Run `npm ci` and check that patch-package is clean. Keep the nested `tar`
   override if `npm ls tar` shows it satisfies `^7.5.3`.
9. Run `npx cap migrate` (8.x CLI). Review every native diff. If the 6→8 migrate output is unreliable,
   stop, reset the native folders, then run it in two hops (install 7.6.9 → migrate → install 8.5.3 → migrate).
   Reject changes that remove:
   - the Android manifest's `allowBackup="false"`, the deep-link intent filter, and location permissions (and confirm
     no `ACCESS_BACKGROUND_LOCATION` is added),
   - the signing/versionCode/versionName wiring in `android/app/build.gradle`,
   - the custom Podfile `post_install` (deployment target 15.0).
10. Android: `variables.gradle` gets minSdk 24, keeps compile/target 36, and takes the §0 androidx versions and
    `cordovaAndroidVersion` 14.0.1. Root `build.gradle` moves to AGP 8.13.0 and google-services 4.4.4. The Gradle wrapper moves to 8.14.3.
11. Android insets: apply the decision in §1 (Option A recommended). Update `capacitor.config.ts`
    (`plugins.SystemBars`) and `MainActivity.java`, and replace the Codemagic `WindowInsetsCompat` grep with an
    equivalent check on the generated `capacitor.config.json`.
12. iOS: `cd ios/App && pod install --repo-update`. Diff `Podfile.lock` and check the SQLCipher version (§3.1).
13. `npm run cap:build` and `npm run cap:build:android`. Check that both generated `capacitor.config.json`
    files still contain the CapacitorSQLite encryption flags.
14. Codemagic: change the Android workflow's `java: 17` to `java: 21`. Leave the iOS workflow alone unless the build
    shows the Xcode/CocoaPods version is too old.
15. Docs, in the same PR: AGENTS.md (summary "Capacitor 6" → 8, rewrite the `tar` rule at line 387, note
    the speech-recognition status, add a Recent Changes entry), the BLUEPRINT.md tech table, CODEMAGIC.md ("Capacitor 6",
    Java 21), IOS_RELEASE.md validation evidence, and §0/§1.2 of the Android plan. Run `npm run verify:docs`.
16. Make reviewable commits (deps + patch removal / native migrate / insets / CI + docs).

### 4.4 Android 16 KB compliance
17. Build the release AAB and check `.so` alignment with `zipalign -c -P 16 -v 4` or Android Studio's
    APK Analyzer. Check the sqlcipher libraries and any speech/TTS native libraries. Play Console's pre-launch report must not
    flag 16 KB issues.

---

## 5. Test plan

**Automated (local and Codemagic)**
- T0: `npm ci` (patch-package clean), `lint`, `typecheck`, `typecheck:api`, `npm run test`
  (docs, tracked-assets, app-store metadata, unit, owner-DR). `verify:migrations` as a sanity check only.
- T0: `offlineStorage.native.test.ts`, `secureStorage.test.ts`, `speech.test.ts`, and the native
  Landing/Settings billing tests. These mock the plugins, so they only catch import/shape breaks.
- T0: Android `./gradlew test` + `bundleRelease`, and an iOS Codemagic build to an internal TestFlight group.

**iOS physical device (blocking)**
- T1: Fresh install. Sign in, create records offline, go online, and confirm they sync.
- T2: **Upgrade in place** over the current production build with data. The app opens with no unreadable-store
  or emergency sign-out prompt, the data is there, and the user stays signed in.
- T3: Upgrade in place with a **pending offline queue**. It replays once, with no duplicates.
- T4: Sign out (the farm queue is cleared) and sign in again. Account deletion is reachable.
- T5: The password-recovery email link opens the set-password screen.
- T6: Geolocation (Quick Add nearest field), haptics, splash, status bar style, and safe areas.
- T7: PDF export → Share sheet. **Ask the Book voice**: permissions, transcription, the 30 s cap, TTS
  playback and stop.
- T8: No billing or pricing UI on native.

**Android (physical device + API 36 emulator; also a 16 KB-page emulator image)**
- T9: T1, T4–T8 on Android. Encrypted SQLite opens, and secure storage persists across a restart.
- T10: Edge-to-edge. Nothing draws under the status/nav bars or the display cutout. The keyboard does not cover inputs
  (Quick Add, spray wizard, Ask the Book). Test in both portrait and landscape.
- T11: The 16 KB check (§4.4), and the app launches on the 16 KB-page emulator.
- T12: Android has had no public install base, so no upgrade-in-place test is needed. If an internal build was
  distributed, repeat T2/T3 on it.

**Release gate:** T0–T8 green before any iOS submission. T9–T11 green before the Play internal track.

---

## 6. Rollback plan

- **Before merge:** drop `chore/capacitor-8`. `main` and the Capacitor 6 Android branch are untouched.
- **After merge, before release:** `git revert` the upgrade commits, then `npm ci` and `pod install`. The revert
  restores `patches/@capacitor+cli+6.2.2.patch` and the native folders. Rebuild both platforms.
- **After an iOS release:** stop the phased release in App Store Connect and fix forward with a hotfix build.
  **Downgrade risk:** a Capacitor 6 / sqlite 6 build reinstalled over a DB that sqlite 8 has touched must still open it.
  Before submitting, test **8→6** on a test device. If it fails, rollback is fix-forward only, and
  William should accept that explicitly before release.
- **Android:** internal track only. Halt the rollout in Play Console. Capacitor 6 cannot satisfy Play's 16 KB
  rule, so an Android rollback means pausing Android, not shipping Capacitor 6.
- **Partial fallback:** if only speech-recognition fails on 8, use the §2 fallbacks instead of rolling back
  the whole upgrade.
- Keep the §4.1 baseline artifacts (Podfile.lock, the previous IPA build number) for comparison.

---

## 7. Open decisions for William/Muse

1. Android insets: Option A (Capacitor 8 `SystemBars` `css`, remove the custom handler; recommended) or
   Option B (keep the handler, `insetsHandling: 'disable'`)?
2. Speech-recognition: approve the §4.2 spike and the fallback order (patch, then `@capgo` alternative,
   then hide voice on native)?
3. Land the uncommitted Android Capacitor 6 work as its own commit first (recommended)?
4. Who runs the physical-device iOS regression (T1–T8), and on which device and iOS version?
