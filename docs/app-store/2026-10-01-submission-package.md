# AcreLedger App Store submission package

Prepared September 27, 2026 for the October 1 launch target. This file is the
source of truth for App Store Connect entry. It is preparation only: do not add
the version for review or submit it without the owner's explicit approval.

## Release decision

- App Store version: **3.6.0**. Change the existing editable 1.0 version record
  to 3.6.0, or replace it with a 3.6.0 record, so it matches the build's
  `CFBundleShortVersionString`.
- Build: do **not** select TestFlight build 185. It predates commit `a8e7c23`,
  which fixes the iOS update status. Select the first validated TestFlight build
  produced from `a8e7c23` or a reviewed descendant containing that commit.
- Release: manual. This leaves the owner in control of the public release after
  approval.
- Primary language: English (U.S.).
- Primary category: Business.
- Secondary category: Productivity.
- Content rights: AcreLedger does not stream, display, or distribute third-party
  editorial content. Map and weather services supply app functionality under
  their terms. Confirm the corresponding App Store Connect content-rights answer.
- Made for Kids: no.

The exact listing copy is in [`metadata.en-US.json`](./metadata.en-US.json).

## App Review information

Enter these values in App Store Connect:

- Contact first name: Will
- Contact last name: Egbert
- Contact email: `support@acreledger.com`
- Contact phone: **OWNER ACTION — enter a monitored phone number**
- Sign-in required: yes
- Demo account username: **OWNER ACTION — enter the disposable review account**
- Demo account password: **OWNER ACTION — enter it only in App Store Connect**

Never commit the review password to Git. Before submission, sign in to the demo
account on the submitted build and confirm that it contains representative,
non-private sample data.

### Review notes

Paste the following into App Review Notes:

> AcreLedger is a farm recordkeeping app. The demo account opens a representative
> farm with fields, activity, grain, and report data.
>
> Suggested review path: sign in; open a field to view its map and quick-log
> actions; open Activity to review season records; open Reports to view report
> readiness and export options; then open Setup > Account & Display to find
> Delete Account.
>
> The iOS app contains no purchase flow, subscription price, or link or call to
> action for purchasing outside the app. Its signed-out screen is limited to
> product information and sign-in. The supplied demo account has access for
> review.
>
> Location is optional and is used for field coordinates and local weather.
> Voice input is optional. Apple's speech recognition turns speech into text;
> AcreLedger sends the resulting text question, not an audio recording, to Ask
> the Book. Ask the Book is read-only and cannot change farm records.
>
> Account deletion starts in Setup > Account & Display. The user types DELETE to
> confirm. AcreLedger records the request, signs the user out, and completes the
> request within 30 days. Deletion is blocked while offline changes are waiting
> to sync so farm work is not silently lost.

## App privacy answers

Privacy policy URL: `https://acreledger.vercel.app/privacy`

Answer **Yes, we collect data from this app**. Declare every row below as linked
to the user, used for app functionality, and not used for tracking.

| App Store data type | Why it is disclosed |
| --- | --- |
| Contact Info > Email Address | Account authentication and optional work-request provider email. |
| Contact Info > Phone Number | Optional customer phone in saved work requests. |
| Contact Info > Physical Address | Optional application-site and work-request billing addresses. |
| Identifiers > User ID | Supabase account and farm access. |
| Location > Precise Location | Field coordinates, boundaries, weather, rainfall, and navigation points. |
| User Content > Photos or Videos | Optional spray-ticket and product-label photos saved with spray records. |
| Search History | Ask the Book text questions and answers retained in an operational log for 30 days. |
| User Content > Other User Content | Farm records, notes, field geometry, report inputs, work requests, and Ask the Book text. |

For each row:

- Collected: yes
- Linked to the user's identity: yes
- Used for tracking: no
- Purpose: App Functionality only

Do not declare audio data. AcreLedger does not retain voice audio; iOS performs
speech recognition and AcreLedger receives the resulting text. Do not declare
payment information, purchase history, advertising data, or diagnostics unless
the submitted build starts collecting them. The native app has no billing or
analytics SDK.

The checked-in privacy manifest and public privacy policy use the same eight
data categories. Publish the App Store privacy responses only after comparing
them to the submitted build's Xcode privacy report.

## Age rating answers

Use the current App Store Connect questionnaire:

- Parental or content controls: no.
- Age assurance: no.
- Unrestricted web access: no. Links may open a specific map or support page;
  AcreLedger is not a web browser.
- User-generated content: no. A farmer's private records are not broadly
  distributed to other users.
- Messaging and chat: no. Ask the Book is an assistant, not person-to-person chat.
- Social media: no.
- Advertising: no.
- Profanity, crude humor, horror/fear, alcohol/tobacco/drugs: none.
- Medical or treatment information: none.
- Sexual content or nudity: none.
- Violence, weapons, or graphic content: none.
- Gambling, simulated gambling, contests, loot boxes, or chance-based activity:
  none/no.
- Made for Kids: no.
- Override to a higher age rating: not applicable.
- Age suitability URL: leave blank.

Expected result: Apple's lowest general-audience rating (currently 4+ in the
U.S.). App Store Connect is authoritative; stop and review if it calculates a
higher rating.

## Export compliance

`ios/App/App/Info.plist` sets `ITSAppUsesNonExemptEncryption` to `false`. The app
uses Apple/platform encryption and standard HTTPS plus the submitted build has
already been classified as using no non-exempt encryption. Reconfirm this on the
new build; do not change the answer if the cryptography changes.

## Screenshot package

Acceptance for the review account and the 12 final screenshots is in
[`2026-10-01-review-acceptance.md`](./2026-10-01-review-acceptance.md). Draft
captures do not meet that bar.

The target supports iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`), so both
sets are required. Capture clean, current screens from the exact release build
with representative sample data and no real customer information.

Use these primary portrait sizes:

- iPhone 6.9-inch: 1320 × 2868 PNG, no alpha.
- iPad 13-inch: 2064 × 2752 PNG, no alpha.

Capture the same six scenes in this order:

1. Dashboard — weather, acreage, crop filters, and field cards. Caption concept:
   `Your whole farm at a glance`.
2. Field detail — a clear boundary map and quick-log actions. Caption concept:
   `Every field mapped and ready to log`.
3. Activity — varied planting, spray, harvest, and grain entries. Caption
   concept: `The season in one feed`.
4. Reports — report readiness with all sample fields ready. Caption concept:
   `Know what is ready before you export`.
5. Storage — bins with inventory and recent movements. Caption concept:
   `Know what is in every bin`.
6. Ask the Book — a useful read-only question and answer using sample data.
   Caption concept: `Ask a question about your farm book`.

Capture rules:

- Use the release build, not the web landing-page images. The existing 325 × 700
  landing images are cropped and are not valid App Store assets.
- Keep the entire viewport visible, including bottom navigation where present.
- Use consistent dark mode, season, farm name, status bar time, and sample data.
- Do not show email addresses, exact home locations, API errors, debug controls,
  browser chrome, TestFlight dialogs, or real farm/customer data.
- If text overlays are added, keep the underlying UI legible and do not claim
  capabilities that are not visible in the submitted build.
- Validate pixel dimensions and confirm PNGs have no alpha before upload.

## Build-selection checklist

Before selecting the build:

- [ ] GitLab, GitHub, and Codeberg point at the same reviewed release SHA.
- [ ] A CodeMagic TestFlight build from that SHA is Validated and Ready to Submit.
- [ ] Marketing version is 3.6.0 and the App Store version record is 3.6.0.
- [ ] `a8e7c23` is an ancestor of the build SHA.
- [ ] The build passes sign-in, password recovery, offline/force-quit/reconnect,
      permissions denial, exports, account deletion, and no-iOS-billing checks.
- [ ] Xcode's privacy report matches the eight declared data categories.
- [ ] iPhone and iPad screenshots come from the selected build.
- [ ] Review credentials work on a clean installation.

## Owner-only actions remaining

1. Provide the monitored review phone number and enter review credentials in
   App Store Connect.
2. Accept the Apple Developer Program agreement.
3. Resolve DSA trader status or exclude EU distribution.
4. Capture the screenshot sets on the Mac after the exact release build exists.
5. Enter the package in App Store Connect, but stop before **Add for Review** and
   **Submit for Review** until the owner explicitly approves submission.
