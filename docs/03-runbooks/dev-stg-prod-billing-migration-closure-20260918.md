# Runbook — dev/staging/prod billing moved off the dead account; what closed and what did not

**Status:** billing migration complete and verified · registry and alerting gaps
still open · **Owner:** infra / whoever holds Billing Admin on
`billingAccounts/0108A0-30D264-286D9C` · **Authored:** 2026-09-18

Follow-up to `dev-gcp-project-billing-rotation-20260903.md`. That runbook left
five remediation steps open. Steps 1 and 3 have since been done by someone else;
this document records the billing migration that closed the rest, the evidence
behind it, and the two things it did **not** fix.

## What changed

All three DRTS projects were moved off `018481-006A8C-BF1660` — the account the
2026-09-03 runbook was written around — onto `0108A0-30D264-286D9C`.

| Project                    | Before                            | After                      |
| -------------------------- | --------------------------------- | -------------------------- |
| `drts-dev-devcc-20260825`  | _(no billing account)_ · `false`  | `0108A0-…` · `true`        |
| `drts-stg-devcc-20260825`  | `018481-006A8C-BF1660` · `false`  | `0108A0-…` · `true`        |
| `drts-prod-devcc-20260825` | `018481-006A8C-BF1660` · `false`  | `0108A0-…` · `true`        |

Note the `false` in the "before" column for all three. This was not a change of
payer on working projects — **billing was disabled across every environment**,
including prod, and the migration restored it. `018481-006A8C-BF1660` was closed
and is not visible to any account we hold.

### Why it needed two people

No single account could do it. The permissions split cleanly in half:

| Account                            | Billing-account side          | Project side                        |
| ---------------------------------- | ----------------------------- | ----------------------------------- |
| `john.lin@dev.cctech-support.com`  | `resourceAssociations.create` | none at the time                    |
| `admin@dev.cctech-support.com`     | none                          | org `organizationAdmin`+`folderAdmin` |
| `yen.tsai@dev.cctech-support.com`  | none                          | none                                |

A relink needs `billing.resourceAssociations.create` on the target account **and**
`resourcemanager.projects.setBillingAccount` on the project. `admin@`'s org roles
do not include the latter — `organizationAdmin` grants IAM administration, not
billing assignment.

Resolution: `admin@` granted `john.lin@` `roles/billing.projectManager` on the
three projects; `john.lin@` performed the relink; the grant was revoked
afterwards. Revoking is safe because `john.lin@` holds
`billing.resourceAssociations.delete` on `0108A0-30D264-286D9C` and can still
detach the projects from the account he pays for. Re-attaching, however, now
requires `admin@` to grant the role again.

### Gotcha worth knowing

`roles/billing.projectManager` grants `createBillingAssignment` and
`deleteBillingAssignment` but **not** `resourcemanager.projects.get`. A principal
holding it can run `gcloud billing projects link` successfully while
`gcloud billing projects describe` keeps returning permission denied. Do not use
`describe` as a propagation or success check for that principal — verify from an
account with project read access instead.

### Quota

`0108A0-30D264-286D9C` caps at **3 attached projects**; a fourth returns
`Cloud billing quota exceeded`. `logical-air-507915-i7` (an empty auto-created
"My First Project") was detached to free the slot for prod, and is now at
`billingEnabled: false`. The account is full. Adding anything needs a quota
increase: https://support.google.com/code/contact/billing_quota_increase

## Verification

Checked from `admin@` and `elainechen@`, not from the account that performed the
writes.

- **Billing** — all three projects report `billingAccounts/0108A0-30D264-286D9C`
  and `billingEnabled: true`. `gcloud billing projects list` on the account
  returns exactly those three.
- **Services** — every Cloud Run service is `Ready: True`: dev 9, staging 3,
  prod 9. Restoring billing did not disturb any running workload.
- **Cutover confirmed** — `drts-dev-devcc-20260825` is no longer the empty shell
  the 2026-09-03 runbook described. It now holds Cloud SQL `drts-dev-db`
  (`POSTGRES_15`, `RUNNABLE`), 9 secrets, 9 Cloud Run services and a `drts`
  Docker repository. **Steps 1 and 3 of that runbook are done.**
- **Nothing stranded on the old account** — no account we hold can read
  `018481-006A8C-BF1660` directly, so this was checked from the other side: a
  billing audit of all 29 projects in org `1064164192528` found **zero**
  projects still attached to it.
- **Registry wiring** — confirmed against the GitHub repository variables, not
  inferred. See "Still open" below: no environment points at the suspended
  `nodal-alloy-503700-s3` any more, but prod and staging now resolve to the dev
  project.

## The `roles/owner` grant on dev — investigated, benign

`john.lin@` holds `roles/owner` on `drts-dev-devcc-20260825` and on neither
staging nor prod. This was **not** part of the billing migration and looked
anomalous, so it was traced through Cloud Audit Logs.

Timeline, all 2026-09-08 UTC, all on dev; staging and prod had no IAM changes:

| Time     | Principal    | Change                                          |
| -------- | ------------ | ----------------------------------------------- |
| 00:30:24 | `john.lin@`  | `AssignResourceToBillingAccount`                |
| 00:47:32 | `elainechen@`| ADD `roles/owner` → `admin@`                    |
| 00:49:10–37 | `elainechen@` | 10 standard roles → `drts-dev-runtime` and `github-actions-deployer` SAs |
| 00:59:31 | `elainechen@`| ADD `roles/owner` → `john.lin@`                 |
| 01:00:09 | `john.lin@`  | REMOVE `roles/owner` → `admin@`                 |

The 00:49 block is exactly the role set the dev provisioning script grants (see
"a provisioning script that is not committed" below). This is a dev provisioning
run: `admin@` was made owner to execute it, ownership
was handed to `john.lin@` at the end, and the temporary `admin@` owner was
removed. That last step is why `admin@` has no direct binding on these projects
today and had to work through org-level roles during the billing migration.

Both entries came from `130.211.247.199` with user agent
`claude-code_2-1-263_agent` — the same host and toolchain as the billing
migration itself (`claude-code_2-1-273_agent`, same IP). Not an external actor.

`john.lin@` used the owner role twice: the 2026-09-08 removal above, and on
2026-09-16 12:00–12:04 to create 3 secrets, add versions and set secret IAM. No
other writes, nothing outside dev.

**Conclusion: deliberate and in use. Leave it.** The only thing worth a decision
is the governance asymmetry — dev has two owners (`elainechen@`, `john.lin@`),
staging and prod have one (`elainechen@`).

## Still open

### 1. Prod and staging pull their images from the **dev** project

`nodal-alloy-503700-s3` — the personal project that used to host dev and serve
as registry for all three environments — now returns `CONSUMER_SUSPENDED` on
every API. It is **not** a billing problem this time: `lifecycleState: ACTIVE`,
billing `01311B-9E9926-9A2ACD`, `billingEnabled: true`. The suspension is
Google-side and separate.

Nothing points at it any more, so no deploy is currently broken by it. The
repository variables were repointed on 2026-09-08:

| Variable                      | Value                      | Set at (UTC)         |
| ----------------------------- | -------------------------- | -------------------- |
| `DEV_ARTIFACT_PROJECT_ID`     | `drts-dev-devcc-20260825`  | 2026-09-08T01:09:41Z |
| `STAGING_ARTIFACT_PROJECT_ID` | `drts-dev-devcc-20260825`  | 2026-09-08T04:41:18Z |
| `PROD_ARTIFACT_PROJECT_ID`    | `drts-dev-devcc-20260825`  | 2026-09-08T04:41:18Z |
| `PROD_ARTIFACT_REGISTRY`      | `us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts` | 2026-09-08T04:41:19Z |

`drts-dev-devcc-20260825` is the only one of the three projects holding an
Artifact Registry repository; staging and prod have none of their own.

So step 2 of the 2026-09-03 runbook was half-done. Prod images are out of an
individual's sandbox — but they now live in the **dev** project, which is the
same class of dependency one rung less bad. Concretely: until 2026-09-17 that
project sat at `billingEnabled: false`, meaning prod's image supply chain was
hanging off a project with no billing, and a suspension there would take prod
deploys down exactly the way `nodal-alloy` went down.

Give staging and prod their own registries, or stand up a shared one that is not
an environment project.

### 1a. `GCP_PROJECT_ID` is stale

The unprefixed `GCP_PROJECT_ID` is still `autotaxi-492811` (set 2026-04-16), a
project that is not in org `1064164192528` at all. Workflows that fall back to it
— `STAGING_GCP_PROJECT_ID || GCP_PROJECT_ID` appears in the deploy rail — would
target something unrelated. Harmless while the prefixed variables are set; worth
deleting so it cannot be reached.

### 2. `drts-dev-devcc-20260908` — an abandoned second dev project

`DRTS Dev 20260908`, created 2026-09-08T01:10:38Z — 60 seconds after the
provisioning run above finished. No billing account, `billingEnabled: false`,
Cloud Run Admin API never enabled, no resources.
The dev provisioning script pins its target to `drts-dev-devcc-20260825`, so
nothing points at it. It appears to be a false start. Left untouched; delete it
if nobody claims it.

### 2a. The dev provisioning script is not committed

The script that performs the 00:49 role grants — `provision-dev-project.sh`,
under the `infra/gcp/dev/` directory — exists only as an untracked file in
working trees. It is not in the repository, so it is deliberately not linked
above: CI's cited-paths check rejects references to paths git does not know.
The provisioning of a GCP project is therefore reproducible only from whichever
checkout still has the file. Commit it.

### 3. Carried over, still unaddressed

Step 5 of the 2026-09-03 runbook — **alert on billing-disabled** — remains open.
Every environment including prod sat at `billingEnabled: false` and it was found
by hand, not by a monitor. That runbook counted two silent billing deaths; this
makes three.

## Related

- `dev-gcp-project-billing-rotation-20260903.md` — the prior runbook this closes
  steps 1 and 3 of, and leaves 2 and 5 open
- `decommission-drts-dev-bobo-20260503.md` — the first rotation
