# WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION Acceptance Packet

Last refreshed against canonical machine truth: `2026-05-19T21:21:01Z`  
Sidecar task: `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE`  
Prepared by: `Codex`  
Assigned reviewer: `Claude2`

## 1. Scope Boundary

This file is a support artifact only.

- It does not change L1/L2 product truth, runtime code, workflow code, or governance docs.
- Canonical status, ownership, and lifecycle truth comes from `/home/edna/workspace/drts-fleet-platform/ai-status.json`.
- The parent artifact and both dependency runbooks are currently recorded in machine truth as branch-scoped commit evidence rather than files present on this `origin/dev` worktree, so this packet validates them via `ai-status.json` plus `git show <commit>:<path>`.

## 2. Machine-Truth Snapshot

| Task | Status | Owner | Reviewer | Last update | Notes |
| --- | --- | --- | --- | --- | --- |
| `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` | `Claude2` | `2026-05-19T21:15:25Z` | This sidecar exists to audit and hand off the parent unblock packet only. |
| `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` | `done` | `Codex` | `Codex2` | `2026-05-19T20:41:33Z` | Closeout evidence recorded on commit `025b1dd3cea63ed41d6814f9be0f2424c92a5d72`, pushed to `origin/codex/wf-prod-001-live-exec-unblock-planning-decision`. |
| `WF-PROD-001-LIVE-EXEC` | `blocked` | `Claude2` | `Codex` | `2026-05-19T21:20:53Z` | Grandparent task now has its own evidence sidecar anchored at commit `9ff924e` on `origin/claude2/wf-prod-001-live-exec`; semantic blocker remains operator-managed production prerequisites. |

Canonical `next` text for `WF-PROD-001-LIVE-EXEC` at `2026-05-19T21:20:53Z`:

> HELD (external). Evidence sidecar anchored at support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md (commit 9ff924e, pushed to origin/claude2/wf-prod-001-live-exec). Live production deploy cannot fire until operator provisions: (1) vars.PROD_GCP_PROJECT_ID/REGION/CLOUDSQL_INSTANCE/RUNTIME_SERVICE_ACCOUNT/PLATFORM_ADMIN_ORIGIN/OPS_CONSOLE_ORIGIN/CONTROL_PLANE_API_ORIGIN/IAP_CLIENT_ID and secrets.PROD_WIF_PROVIDER/PROD_WIF_SERVICE_ACCOUNT in repo Settings; (2) GCP prod project with WIF + Cloud SQL + Artifact Registry + Secret Manager entries drts-prod-db-url/api-key-salt/jwt-secret/controlled-download-signing-secret; (3) GitHub Environment 'production' reviewer rule; (4) a published prod/v<date>.<N> tag from hourly-promote.yml. Per phase1-v3 wave planning §9 note 6, this task stays at status=blocked with explicit waiting_for until those external resources arrive.

Freshness note: the grandparent is no longer the earlier `todo`/`in_progress` intermediate state seen in stale refreshes. Canonical machine truth now shows `status=blocked`, `owner=Claude2`, `reviewer=Codex`, and `waiting_for=Codex`, while the semantic blocker is the external prerequisite set enumerated in the `next` field above.

## 3. Dependency Map

| Dependency | Status | Evidence anchor | Impact on the parent unblock decision |
| --- | --- | --- | --- |
| `PROD-SPEC-001` | `done` | `ai-status.json` row + commit `c289d6f` on `origin/codex2/prod-spec-001` for `docs/03-runbooks/production-deploy-rail-spec-20260519.md` | Formalizes `WF-PROD-001` as `PASS (dry-run contract evidence)` and explicitly says live production execution remains external-gated until GitHub/GCP controls, a valid `prod/v*` tag, and a real deploy exist. |
| `PROD-DRILL-001` | `done` | `ai-status.json` row + commit `fe6321a1085b3af489ae099158baa7e94be5352d` on `origin/codex/prod-drill-001` for `docs/03-runbooks/production-rollback-drill-20260519.md` | Proves the rollback-drill protocol and evidence template already exist. Remaining work is live operational execution, not a missing planning document. |

Dependency conclusion: no upstream dependency is still `review`, `backlog`, or waiting on a planning decision. Earlier sidecar drafts that described `PROD-SPEC-001` or `PROD-DRILL-001` as unfinished are stale against canonical machine truth.

## 4. Parent Acceptance Audit

| Parent acceptance item | Evidence | Result |
| --- | --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Parent artifact at commit `025b1dd3cea63ed41d6814f9be0f2424c92a5d72` states that `WF-PROD-001-LIVE-EXEC` is already classified as `HELD-external`, citing the wave-planning runbook, workflow-family gate row, prod deploy runbook, PROD-RAIL evidence, and absence of any open Phase 1 product decision. | `PASS` |
| Record the decision, scope cut, or explicit follow-up needed by the parent task | Parent artifact records: no new L1/L2 decision, no scope cut, explicit external follow-up only. | `PASS` |
| Produce task-scoped commit/push/PR evidence for any canonical change | Canonical parent row records commit, commit subject, push remote, push branch, and push commit for the closeout branch. | `PASS` |
| Update the parent task with the concrete unblocked next step | Parent row records `resolved_parent_next` pointing to the operator-runbook configuration steps and `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`. The grandparent's latest `next` note at `2026-05-19T21:20:53Z` remains consistent with that route, and now anchors the separate live-exec evidence sidecar at commit `9ff924e`. | `PASS` |

## 5. Sidecar Acceptance Audit

| Sidecar acceptance item | Result |
| --- | --- |
| Create support artifacts only | `PASS` — this task writes only `support/sidecars/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.md`. |
| Do not edit canonical truth | `PASS` — the packet reads canonical machine truth but does not modify `ai-status.json`, `current-work.md`, runbooks, contracts, workflows, or runtime files. |
| Hand off the packet to the assigned reviewer | `READY` — canonical reviewer is `Claude2`, and this packet is prepared for owner handoff after commit/push. |

## 6. Reviewer Verification Notes

Recommended evidence checks for `Claude2`:

1. Verify current machine truth in `/home/edna/workspace/drts-fleet-platform/ai-status.json` for:
   - `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE`
   - `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
   - `WF-PROD-001-LIVE-EXEC`
   - `PROD-SPEC-001`
   - `PROD-DRILL-001`
2. Verify the parent artifact from the recorded closeout commit:
   - `git show 025b1dd3cea63ed41d6814f9be0f2424c92a5d72:support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`
3. Verify dependency artifacts from their recorded task commits:
   - `git show c289d6f:docs/03-runbooks/production-deploy-rail-spec-20260519.md`
   - `git show fe6321a1085b3af489ae099158baa7e94be5352d:docs/03-runbooks/production-rollback-drill-20260519.md`
4. Verify the grandparent live-exec evidence sidecar anchor if needed:
   - `git show 9ff924e:support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
5. Confirm this sidecar packet is now landed on the shared branch at the path listed in the sidecar task's `artifacts` field.

## 7. Handoff Summary

This packet confirms that the parent unblock task is already closed correctly as a routing-only decision, both prerequisite tasks are done, and `WF-PROD-001-LIVE-EXEC` has now been re-blocked with a dedicated live-exec evidence sidecar (`9ff924e`) documenting the remaining external production prerequisites.

Ready for reviewer: `Claude2`
