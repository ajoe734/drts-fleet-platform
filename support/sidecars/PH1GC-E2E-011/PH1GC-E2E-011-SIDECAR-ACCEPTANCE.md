# PH1GC-E2E-011 Sidecar Acceptance Packet

Snapshot Type: owner-authored support packet from machine truth and repo baseline
Snapshot Captured At: 2026-05-22T03:13:52Z
Sidecar Status At Capture: in_progress
Sidecar Owner: Codex2
Sidecar Reviewer: Codex
Parent Task: PH1GC-E2E-011
Parent Title: Phase 1 gap closure - E2E-011 platform admin control plane script

## Purpose

This file is a sidecar-only support artifact for `PH1GC-E2E-011`. It does not change canonical truth, runtime code, or the parent backlog item. It packages the acceptance checklist, dependency map, current baseline, and reviewer handoff notes that the assigned reviewer can use when the parent shell script is ready.

## Scope Boundary

- Allowed: support material for `tests/e2e/E2E-011-platform-admin-control-plane.sh`, its dependency map, and reviewer-facing acceptance framing.
- Not allowed: edits to `tests/e2e/*.sh`, `docs/**`, `packages/contracts/**`, `apps/platform-admin-web/**`, `apps/api/**`, or machine-truth closeout for the parent task.

## Machine-Truth Snapshot

- `ai-status.json` is authoritative. This markdown file is only a reviewer-facing snapshot captured at `2026-05-22T03:13:52Z`.
- Sidecar task `PH1GC-E2E-011-SIDECAR-ACCEPTANCE` is `in_progress` with next step: `Preparing acceptance packet, dependency map, and reviewer handoff for PH1GC-E2E-011 without changing canonical truth.`
- Parent task `PH1GC-E2E-011` is `pending`, owned by `Codex`, reviewed by `Codex2`, and depends formally on `PH1GC-ADM-001`.
- Parent acceptance recorded in machine truth is specific:
  - `tests/e2e/E2E-011-platform-admin-control-plane.sh` must be visible on `origin/dev`.
  - The script must encode all 11 directive steps: login -> tenant -> modules -> quotas -> partner entry -> credential -> adapter -> pricing -> flag -> rollout -> rollback hold -> audit.
  - Audit assertion must run after every mutation step.
  - At least 2 RBAC negative paths must be covered.
  - Pricing publish must carry a version field.
  - Rollback hold must block production promote via `409` / `403` / conflict behavior.
  - Closeout report must follow directive `§7` format.
- Dependency task `PH1GC-ADM-001` is also `pending` at capture time. Its acceptance requires the UAT artifact `docs/04-uat/platform-admin-control-plane-uat-20260519.md` and explicitly says `PH1GC-E2E-011` must assert every control-plane area plus RBAC negatives, pricing versioning, and rollback-hold gate behavior.
- The parent task's `planning_ref` and `next` fields point to `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` and `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`, but those files are not present in the current worktree. For this sidecar, the embedded dispatch brief and `ai-status.json` are therefore the usable machine-truth anchors.

## Current Repo Baseline

### E2E suite state

- `tests/e2e/` currently contains shipped scenarios `E2E-001` through `E2E-009` only. `tests/e2e/E2E-011-platform-admin-control-plane.sh` does not exist in this tree.
- `tests/e2e/run-e2e.sh` discovers scenarios with `find "$SCRIPT_DIR" -maxdepth 1 -name 'E2E-*.sh' | sort`, so the parent task does not need bespoke runner wiring if it adds the file with the standard naming convention.
- `tests/e2e/README.md` documents scenarios `001` to `004` and the generic run commands, but does not mention `E2E-011` or `WF-ADM-001`.
- `docs/04-uat/fbp-014a-e2e-matrix.md` currently has no `WF-ADM-001` / `E2E-011` row in this worktree snapshot.

### UAT / planning baseline

- `docs/04-uat/platform-admin-control-plane-uat-20260519.md` is not present in this worktree, which matches the formal dependency `PH1GC-ADM-001` still being `pending`.
- `docs/00-context/phase1-v3-resolution-20260519.md` already reserves the numbering `E2E-011  Platform Admin Control Plane` and says the required UAT should correspond to `tests/e2e/E2E-011-platform-admin-control-plane.sh`.

### Existing product/runtime anchors the parent script should exercise

- `apps/platform-admin-web/app/tenants/page.tsx` already exposes tenant governance, quotas, rollout status, and rollback-hold messaging.
- `apps/platform-admin-web/app/pricing/page.tsx` already carries pricing publish form state with `effectiveFrom` / `effectiveTo`.
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx` already exposes partner credential and audit-facing sections.
- `apps/platform-admin-web/app/audit/page.tsx` is the audit review surface the parent script is expected to verify.
- `packages/contracts/src/index.ts` already contains the platform-tenant status enum with `rollback_hold`.
- `apps/api/src/modules/platform-admin/tenants.service.ts` already records `set tenant rollback hold` and throws `TENANT_IN_ROLLBACK_HOLD` with `Tenant is in rollback hold. Resolve the hold before promoting.`
- `apps/api/tests/unit/tenants.service.test.ts` already has a unit test for `sets rollback hold and blocks production status`.

Conclusion: this sidecar should be read as a start gate and reviewer packet for a parent task that is still pending, not as proof that `E2E-011` or its UAT dependency already exists on `origin/dev`.

## Dependency Map

### Formal upstream dependency

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `PH1GC-ADM-001` | `pending` | Parent `PH1GC-E2E-011` depends on the platform-admin control-plane UAT artifact. The sidecar should preserve that ordering instead of implying the shell script can close independently of the UAT surface. |

### Practical implementation dependencies

| Dependency | Type | Why it matters |
| --- | --- | --- |
| `tests/e2e/run-e2e.sh` | runner contract | The new script must match the existing `E2E-*.sh` naming convention so `--suite 011` and dry-run discovery work without special-case edits. |
| `tests/e2e/README.md` | suite documentation | Parent closeout should update the scenario map or at minimum the running examples so `011` is visible to future operators. |
| `docs/04-uat/fbp-014a-e2e-matrix.md` | gate matrix | The workflow-family matrix needs an explicit `WF-ADM-001` / `E2E-011` mapping before the parent can claim release-gate traceability. |
| `docs/00-context/phase1-v3-resolution-20260519.md` | numbering authority | This file is the stable in-repo anchor that says `E2E-011` is the platform-admin control-plane slot. The parent should align to that numbering and not invent `E2E-010` aliases in the shipped filename. |
| `apps/platform-admin-web/app/tenants/page.tsx` | UI surface | Tenant creation, module toggles, quotas, rollout stage, and rollback-hold checks need concrete page anchors in the script or closeout notes. |
| `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx` | UI surface | Partner entry and credential issuance/masking are distinct steps and should not be collapsed into generic partner setup language. |
| `apps/platform-admin-web/app/pricing/page.tsx` | UI surface | Pricing publish is a separate control-plane step and must carry version-aware data, not just a generic save. |
| `apps/platform-admin-web/app/audit/page.tsx` | audit surface | The parent acceptance explicitly requires audit assertions after every mutation step. |
| `packages/contracts/src/index.ts` plus `apps/api/src/modules/platform-admin/tenants.service.ts` | contract/runtime gate | Rollback-hold and production-promotion conflict behavior already exist in runtime/contracts and should be the basis for the E2E assertions. |

## Parent Acceptance Checklist

The reviewer can use this list when `PH1GC-E2E-011` moves to review:

- [ ] `tests/e2e/E2E-011-platform-admin-control-plane.sh` exists in the tree and is the shipped `E2E-011` filename.
- [ ] The flow covers the full control-plane chain in order:
  `login -> tenant -> modules -> quotas -> partner entry -> credential -> adapter -> pricing -> flag -> rollout -> rollback hold -> audit`.
- [ ] The script distinguishes `tenant`, `modules`, and `quotas` as separate mutations; they cannot be silently merged into one "tenant setup" step.
- [ ] The script distinguishes `partner entry` and `credential` as separate assertions; credential handling cannot be implied by entry creation alone.
- [ ] The script treats `adapter`, `pricing`, `flag`, and `rollout` as separate control-plane steps, not generic governance placeholders.
- [ ] Audit verification happens after every mutation step, not only once at the end.
- [ ] At least 2 RBAC negative paths are asserted.
- [ ] One negative path should cover an unauthorized tenant-side mutation.
- [ ] One negative path should cover an unauthorized pricing or publish mutation.
- [ ] Pricing publish includes a version field or version-aware payload assertion.
- [ ] Rollback hold blocks production promote and asserts conflict behavior (`409`, `403`, or an explicit equivalent conflict envelope).
- [ ] The parent closeout cites verification evidence such as `bash -n`, `bash tests/e2e/run-e2e.sh --suite 011 --dry-run`, and any live/manual execution that was actually performed.
- [ ] The parent closeout report follows directive `§7` formatting instead of ad hoc prose.

## Reviewer Hotspots

- Confirm the parent task does not over-claim that `PH1GC-ADM-001` is already done unless the UAT file is actually present and machine truth has advanced.
- Confirm the parent task does not claim audit coverage if the script only mutates data but never inspects the audit surface between steps.
- Confirm rollback-hold behavior is asserted against the real conflict contract already surfaced by `tenants.service.ts`, not a made-up exit code.
- Confirm the final script aligns with the existing E2E shell style used by `tests/e2e/E2E-009-prod-rail-dry-run.sh` and remains runnable under `run-e2e.sh --suite 011`.
- Reject any parent closeout that says "admin flow covered" without explicitly enumerating all 11 directive steps.

## Evidence Index

- `ai-status.json`
  Parent and sidecar machine-truth records for `PH1GC-E2E-011`, `PH1GC-E2E-011-SIDECAR-ACCEPTANCE`, and `PH1GC-ADM-001`.
- `current-work.md`
  Human-readable queue snapshot showing the sidecar assignment and parent pending state.
- `docs/00-context/phase1-v3-resolution-20260519.md`
  In-repo numbering authority for `E2E-011` and the UAT/script correspondence.
- `tests/e2e/run-e2e.sh`
  Scenario discovery and `--suite` contract.
- `tests/e2e/README.md`
  Current suite documentation baseline, which still lacks `011`.
- `docs/04-uat/fbp-014a-e2e-matrix.md`
  Current matrix baseline, which still lacks a visible `WF-ADM-001` / `E2E-011` row in this worktree.
- `apps/platform-admin-web/app/tenants/page.tsx`
- `apps/platform-admin-web/app/pricing/page.tsx`
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `apps/platform-admin-web/app/audit/page.tsx`
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/platform-admin/tenants.service.ts`
- `apps/api/tests/unit/tenants.service.test.ts`

## Reviewer Handoff

Owner handoff command:
`AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-E2E-011-SIDECAR-ACCEPTANCE Codex "PH1GC-E2E-011 support packet ready at support/sidecars/PH1GC-E2E-011/PH1GC-E2E-011-SIDECAR-ACCEPTANCE.md. It preserves machine truth that the sidecar is support-only, the parent PH1GC-E2E-011 remains pending behind PH1GC-ADM-001, E2E-011 numbering is anchored to docs/00-context/phase1-v3-resolution-20260519.md, and the current repo baseline still lacks the net-new UAT/script artifacts. Verified git diff --check for the sidecar artifact only; no canonical/runtime files changed."`

Reviewer approval command:
`AI_NAME=Codex scripts/ai-status.sh approve PH1GC-E2E-011-SIDECAR-ACCEPTANCE "Reviewed: packet stays support-only, preserves the pending PH1GC-ADM-001 dependency, and gives a PH1GC-E2E-011-specific acceptance/dependency map without changing canonical truth."`

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/PH1GC-E2E-011/PH1GC-E2E-011-SIDECAR-ACCEPTANCE.md` changed for this task.
- Run `git diff --check -- support/sidecars/PH1GC-E2E-011/PH1GC-E2E-011-SIDECAR-ACCEPTANCE.md`.
- Spot-check that `tests/e2e/E2E-011-platform-admin-control-plane.sh` and `docs/04-uat/platform-admin-control-plane-uat-20260519.md` are absent in this worktree snapshot; the packet intentionally frames them as pending, not delivered.
- Spot-check that `docs/00-context/phase1-v3-resolution-20260519.md` still names `E2E-011` as the platform-admin control-plane slot.
