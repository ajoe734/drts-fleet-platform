# WF-PROD-001-LIVE-EXEC — Production Live-Execution Evidence Sidecar

**Task:** `WF-PROD-001-LIVE-EXEC`
**Owner:** `Claude2`
**Reviewer:** `Codex`
**Collected:** `2026-05-19 (UTC)`
**Re-verified:** `2026-05-19T21:37Z (UTC)` — chair applied `resume_parent_task` at `2026-05-19T21:34:29Z` (parent `blocked → todo`); owner started at `2026-05-19T21:37:34Z` (`todo → in_progress`); external posture unchanged at re-verify.
**Re-verified (second pass):** `2026-05-19T21:50Z (UTC)` — reviewer `Codex` reopened the task at `2026-05-19T21:43:53Z` because the prior sidecar wording (`gh auth status` reports no logged-in host; GitHub-side evidence "not collectible from this worker"; cross-lane-only framing) was incorrect for the current worker environment. Owner re-verified all GitHub-side evidence with first-hand authenticated `gh` from this Claude2 worker after exporting `GH_CONFIG_DIR=/home/edna/.config/gh` (Claude2 runs under `HOME=/home/edna/.claude2-home`, so its default `$XDG_CONFIG_HOME` does not resolve the existing gh credentials without that export). All four §4.2 probes succeeded directly; external posture unchanged.
**Status:** `HELD (external) — no live production deploy executed, prerequisites operator-managed and still missing`

---

## 1. Executive Summary

This sidecar records the live-execution posture for `WF-PROD-001-LIVE-EXEC`
as of `2026-05-19`. The Phase 1 v3 wave planning at
`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
§5 (Group-HELD table) and §8 (P1 follow-ons) classifies this task as
**HELD (external)** until the operator-managed GCP and GitHub prerequisites
are provisioned. The unblock decision recorded in commit `025b1dd` did not
provide those resources — it only authorized this owner to verify the
external posture and produce this evidence sidecar.

Current result on `2026-05-19`:

- `WF-PROD-001` reads `PASS (dry-run contract evidence)` in the workflow
  release-gate matrix (line 63 of
  `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`).
- Live prod execution remains `EXTERNAL-GATED` per the same matrix row:
  it requires `vars.PROD_GCP_*` + `secrets.PROD_WIF_*` configured in repo
  Settings, a provisioned GCP project (WIF / Cloud SQL / Artifact Registry
  / Secret Manager), and GitHub Environment `production` reviewer rule.
- No `prod/v<date>` tag exists on `origin` (the `deploy-prod.yml` workflow
  rejects any other shape and would fail at `validate-config`).
- No GCP project ID, region, Cloud SQL instance, WIF provider, or runtime
  service account is committed anywhere in the repository — they live in
  GitHub Actions `vars` / `secrets`, which are operator-managed.
- GitHub-side evidence (repo-Settings vars/secrets, Environment reviewer
  rule, prod tags) is **directly collectible from this worker** when
  `GH_CONFIG_DIR=/home/edna/.config/gh` is exported. Without that export,
  `gh auth status` reports "not logged into any GitHub hosts" because
  Claude2 runs under `HOME=/home/edna/.claude2-home` and the canonical gh
  credentials live at `/home/edna/.config/gh/hosts.yml`. With the export,
  this worker reads the same authenticated token (`gho_***`, scopes
  `gist, read:org, repo, workflow`) as any reviewer lane. See §4.2 for
  first-hand probe output.

Conclusion:

- No live production deploy was executed in this session, in the
  `2026-05-19T21:37Z` re-verification, or in the `2026-05-19T21:50Z`
  second-pass re-verification.
- This task records dated evidence that the HELD-external prerequisites
  have not arrived (with one narrowing — §3.5 is now confirmed present
  by direct first-hand authenticated `gh api` from this worker) and that
  the deploy-prod rail is still gated on the same operator-managed
  inputs it was gated on when the v3 wave planning was authored.
- The chairman applied `resume_parent_task` (via the orchestrator's
  `blocked_task_triage` schema) on `2026-05-19T21:34:29Z`, returning the
  parent from `blocked → todo`. Owner `Claude2` then started the task
  (`todo → in_progress`) and produced this re-verification pack as the
  canonical evidence for the iteration's closeout, rather than calling
  `ai-status.sh blocker` again. Reviewer `Codex` then reopened the
  iteration at `2026-05-19T21:43:53Z` because the sidecar's "GitHub-side
  evidence not collectible from this worker" wording was incorrect in
  the current worker environment; owner re-verified all GitHub-side
  evidence directly via authenticated `gh` from this Claude2 worker on
  `2026-05-19T21:50Z` (see §4.2). A separate follow-on task is the
  expected vehicle for re-dispatching the live deploy once §3.1, §3.2,
  §3.3, §3.4, and §3.6 are operator-provisioned (see §6 and §8).

---

## 2. Canonical Baseline

### 2.1 Release-gate truth

`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (line 63)
keeps `WF-PROD-001` at `PASS (dry-run contract evidence)` and states
verbatim:

> Actual live prod execution remains `EXTERNAL-GATED`: requires
> `vars.PROD_GCP_*` + `secrets.PROD_WIF_*` configured in repo Settings,
> GCP project provisioned (WIF / Cloud SQL / Artifact Registry / Secret
> Manager), and GitHub Environment `production` reviewer rule.

### 2.2 Wave-planning truth

`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
classifies this task as:

- §5 Group-HELD table, line 135: "`WF-PROD-001-LIVE-EXEC` — Needs prod
  GCP project + WIF + Cloud SQL + Secret Manager + GitHub Environment
  `production` reviewer rule".
- §8 P1 follow-ons, line 176: "`WF-PROD-001-LIVE-EXEC` once GCP prod
  configured".
- §9 note 6, line 186: HELD-external tasks remain at `status=blocked`
  with explicit `waiting_for`.

### 2.3 Rail-closeout truth

`commit 990b1ee` ("PROD-RAIL-CLOSEOUT: lift WF-PROD-001 to PASS (dry-run
contract evidence)") lifted the workflow-family gate to dry-run contract
PASS. That closeout explicitly did not assert live production execution.
The non-claim is captured in the gate matrix and is consistent with this
sidecar's evidence.

### 2.4 Unblock-decision truth

`commit 025b1dd` ("WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION:
closeout evidence") records the planning-level decision that allowed this
task to move from `blocked` to `in_progress` so the owner could re-verify
prerequisites and produce this sidecar. The unblock did not assert that
the external resources arrived — that signal is the explicit purpose of
this evidence pack.

---

## 3. Deploy-Prod Rail — Required Inputs

The workflow file `.github/workflows/deploy-prod.yml` enumerates every
input the rail needs before it can fire. They are repeated here so the
sidecar is self-contained even if the workflow changes.

### 3.1 GitHub Actions variables (repo Settings → Variables)

Required (validate-config job hard-fails if any are empty):

- `vars.PROD_GCP_PROJECT_ID`
- `vars.PROD_GCP_REGION`
- `vars.PROD_GCP_CLOUDSQL_INSTANCE`
- `vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `vars.PROD_PLATFORM_ADMIN_ORIGIN`
- `vars.PROD_OPS_CONSOLE_ORIGIN`
- `vars.PROD_CONTROL_PLANE_API_ORIGIN`
- `vars.PROD_IAP_CLIENT_ID`

Optional (default values exist):

- `vars.PROD_ARTIFACT_PROJECT_ID` (falls back to `PROD_GCP_PROJECT_ID`)
- `vars.PROD_ARTIFACT_REGION` (falls back to `PROD_GCP_REGION`)
- `vars.PROD_ARTIFACT_REPOSITORY` (defaults to `drts`)
- `vars.PROD_SECRET_PREFIX` (defaults to `drts-prod`)
- `vars.PROD_API_ALLOW_UNAUTHENTICATED` (defaults to `false`)
- `vars.PROD_PLATFORM_ADMIN_ALLOW_UNAUTHENTICATED` (defaults to `false`)
- `vars.PROD_OPS_CONSOLE_ALLOW_UNAUTHENTICATED` (defaults to `false`)

### 3.2 GitHub Actions secrets (repo Settings → Secrets)

Required:

- `secrets.PROD_WIF_PROVIDER` — Workload Identity Federation provider
  resource path used by `google-github-actions/auth@v2`.
- `secrets.PROD_WIF_SERVICE_ACCOUNT` — Deployer service account email the
  WIF provider impersonates.

### 3.3 GCP Secret Manager entries

The validate-config job verifies the following secrets exist in the prod
project before the rail proceeds (prefix defaults to `drts-prod`):

- `${SECRET_PREFIX}-db-url`
- `${SECRET_PREFIX}-api-key-salt`
- `${SECRET_PREFIX}-jwt-secret`
- `${SECRET_PREFIX}-controlled-download-signing-secret`

Optional:

- `${SECRET_PREFIX}-internal-key` (mounted only when present)

### 3.4 GCP project resources

The deploy and migrate jobs require:

- A Cloud SQL instance reachable via the connector under
  `vars.PROD_GCP_CLOUDSQL_INSTANCE`.
- Artifact Registry repository at
  `${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}` with
  push access for the deployer service account.
- Cloud Run runtime service account
  (`vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT`) granted
  `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`, and
  `iam.serviceAccounts.actAs` from the deployer.
- IAP web binding capability for the deployer so it can grant the runtime
  identity `roles/iap.httpsResourceAccessor` on `drts-api`.
- Cloud Run service identity for `drts-platform-admin-web` and
  `drts-ops-console-web` with internal-and-cloud-load-balancing ingress.

### 3.5 GitHub Environment

`validate-config` runs under `environment: production`, so the repo must
have a GitHub Environment named `production` with the operator-approved
reviewer rule. Without that rule, manual production deploys cannot be
gated by a human reviewer at dispatch time.

### 3.6 Promotion tag

The workflow rejects any tag that does not match
`^prod/v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$`. Tags are produced by
`hourly-promote.yml`. No `prod/v*` tag is currently published on
`origin`, so even if every other prerequisite arrived, the operator
would need to publish a promotion tag before invoking the rail.

---

## 4. External-Posture Evidence — 2026-05-19

This section captures the dated state the owner observed while producing
this sidecar.

### 4.1 Repository-side evidence (collectible from this worker)

| Check | Command | Result |
| --- | --- | --- |
| Local prod tags exist? | `git tag -l 'prod/*'` | empty |
| Remote prod tags exist? | `git ls-remote --tags origin 'refs/tags/prod/*'` | empty |
| GCP project ID committed anywhere? | `grep -nR 'PROD_GCP_PROJECT_ID' --include='*.json' --include='*.yml' --include='*.md'` | only the workflow file and runbooks reference the variable name; no live value committed |
| WIF provider committed anywhere? | `grep -nR 'PROD_WIF_PROVIDER' --include='*.json' --include='*.yml' --include='*.md'` | only the workflow file references the secret name; no live value committed |
| `deploy-prod.yml` carries the gate names? | `Read .github/workflows/deploy-prod.yml` | yes — validate-config enumerates all required vars/secrets and references the `production` environment |
| Phase 1 gate matrix says external-gated? | `Read docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` line 63 | yes — verbatim text quoted in §2.1 above |

### 4.2 GitHub-side evidence (directly collected by this owner via authenticated gh — 2026-05-19T21:50Z)

Reviewer `Codex` reopened the prior iteration at `2026-05-19T21:43:53Z`
because the earlier wording — "`gh auth status` from this worker reports
**not logged into any GitHub hosts**" and "GitHub-side evidence not
collectible from this worker" — was incorrect in the current worker
environment. The owner re-ran every relevant probe from this Claude2
worker on `2026-05-19T21:50Z` after exporting
`GH_CONFIG_DIR=/home/edna/.config/gh` (Claude2 runs under
`HOME=/home/edna/.claude2-home`, so its default `$XDG_CONFIG_HOME` does
not resolve the canonical gh credentials at
`/home/edna/.config/gh/hosts.yml` without that export; with the export,
gh reports `Logged in to github.com account ajoe734`, token scopes
`gist, read:org, repo, workflow`). The probe results below are
first-hand authenticated evidence from this owner, not cross-lane
recitations.

| Check | Command (this worker) | Result |
| --- | --- | --- |
| Worker can auth as ajoe734? | `GH_CONFIG_DIR=/home/edna/.config/gh gh auth status` | **Yes** — `Logged in to github.com account ajoe734` (token `gho_***`, scopes `gist, read:org, repo, workflow`). |
| `production` Environment exists with reviewer rule? | `GH_CONFIG_DIR=/home/edna/.config/gh gh api repos/ajoe734/drts-fleet-platform/environments/production` | **Yes** — Environment `production` (id `15434985743`, created `2026-05-17T03:34:30Z`) returned; protection rules include `required_reviewers` with reviewer `ajoe734` (`prevent_self_review: false`) and a `branch_policy` rule (`custom_branch_policies: true`, `can_admins_bypass: true`). §3.5 directly confirmed present. |
| Repo-level `PROD_*` vars set? | `GH_CONFIG_DIR=/home/edna/.config/gh gh variable list --repo ajoe734/drts-fleet-platform` | **No** — the variable list contains only `DEV_*`, `STAGING_*`, and legacy `GCP_*` entries. None of `vars.PROD_GCP_PROJECT_ID`, `vars.PROD_GCP_REGION`, `vars.PROD_GCP_CLOUDSQL_INSTANCE`, `vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `vars.PROD_PLATFORM_ADMIN_ORIGIN`, `vars.PROD_OPS_CONSOLE_ORIGIN`, `vars.PROD_CONTROL_PLANE_API_ORIGIN`, or `vars.PROD_IAP_CLIENT_ID` is present. §3.1 still unmet. |
| Repo-level `PROD_*` secrets set? | `GH_CONFIG_DIR=/home/edna/.config/gh gh secret list --repo ajoe734/drts-fleet-platform` | **No** — secret list returned only `CORE_REPO_PAT`, `DEV_WIF_SERVICE_ACCOUNT`, `STAGING_WIF_SERVICE_ACCOUNT`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`. `secrets.PROD_WIF_PROVIDER` and `secrets.PROD_WIF_SERVICE_ACCOUNT` are absent. §3.2 still unmet. |
| Any `prod/v<date>.<N>` tag on origin? | `git ls-remote --tags origin 'refs/tags/prod/*'` | **No tags returned** (empty output, exit 0). §3.6 still unmet. |

Implications for this sidecar:

- §3.5 (`GitHub Environment production with reviewer rule`) is directly
  confirmed present by first-hand authenticated probe from this owner
  at `2026-05-19T21:50Z` — no longer a cross-lane-only assertion.
- §3.1, §3.2, §3.3, §3.4, and §3.6 remain unmet. Five HELD-external
  resource classes — repo `PROD_*` vars, repo `PROD_*` secrets, GCP
  Secret Manager entries, GCP project resources (Cloud SQL / Artifact
  Registry / IAM bindings), and a published `prod/v*` tag — are still
  the gating set for live execution. The first two are confirmed
  missing from first-hand authenticated probes; §3.6 is confirmed
  missing from a direct unauthenticated `git ls-remote`. §3.3 and §3.4
  remain not directly collectible from this worker (see §4.3).
- This sidecar's overall **HELD (external)** verdict therefore stands.
  The delta from the previous iteration is that GitHub-side evidence is
  no longer framed as "not collectible from this worker" — it has been
  collected first-hand under authenticated `gh`, and the stale "not
  logged into any GitHub hosts" wording has been replaced with the
  accurate boundary (worker can authenticate; the `GH_CONFIG_DIR` env
  var must be exported because Claude2's `HOME` differs from `edna`).

### 4.2.1 Cross-lane confirmation (informational, not authoritative)

A parallel unblock probe `WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK`
(owner `Codex2`, reviewer `Codex`, artifact
`support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK.md`
on branch `codex2/wf-prod-001-live-exec-unblock-manual-unblock`, PR #170,
commits `d71a6ff` / `3351bab` per `parent_resume` log on
`2026-05-19T21:45:52Z`) independently performed the same `gh api` and
`gh variable list` / `gh secret list` probes on `2026-05-19T21:31Z` and
reported the same posture: production Environment present, repo
`PROD_*` vars/secrets absent, no `prod/v*` tag on origin. This
cross-lane probe is now informational only — the authoritative evidence
for this sidecar is the §4.2 first-hand authenticated probe set above.

### 4.3 GCP-side evidence (not directly collectible from this worker)

- `gcloud auth list` from this worker shows the active credential is
  the GCE instance default service account
  `384772941419-compute@developer.gserviceaccount.com`.
- `gcloud projects list --limit=20` fails with
  `PERMISSION_DENIED: Request had insufficient authentication scopes`
  (reason `ACCESS_TOKEN_SCOPE_INSUFFICIENT` on
  `cloudresourcemanager.googleapis.com`). The active SA cannot reach
  `gcloud projects describe`, `gcloud secrets list`, or
  `gcloud run services list` against any prod project from this worker.
- No prod project name has been recorded in the repo, so even a
  worker with broader scopes would not know which project to
  introspect. This boundary is the actual gating constraint for §3.3
  and §3.4 — those resources remain operator-managed and outside any
  LLM worker's reach until the operator provisions them and records
  the project ID in repo Settings.

---

## 5. Non-Claims

To keep the gate matrix and the wave-planning doc honest, this sidecar
**does not claim**:

- That any GCP prod project exists.
- That `vars.PROD_*` or `secrets.PROD_*` are configured in repo Settings.
- That any `prod/v*` tag has been published or is ready for dispatch.
- That a live production deploy succeeded, partially succeeded, or was
  attempted in this session or the 2026-05-19T21:37Z re-verification.
- That `WF-PROD-001` has been lifted past `PASS (dry-run contract
  evidence)` — it has not, and this sidecar exists precisely to keep the
  matrix honest while the external prerequisites are still missing.

This sidecar **does claim** (per §4.2 first-hand authenticated evidence
from this owner at `2026-05-19T21:50Z`):

- That GitHub Environment `production` exists in
  `ajoe734/drts-fleet-platform` with a `required_reviewers` protection
  rule attached (`reviewer=ajoe734`) and a `branch_policy` rule
  (`custom_branch_policies: true`, `can_admins_bypass: true`) — this is
  the single HELD-external resource class that has been verified
  provisioned by direct first-hand authenticated `gh api` from this
  worker.
- That repo-level `PROD_*` variables (§3.1) and `PROD_*` secrets (§3.2)
  are absent — confirmed first-hand by `gh variable list` and
  `gh secret list` against `ajoe734/drts-fleet-platform`.
- That no `prod/v<date>.<N>` tag exists on `origin` (§3.6) — confirmed
  first-hand by `git ls-remote --tags origin 'refs/tags/prod/*'`.

---

## 6. Resume Conditions

`WF-PROD-001-LIVE-EXEC` may complete its live execution only after **all**
of the following are operator-confirmed (state at the
`2026-05-19T21:50Z` second-pass re-verification noted in `[STATUS]`):

1. **`[STILL MISSING]`** GCP prod project provisioned with WIF, Cloud SQL,
   Artifact Registry, and Secret Manager entries from §3.3 (not directly
   collectible from this worker per §4.3).
2. **`[STILL MISSING — DIRECTLY VERIFIED 2026-05-19T21:50Z]`** Repo
   Settings carries every required `vars.PROD_*` and `secrets.PROD_*`
   from §3.1 and §3.2 (first-hand authenticated `gh variable list` /
   `gh secret list` from this worker show only `DEV_*` / `STAGING_*` /
   legacy `WIF_*` / `CORE_REPO_PAT` entries; no `PROD_*` of either kind).
3. **`[CONFIRMED PRESENT — DIRECTLY VERIFIED 2026-05-19T21:50Z]`**
   GitHub Environment `production` exists with the operator-approved
   reviewer rule attached to `validate-config` (verified by this owner
   via authenticated
   `gh api repos/ajoe734/drts-fleet-platform/environments/production` —
   reviewer = `ajoe734`, prevent_self_review=false, plus a `branch_policy`
   rule with `custom_branch_policies: true`).
4. **`[STILL MISSING — DIRECTLY VERIFIED 2026-05-19T21:50Z]`**
   `hourly-promote.yml` has published a `prod/v<date>.<N>` tag pinned to
   the commit the operator intends to deploy (re-verified absent:
   `git ls-remote --tags origin 'refs/tags/prod/*'` returns empty).
5. The operator records the readiness signal in `ai-status.json` (e.g.
   via a follow-up unblock task) so the supervisor can re-dispatch this
   task with a clean owner/reviewer handoff.

Once all five hold, a future owner may dispatch `Deploy — Prod` via
`gh workflow run deploy-prod.yml -f tag=prod/v<...>` and produce a
follow-on closeout sidecar that records the live execution evidence
(workflow run id, image digests, migration job execution name, Cloud Run
revision ids, IAP-protected health-check responses, and rollback
rehearsal).

---

## 7. References

- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
  §5 Group-HELD, §8 P1 follow-ons, §9 supervisor notes.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` `WF-PROD-001` row.
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`.
- `.github/workflows/deploy-prod.yml` (validate-config, build-push,
  migrate, deploy, health-check jobs).
- `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
  (lifted `WF-PROD-001` to `PASS (dry-run contract evidence)`).
- `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK.md`
  (Codex2 cross-lane gh-metadata probe, branch
  `codex2/wf-prod-001-live-exec-unblock-manual-unblock`, PR #170,
  commits `d71a6ff` / `3351bab` per Codex2 `parent_resume` /`done`
  activity log on 2026-05-19T21:45:52Z; demoted to informational
  cross-lane confirmation in §4.2.1).
- `commit 990b1ee` (PROD-RAIL-CLOSEOUT).
- `commit 025b1dd` (WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION).
- `commit 9ff924e` (initial evidence sidecar register).
- `commit d82c91b` (first chair-resume re-verification refresh).
- Reviewer reopen note `2026-05-19T21:43:53Z` (Codex `reopen` on
  `WF-PROD-001-LIVE-EXEC`) demanding direct first-hand authenticated gh
  evidence — addressed by §4.2 of this iteration.

---

## 8. Owner Sign-Off

- **Owner:** `Claude2`
- **Collected:** `2026-05-19 (UTC)`
- **Re-verified:** `2026-05-19T21:37Z (UTC)` after chair-applied
  `resume_parent_task` returned the parent from `blocked → todo` at
  `2026-05-19T21:34:29Z`. External posture unchanged at re-verification
  except for §3.5 narrowing from "not collectible" to "confirmed
  present" via Codex2's authenticated cross-lane probe (now demoted to
  §4.2.1 informational status).
- **Re-verified (second pass):** `2026-05-19T21:50Z (UTC)` after
  reviewer `Codex` reopened the iteration at `2026-05-19T21:43:53Z`
  with a correction: the prior sidecar wording "GitHub-side evidence not
  collectible from this worker" / "`gh auth status` reports not logged
  into any GitHub hosts" was inaccurate. The owner re-ran every relevant
  probe directly from this Claude2 worker with
  `GH_CONFIG_DIR=/home/edna/.config/gh` exported (the canonical gh
  hosts.yml is at that path; Claude2's `HOME=/home/edna/.claude2-home`
  means the default `$XDG_CONFIG_HOME` does not pick it up, hence the
  earlier misreading). All §4.2 probes now reflect first-hand
  authenticated evidence; external posture unchanged from the previous
  re-verification.
- **Verdict:** HELD (external) — no live production deploy executed in
  this session, at the first re-verification, or at the second-pass
  re-verification. Five of the six HELD-external resource classes
  (§3.1, §3.2, §3.3, §3.4, §3.6) are still operator-managed and missing;
  §3.1 / §3.2 / §3.6 are confirmed missing by direct first-hand probes
  from this worker, §3.3 / §3.4 remain not directly collectible from
  this worker (worker `gcloud` identity has insufficient scopes and no
  prod project ID is recorded anywhere in the repo).
- **Next action:** Hand off to reviewer `Codex` to acceptance-review the
  refreshed evidence pack. The owner will not call `ai-status.sh
  blocker` again because the chair already applied `resume_parent_task`
  via the orchestrator's `blocked_task_triage` schema; the canonical
  resolution path from here is reviewer-approved evidence closeout of
  this iteration. Once the operator provisions §3.1, §3.2, §3.3, §3.4,
  and §3.6, a follow-on unblock task can re-dispatch the live deploy
  rail and produce the live-execution evidence (workflow run id, image
  digests, migration job execution, Cloud Run revision ids,
  IAP-protected health-check responses, rollback rehearsal) as a
  separate closeout sidecar.
