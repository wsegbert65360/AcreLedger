# CodeMagic CI/CD Setup — AcreLedger

This guide walks you through configuring [CodeMagic](https://codemagic.io) to build, sign, and distribute the AcreLedger iOS app.

The `codemagic.yaml` in the repo root follows the [CodeMagic React Native quick start](https://docs.codemagic.io/yaml-quick-start/building-a-react-native-app/) pattern, adapted for a Capacitor 6 web-to-native build.

---

## 1. Prerequisites

- **CodeMagic account** — [Sign up](https://codemagic.io) and connect your Git repository.
- **Apple Developer Program** — Active membership with a distribution certificate.
- **App Store Connect API Key** — Generate at [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api). Requires **App Manager** role.
- **App Store Connect app record** — Create the app in App Store Connect first. The first upload should be done manually; subsequent builds can be automated.

---

## 2. Add the App in CodeMagic

1. Go to **Teams → Apps → Add app**.
2. Select your Git provider and the AcreLedger repository.
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
3. Give it a name — e.g., `AcreLedger_ASC`.
4. Update `codemagic.yaml` to match:

```yaml
integrations:
  app_store_connect: AcreLedger_ASC  # must match the name you gave it
```

---

## 5. Create Environment Variable Group

In **Settings → Environment variable groups**, create a group called **`acreledger-env`**:

| Key | Example | Secure |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Yes |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Yes |
| `VITE_VISUALCROSSING_KEY` | `your-key` | Yes |
| `VITE_RAIN_API_URL` | `https://rain-api.vercel.app` | No |

These are injected at build time by Vite (the `VITE_` prefix makes them available in the web bundle).

---

## 6. Set Your Apple ID

In `codemagic.yaml`, update `APP_STORE_APPLE_ID` with your app's actual Apple ID number:

1. Go to [App Store Connect](https://appstoreconnect.apple.com).
2. Select your app → **General → App Information**.
3. Copy the **Apple ID** number (e.g., `6738492013`).

```yaml
vars:
  APP_STORE_APPLE_ID: 6738492013  # ← your real Apple ID
```

---

## 7. Versioning

- **Marketing version** (e.g., `3.5.0`) is read from `package.json` at build time.
- **Build number** is auto-incremented by querying the latest build number from App Store Connect and adding 1.
- On the first build (no prior uploads), it falls back to CodeMagic's built-in `$BUILD_NUMBER`.

To bump the app version:
1. Update `"version"` in `package.json`.
2. Commit and push to `main`.

---

## 8. Build Flow

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
agvtool new-version (auto-incremented)
  ↓
xcode-project build-ipa → build/ios/ipa/*.ipa
  ↓
Upload to App Store Connect / TestFlight
```

---

## 9. Triggering Builds

| Event | Action |
|---|---|
| Push to `main` | Triggers `acreledger-ios` workflow (full build → IPA → TestFlight) |
| Manual | Click **Start new build** in CodeMagic dashboard |

---

## 10. Files Added / Changed

| File | Purpose |
|---|---|
| `codemagic.yaml` | CI/CD workflow (follows CodeMagic React Native quick start) |
| `.nvmrc` | Pins Node.js 20 |
| `CODEMAGIC.md` | This guide |
| `.gitignore` | Added `build/`, `*.ipa`, `*.xcarchive` |

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

### `app-store-connect get-latest-app-store-build-number` fails
- This requires the app to have at least one build uploaded to App Store Connect.
- On the first build, the fallback `$BUILD_NUMBER` is used automatically.

### IPA builds but doesn't upload to TestFlight
- Verify the `AcreLedger_ASC` integration name matches exactly.
- Ensure the API key has **App Manager** permission.
- Check that an app record exists in App Store Connect.
