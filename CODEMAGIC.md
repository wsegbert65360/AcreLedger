# CodeMagic CI/CD Setup — AcreLedger

This guide covers configuring [CodeMagic](https://codemagic.io) to build, sign, and distribute the AcreLedger iOS app.

The `codemagic.yaml` in the repo root follows the [CodeMagic React Native quick start](https://docs.codemagic.io/yaml-quick-start/building-a-react-native-app/) pattern, adapted for a Capacitor 6 web-to-native build.

---

## 1. Prerequisites

- **CodeMagic account** — [Sign up](https://codemagic.io) and connect your GitHub repository (`wsegbert65360/AcreLedger`).
- **Apple Developer Program** — Active membership with a distribution certificate.
- **App Store Connect API Key** — Generate at [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api). Requires **App Manager** role.
- **App Store Connect app record** — Create the app in App Store Connect first. The first upload should be done manually; subsequent builds can be automated.

---

## 2. Add the App in CodeMagic

1. Go to **Teams → Apps → Add app**.
2. Select GitHub and the `wsegbert65360/AcreLedger` repository.
3. Choose **"Use codemagic.yaml from repository"** as the build configuration source.

---

## 3. Upload Code Signing Credentials

In the CodeMagic UI, go to **Settings → Code signing (iOS)**:

1. Upload your **Apple Distribution Certificate** (`.p12` file).
   - You'll need the `.p12` file and its password.
2. Upload your **Provisioning Profile** (`.mobileprovision` file).
   - Must match the bundle ID `com.wsegbert.acreledger` and your distribution certificate.

CodeMagic stores these securely and injects them into the build environment. The `codemagic.yaml` references them via the `ios_signing` block.

---

## 4. Add App Store Connect Integration

In the CodeMagic UI, go to **Settings → Developer Portal integrations**:

1. Click **Add → App Store Connect**.
2. Enter your **Issuer ID**, **Key ID**, and paste the **private key** (`.p8` file contents).
3. Name it **`appstore`** — this must match the `integrations.app_store_connect` value in `codemagic.yaml`.
4. Save.

The yaml uses `auth: integration` which automatically references this integration.

---

## 5. Create Environment Variable Group

In **Settings → Environment variable groups**, create a group called **`appstore`**:

| Key | Example | Secure |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Yes |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Yes |
| `VITE_VISUALCROSSING_KEY` | `your-key` | Yes |
| `VITE_RAIN_API_URL` | `https://rain-api.vercel.app` | No |
| `APP_STORE_CONNECT_KEY_ID` | `2F8X4G5J3K` | No |
| `APP_STORE_CONNECT_ISSUER_ID` | `12345678-1234-...` | No |
| `APP_STORE_CONNECT_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----...` | Yes |

The `VITE_*` variables are injected at build time by Vite. The `APP_STORE_CONNECT_*` variables are used for TestFlight publishing via `auth: integration`.

---

## 6. Versioning

- **Marketing version** (e.g., `3.5.0`) is read from `package.json` at build time.
- **Build number** uses CodeMagic's built-in `$BUILD_NUMBER` counter.

To bump the app version:
1. Update `"version"` in `package.json`.
2. Commit and push to `main`.

---

## 7. Build Flow

```
npm ci
  ↓
eslint (lint)
  ↓
vitest (unit tests)
  ↓
vite build --mode capacitor + npx cap sync ios
  ↓
cd ios/App && pod install
  ↓
xcode-project use-profiles
  ↓
agvtool new-marketing-version (from package.json)
agvtool new-version ($BUILD_NUMBER)
  ↓
xcode-project build-ipa → build/ios/ipa/*.ipa
  ↓
Upload to App Store Connect / TestFlight
```

---

## 8. Triggering Builds

| Event | Action |
|---|---|
| Push to `main` | Triggers `acreledger-ios` workflow (full build → IPA → TestFlight) |
| Manual | Click **Start new build** in CodeMagic dashboard |

---

## 9. Files

| File | Purpose |
|---|---|
| `codemagic.yaml` | CI/CD workflow |
| `.nvmrc` | Pins Node.js version |
| `CODEMAGIC.md` | This guide |

---

## Troubleshooting

### Build fails on `npm ci`
- Ensure `package-lock.json` is committed and up to date.
- Run `npm install` locally and commit the updated lockfile.

### CocoaPods errors
- Run `cd ios/App && pod install` locally and commit the updated `Podfile.lock`.

### Code signing errors
- Verify your distribution certificate and provisioning profile are uploaded in CodeMagic.
- Ensure the profile matches bundle ID `com.wsegbert.acreledger`.
- Check the certificate isn't expired.

### IPA builds but doesn't upload to TestFlight
- Verify your App Store Connect integration in CodeMagic settings.
- Ensure the API key has **App Manager** permission.
- Check that an app record exists in App Store Connect.

### App shows "load failed" on launch
- The `appstore` environment variable group is missing or has incorrect values.
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly.
- Rebuild after adding the variables.
