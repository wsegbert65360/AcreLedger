# Backup key recovery

The nightly archive is locked with `age`. The Cloud Run job only has the **public** recipient. The private identity never goes in git, Vercel, or the phone app.

## Two copies

Keep the age private identity in two owner-controlled places, for example:

1. A password manager
2. Encrypted removable media stored off-site

Confirm both copies still decrypt a known archive at least twice a year.

## If one copy is lost

Use the other copy immediately. Make a replacement copy. Do not wait.

## If both copies are lost

Existing Drive archives cannot be decrypted. New backups can start after generating a new age key pair and storing the new public recipient in Secret Manager. Old archives remain unreadable.

## Generating a new key pair

Run this on an offline or trusted machine, not in Cloud Run:

```bash
age-keygen -o age-identity.txt
```

Store `age-identity.txt` in the two approved locations. Put only the `age1...` public recipient into Secret Manager as `acreledger-backup-age-recipient`. Never put the `AGE-SECRET-KEY-...` line in Secret Manager for the backup job, in the repo, or in chat.

## Decrypting an archive

```bash
age -d -i age-identity.txt -o backup.tar.zst acreledger-full-....tar.zst.age
```

Wipe the plaintext when the restore is finished.
