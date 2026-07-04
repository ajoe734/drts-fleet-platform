# Runbook — Decommission legacy dev project `drts-dev-bobo-20260503`

**Status:** ready to execute · **Owner:** infra / whoever holds Owner + Billing
Admin on the project · **Authored:** 2026-07-04

## Why

Dev migrated off this project on 2026-06-30 to **`drts-dev-ray-tw-20260530`**
(Cloud Run hash `ne55h7sy3a`), which is the value of the `DEV_GCP_PROJECT_ID`
GitHub variable and the current live dev. `drts-dev-bobo-20260503` (hash
`waji3fer3a`, the legacy `waji` deploy profile) is a **retired environment** that
still holds a full set of stale Cloud Run services and a **RUNNABLE Cloud SQL
instance** — i.e. it is **still billing** (`billingAccounts/018FE4-B42A8F-105E34`,
enabled). Decommissioning stops that cost and removes the stale public URLs that
have already caused confusion (they look "live" but are not).

> `drts-dev-passenger-web` was already deleted from this project on 2026-07-04
> (the app itself was retired repo-side; see `REFERRAL-EMBED-MIGRATE-20260616`).

## Inventory (captured 2026-07-04, `gcloud`, region `us-central1`)

- **Project:** `drts-dev-bobo-20260503` (number `75915426578`, state `ACTIVE`)
- **Billing:** `billingAccounts/018FE4-B42A8F-105E34` — **ENABLED**
- **Cloud SQL (1):** `drts-dev-db` (`POSTGRES_15`, `RUNNABLE`) ← main cost driver
- **Cloud Run services (15):** `drts-api`, `drts-dev-api`,
  `drts-dev-bank-console-web`, `drts-dev-channel-partner-portal-web`,
  `drts-dev-concierge-portal-web`, `drts-dev-enterprise-dispatch-web`,
  `drts-dev-fleet-partner-portal-web`, `drts-dev-ops-console-web`,
  `drts-dev-partner-booking-web`, `drts-dev-platform-admin-web`,
  `drts-dev-referral-embed-web`, `drts-dev-tenant-console-web`,
  `drts-fleet-partner-portal-web`, `drts-ops-console-web`,
  `drts-platform-admin-web`
- **Cloud Run jobs (2):** `drts-dev-migrate`, `drts-migrate`
- **Secret Manager (5):** `drts-dev-api-key-salt`,
  `drts-dev-controlled-download-signing-secret`, `drts-dev-db-url`,
  `drts-dev-internal-key`, `drts-dev-jwt-secret`
- **Service accounts (custom 2):**
  `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com`,
  `drts-dev-runtime@drts-dev-bobo-20260503.iam.gserviceaccount.com`
  (+ default `75915426578-compute@developer.gserviceaccount.com`)
- **Artifact Registry (us-central1):** none · **GCS buckets:** none

```sh
# Shared shell vars for every step below
export P=drts-dev-bobo-20260503
export R=us-central1
export ACC=<an-account-with-Owner+BillingAdmin-on-$P>   # e.g. bobo.du@cctech-support.com
```

## Step 0 — Pre-flight safety gates (do NOT skip)

Decommissioning is destructive and, after Step 7, irreversible past a 30-day
window. Confirm ALL of these first:

1. **Nothing current points here.** `DEV_GCP_PROJECT_ID` must be
   `drts-dev-ray-tw-20260530`, and the `waji` profile must be out of use:
   ```sh
   gh variable get DEV_GCP_PROJECT_ID          # expect drts-dev-ray-tw-20260530
   gh variable get WAJI_GCP_PROJECT_ID          # if still drts-dev-bobo-20260503, retire the waji profile FIRST
   grep -n "INPUT_TARGET_PROFILE:-waji" .github/workflows/deploy-dev.yml
   ```
   The `deploy-dev.yml` default profile is still `waji` → **change it to the
   current (ray-tw) profile or remove the waji path before deleting the project**,
   otherwise a manual `deploy-dev` dispatch will fail against a deleted project.
2. **No live traffic.** These services serve only stale builds; confirm with
   product/ops that no partner iframe, tester, or integration still hits a
   `*-waji3fer3a-uc.a.run.app` URL. (The referral embed host already moved to
   `drts-dev-referral-embed-web-ne55h7sy3a`.)
3. **Staging is separate.** This is the *dev* bobo project; do NOT confuse it
   with `drts-staging-bobo-20260502`.

## Step 1 — Back up anything worth keeping

Dev data is generally reproducible from seeds, but take a final SQL export and
snapshot the secret values before deleting.

```sh
# Cloud SQL: export to a GCS bucket you control (create one if needed), or take an on-demand backup.
gcloud sql backups create --instance=drts-dev-db --project=$P --account=$ACC
# (optional) logical export:
# gcloud sql export sql drts-dev-db gs://<your-backup-bucket>/bobo-dev-db-final.sql.gz \
#   --database=<db> --project=$P --account=$ACC

# Secrets: record values if any are still referenced elsewhere (most are dev-only).
for s in drts-dev-api-key-salt drts-dev-controlled-download-signing-secret \
         drts-dev-db-url drts-dev-internal-key drts-dev-jwt-secret; do
  echo "== $s =="; gcloud secrets versions access latest --secret="$s" --project=$P --account=$ACC 2>/dev/null | head -c 0; echo "(access if needed)"
done
```

## Step 2 — Delete Cloud Run services (15) + jobs (2)

Fastest safe cleanup; each is independent.

```sh
for s in drts-api drts-dev-api drts-dev-bank-console-web \
         drts-dev-channel-partner-portal-web drts-dev-concierge-portal-web \
         drts-dev-enterprise-dispatch-web drts-dev-fleet-partner-portal-web \
         drts-dev-ops-console-web drts-dev-partner-booking-web \
         drts-dev-platform-admin-web drts-dev-referral-embed-web \
         drts-dev-tenant-console-web drts-fleet-partner-portal-web \
         drts-ops-console-web drts-platform-admin-web; do
  gcloud run services delete "$s" --project=$P --region=$R --account=$ACC --quiet
done

for j in drts-dev-migrate drts-migrate; do
  gcloud run jobs delete "$j" --project=$P --region=$R --account=$ACC --quiet
done
```

## Step 3 — Delete Cloud SQL (the main cost)

```sh
# Deletion protection may be on; disable then delete.
gcloud sql instances patch drts-dev-db --no-deletion-protection --project=$P --account=$ACC || true
gcloud sql instances delete drts-dev-db --project=$P --account=$ACC --quiet
```

## Step 4 — Delete secrets (5)

```sh
for s in drts-dev-api-key-salt drts-dev-controlled-download-signing-secret \
         drts-dev-db-url drts-dev-internal-key drts-dev-jwt-secret; do
  gcloud secrets delete "$s" --project=$P --account=$ACC --quiet
done
```

## Step 5 — (Artifact Registry / GCS)

None found in `us-central1` at capture time. Re-verify before project delete:

```sh
gcloud artifacts repositories list --project=$P --account=$ACC
gcloud storage buckets list --project=$P --account=$ACC
```

## Step 6 — Delete custom service accounts (2)

Do this only after confirming no other project/workflow impersonates them (the
`github-actions-deployer` was the legacy waji deployer).

```sh
for sa in github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com \
          drts-dev-runtime@drts-dev-bobo-20260503.iam.gserviceaccount.com; do
  gcloud iam service-accounts delete "$sa" --project=$P --account=$ACC --quiet
done
```

## Step 7 — Unlink billing, then delete the project

`gcloud projects delete` is a **soft delete with a 30-day recovery window**;
after 30 days it is permanent. Requires **Owner** on the project and **Billing
Account Administrator** on the billing account.

```sh
# Stop billing first (in case project-delete is delayed / reverted).
gcloud beta billing projects unlink $P --account=$ACC

# Soft-delete the project (recoverable for 30 days via `gcloud projects undelete`).
gcloud projects delete $P --account=$ACC
```

## Rollback

- Before Step 7: individual resources can simply be re-created/redeployed.
- After Step 7 (within 30 days): `gcloud projects undelete $P` restores the
  project shell, but **deleted Cloud SQL / Cloud Run / secrets do NOT come back**
  — only the empty project does. Treat Steps 3–4 as the point of no return for data.

## Post-decommission repo cleanup (separate PR)

Once the project is gone, remove the dead `waji` profile so nothing tries to
deploy there again:

- `.github/workflows/deploy-dev.yml`: drop the `waji` branch of the profile
  resolver (or repoint its defaults), change `INPUT_TARGET_PROFILE:-waji` default.
- Delete stale GitHub vars: `WAJI_GCP_PROJECT_ID`, `WAJI_GCP_CLOUDSQL_INSTANCE`,
  `WAJI_GCP_*_SERVICE`, `WAJI_WIF_*`, `WAJI_ARTIFACT_*`, `WAJI_SECRET_PREFIX`.
