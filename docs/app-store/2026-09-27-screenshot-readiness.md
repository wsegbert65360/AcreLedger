# App Store screenshot readiness — 2026-09-27

Status: **DRAFT PIPELINE PROVED; FINAL SCREENSHOTS BLOCKED**

This evidence is for launch preparation only. It does not certify the selected
TestFlight build and must not be uploaded as the final screenshot package.

## Provenance

- Base source: `a8e7c237d9d0b4800979fd7023b914553dbd9341` plus the intentional,
  uncommitted App Store metadata, privacy, and native-landing changes.
- Mac: macOS 26.6.2; Xcode 26.5 (17F42).
- Node: 22.23.2; npm 10.9.8.
- Bundle ID: `com.wsegbert.acreledger`.
- Target simulators: iPhone 17 Pro Max and iPad Pro 13-inch (M5), iOS 26.5.

## Verified

- `npm ci` completed from the checked-in lockfile.
- `npm run cap:build` completed, including CocoaPods synchronization.
- An unsigned Debug simulator build completed with `CODE_SIGNING_ALLOWED=NO`.
- The draft app installed and launched on both required simulator families.
- Native signed-out views were visually inspected after removing web purchase
  prompts. They contain sign-in and product information, but no subscription
  price, trial offer, purchase link, or call to purchase outside the app.
- The capture pipeline produced the primary required dimensions:
  - iPhone: 1320 × 2868.
  - iPad: 2064 × 2752.
- A lossless CoreGraphics conversion produced 8-bit RGB PNGs with no alpha.
- The draft app was uninstalled and both simulators were returned to shutdown.

## Finding corrected during the run

The first native capture exposed the web landing page's `$299` annual price and
free-trial language inside the iOS app. That contradicted the prepared App Review
note and created avoidable review risk. The Capacitor landing experience now
hides pricing, trial, signup, and purchase-oriented calls to action while leaving
the web landing page unchanged. Automated coverage verifies the native gate.

This follows Apple's current rule for a free stand-alone companion to a paid web
tool: there must be no purchasing inside the app or calls to purchase outside it.
Apple also requires metadata and review notes to reflect the actual submitted
experience.

## Remaining blockers

1. Create and approve a disposable review account populated with fictional,
   non-private sample farm data.
2. Select the final TestFlight build from a reviewed commit containing these
   changes.
3. Capture Dashboard, Field detail, Activity, Reports, Storage, and Ask the Book
   on both device families from that exact build.
4. Re-run the dimension, RGB/no-alpha, privacy, and visual-content checks on all
   12 final PNGs.
5. Enter the final assets in App Store Connect only after owner approval.

The repository has no safe production demo mode. The existing developer test
data generator is not an approved review dataset and was not used.

## Apple references

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
  — see 2.1, 2.3, and 3.1.3(f).
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications)
