# iPhone password-recovery device test

Use a disposable account. The reset code is a credential. Do not reuse or forward it.

## Dashboard check (William)

The hosted Recovery template is not updated by git. In Supabase, open **Authentication → Email Templates → Recovery** and make it match `supabase/templates/recovery.html`:

- Subject: `Reset your AcreLedger password`
- Body shows the account email with `{{ .Email }}` and the six-digit code with `{{ .Token }}`
- Do not use `{{ .ConfirmationURL }}` in this template. That variable is a tappable link, and it is not the current recovery path.
- The message says the code expires in 1 hour and works once

In **Authentication → Providers → Email**, keep the email OTP at 6 digits and a 3600-second expiry.

`com.wsegbert.acreledger://auth/recovery` stays permitted in **Authentication → URL Configuration**. This email does not link there. The app still accepts an older PKCE `?code=` link only when it is opened on the same device that requested the reset. It does not accept a `?token_hash=` link: that value is not bound to this device, so the app must not sign in. It also rejects a legacy `#access_token` link.

## Device test

1. On the iPhone, open AcreLedger while signed out, choose **Forgot your password?**, and confirm the screen title is **Reset Password**.
2. Enter the disposable account email and tap **Send code**. Expected: a confirmation that a code was sent, then **Enter Reset Code** with “Enter the 6-digit code we sent to …” for that email.
3. In Mail on the same iPhone, open the newest reset email. Expected: a six-digit code, not a link. Type it into AcreLedger. Expected: **Choose New Password**.
4. Enter and confirm a new password of at least 8 characters, then tap **Update Password**. Expected: “Password updated.” and the farm opens while still signed in. Sign out, then sign in with the new password.

## Failure evidence

Record the app error, iOS version, build number, and whether the email showed a six-digit code or a link. Share the code only through the approved secure channel. In issue trackers write `code=[redacted]`.

A wrong or expired code stays on **Enter Reset Code** and says to check the newest email or tap **Resend code**. If the email still has a link, record only its shape: `?code=…`, `?token_hash=…&type=recovery`, or `#access_token=…`, with the token redacted. Do not open a `?token_hash=` link or a legacy `#access_token` link expecting a session: both must fail and must not sign in. A `?code=` link works only on the device that requested the reset. A link email means the hosted Recovery template is still the old one.
