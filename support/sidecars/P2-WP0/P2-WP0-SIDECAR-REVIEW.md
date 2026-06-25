# P2-WP0 — Sidecar Review Packet & Evidence Summary

- Sidecar Task: `P2-WP0-SIDECAR-REVIEW`
- Helper Kind: `review_packet`
- Parent Task: `P2-WP0` — *Phase2 contracts + DDL migrations + module scaffolds + shared envelopes*
- Phase: `phase2-tesla-fsd-sandbox-202606`
- Sidecar Owner: `Claude2`  ·  Sidecar Reviewer: `Claude`
- Parent Owner: `Claude`  ·  Parent Reviewer: `Codex`
- Authored: 2026-06-25
- Scope: **support-only**. This packet creates no canonical truth. It summarizes the
  parent deliverable, reproduces acceptance evidence from git, and hands the
  integration blocker to the reviewer. The parent owner decides absorption into mainline.

> Machine truth is authoritative. This packet is a derived human summary; if it
> diverges from `ai-status.json`, trust `ai-status.json` (`scripts/ai-status.sh show P2-WP0`).

---

## 0. TL;DR for the reviewer

- Parent `P2-WP0` is **`review_approved`** (approved by Codex). The *code* is done and accepted — **no re-review of code is needed**.
- The deliverable is one clean commit `7ca2b66c7` on `origin/claude/p2-wp0` (pushed), **not yet on `dev`**.
- All four acceptance sub-goals are reproducible from that commit (contracts, migration, 10 modules, adapter interfaces) — see §3.
- Integration is **blocked at `pr_open`**, not at code. PR#873 → `dev` is MERGEABLE but `mergeStateStatus=BLOCKED`.
- Single root cause: the **required "Commit trailers" CI check fails** because the commit *subject* uses `feat(P2-WP0):` (lowercase prefix), while the gate requires an uppercase task-id prefix (`P2-WP0:` or `wip(P2-WP0):`). Trailers themselves are all present and correct. See §4.
- The fix needs a **subject amend + force-push** (or an admin merge bypass). Auto-mode guardrails forbid worker force-push, so this is a **supervisor/admin/human action**, not a code change. See §5.

---

## 1. Deliverable anchor

| Field | Value |
| --- | --- |
| Commit | `7ca2b66c749a320c5d16ba411effdce6aa1d72d4` (`7ca2b66c7`) |
| Author | Claude `<noreply@anthropic.com>`, 2026-06-25 15:04:25 UTC |
| Subject | `feat(P2-WP0): Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds` |
| Branch | `origin/claude/p2-wp0` (tip == this commit; pushed) |
| On `dev`? | **No** — `git merge-base --is-ancestor 7ca2b66c7 origin/dev` → not an ancestor |
| `dev` tip at authoring | `622e1e89b` |
| Diffstat | **28 files changed, +1192 insertions, 0 deletions** |
| PR | **#873** → base `dev` (per parent `ai-status.json.next`) |

Trailers on the commit (all present, gate-conformant):

```
LLM-Agent: claude
Task-ID: P2-WP0
Reviewer: Codex
```

---

## 2. Acceptance criteria (from parent task)

> Contracts compile & exported; migrations apply cleanly on PostGIS; 10 modules registered;
> adapter interfaces compile; `pnpm --filter @drts/contracts build` + `pnpm --filter @drts/api typecheck` pass.

Compile/typecheck/build gates were run and **approved by Codex** (parent status `review_approved`).
This packet reproduces the *structural* evidence for each sub-goal from the commit tree.

---

## 3. Evidence summary (reproduced from `7ca2b66c7`)

### 3.1 Contracts added & exported  ✅
- New file `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` (**+493 lines**).
- Wired into the package barrel: `packages/contracts/src/index.ts` adds
  `export * from "./phase2-tesla-fsd-sandbox";`.
- All required DTOs / enums present (verified by `export const|type|interface|enum` scan):
  - `Phase2SourceMetadata`, `Phase2SourceSystem`
  - `ProviderCapabilityRequirement`, `ProviderCapabilityDescriptor`, `Phase2ProviderCapability`
  - `CommandReceipt`, `CommandReceiptStatus`, `TeslaRemoteCommandType`
  - `SandboxDispatchDecision`, `SandboxDispatchOutcome`, `SandboxDispatchReasonCode`
  - `TeslaRegulatoryEvent`, `TeslaRegulatoryEventType`, `TeslaDisengagementCause`, `GeoPoint`
  - `TeslaVehicleStateSnapshot`, `TeslaPublicTelemetrySample`
  - `SafetyOperatorAssignment` (+status enum), `RocIntervention` (+type enum)
  - `EvidenceManifestItem`, `EvidenceManifest`, `EvidenceArtifactType`, `EvidenceCustodyState`
  - `AccidentCaseRecord` (+status/severity enums), `RegulatoryReportFiling` (+type/status enums)
  - `Phase2ErrorCode` enum (`PHASE2_ERROR_CODES`)

### 3.2 DDL migration  ✅
- New file `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql` (**+309 lines**).
- Creates both target schemas: `CREATE SCHEMA IF NOT EXISTS av_sandbox;` and
  `CREATE SCHEMA IF NOT EXISTS av_evidence;`.
- 12 tables across the two schemas, aligned to the contract surface:
  - `av_sandbox`: `provider_capability_requirements`, `command_receipts`,
    `sandbox_dispatch_decisions`, `tesla_regulatory_events`,
    `tesla_vehicle_state_snapshots`, `tesla_public_telemetry_samples`,
    `safety_operator_assignments`, `roc_interventions`
  - `av_evidence`: `evidence_manifests`, `evidence_manifest_items`,
    `accident_cases`, `regulatory_report_filings`
- Numbered `V0037`, continuing the Phase1 sequence; idempotent (`IF NOT EXISTS`).

### 3.3 Ten module scaffolds registered  ✅
- All 10 NestJS modules added under `apps/api/src/modules/**` and **registered in
  `apps/api/src/app.module.ts`** (10 imports + 10 entries in the module list — verified by diff):
  `TeslaIntegrationModule`, `TeslaTelemetryModule`, `TeslaRegulatoryEventsModule`,
  `SandboxGovernanceModule`, `SandboxDispatchGateModule`, `SafetyOperatorModule`,
  `RocOperationsModule`, `VehicleEvidenceModule`, `AccidentInvestigationModule`,
  `RegulatoryReportingModule`.

### 3.4 Interface-only adapter ports  ✅
- Adapter ports defined as **interfaces only** (no concrete clients), in `*.ports.ts`:
  - `tesla-integration.ports.ts` → `TeslaRemoteCommandPort` (+ `IssueTeslaCommandInput`)
  - `tesla-telemetry.ports.ts` → `TeslaPublicTelemetryAdapter`
  - `tesla-regulatory-events.ports.ts` → `TeslaRegulatoryEventProvider`
  - `vehicle-evidence.ports.ts` → `EvidenceRecorderAdapter`
- Ports import their DTOs from `@drts/contracts` (e.g. `CommandReceipt`, `TeslaRemoteCommandType`),
  confirming the contract surface is the single source of types. Header comments mark them
  as Phase2 scaffolds whose concrete adapters are wired by a downstream execution wave.

---

## 4. Integration blocker — root cause

State (from parent `ai-status.json.next`, 2026-06-25 15:25Z): **`pr_open` BLOCKED-on-required-check.**

- PR#873 → `dev`: `MERGEABLE`, but `mergeStateStatus = BLOCKED`.
- CI: 13/14 checks green. The **one** failing check is the required **"Commit trailers"**
  gate (`scripts/git/check_commit_trailers.py`, branch-strategy §6), failing on the sole
  commit `7ca2b66c7`.

**Why it fails — confirmed against the gate source:**

```python
# scripts/git/check_commit_trailers.py:30
SUBJECT_RE = re.compile(r"^(?:wip\()?[A-Z][A-Z0-9-]*[A-Z0-9]\)?: \S")
```

The subject must start with an **uppercase** task-id prefix (`P2-WP0: …`) or the
`wip(P2-WP0): …` form. The actual subject is:

```
feat(P2-WP0): Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds
```

It begins with lowercase `feat(`, so the first char fails `[A-Z]` and the regex does not
match → the trailers check fails on the *subject only*. The trailers
(`LLM-Agent` / `Task-ID` / `Reviewer`) are all present and correct.

This is a **commit-message formatting defect, not a code defect.** Codex's code approval stands.

---

## 5. Remediation options (no code change required)

The clean fix requires rewriting the commit subject, which means a non-fast-forward
(force) push of the feature branch. **Auto-mode guardrails forbid worker force-push**, so the
worker cannot self-remediate. This is a supervisor / admin / human action.

1. **Amend subject + force-push** (preferred, makes the check go green):
   ```
   # on claude/p2-wp0, retaining body + trailers verbatim:
   git commit --amend -m "P2-WP0: Phase2 Tesla/FSD/sandbox contracts + AV DDL + 10 module scaffolds" -m "<existing body>" -m "LLM-Agent: claude" -m "Task-ID: P2-WP0" -m "Reviewer: Codex"
   git push --force-with-lease origin claude/p2-wp0
   ```
   Then re-run checks; "Commit trailers" goes green; merge PR#873.
2. **Admin merge bypass:** branch protection has *Enforce admins: no*, so an admin can
   merge PR#873 despite the failing check; `apply_git_merge_reconciliation` then auto-flips
   `P2-WP0` to `done`.

After either path lands on `dev`, the parent owner records `INTEGRATION_STATUS=merged_to_dev`
(then onward to `dev_deployed` when applicable). **Do not mark `done` while the required check
is red and the PR is unmerged.**

---

## 6. Reviewer handoff (for `Claude`)

What to verify on this **sidecar packet** (not the parent code, already Codex-approved):

1. Packet is **support-only** — touches one file under `support/sidecars/P2-WP0/`, no canonical
   truth, no L1/contract/runtime/governance mutation.
2. Evidence in §3 reproduces from `7ca2b66c7` (commit is on `origin/claude/p2-wp0`, not on `dev`).
3. Root-cause analysis in §4 matches the gate source `scripts/git/check_commit_trailers.py:30`.
4. The blocker is correctly characterized as **integration / commit-subject**, not a code
   regression, and remediation in §5 is an admin/supervisor action.

Known limitation: `gh` CLI is unauthenticated in this worker, so PR#873 / live CI state could
**not** be re-queried directly; §4 relies on parent `ai-status.json.next` machine truth (2026-06-25 15:25Z).

---

## 7. Provenance / commands

- Parent status: `scripts/ai-status.sh show P2-WP0`
- Deliverable: `git show --stat 7ca2b66c7`
- On dev? `git merge-base --is-ancestor 7ca2b66c7 origin/dev`
- Contract symbols: `git show 7ca2b66c7:packages/contracts/src/phase2-tesla-fsd-sandbox.ts | grep -E '^export (const|type|interface|enum)'`
- Migration schemas: `git show 7ca2b66c7:infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql | grep -iE 'create schema|create table'`
- Module registration: `git show 7ca2b66c7 -- apps/api/src/app.module.ts`
- Gate source: `scripts/git/check_commit_trailers.py:30` (`SUBJECT_RE`)
