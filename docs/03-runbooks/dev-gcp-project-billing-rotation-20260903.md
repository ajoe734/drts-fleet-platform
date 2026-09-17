# Runbook — Dev is running in a personal GCP project, and the org's dev project has no billing

**Status:** needs a decision from someone with Billing Admin · **Owner:** infra /
whoever holds Billing Admin on `billingAccounts/018481-006A8C-BF1660` ·
**Authored:** 2026-09-03

## Why this exists

Dev has now been through **four** GCP projects, and every rotation has been
forced by billing rather than chosen:

| Project                    | Role                 | How it ended                                                          |
| -------------------------- | -------------------- | --------------------------------------------------------------------- |
| `drts-dev-bobo-20260503`   | dev until 2026-06-30 | retired; see `decommission-drts-dev-bobo-20260503.md`                 |
| `drts-dev-ray-tw-20260530` | dev over June/July   | rotated                                                               |
| `drts-dev-ray-tw-20260730` | dev until 2026-08-25 | billing disabled, then **suspended** by Google (`CONSUMER_SUSPENDED`) |
| `nodal-alloy-503700-s3`    | **dev today**        | active — but it is a personal sandbox project (see below)             |

The third one dying is what took the dev deploy rail down from 2026-08-26 to
2026-09-02. This runbook records what the recovery actually landed on, because
the answer is not what the environment naming implies.

## What is actually true (captured 2026-09-03 via `gcloud`)

On 2026-08-25 at 14:06 UTC three projects were created together under
organization `1064164192528`:

```
drts-dev-devcc-20260825    "DRTS Dev"          created 2026-08-25T14:06:27Z
drts-stg-devcc-20260825    "DRTS Staging"      created 2026-08-25T14:06:50Z
drts-prod-devcc-20260825   "DRTS Production"   created 2026-08-25T14:06:50Z
```

Fourteen minutes later, at 14:20 UTC, the GitHub repository variables were
repointed. `STAGING_GCP_PROJECT_ID` and `PROD_GCP_PROJECT_ID` went to their
matching new projects. **`DEV_GCP_PROJECT_ID` did not.** It was set to:

```
nodal-alloy-503700-s3      "DRTS Dev Elainechen"   created 2026-07-27T00:51:43Z
```

— a Google-auto-named project created a month earlier and titled after an
individual.

### Billing is the reason

| Project                    | Billing account                        | Enabled |
| -------------------------- | -------------------------------------- | ------- |
| `drts-dev-devcc-20260825`  | _(none)_                               | **No**  |
| `nodal-alloy-503700-s3`    | `billingAccounts/018481-006A8C-BF1660` | Yes     |
| `drts-stg-devcc-20260825`  | `billingAccounts/018481-006A8C-BF1660` | Yes     |
| `drts-prod-devcc-20260825` | `billingAccounts/018481-006A8C-BF1660` | Yes     |

`drts-dev-devcc-20260825` is an empty shell: Cloud Run Admin, Cloud SQL Admin
and Secret Manager APIs have never been enabled on it. With no billing it could
not have hosted anything, so dev was pointed at a project whose billing worked.
**This was a deliberate workaround, not a typo.**

### What is in the personal project now

As of 2026-09-03 `nodal-alloy-503700-s3` holds the entire dev environment —
9 Cloud Run services, Cloud SQL `drts-dev-db` (`POSTGRES_15`, `RUNNABLE`), and
9 `drts-dev-*` Secret Manager secrets.

It is also the Artifact Registry for **all three environments**:
`DEV_ARTIFACT_PROJECT_ID`, `STAGING_ARTIFACT_PROJECT_ID` and
`PROD_ARTIFACT_PROJECT_ID` all resolve to
`us-central1-docker.pkg.dev/nodal-alloy-503700-s3/drts`.

## Risks

- **Production images live in a personal project.** Whatever happens to that
  project or that individual's access takes the prod image registry with it, not
  just dev.
- **The naming no longer tells the truth.** Staging and prod are
  `drts-*-devcc-20260825`; dev is not, so anyone reading the variables or a
  Cloud Run URL has no way to know dev sits somewhere else entirely.
- **This failure mode has already fired twice.** A dev project losing billing
  has now destroyed one environment (`bobo`, retired) and suspended another
  (`ray-tw-20260730`). Nothing currently alerts on it.

## Remediation

Steps 1–2 need Billing Admin on `018481-006A8C-BF1660`. Note that
`elainechen@dev.cctech-support.com` cannot see that billing account at all
(`gcloud billing accounts list` returns only the closed
`01FE78-DB80DE-742A8B`), so this cannot be done from that account.

1. **Attach billing** to `drts-dev-devcc-20260825`, then enable
   `run.googleapis.com`, `sqladmin.googleapis.com` and
   `secretmanager.googleapis.com` on it.
2. **Move the Artifact Registry off the personal project**, at minimum for
   staging and prod. Prod images should not be stored in an individual's
   sandbox.
3. **Provision and cut dev over.** Create the Cloud SQL instance, the
   `drts-dev-*` secrets and the `drts-dev-runtime` service account in
   `drts-dev-devcc-20260825`, repoint the `DEV_GCP_*` and `DEV_ARTIFACT_*`
   variables, and dispatch `deploy-dev.yml`. Since `CI-DEPLOY-BOOTSTRAP-001` the
   deploy can stand up a project with no Cloud Run services in it, so the eight
   web services no longer have to be created by hand the way three of them were
   on 2026-08-25.
4. **Confirm the 2026-08-25 intent** with `elainechen@dev.cctech-support.com` —
   specifically whether pointing dev at the personal project was meant to be
   temporary, and why `drts-dev-devcc-20260825` never got a billing account.
5. **Alert on it.** A billing-disabled check on the dev and prod projects would
   have caught all three of these rotations before the environment died rather
   than after.

## Related

- `decommission-drts-dev-bobo-20260503.md` — the first rotation
- `support/unblock/S1F-REL-FIN-DEP-001/S1F-REL-FIN-DEP-001-UNBLOCK-MANUAL-UNBLOCK.md`
  — records `billingEnabled: false` on `drts-dev-ray-tw-20260730` before it was
  suspended
- `CI-DEPLOY-IMMUTABLE-TAG-001` / `-002` / `-003`, `CI-DEPLOY-BOOTSTRAP-001` —
  the deploy-rail defects the move to a new registry and an empty project
  exposed

---

## Outcome — 2026-09-08

Dev was cut over to the canonical project. This section records what actually
landed, so the next person does not have to re-derive it.

### What forced it

`nodal-alloy-503700-s3` — the personal project holding the entire dev
environment — is now **`CONSUMER_SUSPENDED`** itself. Every `gcloud` call
against it is refused, so nothing in it could be exported: not the database,
not the three Google Maps keys, not the other secrets. That is the fifth
rotation, and the second project to die rather than be retired deliberately.

### Steps 1 and 3, done

Billing was attached to `drts-dev-devcc-20260825`
(`billingAccounts/0108A0-30D264-286D9C`, `billingEnabled: true`), and the
project was provisioned with `infra/gcp/dev/provision-dev-project.sh`, which was
written for this rotation and is idempotent:

- APIs: run, sqladmin, secretmanager, artifactregistry, iam, iamcredentials, sts, and support APIs
- Cloud SQL `drts-dev-db` — `POSTGRES_15`, `db-custom-1-3840`, `us-central1`, database `drts_fleet_platform`, user `drts_dev`
- Artifact Registry `drts` (`us-central1`, docker) — dev images no longer live in a personal project
- Service accounts `drts-dev-runtime` and `github-actions-deployer`, with the same role split staging uses
- WIF pool `github-actions` + OIDC provider `github`, constrained by `assertion.repository=='ajoe734/drts-fleet-platform'`
- Six Secret Manager secrets, generated in place: `db-url`, `api-key-salt`, `jwt-secret`, `controlled-download-signing-secret`, `referral-embed-handoff-key`, `referral-embed-partner-ingress-key`

Project ownership was granted to `john.lin@dev.cctech-support.com`. The
temporary `roles/owner` used to run the provisioning was removed afterwards.

Google Maps keys were **not** recreated: they are external credentials, the old
ones are unrecoverable, and the deploy requires all three or none. Dev runs the
map provider in its degraded mode until they are supplied.

### Cutover and verification

GitHub variables `DEV_GCP_PROJECT_ID`, `DEV_GCP_CLOUDSQL_INSTANCE`,
`DEV_GCP_RUNTIME_SERVICE_ACCOUNT` and `DEV_ARTIFACT_PROJECT_ID`, plus secrets
`DEV_WIF_PROVIDER` and `DEV_WIF_SERVICE_ACCOUNT`, were repointed.
`deploy-dev.yml` then ran green on `publish/v2026.09.07.0`
(run `34177265018`): 89 migrations applied to the empty database, nine Cloud Run
services deployed, health check and the sixteen candidate-bound operational
journeys all passing. `GET /health` on the API returns 200.

Two failures on the way there, both worth knowing about:

1. **Dispatching from `main` is blocked.** `gh workflow run` defaults to the
   repository default branch, and `deploy-dev.yml` rejects that per
   branch-strategy v4. Dispatch with `--ref publish/v<date>` as well as
   `-f source_ref=publish/v<date>`.
2. **Cross-app origins do not bootstrap in an empty project.** The deploy
   resolves sibling origins by describing already-deployed services, so on a
   project with no services the Tenant Console shipped with its own origin where
   the Ops Console origin belonged, and the `tenant-ops-dispatch-intent`
   acceptance journey failed. Fixed by setting the `DEV_*_ORIGIN` variables
   explicitly; they are no longer order-dependent. `DEV_MAP_PROVIDER_ALLOWED_ORIGINS`
   still held the old project's Cloud Run hostname and was corrected at the same time.

### Still open

- **Step 2 is only half done.** `STAGING_ARTIFACT_PROJECT_ID`,
  `PROD_ARTIFACT_PROJECT_ID` and `PROD_ARTIFACT_REGISTRY` still resolve to the
  suspended `nodal-alloy-503700-s3`, so staging and prod cannot pull or push
  images. Production's image registry is in a dead personal sandbox.
- **Prod has no billing.** `drts-prod-devcc-20260825` is `billingEnabled: false`
  on the old account. Linking it to `0108A0-30D264-286D9C` fails with
  `Cloud billing quota exceeded` — that account is capped despite holding only
  three projects, one of which is an unused default "My First Project". Either
  request a quota increase, or put prod on a verified account rather than the
  newest one.
- **Custom domains are down.** The nine `smarttransport.tw` hostnames pointed at
  the suspended project. `gcloud domains list-user-verified` is empty for
  `john.lin@`, so domain mappings cannot be recreated until the domain is
  re-verified for the operating account and the new deployer service account.
  Dev is reachable only on `*.run.app` until then.
