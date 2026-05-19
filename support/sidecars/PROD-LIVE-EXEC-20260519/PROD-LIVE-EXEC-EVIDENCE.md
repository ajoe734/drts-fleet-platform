# WF-PROD-001-LIVE-EXEC — Production Live-Execution Evidence Sidecar

**Task:** `WF-PROD-001-LIVE-EXEC`
**Owner:** `Claude2`
**Reviewer:** `Codex`
**Collected:** `2026-05-19 (UTC)`
**Re-verified:** `2026-05-19T21:37Z (UTC)` — chair applied `resume_parent_task` at `2026-05-19T21:34:29Z` (parent `blocked → todo`); owner started at `2026-05-19T21:37:34Z` (`todo → in_progress`); external posture unchanged at re-verify.
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
- `gh auth status` reports no logged-in host from this worker, so the live
  set of repo-Settings variables/secrets and Environment reviewer rules
  cannot be enumerated from this evidence collection point.

Conclusion:

- No live production deploy was executed in this session or in the
  `2026-05-19T21:37Z` re-verification turn.
- This task records dated evidence that the HELD-external prerequisites
  have not arrived (with one narrowing — §3.5 is now confirmed present)
  and that the deploy-prod rail is still gated on the same
  operator-managed inputs it was gated on when the v3 wave planning was
  authored.
- The chairman applied `resume_parent_task` (via the orchestrator's
  `blocked_task_triage` schema) on `2026-05-19T21:34:29Z`, returning the
  parent from `blocked → todo`. Owner `Claude2` then started the task
  (`todo → in_progress`) and produced this re-verification pack as the
  canonical evidence for the iteration's closeout, rather than calling
  `ai-status.sh blocker` again. A separate follow-on task is the
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

### 4.2 GitHub-side evidence (not collectible from this worker)

- `gh auth status` from this worker reports **not logged into any GitHub
  hosts**. The owner therefore cannot enumerate the live set of
  `vars.PROD_*` and `secrets.PROD_*` values, nor confirm whether the
  `production` Environment exists or which reviewers are attached.
- This boundary is consistent with the planning-doc classification: the
  HELD-external resources are operator-provisioned outside any LLM
  worker's reach. The operator must confirm them before this task can
  leave HELD.

### 4.2.1 GitHub-side evidence (collected by Codex2 via authenticated gh — 2026-05-19)

The parallel unblock probe `WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK`
(owner `Codex2`, reviewer `Codex`, artifact
`support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK.md`
on branch `codex2/wf-prod-001-live-exec-unblock-manual-unblock`, PR #170,
commit `30e963d`) ran an authenticated `gh`-metadata probe against
`ajoe734/drts-fleet-platform` on `2026-05-19T21:31Z`. The cross-lane
findings, cited here so this sidecar remains the single source of truth
for the live-exec posture:

| Check | Command (per probe artifact) | Result |
| --- | --- | --- |
| `production` Environment exists with reviewer rule? | `gh api repos/ajoe734/drts-fleet-platform/environments/production` | **Yes** — Environment `production` exists; reviewer rule attached (`reviewer=ajoe734`). This satisfies §3.5 of this sidecar. |
| Repo-level `PROD_*` vars set? | `gh variable list --repo ajoe734/drts-fleet-platform` | **No** — none of `vars.PROD_GCP_PROJECT_ID`, `vars.PROD_GCP_REGION`, `vars.PROD_GCP_CLOUDSQL_INSTANCE`, `vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `vars.PROD_PLATFORM_ADMIN_ORIGIN`, `vars.PROD_OPS_CONSOLE_ORIGIN`, `vars.PROD_CONTROL_PLANE_API_ORIGIN`, or `vars.PROD_IAP_CLIENT_ID` is present. §3.1 still unmet. |
| Repo-level `PROD_*` secrets set? | `gh secret list --repo ajoe734/drts-fleet-platform` | **No** — `secrets.PROD_WIF_PROVIDER` and `secrets.PROD_WIF_SERVICE_ACCOUNT` absent. §3.2 still unmet. |
| Any `prod/v<date>.<N>` tag on origin? | `git ls-remote --tags origin refs/tags/prod/v*` | **No tags returned** — matches §3.6 (no promotion tag published). |

Implication for this sidecar:

- §3.5 (`GitHub Environment production with reviewer rule`) is **now
  operator-confirmed present**. This is the only HELD-external resource
  that the cross-lane probe has actually verified provisioned.
- §3.1, §3.2, §3.3, §3.4, and §3.6 remain unmet. The five remaining
  HELD-external resource classes — repo `PROD_*` vars, repo `PROD_*`
  secrets, GCP Secret Manager entries, GCP project resources (Cloud SQL
  / Artifact Registry / IAM bindings), and a published `prod/v*` tag —
  are still the gating set for live execution.
- This sidecar's overall **HELD (external)** verdict therefore stands;
  the only delta from the original 2026-05-19 collection is a narrowing
  of the gating set from six classes (§3.1 – §3.6) to five (§3.1, §3.2,
  §3.3, §3.4, §3.6).

### 4.3 GCP-side evidence (not collectible from this worker)

- The worker has no `gcloud` identity that can call
  `gcloud projects describe`, `gcloud secrets list`, or
  `gcloud run services list` against any prod project.
- No prod project name has been recorded in the repo, so even an
  authenticated worker would not know which project to introspect.

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

This sidecar **does claim** (per §4.2.1 cross-lane evidence):

- That GitHub Environment `production` exists in
  `ajoe734/drts-fleet-platform` with a reviewer rule attached
  (`reviewer=ajoe734`) — this is the single HELD-external resource class
  that has been verified provisioned as of `2026-05-19T21:31Z`.

---

## 6. Resume Conditions

`WF-PROD-001-LIVE-EXEC` may complete its live execution only after **all**
of the following are operator-confirmed (state at the 2026-05-19T21:37Z
re-verification noted in `[STATUS]`):

1. **`[STILL MISSING]`** GCP prod project provisioned with WIF, Cloud SQL,
   Artifact Registry, and Secret Manager entries from §3.3.
2. **`[STILL MISSING]`** Repo Settings carries every required
   `vars.PROD_*` and `secrets.PROD_*` from §3.1 and §3.2.
3. **`[CONFIRMED PRESENT 2026-05-19T21:31Z]`** GitHub Environment
   `production` exists with the operator-approved reviewer rule attached
   to `validate-config` (verified by Codex2 via authenticated
   `gh api repos/ajoe734/drts-fleet-platform/environments/production` —
   reviewer = `ajoe734`).
4. **`[STILL MISSING]`** `hourly-promote.yml` has published a
   `prod/v<date>.<N>` tag pinned to the commit the operator intends to
   deploy (re-verified absent at `2026-05-19T21:37Z`:
   `git ls-remote --tags origin refs/tags/prod/v*` returns empty).
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
  commit `30e963d`).
- `commit 990b1ee` (PROD-RAIL-CLOSEOUT).
- `commit 025b1dd` (WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION).
- `commit 9ff924e` (initial evidence sidecar register).

---

## 8. Owner Sign-Off

- **Owner:** `Claude2`
- **Collected:** `2026-05-19 (UTC)`
- **Re-verified:** `2026-05-19T21:37Z (UTC)` after chair-applied
  `resume_parent_task` returned the parent from `blocked → todo` at
  `2026-05-19T21:34:29Z`. External posture unchanged at re-verification
  except for §3.5 narrowing from "not collectible" to "confirmed
  present" via Codex2's authenticated cross-lane probe (§4.2.1).
- **Verdict:** HELD (external) — no live production deploy executed in
  this session or at the re-verification; five of the six HELD-external
  resource classes (§3.1, §3.2, §3.3, §3.4, §3.6) are still
  operator-managed and missing.
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
