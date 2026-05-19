# WF-PROD-001-LIVE-EXEC Acceptance Packet & Dependency Map

- **Sidecar Kind:** `acceptance_packet`
- **Parent Task:** `WF-PROD-001-LIVE-EXEC`
- **Current Sidecar Owner:** `Codex`
- **Assigned Sidecar Reviewer:** `Codex2`
- **Parent Owner At Snapshot:** `Claude2`
- **Parent Reviewer At Snapshot:** `Codex`
- **Last Revised:** `2026-05-19T21:39:28Z`
- **Status:** `Refreshed support-only acceptance packet against canonical AI_STATUS_ROOT after stale commit cf7bcc4. The parent has since advanced beyond the old blocked snapshot: it was routed through todo by the unblock child and is now in_progress for evidence refresh while still operationally external-gated.`

---

## 1) Scope Boundary

This sidecar stays support-only.

- **In scope:** acceptance framing for `WF-PROD-001-LIVE-EXEC`, dependency mapping, reviewer checklist, current machine-truth snapshot, and honest evidence expectations for the first real production deploy plus rollback proof.
- **Out of scope:** editing L1/L2 canonical truth, changing the parent task's control-plane status, changing runtime/workflow/GCP/GitHub implementation, or claiming that a real production deploy already happened.

---

## 2) Canonical Machine-Truth Snapshot

The authoritative control-plane source for this packet is canonical `ai-status.json` at `AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform`, with `current-work.md` treated only as a derived human summary.

### Snapshot drift this refresh fixes

- Commit `cf7bcc4` on this branch still captured the older parent snapshot: `status=blocked`, `waiting_for=Codex`, `last_update=2026-05-19T21:20:53Z`.
- Canonical machine truth later recorded the unblock child `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` as `done` with `resolved_parent_status=todo`.
- Canonical machine truth now shows the parent resumed to `status=in_progress` at `2026-05-19T21:37:34Z` with no open `waiting_for`, no open blocker entry, and no open handoff entry.

### Parent `WF-PROD-001-LIVE-EXEC`

- title=`Production deploy live execution (HELD)`
- owner=`Claude2`
- reviewer=`Codex`
- status=`in_progress`
- waiting_for=`<none>`
- depends_on=`["PROD-SPEC-001","PROD-DRILL-001"]`
- artifact target=`support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
- last_update=`2026-05-19T21:37:34Z`
- next=`Resuming after chair-applied resume_parent_task: re-verifying HELD-external posture from this worker and refreshing the live-exec evidence sidecar with a 2026-05-19 re-verification stamp; live prod deploy still cannot fire (PROD_* vars/secrets absent, no prod/v* tag on origin, worker not authenticated to gh/gcloud).`

### Sidecar `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` at draft time
- helper kind=`acceptance_packet`
- support artifact path=`support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- last_update=`2026-05-19T21:36:51Z`
- `mutates_canonical=false`

### Important posture that this packet must preserve

- The parent is currently `in_progress`, not `blocked` and not `todo`.
- Operationally, the parent is still HELD-external. The `in_progress` state reflects owner-side re-verification and evidence refresh, not live production readiness.
- The old `waiting_for=Codex` field is no longer current and must not be reused in downstream acceptance language.
- `PROD-SPEC-001` and `PROD-DRILL-001` remain `done`, and the unblock child remains `done`; the remaining gap is external operator/runtime readiness plus missing live evidence.
- The parent evidence path and dependency docs are still absent from canonical root and this task worktree, so this packet must rely on canonical task closeout metadata rather than pretending those files are locally visible here.

### Current externally gated signals observed during this refresh

- `git ls-remote --tags origin 'refs/tags/prod/v*'` returned no matching tags.
- The parent `next` field still records missing `PROD_*` repo vars/secrets and missing worker `gh`/`gcloud` authentication.
- `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` is still absent in both this worktree and canonical root.

---

## 3) Dependency Map

### Formal dependencies recorded in machine truth

| Dependency | Shared-truth status | Closeout evidence | Current branch/root visibility | Why it matters to `WF-PROD-001-LIVE-EXEC` |
| --- | --- | --- | --- | --- |
| `PROD-SPEC-001` | `done` | commit `c289d6f`, push `origin/codex2/prod-spec-001` | `docs/03-runbooks/production-deploy-rail-spec-20260519.md` is still missing in both canonical root and this task worktree | Freezes the production deploy rail contract: manual `prod/v*` deploys, required GitHub/GCP wiring, workflow graph, health checks, and non-claim language for dry-run vs live evidence. |
| `PROD-DRILL-001` | `done` | commit `fe6321a1085b3af489ae099158baa7e94be5352d`, push `origin/codex/prod-drill-001` | `docs/03-runbooks/production-rollback-drill-20260519.md` is still missing in both canonical root and this task worktree | Freezes the qualifying rollback-drill protocol: named roles, tag pair, entry criteria, deploy/verify/rollback sequence, stop conditions, and evidence template. |

### Routing dependency already resolved

| Supporting task | Shared-truth status | Closeout evidence | Current branch/root visibility | Why it matters |
| --- | --- | --- | --- | --- |
| `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` | `done` | commit `025b1dd3cea63ed41d6814f9be0f2424c92a5d72`, push `origin/codex/wf-prod-001-live-exec-unblock-planning-decision` | `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md` is still missing in both canonical root and this task worktree | Confirms the parent is not blocked by unresolved product semantics. The child closed with `resolved_parent_status=todo`, and the parent later resumed to `in_progress`; the remaining gate is external operator/GitHub/GCP readiness plus live evidence collection. |

### In-branch anchors that are present right now

| Anchor | Current state | Why it matters |
| --- | --- | --- |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` | present | Defines the current deploy/rollback operating rail, required GitHub configuration, required GCP wiring, workflow stages, and minimum evidence expectations. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` row `WF-PROD-001` | present | Current gate read remains `PASS (dry-run contract evidence)` with explicit `EXTERNAL-GATED` language for the first real production execution. |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` | present | Confirms the production rail is structurally real at dry-run level, while explicitly not claiming live production execution. |

### Machine-truth artifacts that are not visible on this branch/root

| Artifact | Current state | Meaning |
| --- | --- | --- |
| `docs/03-runbooks/production-deploy-rail-spec-20260519.md` | missing | The deploy-rail spec is closed in machine truth but not merged into this branch/root view. |
| `docs/03-runbooks/production-rollback-drill-20260519.md` | missing | The rollback drill protocol is closed in machine truth but not merged into this branch/root view. |
| `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md` | missing | The unblock decision is authoritative through task closeout metadata, not through a locally visible file on this branch/root. |
| `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` | missing | The parent owner is actively refreshing this evidence sidecar, but the artifact is not visible on this branch/root yet. |

---

## 4) Parent Acceptance Framing

The parent still has no explicit `acceptance` array in canonical `ai-status.json`, so this packet expands the reviewer bar from current machine truth plus the runbook/gate anchors that are present on this branch.

### AC-1: Dependency truth is consumed honestly

- `PROD-SPEC-001` and `PROD-DRILL-001` must remain `done` in the acceptance framing even though their docs are not visible on this branch/root.
- The unblock child must remain `done` and must keep the parent classified as resolved for planning/contract semantics.
- The parent must stay on the current resumed snapshot: owner=`Claude2`, reviewer=`Codex`, status=`in_progress`, no `waiting_for`, last_update=`2026-05-19T21:37:34Z`.

**PASS condition for parent:** the live-exec evidence or held-state packet cites the current machine-truth dependency closure and current resumed owner state without regressing to the stale blocked snapshot from `cf7bcc4`.

### AC-2: External GitHub and GCP prerequisites are proven for the actual run

Before any real production deploy is treated as accepted evidence, the operator lane must prove:

- GitHub repo variables exist for the production values called out by the runbook, including `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`, `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `PROD_PLATFORM_ADMIN_ORIGIN`, `PROD_OPS_CONSOLE_ORIGIN`, `PROD_CONTROL_PLANE_API_ORIGIN`, and `PROD_IAP_CLIENT_ID`.
- GitHub repo secrets exist for `PROD_WIF_PROVIDER` and `PROD_WIF_SERVICE_ACCOUNT`.
- GitHub Environment `production` is configured with a human reviewer path.
- GCP wiring is live for WIF, runtime service account separation, Artifact Registry push, Cloud SQL target, Secret Manager entries, and Cloud Run/IAP rights or an explicit manual fallback.
- The target `prod/vYYYY.MM.DD.N` tag exists on origin, and a previous known-good tag exists for rollback proof.

**PASS condition for parent:** the evidence packet records that the real operator environment satisfied these gates, not merely that the runbook lists them.

### AC-3: The first real production deploy is reviewable end to end

The reviewer needs all of the following recorded in the parent evidence:

- deployed `prod/v*` tag and resolved commit SHA
- workflow run URL
- whether migration ran or `skip_migration=true`
- protected health-check outcomes
- production environment approver
- resulting evidence artifact path and any redacted manual evidence needed to support it

**PASS condition for parent:** a reviewer can reconstruct what was deployed, who approved it, what health checks passed, and what still remained manual/external.

### AC-4: Rollback evidence is captured under the formal drill protocol

The rollback companion must capture:

- named `drillCommander`, `rollbackOperator`, `dbOwner`, `envApprover`, and `scribe`
- `candidateTag` and `rollbackTag` plus resolved SHAs
- candidate deploy workflow URL
- rollback redispatch with `skip_migration=true` unless a separately reviewed migration rollback path exists
- protected health checks before deploy, after deploy, and after rollback
- explicit stop-condition or partial-failure notes if the drill did not complete cleanly

**PASS condition for parent:** the qualifying rollback drill or incident rollback is evidenced concretely enough to satisfy `PROD-DRILL-001` through machine-truth closure, not through tabletop language.

---

## 5) Reviewer-Usable Checklist

| Item | Required result |
| --- | --- |
| Parent snapshot is current | packet says parent owner=`Claude2`, reviewer=`Codex`, status=`in_progress`, no `waiting_for`, last_update=`2026-05-19T21:37:34Z`, and `next` still says live prod deploy cannot fire yet |
| Sidecar routing is current | packet says sidecar owner=`Codex`, reviewer=`Codex2`, and the owner handoff target is still `Codex2` |
| Dependency state is honest | `PROD-SPEC-001`, `PROD-DRILL-001`, and the unblock child all remain `done` via canonical machine truth |
| Visibility gaps are explicit | packet states that the dependency docs, unblock artifact, and parent live-exec evidence artifact are still missing from canonical root and this task worktree |
| Runbook/gate anchors are present | packet points to the existing prod deploy/rollback runbook, gate row, and PROD-RAIL closeout evidence |
| External gating meaning is preserved | packet does not confuse machine-truth `in_progress` with live readiness; it preserves the real blocker cause as external GitHub/GCP/operator readiness plus missing prod tag/evidence |
| Reviewer commands are current | owner handoff targets `Codex2`, and approve/reopen commands target the same reviewer |

---

## 6) Reviewer Hotspots For `Codex2`

1. Confirm the packet now matches current canonical machine truth after stale commit `cf7bcc4`: parent is `in_progress` at `2026-05-19T21:37:34Z` under `Claude2/Codex`, with no `waiting_for`.
2. Confirm the packet is honest about chronology: the unblock child closed with `resolved_parent_status=todo`, and the parent later resumed to `in_progress` for evidence refresh.
3. Confirm the packet is honest about visibility: dependency docs, unblock artifact, and parent live-exec evidence are authoritative in machine truth but still absent from canonical root and this task worktree.
4. Confirm the packet preserves the HELD-external interpretation even though the control-plane status is currently `in_progress`.
5. Confirm the reviewer checklist demands actual production workflow evidence plus rollback evidence, not dry-run proof.
6. Confirm the packet remains support-only and does not mutate any canonical truth file, workflow, or runtime implementation.

---

## 7) Sidecar Acceptance Checklist

### AC-S1 - Support artifact only

- [x] Output stays confined to `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- [x] No canonical truth file is edited by this packet refresh
- [x] No runtime, workflow, registry, GitHub, or GCP implementation changes are made here

### AC-S2 - Machine-truth aligned dependency map

- [x] Parent and sidecar owner/reviewer/status fields match canonical `AI_STATUS_ROOT/ai-status.json` at draft time
- [x] Formal dependencies remain exactly `PROD-SPEC-001` and `PROD-DRILL-001`
- [x] The unblock child remains included as the routing decision that preserves HELD-external classification
- [x] The packet explicitly records the current branch/root visibility gap for dependency artifacts and the parent evidence artifact

### AC-S3 - Reviewer-ready acceptance framing

- [x] External prerequisite checklist is explicit
- [x] Required live deploy evidence is explicit
- [x] Required rollback evidence is explicit
- [x] Non-claim boundary is preserved: this packet does not upgrade `WF-PROD-001-LIVE-EXEC` beyond current evidence

---

## 8) Machine-Truth Handoff Commands

### Owner -> Reviewer (`Codex` -> `Codex2`)

```bash
AI_NAME=Codex scripts/ai-status.sh handoff WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE Codex2 "Refreshed support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md against canonical AI_STATUS_ROOT after stale commit cf7bcc4. Packet now matches parent WF-PROD-001-LIVE-EXEC owner=Claude2 reviewer=Codex status=in_progress last_update=2026-05-19T21:37:34Z with no waiting_for, preserves the HELD-external meaning from the parent next step, records dependency closeout metadata for PROD-SPEC-001, PROD-DRILL-001, and the unblock child, and notes the current visibility gap plus the absence of prod/v* tags on origin during this refresh."
```

### Reviewer Approve (`Codex2`)

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "Approved refreshed support-only packet. The sidecar now matches canonical machine truth for the resumed parent snapshot, keeps the dependency docs/unblock artifact/live-exec evidence honest as done-or-anchored in status but still absent on this branch/root, preserves the HELD-external interpretation while the parent is in_progress, and provides a reviewer-usable acceptance checklist for live deploy and rollback evidence."
```

### Reviewer Reopen (`Codex2`)

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "Please refresh the WF-PROD-001 live-exec sidecar packet: <describe any remaining machine-truth mismatch, reviewer-routing error, stale parent snapshot, or missing evidence requirement>."
```

Owner closeout happens only after `review_approved` and after the support-artifact commit/push metadata is available for `done`.

---

## 9) Verification Notes

- Verified canonical machine truth from `/home/edna/workspace/drts-fleet-platform/ai-status.json`.
- Verified canonical parent `WF-PROD-001-LIVE-EXEC` is `in_progress` with owner=`Claude2`, reviewer=`Codex`, no `waiting_for`, and last_update=`2026-05-19T21:37:34Z`.
- Verified there are no open handoff or blocker entries for either `WF-PROD-001-LIVE-EXEC` or `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE`.
- Verified canonical dependency closeout metadata for `PROD-SPEC-001`, `PROD-DRILL-001`, and `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`.
- Verified both canonical root and this task worktree still lack `production-deploy-rail-spec-20260519.md`, `production-rollback-drill-20260519.md`, `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`, and `PROD-LIVE-EXEC-EVIDENCE.md`.
- Verified the current branch/root does contain `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, the `WF-PROD-001` gate row, and `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`.
- Verified `git ls-remote --tags origin 'refs/tags/prod/v*'` returned no matching tags during this refresh.
- No runtime tests or live workflow checks were run because this sidecar task updates support documentation only.
