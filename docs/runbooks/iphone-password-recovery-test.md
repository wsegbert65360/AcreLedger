# iPhone Password-Recovery Test

## Dashboard check before testing

In Supabase, open **Authentication → Email Templates → Recovery**. Confirm the
template uses `{{ .ConfirmationURL }}` for the reset link. This is a manual
dashboard check; do not assume the deployed template matches the repository.

## Device test

1. On a real iPhone, open AcreLedger and choose **Reset Password** from sign in.
   Enter the disposable test account email and submit. Expect the app to confirm
   that the reset email was sent.
2. Open the newest reset email on that iPhone and tap its link. Expect iOS to
   open AcreLedger directly at **Choose New Password**.
3. Enter and confirm a new password. Expect a success message and return to
   sign in.
4. Sign in with the new password. Expect normal authenticated access.

If any step fails, capture the app error, the iOS behavior, and paste the email
link target (without altering it). Identify whether it contains `?code=`,
`?token_hash=...&type=recovery`, or `#access_token`; this determines the next
diagnostic step. Do not paste credentials or account passwords.
