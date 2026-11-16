# Offline, native, and accounts

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/lib/native.ts, src/lib/syncQueue.ts, src/main.tsx, capacitor.config.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [Account, Credential, and Password-Recovery Safety](#account-credential-and-password-recovery-safety)
- [Native & Offline Capability](#native--offline-capability)
<!-- contents:end -->

## Account, Credential, and Password-Recovery Safety

Canonical detail: [BLUEPRINT → Account Lifecycle and Native Credential Safety](../../BLUEPRINT.md#account-lifecycle-and-native-credential-safety).

- Account deletion is a request (`account_deletion_requests`), never a client-side delete. Never add client update/delete grants or let request input choose another user or farm.
- Native credentials and encryption material go through `secureStorage` (Keychain/Keystore).
- Keep the native recovery scheme `com.wsegbert.acreledger://auth/recovery`, the Supabase redirect allowlist, `Info.plist`, the app listener, and recovery tests synchronized. Never accept arbitrary custom-scheme hosts or paths, and never establish a session from raw `access_token`/`refresh_token` values in the URL: the native listener accepts a PKCE `code` (`exchangeCodeForSession`) or a `token_hash` only when `type=recovery` (`verifyOtp`).
- On `/auth?mode=recovery` the browser client must leave `detectSessionInUrl` off so the one-time PKCE code is exchanged only by `establishWebPasswordRecoverySession`. If that exchange fails or returns no session, reject it — do not treat an existing `getSession()` as this reset. A missing PKCE verifier tells the user to open the link in the same browser or app that requested the reset. Other URLs, including sign-in and sign-up, keep auto-detect.
- Signup always shows the check-your-email screen. Production Confirm email in the Supabase Auth dashboard is an owner toggle; this repository does not flip it.

## Native & Offline Capability

- **Web Compatibility**: The codebase is a shared web/native hybrid. Never call Capacitor plugins unconditionally. All native device APIs must check `Capacitor.isNativePlatform()` or use `@/lib/native.ts` wrappers.
- **Offline Operations**: Mutations queue locally when offline (`@/lib/syncQueue.ts`, `@/lib/offlineStorage.ts`) and replay on reconnect or foreground resume; batching rules are under [Optimistic Update Pattern](./data-safety.md#optimistic-update-pattern). Native iOS SQLite encryption must stay explicitly on (`CapacitorSQLite.iosIsEncryption: true` in `capacitor.config.ts` and the copied iOS config). The plugin treats a missing key as encryption off, which prevents opening the encrypted store.

- **Haptic Feedback**: Trigger native haptic feedback on major user interactions:
  - Navigation tab taps: light haptic feedback.
  - Record save/validation success: success notification haptic.
  - Form validation failure: error notification haptic.
- **Layout Insets**: Use CSS env safe-area variables for header and bottom navigation spacing to prevent content overlaps on notched screens (e.g. Dynamic Island).
- **PWA / Service Worker** (`src/main.tsx`): In `DEV`, service workers and caches are unregistered/cleared on load so code changes always win. In production, `registerSW` is wired so a waiting worker (`onNeedRefresh`) **and** a `controllerchange` flip both trigger an auto-reload — iOS checks for SW updates only ~daily on its own, so the app also polls `registration.update()` on `visibilitychange`, `focus`, `online`, and every 30 min while visible. Four safety guards must be preserved when touching this code:
  - The reload is deferred while a Radix overlay is open (`[data-state="open"]`, `[role="dialog"]`, `[role="alertdialog"]`) so unsaved form entries aren't lost; after `MAX_DEFERS` (10 × 30 s ≈ 5 min) it force-reloads so a stuck overlay can't pin the tab to a stale worker forever.
  - The `controllerchange` handler is guarded on `hadControllerAtLoad` so a first-ever visit (where the new worker claims a previously-uncontrolled page via `clients.claim()`) is **not** reloaded. Don't drop either guard — reloading on first load or mid-entry both wreck UX.
  - Navigations are served **network-first** by the `NavigationRoute` built in `@/lib/swNavigation.ts`, raced against `NAVIGATION_TIMEOUT_MS` (3 s); a hang, a network failure, or a non-OK response falls back to the current precached `/index.html`. There is **no runtime HTML cache** — don't add one, and don't pass a `RequestInit` to the navigate fetch, which re-arms the timer race.
  - `@/lib/swReload.ts` permits a **single** retry after a reload. If a navigation still fails once the page has already reloaded for this reason, stop reloading and surface the failure rather than looping. `src/test/swSource.test.ts` asserts these properties against the compiled worker source; keep it green.
