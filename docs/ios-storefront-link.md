# iOS: website upgrade link (US storefront only)

Decision (2026-11-08): the iOS app keeps a link to the website's Pro plan, shown only to users on the
US App Store storefront. No in-app purchase for now (see "Later" below).

## Why this is allowed
Since the May 2025 Epic ruling, App Review Guidelines 3.1.1(a) and 3.1.3 let apps on the **US storefront**
include buttons, external links and calls to action to other purchase methods, with no entitlement.
Everywhere else the old anti-steering rule still applies, so the link must not appear there.

Open risks (recheck at submission):
- Apple's commission on these links is 0% now but the court case is not final (Supreme Court review pending;
  Apple has asked for up to 15%).
- App Review may still ask for in-app purchase when paid features are unlocked from a web purchase
  (3.1.1 / 3.1.3(b)). Reviewers have been inconsistent. If that happens: add IAP, or hide the link and the
  paid-plan wording on iOS.

## What the app does
- `src/lib/storefront.ts` + `src/hooks/useIosUpgradeLink.ts`: the link shows only when ALL are true:
  platform is iOS, `Storefront.current.countryCode` is `USA`, and `VITE_UPGRADE_URL` is a valid https URL.
  Anything else (plugin missing, error, unknown storefront, non-US, URL unset) means no link. Fail closed.
- The link lives in one place: the Settings "Your plan" card (`PlanCard`). It opens the system browser
  (Safari). Nothing is bought or entered inside the app, and no price is shown in the app.
- Without the link the card says: "Plans are managed on the AcreLedger website."
- Android and web are unchanged.

## Xcode steps: DONE on a Mac (2026-11-08, commit bebc1dd)
Both Swift files are in the App target and the storyboard uses `MainViewController`. Verified: simulator build with
no warnings in the two files, app launches, and `Storefront.getCountryCode()` answers `USA` on the simulator.
NOT yet verified: the link on the real Settings screen (needs a signed-in session), a non-US account (link must
stay hidden), and a real device or TestFlight build. Original steps, kept for reference:
1. `npx cap sync ios`, then open `ios/App/App.xcworkspace` in Xcode.
2. Right-click the App group, "Add Files to App...", select `StorefrontPlugin.swift` and
   `MainViewController.swift`, tick the **App** target.
3. Open `Base.lproj/Main.storyboard`, select the view controller, and in the Identity inspector set
   Class = `MainViewController`, Module = `App` (it is currently `CAPBridgeViewController` / `Capacitor`).
4. Build and run. In the Safari/Web Inspector console, `Capacitor.Plugins.Storefront.getCountryCode()` should
   resolve with a code. If it rejects with "not implemented", the files or storyboard step is missing.
5. Set `VITE_UPGRADE_URL` for the iOS build to the website plans page.
6. Test with a US sandbox/TestFlight account AND a non-US one. Storefront values have been reported as
   unreliable on some iOS 18 and TestFlight setups; the failure mode is a hidden link, never a wrongly
   shown one.

## Draft App Review notes (paste into App Store Connect, edit as needed)
> AcreLedger is a free farm record-keeping app. A Pro plan, sold on our website, adds reports and extra
> tools. The app offers no purchase flow. On the US storefront only, the Settings screen includes a link
> that opens our website in Safari, as permitted by Guideline 3.1.1(a) for US-storefront apps. On all other
> storefronts the app shows no link and no pricing. Free-plan users keep full access to record keeping and to
> exporting their own data.

## Later
Apple In-App Purchase (RevenueCat or StoreKit + App Store Server Notifications feeding `farm_entitlement`)
is a self-contained add-on if App Review requires it or iOS buyers matter. 15% (Small Business Program,
verify) to 30% Apple commission applies.
