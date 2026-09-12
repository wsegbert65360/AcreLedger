# Cloud Scheduler example — AcreLedger owner backup

Do not enable this schedule until the verification gates in `docs/runbooks/owner-backup-operations.md` have passed.

## Job

- Name: `acreledger-owner-backup-nightly`
- Region: same as the Cloud Run Job when possible
- Time zone: `America/Chicago`
- Frequency: `0 2 * * *` (02:00 America/Chicago every day)
- Target: Cloud Run Job `acreledger-owner-backup`
- Overlap: the worker also rejects a second run for the same Chicago date

## Example command

```bash
gcloud scheduler jobs create http acreledger-owner-backup-nightly \
  --location=REGION \
  --schedule="0 2 * * *" \
  --time-zone="America/Chicago" \
  --uri="https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/acreledger-owner-backup:run" \
  --http-method=POST \
  --oauth-service-account-email=acreledger-owner-backup-scheduler@PROJECT_ID.iam.gserviceaccount.com
```

## Monitoring

Create log-based alerts on Cloud Logging for:

- `jsonPayload.event="BACKUP_FINAL" AND jsonPayload.success=false`
- `jsonPayload.event="BACKUP_ALERT"`
- No `jsonPayload.event="BACKUP_FINAL" AND jsonPayload.success=true` within 30 hours

Route those alerts to the owner destination email. Never treat scheduler invocation alone as backup success.
