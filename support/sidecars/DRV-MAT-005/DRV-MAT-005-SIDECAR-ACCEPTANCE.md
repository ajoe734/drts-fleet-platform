# DRV-MAT-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `DRV-MAT-005` - Driver SOS incident flow  
**Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Claude2`  
**Parent Owner / Reviewer (current snapshot):** `Codex` / `Codex2`  
**Generated:** `2026-05-05` (UTC)  
**Snapshot Status:** Parent `DRV-MAT-005` remains `backlog` in `ai-status.json` (`last_update: 2026-05-05T02:35:38Z`). This sidecar is support-only and does not claim parent implementation, review, or closeout.

> **Provenance.** Repo HEAD at packet generation is `7fc93c3 DRV-MAT-004 unify trip workflow command center` on branch `codex/dev-deploy-backend-android`. Parent evidence currently points at `.orchestrator/evidence/claude2-20260505T023211Z-ed213c14.json`, but that evidence file only records that the worker exited before reaching a terminal state. It is not implementation proof.

## 1) Scope Boundary

This sidecar only prepares reviewer-facing acceptance framing, dependency mapping, repo baseline, and handoff notes for `DRV-MAT-005`.

- In scope: support-only acceptance checklist, dependency map, current `/incident` baseline, gap summary against parent acceptance, reviewer hotspots, handoff wording.
- Out of scope: editing `apps/driver-app/app/incident.tsx`, `apps/driver-app/app/trip.tsx`, `apps/driver-app/components/ui/*`, contracts, tests, design docs, execution packet, or parent machine truth beyond sidecar status updates.

## 2) Current State Baseline

### 2.1 Parent machine truth

- `ai-status.json` records `DRV-MAT-005` as `status=backlog`, `owner=Codex`, `reviewer=Codex2`, `depends_on=["DRV-MAT-001","DRV-MAT-004"]`.
- Parent acceptance is explicitly:
  - `SOS requires confirmation`
  - `success returns to trip`
  - `no text button`
  - `typecheck passes`
- Parent artifact scope is `apps/driver-app/app/incident.tsx` plus optional shared confirm helper under the shared UI surface described in the execution packet.

### 2.2 Dependency closure

- `DRV-MAT-001` is `done` with commit `866235025ec8925533ee09ca75b2b6dcb4ed14f0` (`DRV-MAT-001: finalize shared UI foundation`), pushed to `origin/codex/drv-mat-001-closeout`.
- `DRV-MAT-004` is `done` with commit `7fc93c3162398917c518cf3b26257202aec95f47` (`DRV-MAT-004 unify trip workflow command center`), pushed to `origin/codex/dev-deploy-backend-android`.
- The current worktree shows no in-flight edits under the parent slice: `apps/driver-app/app/incident.tsx`, `apps/driver-app/app/trip.tsx`, `tests/unit/incident.test.ts`, and `apps/driver-app/components/ui/*` are clean. The only local delta produced by this sidecar is this packet file.

### 2.3 Existing repo baseline for `/incident`

The repo already contains an older SOS implementation in `apps/driver-app/app/incident.tsx`:

- Feature-gate check exists through `client.isFeatureEnabled("driver-app.incidents")` at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:22).
- Submit path already creates a safety-critical incident at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:38) with `category: "safety"` and `severity: "critical"`, escalates to `safety_officer`, then returns to `/trip` at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:52).
- Disabled and loading states exist at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:60) and [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:69).
- `tests/unit/incident.test.ts` already includes a safety-critical SOS unit case.

This baseline comes from historical commits `2600629` (`feat(driver-app): add safety-critical SOS flow`) and `9224a46` (`fix(gap-p2s1-001): prevent duplicate SOS submission`). Those commits are useful context, but they do not auto-close `DRV-MAT-005`, which is a later productization task with stricter UX acceptance.

## 3) Acceptance Gap Assessment

This section compares the current repo state to the parent task's formal acceptance without changing parent status.

### AC-1 - `SOS requires confirmation`

- [ ] Not satisfied in current repo snapshot.
- `handleSubmit` calls `createIncident` immediately when the primary SOS control is pressed at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:30).
- No modal, interstitial confirm state, shared confirm helper, or second-step confirmation is present in `incident.tsx`.

### AC-2 - `success returns to trip`

- [x] Satisfied by current repo snapshot.
- Successful submit executes `router.replace("/trip")` at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:52).

### AC-3 - `no text button`

- [ ] Not satisfied in current repo snapshot.
- The primary SOS action is still a styled `<Text>` node with `onPress` at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:104), not a shared `ActionButton`.
- The back affordance is also a text link at [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:111).
- The `/trip` entry point to SOS is still a text link (`SOS 緊急通報 →`) at [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:998), which is relevant because `DRV-MAT-004` already localized the trip command center but did not convert the SOS affordance to shared button posture.

### AC-4 - `typecheck passes`

- [ ] Not yet evidenced for the parent task.
- This sidecar did not run `pnpm --filter @drts/driver-app typecheck` on behalf of the parent owner.
- Machine truth for `DRV-MAT-005` contains no parent review or closeout note with a `typecheck` result.

## 4) Dependency Map

### 4.1 Formal upstream dependencies

| Dependency    | Source                   | Status | Why It Matters                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-001` | `DRV-MAT-005.depends_on` | `done` | Supplies the shared UI contract that `DRV-MAT-005` is expected to consume, including [index.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/components/ui/index.ts:1) exports such as `ActionButton`, `AppScreen`, `PageHeader`, `EmptyState`, `ErrorBanner`, and `BottomActionBar`. |
| `DRV-MAT-004` | `DRV-MAT-005.depends_on` | `done` | Owns the trip command center and current SOS entry affordance. `/incident` success returns to `/trip`, and `/trip` currently links into SOS via [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:998).                                                            |

### 4.2 Practical implementation dependencies

| Anchor | Location                                                                                                                                                                       | Why It Matters                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1  | [ActionButton.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/components/ui/ActionButton.tsx:1)                                                                  | Shared button primitive already exists and should replace text-as-button controls.                                                                                          |
| D-P-2  | [incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:38)                                                                                   | Existing safety-critical submit path should be preserved while layering confirmation and shared controls on top.                                                            |
| D-P-3  | [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:998)                                                                                          | Current trip-to-SOS entry is still text-link based; parent owner should decide whether `DRV-MAT-005` absorbs this consumer-side posture change or leaves it as a follow-up. |
| D-P-4  | [incident.test.ts](/home/edna/workspace/drts-fleet-platform/tests/unit/incident.test.ts:56)                                                                                    | Existing unit coverage proves the safety/critical payload baseline and should stay green after productization.                                                              |
| D-P-5  | [driver-app-productization-design-plan-20260504.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/driver-app-productization-design-plan-20260504.md:16)        | Higher-precedence design input describing the current `/incident` gaps: text-as-button, no two-step confirmation, no shared danger-state components.                        |
| D-P-6  | [driver-app-productization-execution-packet-20260504.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:170) | Defines the approved parent write scope and verification command.                                                                                                           |

### 4.3 Downstream consumers and reviewers

| Consumer                   | Current Status          | Why It Matters                                                                                                           |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DRV-MAT-010`              | `backlog`               | The verification pack will need the final `/incident` confirmation flow and typecheck evidence once the parent closes.   |
| Parent reviewer `Codex2`   | `pending future review` | Must verify confirmation gating, shared-button conversion, and `typecheck` evidence before parent can move past review.  |
| Sidecar reviewer `Claude2` | `assigned`              | Reviews that this packet accurately describes the current baseline and acceptance gaps without mutating canonical truth. |

## 5) Evidence Inventory

| ID   | Evidence                                        | Location                                                                                   |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E-1  | Parent task machine state                       | `ai-status.json` entry for `DRV-MAT-005`                                                   |
| E-2  | Sidecar task machine state                      | `ai-status.json` entry for `DRV-MAT-005-SIDECAR-ACCEPTANCE`                                |
| E-3  | Parent design row and route inventory           | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:15-16,324`         |
| E-4  | Parent execution scope and verification command | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:170-184`          |
| E-5  | Existing SOS implementation baseline            | `apps/driver-app/app/incident.tsx`                                                         |
| E-6  | Current trip-to-SOS entry affordance            | `apps/driver-app/app/trip.tsx:998-1001`                                                    |
| E-7  | Shared UI contract from `DRV-MAT-001`           | `apps/driver-app/components/ui/index.ts`, `apps/driver-app/components/ui/ActionButton.tsx` |
| E-8  | Existing SOS unit coverage                      | `tests/unit/incident.test.ts`                                                              |
| E-9  | Dependency closeout for `DRV-MAT-001`           | `ai-status.json` entry for `DRV-MAT-001`                                                   |
| E-10 | Dependency closeout for `DRV-MAT-004`           | `ai-status.json` entry for `DRV-MAT-004`                                                   |
| E-11 | Parent evidence ref outcome                     | `.orchestrator/evidence/claude2-20260505T023211Z-ed213c14.json`                            |

## 6) Reviewer Hotspots (`Claude2`)

Reviewer should verify:

1. The packet preserves machine truth: parent `DRV-MAT-005` is still `backlog`, not `in_progress`, `review`, or `done`.
2. The acceptance framing uses the parent's exact four bullets and does not add new product requirements.
3. The packet clearly distinguishes historical SOS implementation (`2600629`, `9224a46`) from the still-open `DRV-MAT-005` productization task.
4. The dependency map correctly ties `DRV-MAT-001` to shared UI primitives and `DRV-MAT-004` to the trip entry/return behavior.
5. The packet does not edit runtime files or claim `typecheck` passed for the parent when no fresh verification has been run.

## 7) Sidecar Acceptance Checklist

### AC-S1 - `Create support artifacts only`

- [x] Only `support/sidecars/DRV-MAT-005/DRV-MAT-005-SIDECAR-ACCEPTANCE.md` was written.
- [x] Content is limited to acceptance framing, dependency mapping, evidence anchors, and reviewer guidance.

### AC-S2 - `Do not edit canonical truth`

- [x] No L1/L2 truth, runtime files, contracts, tests, or design docs were modified.
- [x] Sidecar machine-state updates were recorded through `scripts/ai-status.sh`.

### AC-S3 - `Hand off the packet to the assigned reviewer`

- [x] Handed off to `Claude2` for review.
- [x] Review approved in machine truth with notes that the packet correctly captures acceptance gaps, dependency closure, and evidence inventory without touching canonical truth.

## 8) Handoff Command

Owner (`Codex2`) -> Reviewer (`Claude2`)

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff DRV-MAT-005-SIDECAR-ACCEPTANCE Claude2 \
  "Prepared support-only DRV-MAT-005 acceptance packet at support/sidecars/DRV-MAT-005/DRV-MAT-005-SIDECAR-ACCEPTANCE.md. Parent DRV-MAT-005 remains backlog under Codex/Codex2; packet maps dependency closure to DRV-MAT-001 done (shared UI foundation) and DRV-MAT-004 done (trip command center), captures the existing safety-critical SOS baseline in incident.tsx, and records the still-open acceptance gaps: no confirmation step, text-as-button controls remain in incident.tsx and trip.tsx, and no fresh driver-app typecheck evidence is recorded for the parent. No canonical truth modified."
```

Reviewer approval already landed in machine truth at `2026-05-05T02:45:16Z`, so the command above is retained as provenance rather than a pending action.

## 9) Notes For Parent Owner (`Codex`)

These are support observations, not new acceptance criteria:

1. The existing `incident.tsx` payload and unit test already cover the safety-critical semantic baseline, so parent work should preserve that behavior while adding confirmation and shared controls.
2. The trip entry link at [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:998) is still text-based. If `DRV-MAT-005` converts only `/incident` and leaves `/trip` unchanged, reviewer should decide whether that still satisfies the intended "no text button" posture for the end-to-end SOS flow.
3. Parent verification command remains `pnpm --filter @drts/driver-app typecheck` per the execution packet; closeout should record the command/result in machine truth.
