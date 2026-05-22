# AcreLedger — macOS Compilation and iOS Distribution Guide

This document is the instruction layer for the AI assistant/developer executing tasks on **macOS**. It details the steps required to pull, compile, build, test, and distribute the AcreLedger iOS native application wrapping the React 18 / Vite PWA codebase via Capacitor.

---

## 1. Prerequisites and Setup on macOS

Before running build commands, verify the local environment:
1. **Node.js**: Verify that Node (v18+ or v20+) and npm are installed.
2. **Xcode**: Must have Xcode 14+ installed along with the Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. **CocoaPods**: Install CocoaPods to manage native iOS dependencies:
   ```bash
   sudo gem install cocoapods
   # Or using Homebrew:
   brew install cocoapods
   ```
4. **Apple Developer Account**: Configure a valid Apple Developer Account inside Xcode (**Xcode Preferences > Accounts**).

---

## 2. Setup and Synchronization Commands

Run the following commands in the root of the project to pull dependencies, sync configurations, and build the distribution bundle:

```bash
# 1. Install project dependencies
npm install

# 2. Build the app for Capacitor configuration and copy compiled assets to the iOS directory
npm run cap:build

# 3. Verify that CocoaPods dependencies are installed and native targets are generated
cd ios/App && pod install && cd ../..

# 4. Open the workspace in Xcode
npm run cap:open
```

---

## 3. Xcode Project Configuration Checklist

Once Xcode launches:
- [ ] **Select Target**: Choose the main **App** target in the sidebar.
- [ ] **Signing & Capabilities**:
  - Head to the **Signing & Capabilities** tab.
  - Check **Automatically manage signing**.
  - Select your active **Team** / **Developer Profile**.
  - Verify that the Bundle Identifier is set correctly (e.g. `com.acreledger.app` or similar unique identifier).
- [ ] **Privacy Keys in Info.plist**:
  - Verify that the app's location privacy description strings are correctly localized under **Info.plist** (already updated in the repo for geolocation support):
    - `NSLocationWhenInUseUsageDescription`
    - `NSLocationAlwaysAndWhenInUseUsageDescription`
- [ ] **Encryption Exemption Info.plist**:
  - The repository has already added `ITSAppUsesNonExemptEncryption = NO` (`false` in plist) to prevent App Store compliance review blocks for standard HTTPS traffic. Verify that this flag is present in the `Info.plist`.
- [ ] **App Store Icon**:
  - The asset catalog utilizes a modern flat RGB 1024x1024 flat icon with no transparency or alpha channel to prevent App Store Connect processing rejections. Do not replace it with an icon containing an alpha channel.

---

## 4. Verification and Local Testing Protocol

Run verification on a Simulator or Connected Test Device before archiving:
1. **Launch App**: Select a simulator (e.g., iPhone 15 Pro or iPhone 16) and click **Run** (Cmd + R) in Xcode.
2. **Layout & Safe Area Insets**:
   - Verify that the notch, Dynamic Island, and home indicator do not overlap UI elements.
   - The CSS in `src/index.css` sets:
     ```css
     padding-top: env(safe-area-inset-top, 0px);
     padding-bottom: env(safe-area-inset-bottom, 0px);
     ```
     Ensure headers and the `BottomNav` navigation bar respect these boundaries.
3. **Core Native Wrappers**:
   - **Haptic Feedback**: Perform tab switches on `BottomNav.tsx` or save/validate modal records. Verify that haptic signals fire (logs will output in the Xcode console if debug is enabled, and physical devices will vibrate).
   - **Geolocation Lookup**: Access weather or field centroids and ensure location permission dialogs display correctly.
   - **App Lifecycle Resume**: Push the app to the background, and reopen it. Verify that the network banner states sync/sync replay occurs without crashing.
4. **Unit Tests**:
   - Run Vitest locally on macOS to ensure all unit tests remain functional:
     ```bash
     npm run test
     ```

---

## 5. Building and Archiving for Distribution

To upload the build to App Store Connect / TestFlight:
1. **Target**: Select **Any iOS Device (arm64)** as the build target in Xcode (rather than a simulator target).
2. **Product Archive**: Choose **Product > Archive** from the Xcode menu.
3. **Distribute**: Once the organizer opens, select the latest archive and click **Distribute App**.
4. **Destinations**: Choose **App Store Connect** (to upload to TestFlight) and follow the prompts to sign, generate, and upload the build.

---

## 6. Non-Negotiable Project Rules

When modifying or fixing bugs on the macOS side, strict adherence to the project rules in `AGENTS.md` is mandatory. Below is a recap of these core guidelines:

### Data Safety
- **No Hard Deletes**: Never delete database records. Always soft delete by setting `deleted_at` to an ISO timestamp (`new Date().toISOString()`).
- **Farm Scoping**: Every Supabase write must be scoped to the current `farm_id`. Include the null-guard on mutations:
  ```ts
  if (!farm_id) {
    toast.error('No farm selected.');
    return false;
  }
  ```
- **Season Scoping**: Write operations must stamp new records with `viewingSeason` (retrieved from `useFarm()`), not `activeSeason`.
- **Mapper Discipline**: Run camelCase-to-snake_case translation mappers (`@/lib/mappers.ts`) before invoking Supabase mutations or updating React state. Optional fields must use `null` instead of `undefined`.
- **Optimistic Updates**: Every state change must update React state optimistically first, run the Supabase async request, and rollback state to the previous snapshot on error. Returns must be `Promise<boolean>`.

### Web Compatibility
- The codebase remains a shared Web/Native hybrid. **Never** call Capacitor plugins unconditionally. All native behaviors must be wrapped inside conditional guards:
  ```ts
  import { Capacitor } from '@capacitor/core';
  if (Capacitor.isNativePlatform()) {
    // Native-only logic
  }
  ```
  Ensure the app is fully functional in a standard desktop or mobile web browser.
