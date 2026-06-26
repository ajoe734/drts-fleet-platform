# P2-DP-C5-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P2-DP-C5-001` — Phase2 canonical audit event catalog + `Phase2AuditContext` + `ActionReceipt`  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Codex2`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Last Revised:** `2026-06-26T01:37:00Z (UTC)`
**Status:** `review` — support-only packet refreshed for closeout and
re-handed to reviewer `Codex2`; no canonical truth, runtime implementation,
or task-board definition is changed by this artifact.

This packet converts the parent task's single-line acceptance target into a
reviewer-facing checklist, dependency map, and evidence index. It now reflects
the reviewed parent branch state plus the sidecar's closeout-refresh review
pass. It does not approve the parent by itself; this sidecar only packages
acceptance guidance/evidence for the parent branch and its current
integration-gate state.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance target as concrete reviewer checks for
  contracts, helper behavior, append-only amendment semantics, and targeted
  verification
- map the hard dependency on `P2-WP0` and the directly coupled code surfaces
  the reviewer should inspect together
- capture the current review history: initial implementation, review failure on
  the amended path, and the follow-up fixes now present on the owner branch
- identify nearby consumer tasks that rely on this audit and receipt foundation

Out of scope:

- changing Phase 2 canonical truth, parent implementation, or machine-truth
  task definitions from this sidecar
- approving downstream tasks such as ROC UI, Tesla integration, or regulatory
  workflows
- inventing new hard dependency edges that are not already present in machine
  truth

---

## 2. Machine-Truth Anchors

### 2.1 Sidecar snapshot

Machine-truth row: `ai-status.json` → `P2-DP-C5-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`review` (closeout refresh re-handed to reviewer `Codex2`)
- depends_on=`[P2-WP0]`
- helper_parent=`P2-DP-C5-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/P2-DP-C5-001/P2-DP-C5-001-SIDECAR-ACCEPTANCE.md`

### 2.2 Parent snapshot

Machine-truth row: `ai-status.json` → `P2-DP-C5-001`

- owner=`Codex`
- reviewer=`Codex2`
- status=`blocked` (review-approved implementation is waiting for merge-to-dev
  closeout after the integration gate refused branch-only `done`)
- depends_on=`[P2-WP0]`
- artifacts:
  - `packages/contracts/src/`
  - `apps/api/src/common/`
- acceptance:
  - `Audit catalog constants exported & exhaustive vs §7.3; Phase2AuditContext compiles; emit helper writes append-only; ActionReceipt returned by sample command; sensitive fields excluded; unit tests green`
- latest owner/integration note:
  - `Formal closeout commit 6f39a2caa is pushed to origin/codex/p2-dp-c5-001 after green verification (vitest phase2-audit-contracts/phase2-audit-helper/action-receipt/maintenance-action-receipt and contracts tsc). scripts/ai-status.sh done was refused by the integration gate because branch_pushed is branch-only; waiting for merge to dev, then rerun done with INTEGRATION_STATUS=merged_to_dev or dev_deployed.`

### 2.3 Hard upstream dependency

Machine-truth row: `ai-status.json` → `P2-WP0`

- status=`done`
- commit_hash=`a00a3bbd7cee08b0146b3998dc745bfe58386bb9`
- commit_subject=`P2-WP0: Phase2 Tesla/FSD/sandbox contracts + AV dispatch DD foundation`
- push_ref=`origin/dev`
- integration_status=`merged_to_dev`

Reviewer implication:

- `P2-DP-C5-001` is building on top of already-landed Phase 2 DTO scaffolds,
  `CommandReceipt`, `ProviderCapabilityRequirement`, and the registered
  `sandbox-governance` module surface from `P2-WP0`.
- The parent task should extend that foundation, not re-litigate DTO ownership,
  module placement, or envelope naming.

---

## 3. Review History And Branch State

The parent has already gone through one failed review cycle. The packet should
be read against the cumulative owner branch state, not only against the first
reviewed commit.

### 3.1 Review-failed branch snapshot

Reviewer branch signal in machine truth and local refs:

- `codex2/p2-dp-c5-001` carried commit `29a2930e4`
- commit subject=`feat(P2-DP-C5-001): add phase2 audit catalog and helper`
- review failure recorded:
  - amended sandbox-governance upsert emitted
    `sandbox.provider_capability_requirement.amended`
    without `supersedesAuditId` / `amendsResourceVersion`
  - existing coverage only asserted the configured path

### 3.2 Current owner branch snapshot

Cumulative owner branch: `origin/codex/p2-dp-c5-001`

- `ff529ba08` — `wip(P2-DP-C5-001): anchor phase2 audit contracts and helper`
- `7ebda704d` — `P2-DP-C5-001: fix phase2 audited action optional fields`
- `66c6b4655` — `P2-DP-C5-001: fix sandbox governance amendment audits`

Reviewer implication:

- review should target the cumulative branch state on `codex/p2-dp-c5-001`
  rather than the superseded `codex2/p2-dp-c5-001` review-failed snapshot
- the fix is not only test expansion; it also changes the sandbox-governance
  write path so the amended event now carries append-only linkage metadata

### 3.3 Sidecar review record and closeout refresh

- reviewer approval already exists for sidecar commit `56a62e092` on
  `origin/codex/p2-dp-c5-001-sidecar-acceptance`
- that approval confirmed the packet stayed within sidecar scope, added only
  this support artifact, and matched current refs plus task slices for
  `P2-DP-C5-001`, `P2-WP0`, `P2-GOV-001`, `P2-TESLA-001`, `P2-REG-001`,
  `P2-DP-C2-001`, and `P2-UI-ROC-002`
- this refresh does not change the acceptance checklist, dependency map, or
  code/test anchors; it only realigns stale self-status and handoff wording for
  owner closeout

---

## 4. Spec-To-Code Anchor Map

The parent acceptance line expands into four concrete surfaces.

### 4.1 Contract surface

`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`

- publishes `PHASE2_AUDIT_EVENT_CATALOG`
- publishes flattened `PHASE2_AUDIT_EVENT_NAMES`
- publishes `Phase2AuditEventName`
- publishes `Phase2AuditActorType`
- publishes `Phase2AuditContext`
- includes explicit amendment events such as:
  - `sandbox.provider_capability_requirement.amended`
  - `evidence.manifest.amended`
  - `accident.case.amended`
  - `regulatory.report.amended`

Reviewer focus:

- event names follow the required `<domain>.<resource>.<past_tense_action>`
  shape
- status-driven subcatalogs are exhaustive for their lifecycle enums
- amendment events exist where append-only correction semantics are required

### 4.2 Shared audit helper surface

`apps/api/src/common/phase2-audit.ts`

- sanitizes audit summaries before persistence
- rejects raw provider payloads, signed URLs, tokens, and passenger-sensitive
  fields from audit summaries
- validates amendment semantics:
  - non-amendment events must not carry amendment metadata
  - amendment events must carry `supersedesAuditId` or
    `amendsResourceVersion`
- converts an audit write into an `ActionReceipt` through the shared
  `toActionReceipt(...)` path

Reviewer focus:

- the helper is reusable by multiple Phase 2 modules, not hard-wired to one
  domain
- optional `actionId` / `resourceType` / `resourceId` / `status` fields are
  passed into `toActionReceipt(...)` only when present
- the returned receipt remains audit-backed and includes `auditId`

### 4.3 Sample write-command surface

`apps/api/src/modules/sandbox-governance/sandbox-governance.service.ts`

- upgrades provider capability requirement writes from in-memory list mutation
  only to audit-backed command handling
- introduces
  `upsertProviderCapabilityRequirement(...) -> { requirement, receipt, auditLog }`
- emits:
  - `sandbox.provider_capability_requirement.configured` on first write
  - `sandbox.provider_capability_requirement.amended` on later correction
- on amendment, carries:
  - `previousSummary`
  - `supersedesAuditId`
  - `amendsResourceVersion`
  - incremented `resourceVersion`

Reviewer focus:

- the amended path must no longer throw when the second upsert happens
- the service must return a valid `ActionReceipt`, not only an audit log
- append-only correction behavior is represented as a new audit event, not an
  in-place overwrite of prior audit history

### 4.4 Wiring and tests

`apps/api/src/modules/sandbox-governance/sandbox-governance.module.ts`

- imports `AuditNotificationModule` so the governance service can persist audit
  records through the existing audit-notification seam

Test anchors on the owner branch:

- `tests/unit/phase2-audit-contracts.test.ts`
- `tests/unit/phase2-audit-helper.test.ts`
- existing shared receipt tests:
  - `tests/unit/action-receipt.test.ts`
  - `tests/unit/maintenance-action-receipt.test.ts`

Reviewer focus:

- contract tests prove catalog uniqueness and enum exhaustiveness
- helper tests prove redaction, amendment validation, receipt generation, and
  sandbox-governance configured→amended behavior
- receipt tests remain green after the helper changes

---

## 5. Dependency Map

### 5.1 Hard machine-truth dependency

| Dependency | Status | Relevance |
| --- | --- | --- |
| `P2-WP0` | `done` | Supplies the Phase 2 contract file, `CommandReceipt`, `ProviderCapabilityRequirement`, error enums, and the scaffolded `sandbox-governance` module that this parent extends. |

### 5.2 Directly coupled code surfaces

These are not separate tasks, but they form the review boundary for this
parent:

| Surface | Why it is coupled |
| --- | --- |
| `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | Canonical event names and `Phase2AuditContext` live here. |
| `apps/api/src/common/phase2-audit.ts` | Shared helper enforces redaction, amendment rules, and audited `ActionReceipt` generation. |
| `apps/api/src/common/action-receipt.ts` | Final receipt shape and non-empty resource/action requirements come from this shared envelope utility. |
| `apps/api/src/modules/audit-notification/` | Audit persistence sink used by the helper and sandbox-governance sample write path. |
| `apps/api/src/modules/sandbox-governance/` | Sample Phase 2 write command proving configured/amended append-only behavior. |

### 5.3 Semantic downstream consumers visible in machine truth

These are nearby consumers of the audit / receipt foundation. They are not all
hard `depends_on` edges on the task board, so they should be read as semantic
coupling rather than formal blocking edges.

| Task | Relationship | Relevance |
| --- | --- | --- |
| `P2-GOV-001` | direct domain consumer | Governance CRUD and compliance snapshots live in `apps/api/src/modules/sandbox-governance/`, so they rely on the shared audited write pattern and stable provider-capability requirement semantics. |
| `P2-TESLA-001` | receipt/audit consumer | Its acceptance explicitly requires `CommandReceipt` persistence with audit for Tesla command broker writes. |
| `P2-REG-001` | audited lifecycle consumer | Its acceptance explicitly requires submit/ack lifecycle auditing for regulatory notifications. |
| `P2-DP-C2-001` | UI receipt consumer | ROC shell acceptance requires `availableActions` writes to return `ActionReceipt`. |
| `P2-UI-ROC-002` | UI receipt consumer | ROC takeover/alerts/evidence/report screens require writes to surface `ActionReceipt` and trust backend action authority. |

Reviewer implication:

- if the parent changes event-name shape, amendment semantics, redaction rules,
  or receipt generation behavior, the likely blast radius is wider than
  sandbox-governance alone
- the parent should therefore be reviewed as shared foundation, not as an
  isolated module-local helper

---

## 6. Parent Acceptance Checklist

The reviewer should treat each item below as required for parent acceptance.

- [ ] `PHASE2_AUDIT_EVENT_CATALOG` is exported from the Phase 2 contracts file
      and includes all lifecycle subcatalogs required by the parent acceptance
      bar.
- [ ] `PHASE2_AUDIT_EVENT_NAMES` is unique and every event string matches
      `<domain>.<resource>.<past_tense_action>`.
- [ ] `Phase2AuditContext` compiles against catalog-backed event names and
      includes amendment metadata fields needed for append-only corrections.
- [ ] `apps/api/src/common/phase2-audit.ts` strips raw provider payloads,
      signed URLs, tokens, and passenger-sensitive fields from audit summaries.
- [ ] Amendment metadata is rejected on non-`.amended` events and required on
      `.amended` events.
- [ ] `emitPhase2AuditedAction(...)` returns a valid `ActionReceipt` with
      `auditId` for a sample write path.
- [ ] `SandboxGovernanceService` emits
      `sandbox.provider_capability_requirement.configured` on first write and
      `sandbox.provider_capability_requirement.amended` on follow-up correction.
- [ ] The amended sandbox-governance path records `previousSummary`,
      `supersedesAuditId`, `amendsResourceVersion`, and incremented
      `resourceVersion` instead of throwing on second upsert.
- [ ] Contract and helper tests cover both the happy path and the amendment
      path that previously failed review.
- [ ] Any remaining typecheck failure reported in handoff is clearly identified
      as pre-existing repo baseline debt rather than a regression introduced by
      this parent slice.

---

## 7. Suggested Reviewer Spot-Checks

- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
  - verify the catalog includes the sandbox amendment event and exported
    `Phase2AuditContext`
- `apps/api/src/common/phase2-audit.ts`
  - verify redaction list, amendment validation, and audited receipt assembly
- `apps/api/src/modules/sandbox-governance/sandbox-governance.service.ts`
  - verify the second upsert path uses amendment metadata and returns receipt +
    audit log
- `apps/api/src/modules/sandbox-governance/sandbox-governance.module.ts`
  - verify `AuditNotificationModule` wiring exists
- `tests/unit/phase2-audit-contracts.test.ts`
  - verify catalog uniqueness / exhaustiveness / amendment-event coverage
- `tests/unit/phase2-audit-helper.test.ts`
  - verify redaction, receipt, and configured→amended sandbox-governance
    behavior

---

## 8. Verification Evidence To Expect In Parent Handoff

Recorded or referenced verification around this parent slice currently includes:

```bash
pnpm exec vitest run tests/unit/phase2-audit-contracts.test.ts tests/unit/phase2-audit-helper.test.ts tests/unit/action-receipt.test.ts tests/unit/maintenance-action-receipt.test.ts
pnpm exec tsc -p packages/contracts/tsconfig.json --noEmit
```

Historical review evidence also referenced:

```bash
pnpm exec vitest run apps/api/tests/unit/phase2-audit.test.ts
```

Reviewer note:

- the packet does not independently re-run these commands; it identifies the
  expected evidence surface and the review-failure delta that the owner branch
  must now satisfy
- if the owner handoff still cites the earlier `apps/api/tests/unit/phase2-audit.test.ts`
  path, confirm whether the cumulative branch intentionally replaced that
  coverage with `tests/unit/phase2-audit-helper.test.ts` or whether both should
  remain in the final evidence set

---

## 9. Handoff Notes

- This packet is support-only and does not modify canonical truth.
- Parent `P2-DP-C5-001` is now `blocked` only on integration closeout after a
  reviewer-approved branch push; the core review focus remains the previously
  failing amended sandbox-governance path plus audited `ActionReceipt`
  behavior.
- This sidecar is back in `review` only for a closeout metadata refresh after
  owner prep; the acceptance checklist, dependency map, and evidence anchors are
  otherwise unchanged from the already-approved packet.
- The most important regression to guard against is the previously failing
  amended sandbox-governance path. A green catalog test alone is insufficient.
- Treat `ActionReceipt` as shared foundation behavior, not as sandbox-local
  convenience API surface.
- After reviewer re-ack, owner closeout should record
  `INTEGRATION_STATUS=not_applicable` because this is a support-only sidecar
  artifact with no deploy target.
- If the owner handoff mentions repo-wide typecheck failures, require the note
  to distinguish pre-existing baseline debt from any new errors introduced by
  this branch.

---

## 10. Evidence Index

- `ai-status.json` task slices for:
  - `P2-DP-C5-001`
  - `P2-DP-C5-001-SIDECAR-ACCEPTANCE`
  - `P2-WP0`
  - `P2-GOV-001`
  - `P2-TESLA-001`
  - `P2-REG-001`
  - `P2-DP-C2-001`
  - `P2-UI-ROC-002`
- local branch refs:
  - `origin/codex/p2-dp-c5-001`
  - `codex/p2-dp-c5-001`
  - `codex2/p2-dp-c5-001`
  - `origin/codex/p2-dp-c5-001-sidecar-acceptance`
  - `codex/p2-dp-c5-001-sidecar-acceptance`
- cumulative owner-branch commits:
  - `ff529ba08`
  - `7ebda704d`
  - `66c6b4655`
- approved sidecar packet commit:
  - `56a62e092`
- review-failed prior branch commit:
  - `29a2930e4`
- code/test anchors:
  - `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
  - `apps/api/src/common/phase2-audit.ts`
  - `apps/api/src/common/action-receipt.ts`
  - `apps/api/src/modules/sandbox-governance/sandbox-governance.module.ts`
  - `apps/api/src/modules/sandbox-governance/sandbox-governance.service.ts`
  - `tests/unit/phase2-audit-contracts.test.ts`
  - `tests/unit/phase2-audit-helper.test.ts`
  - `tests/unit/action-receipt.test.ts`
  - `tests/unit/maintenance-action-receipt.test.ts`
