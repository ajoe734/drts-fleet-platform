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
