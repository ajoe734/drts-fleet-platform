# WF-PROD-001-LIVE-EXEC Sidecar Acceptance Packet

This document is a support-only acceptance packet for
`WF-PROD-001-LIVE-EXEC`. It does not modify canonical truth. It refreshes the
review snapshot against canonical `AI_STATUS_ROOT` as observed on
`2026-05-19T21:46:44Z`, because the parent task and its unblock helpers moved
forward after earlier stale sidecar handoffs.

Anchors used here come from:

- canonical `AI_STATUS_ROOT/ai-status.json`
- canonical `AI_STATUS_ROOT/current-work.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`

## 1. Scope Boundary

- **Packet Artifact:** `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- **Parent Task:** `WF-PROD-001-LIVE-EXEC`
- **Helper Kind:** `acceptance_packet`
- **Mutates Canonical:** `false`
- **Objective:** prepare a reviewer-facing support packet for the first live
  production deploy task without changing workflow code, product truth, or
  parent machine truth

Guardrails:

- This packet is support-only and does not itself claim a successful
  production deploy.
- Canonical `AI_STATUS_ROOT` is authoritative over the worktree-local copy of
  `ai-status.json`.
- Visibility gaps in this worker worktree are recorded honestly instead of
  being papered over.

## 2. Machine-Truth Snapshot

### 2.1 Parent task row - `WF-PROD-001-LIVE-EXEC`

At refresh time, canonical machine truth records:

| Field | Value |
| --- | --- |
| Title | `Production deploy live execution (HELD)` |
| Owner | `Claude2` |
| Reviewer | `Codex` |
| Status | `in_progress` |
| Depends on | `PROD-SPEC-001`, `PROD-DRILL-001` |
| Artifact | `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` |
| Last update | `2026-05-19T21:46:44Z` |
| Next | `Re-opened by Codex reopen at 21:43:53Z. Re-verifying GitHub-side evidence with first-hand authenticated gh from this worker per reviewer's reopen note, refreshing sidecar §4.2/§4.2.1 to drop stale 'not logged in' claim and restate blockers from direct evidence.` |

`current-work.md` at canonical root matches the parent row: owner `Claude2`,
status `in_progress`, and dependencies `PROD-SPEC-001` plus `PROD-DRILL-001`.

### 2.2 Sidecar task row - `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE`

At refresh time, canonical machine truth records:

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Codex2` |
| Status | `review` |
| Depends on | `PROD-SPEC-001`, `PROD-DRILL-001` |
| Last update | `2026-05-19T21:42:04Z` |
| Next | `Refreshed ... after stale commit cf7bcc4 ... packet now matches parent ... status=in_progress last_update=2026-05-19T21:37:34Z ...` |

Reviewer implication:

- the sidecar row does exist in canonical machine truth
- the current review obligation is real and can be approved by `Codex2`
- the owner handoff message is already stale because the parent advanced again
  to `2026-05-19T21:46:44Z` after that `21:42:04Z` sidecar handoff

### 2.3 Worktree visibility gap

This isolated worktree does not currently materialize every artifact named in
canonical machine truth:

| Path from canonical truth | Visibility in this worktree |
| --- | --- |
| `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` | missing |
| `docs/03-runbooks/production-deploy-rail-spec-20260519.md` | missing |
| `docs/03-runbooks/production-rollback-drill-20260519.md` | missing |
| `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK.md` | missing |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` | present |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` | present |

This packet therefore distinguishes between canonical status truth and local
artifact visibility inside this review worktree.

## 3. Dependency Map

### 3.1 `PROD-SPEC-001` - production deploy rail spec

Canonical machine truth:

| Field | Value |
| --- | --- |
| Owner | `Codex2` |
| Reviewer | `Claude` |
| Status | `done` |
| Artifact | `docs/03-runbooks/production-deploy-rail-spec-20260519.md` |
| Last update | `2026-05-19T17:19:57Z` |
| Commit | `c289d6f` |
| Push branch | `origin/codex2/prod-spec-001` |

Reviewer note:

- the dependency is closed in canonical machine truth
- this worktree still cannot open the artifact path, so local inspection here
  is limited to status metadata plus source anchors already present

### 3.2 `PROD-DRILL-001` - production rollback drill protocol

Canonical machine truth:

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status | `done` |
| Artifact | `docs/03-runbooks/production-rollback-drill-20260519.md` |
| Last update | `2026-05-19T19:58:14Z` |
| Commit | `fe6321a1085b3af489ae099158baa7e94be5352d` |
| Push branch | `origin/codex/prod-drill-001` |

Reviewer note:

- the dependency is also closed in canonical machine truth
- the artifact is likewise absent from this isolated worktree, so the packet
  must report the visibility gap rather than pretending the doc is locally
  reviewable here

### 3.3 Unblock helpers already closed

Canonical machine truth shows both helper unblock tasks as `done`:

- `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
  - commit `025b1dd3cea63ed41d6814f9be0f2424c92a5d72`
  - pushed to `origin/codex/wf-prod-001-live-exec-unblock-planning-decision`
- `WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK`
  - commit `3351babe69824d84e5631df86faf565a55186329`
  - pushed to `origin/codex2/wf-prod-001-live-exec-unblock-manual-unblock`

Packet implication:

- no remaining product-planning blocker is recorded for the parent task
- the remaining blocker set is operational and external, not semantic

### 3.4 Existing dry-run rail evidence

`support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
still proves only the dry-run/static-contract rail:

- `deploy-prod.yml` contains real `validate-config`, `build-push`, `migrate`,
  `deploy`, and `health-check` jobs
- `tests/e2e/E2E-009-prod-rail-dry-run.sh` passed as a static contract check
- the repo still does not claim a real production deploy, Cloud Run revision,
  Cloud SQL migration, or WIF-authenticated live execution

## 4. Current External Gate Read

Direct reviewer verification from this worker confirms:

- `gh auth status` shows an authenticated `ajoe734` session on GitHub
- `gh api repos/ajoe734/drts-fleet-platform/environments/production` confirms
  the `production` environment exists and carries a required reviewer rule for
  `ajoe734`
- `gh variable list` shows no `PROD_*` repository variables
- `gh secret list` shows no `PROD_*` repository secrets
- `git ls-remote --tags origin 'refs/tags/prod/v*'` returned no matches

Operational meaning:

- one required GitHub-side gate is present: the `production` environment with a
  reviewer rule
- the repo is still missing the required production variables and secrets that
  `deploy-prod.yml` validates before live execution
- no deployable `prod/vYYYY.MM.DD.N` tag exists on `origin`, so the first live
  workflow run cannot start yet even if the repo config were completed

## 5. Parent Acceptance Checklist

These are the reviewer-facing gates implied by the current canonical state.

### A. Dependency gates

- [x] `PROD-SPEC-001` is `done` in canonical machine truth.
- [x] `PROD-DRILL-001` is `done` in canonical machine truth.
- [x] The planning/unblock helper tasks are closed and the remaining blocker is
  operational, not semantic.

### B. External readiness gates

- [x] GitHub `production` environment exists with a required reviewer rule.
- [ ] Required repository `PROD_*` variables exist.
- [ ] Required repository `PROD_*` secrets exist.
- [ ] Required prod GCP resources backing those variables/secrets exist and are
  ready for the workflow.
- [ ] A real `refs/tags/prod/v*` tag exists on `origin`.
- [ ] A real `gh workflow run deploy-prod.yml -f tag=prod/v...` has completed
  `validate-config -> build-push -> migrate -> deploy -> health-check`.

### C. Evidence gates

- [ ] The parent artifact path
  `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
  resolves in the shared branch/worktree used for review.
- [ ] The live evidence packet records the deployed tag, commit SHA, whether
  migration ran or was skipped, workflow run URL, health results, and any
  rollback decision.

### D. Sidecar guardrails

- [x] This packet only creates or updates support material.
- [x] No canonical truth, workflow code, or runtime implementation was edited.
- [x] The packet preserves the non-claim boundary between dry-run rail evidence
  and real production execution evidence.

## 6. Reviewer Conclusion

Reviewer conclusion for `2026-05-19T21:46:44Z` snapshot:

- the prior owner handoff at `2026-05-19T21:42:04Z` was stale because the
  parent advanced afterward
- this refreshed packet now matches current canonical machine truth: parent
  owner `Claude2`, reviewer `Codex`, status `in_progress`
- the sidecar row is real, in `review`, and eligible for `approve` by `Codex2`
- the remaining blockers are external/operator gates, not unresolved product
  dependencies
- this worktree still has an honest artifact-visibility gap, but that gap is
  already called out explicitly and does not invalidate the packet's status
  summary

Approval standard:

- approve the packet as a support artifact describing current machine truth
- do not interpret that approval as approval of a live production deployment

## 7. Packet Verification

Verification performed for this refresh:

- read `AI_COLLABORATION_GUIDE.md`
- read canonical `AI_STATUS_ROOT/ai-status.json`
- read canonical `AI_STATUS_ROOT/current-work.md`
- read `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- read `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- read `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
- verified canonical status rows for:
  - `WF-PROD-001-LIVE-EXEC`
  - `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE`
  - `PROD-SPEC-001`
  - `PROD-DRILL-001`
  - `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
  - `WF-PROD-001-LIVE-EXEC-UNBLOCK-MANUAL-UNBLOCK`
- verified `gh auth status` succeeds for account `ajoe734`
- verified GitHub `production` environment metadata via `gh api`
- verified repo variable and secret listings do not include `PROD_*`
- verified `origin` has no `refs/tags/prod/v*`
- verified this isolated worktree still lacks the parent live-evidence file,
  both dependency docs, and the unblock artifact path named above

No runtime tests were run because this sidecar updates support documentation
only and does not change executable code.
