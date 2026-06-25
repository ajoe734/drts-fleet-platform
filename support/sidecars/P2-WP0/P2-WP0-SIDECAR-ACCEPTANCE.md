# P2-WP0 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-WP0` — Phase2 contracts + DDL migrations + module scaffolds + shared envelopes
**Sidecar Task ID:** `P2-WP0-SIDECAR-ACCEPTANCE`
**Current Sidecar Owner:** `Codex`
**Assigned Reviewer:** `Claude`
**Parent Owner / Reviewer:** `Claude` / `Codex`
**Last Revised:** `2026-06-25T15:45:00Z (UTC)`
**Status:** support packet drafted from machine truth plus parent branch evidence; ready for sidecar review handoff.

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-WP0` 的 acceptance checklist、dependency map、repo evidence anchors、以及 reviewer handoff notes；不修改 canonical truth，也不代替 parent task 吸收或 closeout 主線實作。

- In scope: support-only acceptance framing, parent branch evidence summary, dependency snapshot, reviewer focus, integration snapshot.
- Out of scope: 修改 `packages/contracts` / `apps/api` / `infra/migrations` 的 canonical implementation、改寫 Phase2 product truth、代替 parent owner 做 `review_approved -> done` closeout。

---

## 2) Parent State Snapshot

以 `AI_NAME=Codex scripts/ai-status.sh show P2-WP0` 讀取於 `2026-06-25`：

- Parent `P2-WP0` 目前為 `review_approved`
- Owner / Reviewer: `Claude` / `Codex`
- Formal dependencies: none (`depends_on=[]`)
- Parent branch tip: `origin/claude/p2-wp0`
- Commit: `7ca2b66c749a320c5d16ba411effdce6aa1d72d4`
- Commit subject: `feat(P2-WP0): Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds`
- Integration snapshot from machine truth:
  - branch closeout already recorded
  - PR `#873` is open to `dev`
  - `mergeStateStatus=BLOCKED`
  - CI is still pending
  - `INTEGRATION_STATUS=pr_open`

This means the parent implementation already cleared reviewer approval, but it is not yet merged to `origin/dev`. This sidecar packet is therefore purely reviewer support material, not a substitute for parent integration closeout.

---

## 3) Dependency Map

### Formal upstream dependencies

`P2-WP0` and this sidecar both currently have **no machine-truth upstream blockers**.

| Dependency | Status | Notes |
| ---------- | ------ | ----- |
| None | `n/a` | `scripts/ai-status.sh show P2-WP0` reports `depends_on=[]`; this packet introduces no new canonical dependency claims. |

### Practical integration dependency

| Item | Status | Why it matters |
| ---- | ------ | -------------- |
| Parent PR `#873` to `dev` | `open` | Parent task is reviewer-approved, but canonical absorption still depends on the existing PR merge and CI completion. |

Bottom line: there is no upstream backlog blocker for `P2-WP0`; the only remaining gate is integration of the already-approved parent branch.

---

## 4) Acceptance Checklist

Source: parent task acceptance field in machine truth.

| Parent acceptance item | Status in this packet | Evidence |
| ---------------------- | --------------------- | -------- |
| Contracts compile and are exported | `STATIC PASS` | `packages/contracts/src/index.ts:5524` exports `./phase2-tesla-fsd-sandbox`; the new contract surface in `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` includes `Phase2SourceMetadata` (`:34-47`), `ProviderCapabilityRequirement` (`:68-74`), `CommandReceipt` (`:117-130`), `SandboxDispatchDecision` (`:161-178`), Tesla regulatory and telemetry DTOs (`:187-277`), `EvidenceManifestItem` (`:352-371`), `AccidentCaseRecord` (`:405-423`), and `Phase2ErrorCode` (`:475-493`). |
| AV sandbox + evidence DDL skeleton exists and matches the described ownership split | `STATIC PASS` | `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql` creates `av_sandbox` and `av_evidence` schemas (`:25-26`), provisions provider capability requirements (`:30-40`), command receipts (`:44-64`), sandbox dispatch decisions (`:71-86`), Tesla regulatory/event telemetry tables (`:93-172`), evidence manifests/items (`:214-254`), accident cases (`:258-281`), and regulatory report filings (`:285-309`). |
| Ten module scaffolds are registered | `STATIC PASS` | `apps/api/src/app.module.ts:52-62` imports the ten new Phase2 modules and `:99-109` registers them in the Nest app. `git show --stat 7ca2b66c7` confirms creation of the ten scaffold directories under `apps/api/src/modules/`. |
| Interface-only adapters compile as defined surfaces | `STATIC PASS` | `tesla-integration.ports.ts:9-20` defines `TeslaRemoteCommandPort`; `tesla-telemetry.ports.ts:13-23` defines `TeslaPublicTelemetryAdapter` and `TeslaVehicleStatePort`; `tesla-regulatory-events.ports.ts:10-18` defines `TeslaRegulatoryEventProvider`; `vehicle-evidence.ports.ts:9-18` defines `EvidenceRecorderAdapter`. |
| `pnpm --filter @drts/contracts build` and `pnpm --filter @drts/api typecheck` pass | `NOT RERUN IN SIDECAR` | Independent rerun was attempted against detached parent commit `7ca2b66c7`, but the temp worktree had no `node_modules`, so both commands failed before compilation with `tsc: not found` / `Local package.json exists, but node_modules missing`. This packet therefore preserves the parent task's `review_approved` state, but does not claim an additional clean-room rerun from this sidecar environment. |

---

## 5) Evidence Summary

### Contracts

- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` is scaffold-only and explicitly documents that it declares DTO / event / error surfaces for downstream Phase2 waves rather than runtime logic.
- The file covers the full acceptance brief surface in one place:
  - provenance metadata
  - provider capability requirements
  - Tesla remote-command receipts
  - sandbox dispatch decisions
  - Tesla regulatory events and public telemetry samples
  - safety-operator / ROC operation records
  - evidence custody records
  - accident investigation records
  - regulatory filing records
  - stable Phase2 error codes

### API module scaffolds

- `apps/api/src/app.module.ts:99-109` registers:
  - `TeslaIntegrationModule`
  - `TeslaTelemetryModule`
  - `TeslaRegulatoryEventsModule`
  - `SandboxGovernanceModule`
  - `SandboxDispatchGateModule`
  - `SafetyOperatorModule`
  - `RocOperationsModule`
  - `VehicleEvidenceModule`
  - `AccidentInvestigationModule`
  - `RegulatoryReportingModule`
- The individual module and service files are scaffold-only. For example:
  - `tesla-integration.service.ts:5-18` states concrete adapter wiring and persistence are left to downstream waves
  - the companion module files export their services without adding runtime behavior yet

### Migration surface

- `V0037` is clearly labeled skeleton-only and keeps the ownership split explicit:
  - `av_sandbox` for autonomy telemetry, command bridge, and dispatch governance
  - `av_evidence` for evidence custody, accident cases, and regulatory filings
- The migration uses Phase1-aligned varchar subject ids and provenance columns, which matches the parent task brief's contract-plus-DDL scaffolding role rather than a full runtime implementation.

---

## 6) Verification Notes

Attempted independent reviewer-side rerun:

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/api typecheck
```

Result in detached verification worktree for commit `7ca2b66c7`:

- `pnpm --filter @drts/contracts build` failed immediately with `tsc: not found`
- `pnpm --filter @drts/api typecheck` failed for the same reason
- pnpm also reported `node_modules missing`

Interpretation:

- This is an **environment-precondition failure in the sidecar verification worktree**, not evidence of a parent code regression.
- The sidecar packet therefore records static repo evidence plus the parent machine-truth integration snapshot, and leaves final executable verification claims with the parent branch/PR context.

---

## 7) Reviewer Focus (`Claude`)

- Confirm this packet stays support-only and does not mutate canonical truth.
- Confirm the dependency map does **not** invent new blockers beyond the existing parent PR/CI gate.
- Confirm the acceptance table is faithful to parent machine truth:
  - four items are statically evidenced from commit `7ca2b66c7`
  - build/typecheck rerun is explicitly marked `NOT RERUN IN SIDECAR`
- Confirm the packet correctly reflects that parent `P2-WP0` is already `review_approved` and only awaits integration completion on PR `#873`.

Useful review commands:

```bash
AI_NAME=Claude scripts/ai-status.sh show P2-WP0
git show --stat --summary 7ca2b66c7
git show 7ca2b66c7:packages/contracts/src/phase2-tesla-fsd-sandbox.ts
git show 7ca2b66c7:infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql
git show 7ca2b66c7:apps/api/src/app.module.ts
```

---

## 8) Handoff Notes

- This artifact is limited to `support/sidecars/P2-WP0/P2-WP0-SIDECAR-ACCEPTANCE.md`.
- No canonical runtime, registry, contract truth, or governance implementation was modified for this sidecar task.
- Parent task `P2-WP0` remains owned by `Claude`; this packet is only the reviewer-facing acceptance/support summary requested by the sidecar brief.
- Recommended sidecar handoff summary:

> P2-WP0 acceptance packet is ready at `support/sidecars/P2-WP0/P2-WP0-SIDECAR-ACCEPTANCE.md`. It records that the parent task has no upstream blockers, is already `review_approved`, and currently waits on PR #873 / CI for integration. The packet statically anchors the contracts, V0037 DDL skeleton, module registrations, and adapter ports from commit `7ca2b66c7`, while explicitly noting that this sidecar environment could not independently rerun `pnpm` build/typecheck because the detached verification worktree had no `node_modules`.
