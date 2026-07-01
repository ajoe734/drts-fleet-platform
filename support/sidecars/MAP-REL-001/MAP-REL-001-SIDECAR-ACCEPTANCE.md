# MAP-REL-001 SIDECAR ACCEPTANCE

Snapshot Type: owner support packet
Snapshot Captured At: 2026-07-01T02:37:19Z
Snapshot Status At Capture: `in_progress`
Worktree / HEAD: `codex/map-rel-001-sidecar-acceptance` @ `f452f019f`
Sidecar Owner / Reviewer: `Codex` / `Codex2`
Parent Task: `MAP-REL-001`
Parent Owner / Reviewer: `Codex2` / `Codex`

## Purpose

This packet is a support-only acceptance artifact for `MAP-REL-001`. It
consolidates the current release-gate checklist, dependency map, machine-truth
snapshot, and reviewer hotspots without editing canonical truth or re-signing
the parent task's evidence.

## Scope Boundary

- Allowed: acceptance framing, dependency mapping, evidence-anchor collection,
  machine-truth drift notes, and reviewer handoff guidance for `MAP-REL-001`.
- Not allowed: edits to runtime code, product/canonical docs, `ai-status.json`
  payloads by hand, or parent-task closeout claims.

## Machine-Truth Snapshot

`ai-status.json` remains authoritative. This markdown file is only a reviewer
snapshot captured via `AI_NAME=Codex scripts/ai-status.sh show ...` on
`2026-07-01T02:37:19Z`.

| Task | Status | Owner / Reviewer | Why it matters to `MAP-REL-001` |
| ---- | ------ | ---------------- | -------------------------------- |
| `MAP-REL-001-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` / `Codex2` | This support packet only. |
| `MAP-REL-001` | `in_progress` | `Codex2` / `Codex` | Parent release-gate closeout depends directly on `MAP-QA-002` and `MAP-OBS-001`. Current `next` still says CI E2E is pending because local `psql` was unavailable. |
| `MAP-QA-002` | `in_progress` | `Codex2` / `Codex` | Owns final cross-surface E2E evidence for all five release gates. |
| `MAP-OBS-001` | `in_progress` | `Codex2` / `Codex` | Owns metrics, audit, alert, and runbook evidence; approved owner branch is on PR `#1027` but not yet merged to `dev`. |
| `MAP-QA-001` | `review` | `Codex` / `Claude2` | Provides the offline harness and deterministic provider fixtures that `MAP-QA-002` should consume. |
| `MAP-FE-CALL-001` | `review` | `Codex` / `Claude2` | Gate A callcenter booking path is implemented but not release-accepted. |
| `MAP-FE-TEN-001` | `backlog` | `Claude2` / `Codex2` | Tenant booking/address consistency remains open, so Gate A/E cannot be claimed cross-surface. |
| `MAP-FE-CON-001` | `backlog` | `Codex2` / `Claude` | Concierge and partner entry consistency remains open, so Gate A/E cannot be claimed cross-surface. |
| `MAP-FE-ADM-001` | `in_progress` | `Codex2` / `Codex` | Gate B is still blocked; current review failed on publish/governance gaps. |
| `MAP-MOB-DRV-001` | `review` | `Codex2` / `Claude2` | Gate D code checks passed, but mobile UAT is still an explicit external gate. |
| `MAP-UI-001` | `review` | `Codex` / `Claude2` | Shared picker primitive for booking/address flows is ready for review. |
| `MAP-UI-002` | `review` | `Codex2` / `Claude2` | Original geometry-editor parent still carries sidecar review blockers. |
| `MAP-UI-002-HARDEN-001` | `review` | `Codex2` / `Claude2` | Hardening slice fixes out-of-range and self-intersection blockers. |
| `MAP-UI-002-INTEGRATE-001` | `review` | `Codex` / `Claude2` | Integrated GeometryEditor branch is ready, but this is still not equivalent to Gate B production pass. |
| `MAP-BE-001` | `review` | `Codex` / `Claude2` | Geo/provenance contracts are not yet machine-truth `done`. |
| `MAP-BE-002` | `review` | `Codex` / `Claude2` | Provider gateway is not yet machine-truth `done`. |
| `MAP-BE-003` | `review` | `Codex` / `Claude2` | Client coverage is not yet machine-truth `done`. |
| `MAP-BE-005` | `review` | `Codex` / `Claude2` | Spatial audit snapshot is critical for release evidence, but still not `done`. |

## Parent Acceptance Checklist

The parent `MAP-REL-001` acceptance row is:

- `all release gates evidenced`
- `rollout and rollback documented`
- `PostGIS/provider prerequisites confirmed`
- `gap inventory closeout updated`
- `no unsupported production claim`

Reviewer should keep the parent bar at that exact level. This sidecar does not
lower it.

| Gate / requirement | Required proof before parent closeout | Current blockers at snapshot time |
| ------------------ | ------------------------------------- | --------------------------------- |
| Gate A: Callcenter safe to dispatch | Serviceable path, no-pickup/not-serviceable block, manual-review path, coordinate snapshot, and E2E evidence. | `MAP-QA-002` is still `in_progress`; `MAP-FE-CALL-001` is only `review`; `MAP-FE-TEN-001` and `MAP-FE-CON-001` are still `backlog`; `MAP-BE-004` is referenced by the execution packet but has no canonical row returned by `ai-status.sh show`. |
| Gate B: Governance safe to publish | Platform Admin publish/retire flow, evaluator effect, geometry mutation metrics, and actor/version/effective-date audit proof. | `MAP-FE-ADM-001` review failed; `MAP-UI-002` still has parent review blockers even though hardening/integration follow-ups exist; `MAP-BE-006` is referenced by the execution packet and gap inventory but has no canonical row returned by `ai-status.sh show`. |
| Gate C: Ops safe to operate | Real `/dispatch` map route evidence, overlays, stale/no-location distinction, and degraded fallback evidence. | `MAP-FE-OPS-001` is described in the execution packet but has no canonical row returned by `ai-status.sh show`; `MAP-QA-002` and `MAP-OBS-001` are both still open. |
| Gate D: Driver safe to navigate | Driver trip map route evidence, external navigation correctness, heartbeat coexistence, and Android/iOS UAT. | `MAP-MOB-DRV-001` is only `review`; task notes explicitly keep mobile UAT as an outstanding external gate. |
| Gate E: Degraded safe | Provider outage cannot silently create normal dispatchable coordinate-less orders; quota/latency/error alerts and runbook distinctions must be final. | `MAP-QA-002` is still open; `MAP-OBS-001` is still open pending merge; `MAP-FE-TEN-001` and `MAP-FE-CON-001` remain backlog; `MAP-PROD-000` and `MAP-INFRA-001` are still referenced by planning docs but no canonical row was returned by `ai-status.sh show`. |
| Rollout and rollback documented | Feature-flag order, rollback path, and release verifier references are explicit. | Parent `next` still points at corrective PR work and pending CI E2E; no final release packet is visible in this worktree. |
| PostGIS/provider prerequisites confirmed | Provider health/quota/env evidence and PostGIS/evaluator failure handling are documented with executable proof. | Runbook sections describe these artifacts, but the current worktree is missing the referenced provider runbook, alert file, and env verifier script. |
| Gap inventory closeout updated | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` is updated or superseded with closeout state. | Gap inventory still reads as an active remediation plan, not a finished release closeout. |
| No unsupported production claim | Every referenced gate has concrete evidence and machine-truth alignment. | Several dependencies remain non-`done`, and multiple runbook-referenced task IDs or files are absent from current machine truth / worktree. |

## Dependency Map

### 1. Direct hard dependencies

| Dependency | Current status | Relationship to `MAP-REL-001` |
| ---------- | -------------- | ------------------------------ |
| `MAP-QA-002` | `in_progress` | Owns `E2E-MAP-001` through `E2E-MAP-007`, final command links, screenshots/UAT notes, and the release-gate scenario proof that `MAP-REL-001` must cite. |
| `MAP-OBS-001` | `in_progress` | Owns the metrics, audit events, alerts, and runbook distinctions that prove Gate E degraded safety and the audit portions of Gates A/B/C. |

### 2. Gate support map

| Release gate | Upstream slices that must be reconciled | Snapshot reading |
| ------------ | --------------------------------------- | ---------------- |
| Gate A | `MAP-QA-001`, `MAP-QA-002`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-005`, plus the runbook-only `MAP-BE-004` row | Harness exists in machine truth, but the final E2E suite is still open and two entry-surface tasks are still backlog. |
| Gate B | `MAP-FE-ADM-001`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-OBS-001`, plus the runbook-only `MAP-BE-006` row | UI primitive hardening/integration is in review, but the actual admin governance surface is still in progress with active review failures. |
| Gate C | `MAP-QA-002`, `MAP-OBS-001`, `MAP-BE-005`, plus the runbook-only `MAP-FE-OPS-001` row | The execution packet says the ops map board exists, but no canonical row is discoverable for the ops surface in current machine truth. |
| Gate D | `MAP-MOB-DRV-001`, `MAP-QA-002`, `MAP-OBS-001` | Driver code checks are recorded, but final UAT and release-evidence packaging are still outstanding. |
| Gate E | `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001` | Degraded-mode proof is the least ready gate because provider/infra board rows are missing, observability is awaiting merge, and tenant/concierge flows are still not closed. |

### 3. Machine-truth drift the reviewer should preserve

The following task IDs are cited by the execution packet and/or gap inventory,
but `AI_NAME=Codex scripts/ai-status.sh show <TASK>` returned `Task not found`
from this worktree on `2026-07-01`:

| Task ID | Referenced by | Reviewer implication |
| ------- | ------------- | -------------------- |
| `MAP-PROD-000` | execution packet dependency table and `MAP-INFRA-001` prerequisite | Do not assume provider strategy is canonically closed just because the planning doc has a section for it. |
| `MAP-INFRA-001` | execution packet dependency table, gap inventory progress, `MAP-BE-002` dependency, `MAP-OBS-001` evidence template | Gate E cannot be called complete while its provider/env/quota foundation lacks a discoverable machine-truth row. |
| `MAP-BE-004` | execution packet dependency table, gap inventory progress, `MAP-FE-*` dependencies, `MAP-OBS-001` evidence template | Gate A/B/C/E evidence may still rely on an implementation row that is not discoverable in canonical machine truth. |
| `MAP-BE-006` | execution packet dependency table, gap inventory progress, `MAP-UI-002` dependency, `MAP-OBS-001` evidence template | Gate B cannot be treated as closed until backend governance authority is discoverable and reviewable in machine truth. |
| `MAP-FE-OPS-001` | execution packet dependency table and dedicated implementation section | Gate C ops-map acceptance needs a real row, not only a planning-doc claim. |

This is not a sidecar blocker by itself, but it is a release-review blocker if
the parent tries to claim complete production readiness without reconciling the
board drift.

## Repo-Visible Evidence And Missing Artifacts

### Present in this worktree

| Artifact | Why `MAP-REL-001` should use it |
| -------- | ------------------------------- |
| `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` | Canonical execution packet for task graph, gate definitions, and implementation-status prose. |
| `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | Canonical gap inventory used by the parent acceptance row. |
| `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` | Concrete verifier-topic contract for metrics, audit, alerts, runbook distinctions, and handoff wording into `MAP-REL-001`. |

### Referenced by planning docs but missing from this worktree

The execution packet claims these files already exist, but a direct path check
on `2026-07-01T02:37:19Z` returned `MISSING`:

| Missing path | Why it matters |
| ------------ | -------------- |
| `docs/03-runbooks/map-provider-operational-runbook-20260630.md` | Runbook section `MAP-INFRA-001` says this should document provider outage/quota/ops response. |
| `infra/alerts/map-geofence-alerts.yaml` | Runbook section `MAP-INFRA-001` says this should define provider, quota, and booking-surface alerts. |
| `scripts/verify-map-provider-env.mjs` | Runbook section `MAP-INFRA-001` says this should be the preflight env gate. |
| `support/sidecars/MAP-QA-001/MAP-QA-001-MOCK-PROVIDER-HARNESS.md` | Runbook section `MAP-QA-001` says this should document the mock provider fixture matrix. |
| `support/sidecars/MAP-QA-002/MAP-QA-002-EXECUTION-KICKOFF-20260701.md` | `MAP-QA-002.next` says execution started from this file, but the current worktree does not contain it. |

Reviewer should treat these as real evidence gaps or branch-drift signals, not
as already-satisfied release inputs.

## Reviewer Hotspots

1. `MAP-REL-001` parent closeout is still far from `done`: both direct
   dependencies are open, and the parent `next` explicitly cites pending CI E2E.
2. Gate B is the clearest production blocker:
   `MAP-FE-ADM-001` review failed, while `MAP-UI-002` required follow-up
   hardening and integration slices.
3. Gate E is the least trustworthy surface for a release claim because the
   execution packet references provider/env/alert artifacts that are not
   present in this worktree.
4. The `MAP-OBS-001` template is useful, but it is still a template until
   copied to final evidence with real `PASS` lines, branch/SHA values, and
   artifact paths.
5. Missing canonical rows for `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-BE-004`,
   `MAP-BE-006`, and `MAP-FE-OPS-001` should be escalated or reconciled before
   the parent is allowed to say "no unsupported production claim."

## Reviewer Handoff

Owner handoff command:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-REL-001-SIDECAR-ACCEPTANCE Codex2 "Prepared support-only MAP-REL-001 acceptance packet at support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md. Packet captures current machine-truth snapshot, release-gate checklist, dependency map, board-drift notes, and missing runbook/evidence paths without editing canonical truth. Verified git diff --check for the sidecar artifact; no runtime or canonical files changed."
```

Reviewer approval command:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-REL-001-SIDECAR-ACCEPTANCE "Reviewed: MAP-REL-001 support packet stays sidecar-only, accurately records the current gate/dependency state, and does not over-claim missing machine-truth rows or absent evidence artifacts."
```

## Local Verification For This Sidecar Slice

- Confirm only
  `support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md` changed.
- Run:
  `git diff --check -- support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md`
- Spot-check the following machine-truth rows with `scripts/ai-status.sh show`:
  `MAP-REL-001-SIDECAR-ACCEPTANCE`, `MAP-REL-001`, `MAP-QA-002`,
  `MAP-OBS-001`, `MAP-QA-001`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`,
  `MAP-FE-CON-001`, `MAP-FE-ADM-001`, `MAP-MOB-DRV-001`, `MAP-UI-002`,
  `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-BE-001`,
  `MAP-BE-002`, `MAP-BE-003`, and `MAP-BE-005`.
- Re-run targeted existence checks for the missing paths listed above before
  any parent reviewer tries to cite them as already-landed evidence.

No runtime verification was run for this sidecar itself because this task only
creates a reviewer support artifact.
