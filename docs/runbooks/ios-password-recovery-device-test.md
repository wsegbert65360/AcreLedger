# iPhone password-recovery device test

Use a disposable account. Do not reuse or forward a reset link: it is a credential.

## Dashboard check (William)

In Supabase, open **Authentication → Email Templates → Recovery**. Confirm the recovery-link
template uses `{{ .ConfirmationURL }}` for its link target. This setting is outside this repository;
it has not been verified from source control. Confirm the native redirect URL
`com.wsegbert.acreledger://auth/recovery` remains permitted in **Authentication → URL Configuration**.

## Device test

1. On the iPhone, open AcreLedger while signed out and choose **Reset Password**.
2. Enter the disposable account email and submit. Expected: the app confirms that a reset email was
   sent.
3. In Mail on the same iPhone, open the newest reset email and tap its reset link. Expected: iOS
   opens AcreLedger and it displays **Choose New Password**.
4. Enter and confirm a new password, then submit. Expected: the app confirms the password changed,
   signs out, and the new password works at sign-in.

## Failure evidence

Capture the app error, iOS version, build number, and whether AcreLedger opened. Most importantly,
record the recovery-link format from the email target: `?code=…`, `?token_hash=…&type=recovery`, or
`#access_token=…`. The target contains a live credential: share it only through the approved secure
channel and redact the token values in issue trackers/screenshots (for example,
`?token_hash=[redacted]&type=recovery`). A legacy `#access_token` link is expected to show the
message asking for a new reset email; it must never sign in a session.
