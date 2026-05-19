# WF-PROD-001-LIVE-EXEC Acceptance Packet & Dependency Map

- **Sidecar Kind:** `acceptance_packet`
- **Parent Task:** `WF-PROD-001-LIVE-EXEC`
- **Current Sidecar Owner:** `Codex`
- **Assigned Sidecar Reviewer:** `Codex2`
- **Parent Owner At Snapshot:** `Claude2`
- **Parent Reviewer At Snapshot:** `Codex`
- **Last Revised:** `2026-05-19T21:15:21Z`
**Status:** `Refreshed support-only acceptance packet aligned to canonical machine truth after review failure identified a missing shared-branch artifact and stale reviewer/status metadata in the earlier draft.`

---

## 1) Scope Boundary

This sidecar stays support-only.

- **In scope:** acceptance framing for `WF-PROD-001-LIVE-EXEC`, dependency mapping, reviewer checklist, current machine-truth snapshot, and honest evidence expectations for the first real production deploy plus rollback proof.
- **Out of scope:** editing L1/L2 canonical truth, changing the parent task's control-plane status, changing runtime/workflow/GCP/GitHub implementation, or claiming that a real production deploy already happened.

---

## 2) Canonical Machine-Truth Snapshot

The authoritative control-plane source for this packet is canonical `ai-status.json` under `AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform`, with `current-work.md` used only as the derived human view.

### Parent `WF-PROD-001-LIVE-EXEC`

- title=`Production deploy live execution (HELD)`
- owner=`Claude2`
- reviewer=`Codex`
- status=`in_progress`
- depends_on=`["PROD-SPEC-001","PROD-DRILL-001"]`
- artifact target=`support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
- last_update=`2026-05-19T21:13:47Z`
- next=`Claude2 is re-confirming the HELD-external classification, checking whether prod GitHub/GCP prerequisites remain missing, and preparing held-state/live-exec evidence before reporting the external blocker posture.`

### Sidecar `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- helper kind=`acceptance_packet`
- support artifact path=`support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- last_update=`2026-05-19T21:15:21Z`
- `mutates_canonical=false`

### Important posture that this packet must preserve

- The parent moved beyond earlier `todo`/`blocked` snapshots and is now `in_progress` under `Claude2`, but the underlying operational meaning is still **HELD-external**.
- No live production evidence file exists yet at `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`. That is expected until a real operator-run deploy occurs.
- The reviewer failure was correct: the earlier draft existed only in a private worktree and was stale for current machine truth. This refresh corrects reviewer routing and lifecycle references.

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
| `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` | `done` | commit `025b1dd3cea63ed41d6814f9be0f2424c92a5d72`, push `origin/codex/wf-prod-001-live-exec-unblock-planning-decision` | `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md` is still missing in both canonical root and this task worktree | Confirms the parent is **external-gated operator work**, not a missing product/contract decision. The correct next step remains real GitHub/GCP readiness plus the first actual `gh workflow run deploy-prod.yml ...`. |

### In-branch anchors that are present right now

| Anchor | Current state | Why it matters |
| --- | --- | --- |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` | present | Defines the current deploy/rollback operating rail, required GitHub configuration, required GCP wiring, workflow stages, and minimum evidence expectations. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` row `WF-PROD-001` | present | Current gate read remains `PASS (dry-run contract evidence)` with explicit `EXTERNAL-GATED` language for the first real production execution. |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` | present | Confirms the production rail is structurally real at dry-run level, while explicitly not claiming live production execution. |

### Dependency visibility note

Machine-truth closeout metadata is authoritative for dependency state in this packet. The dependency docs and unblock note above are still absent from canonical root and this task worktree, so this sidecar must not pretend the current branch already contains those files.

### Not-yet-produced parent evidence

| Expected parent artifact | Current state | Meaning |
| --- | --- | --- |
| `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` | missing | Expected. No real production deploy/rollback evidence has been recorded yet. |

---

## 4) Parent Acceptance Framing

The parent task still has no explicit `acceptance` array in `ai-status.json`, so this packet expands the reviewer bar from current machine truth plus the runbook/gate anchors that are present on this branch.

### AC-1: Dependency truth is consumed honestly

- `PROD-SPEC-001` and `PROD-DRILL-001` must remain `done` in the acceptance framing even though their docs are not visible on this branch/root.
- The unblock child must remain `done` and must keep the parent classified as external-gated rather than semantically blocked.
- The parent must not regress to the earlier stale snapshot that said owner=`Gemini`, reviewer=`Codex`, status=`todo`.

**PASS condition for parent:** the live-exec evidence or held-state packet cites the current machine-truth dependency closure without inventing new canonical blockers.

### AC-2: External GitHub and GCP prerequisites are proven for the actual run

Before any real production deploy is treated as accepted evidence, the operator lane must prove:

- GitHub repo variables exist for `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`, `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `PROD_PLATFORM_ADMIN_ORIGIN`, `PROD_OPS_CONSOLE_ORIGIN`, `PROD_CONTROL_PLANE_API_ORIGIN`, and `PROD_IAP_CLIENT_ID`.
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
| Parent snapshot is current | packet says parent owner=`Claude2`, reviewer=`Codex`, status=`in_progress`, and still HELD-external in meaning |
| Sidecar snapshot is current | packet says sidecar owner=`Codex`, reviewer=`Codex2`, status=`in_progress` |
| Dependency state is honest | `PROD-SPEC-001`, `PROD-DRILL-001`, and the unblock child all remain `done` via machine truth |
| Dependency visibility gap is explicit | packet states that the dependency docs/unblock note are still missing from canonical root and this task worktree |
| Runbook/gate anchors are present | packet points to the existing prod deploy/rollback runbook, gate row, and PROD-RAIL closeout evidence |
| Live-evidence gap is explicit | packet does not pretend `PROD-LIVE-EXEC-EVIDENCE.md` already exists |
| Reviewer commands are current | owner handoff targets `Codex2`, and approve/reopen commands target the same reviewer |

---

## 6) Reviewer Hotspots For `Codex2`

1. Confirm the packet now matches canonical machine truth after the review failure: parent owner is `Claude2`, sidecar reviewer is `Codex2`, and the parent is `in_progress` rather than the old `todo`/`blocked` snapshot.
2. Confirm the packet is honest about dependency visibility: the controlling docs are closed in machine truth but still absent from canonical root and this task worktree.
3. Confirm the packet preserves the external-gated reading from the unblock decision rather than reopening a resolved semantic blocker.
4. Confirm the reviewer checklist demands actual production workflow evidence plus rollback evidence, not dry-run proof.
5. Confirm the packet remains support-only and does not mutate any canonical truth file, workflow, or runtime implementation.

---

## 7) Sidecar Acceptance Checklist

### AC-S1 - Support artifact only

- [x] Output stays confined to `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- [x] No canonical truth file is edited by this packet refresh
- [x] No runtime, workflow, registry, GitHub, or GCP implementation changes are made here

### AC-S2 - Machine-truth aligned dependency map

- [x] Parent and sidecar owner/reviewer/status fields match canonical `ai-status.json`
- [x] Formal dependencies remain exactly `PROD-SPEC-001` and `PROD-DRILL-001`
- [x] The unblock child remains included as the routing decision that preserves HELD-external classification
- [x] The packet explicitly records the current branch/root visibility gap for dependency artifacts

### AC-S3 - Reviewer-ready acceptance framing

- [x] External prerequisite checklist is explicit
- [x] Required live deploy evidence is explicit
- [x] Required rollback evidence is explicit
- [x] Non-claim boundary is preserved: this packet does not upgrade `WF-PROD-001-LIVE-EXEC` beyond current evidence

---

## 8) Machine-Truth Handoff Commands

### Owner -> Reviewer (`Codex` -> `Codex2`)

```bash
AI_NAME=Codex scripts/ai-status.sh handoff WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE Codex2 "Refreshed support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md against canonical machine truth after the prior review failure. Packet now matches parent WF-PROD-001-LIVE-EXEC owner=Claude2 reviewer=Codex status=in_progress, sidecar reviewer=Codex2, and current dependency closeout metadata for PROD-SPEC-001, PROD-DRILL-001, and the unblock child. It also records the honest branch/root visibility gap for those dependency docs, keeps WF-PROD-001 framed as HELD-external operator work, and defines the reviewer checklist for the first real prod deploy plus rollback evidence."
```

### Reviewer Approve (`Codex2`)

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "Approved refreshed support-only packet. The sidecar now matches canonical machine truth for parent/sidecar routing, keeps the dependency docs honest as done-in-status but still absent on this branch/root, preserves the HELD-external interpretation from the unblock child, and provides a reviewer-usable acceptance checklist for live deploy and rollback evidence."
```

### Reviewer Reopen (`Codex2`)

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "Please refresh the WF-PROD-001 live-exec sidecar packet: <describe any remaining machine-truth mismatch, reviewer-routing error, or missing evidence requirement>."
```

Owner closeout happens only after `review_approved` and after the support-artifact commit/push metadata is available for `done`.

---

## 9) Verification Notes

- Verified canonical machine truth from `/home/edna/workspace/drts-fleet-platform/ai-status.json` and derived `current-work.md`.
- Verified the current branch/root still lacks `production-deploy-rail-spec-20260519.md`, `production-rollback-drill-20260519.md`, and the unblock closeout note, so the packet keeps those as machine-truth-only dependency anchors.
- Verified the current branch/root does contain `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, the `WF-PROD-001` gate row, and `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`.
- No runtime tests or live workflow checks were run because this sidecar task updates support documentation only.
