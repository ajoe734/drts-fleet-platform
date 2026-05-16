# BE-RULE-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `BE-RULE-001` — Tenant Approval Rules canonical contract  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Claude`  
**Sidecar Owner:** `Gemini2`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-05-13` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; no canonical truth,
runtime implementation, or task-board fields are modified by this packet.

This packet is the reviewer-facing support artifact for `BE-RULE-001`, the
Wave 3 contract-unblocker that publishes the tenant approval-rule canonical
contract and tenant API surface required by `TEN-UI-RD-014` (TN_Rules) and
part of `TEN-UI-RD-010` (TN_NewBooking). It restates the parent acceptance bar
from `ai-status.json`, maps the hard dependency on `BE-CC-001`, anchors the
planning decisions captured in
`docs/05-ui/tenant-console-parity-decisions-20260510.md`,
`docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`, and
`docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`, and gives
the reviewer a concrete checklist for contract, API, approver-resolution, and
verification evidence.

At packet refresh time, the parent is `in_progress` under `Codex2` with
reviewer `Claude`, depends on `BE-CC-001`, and declares these acceptance items
in machine truth:

- add `TenantApprovalRuleRecord`
- add `ListTenantApprovalRulesQuery`
- add `UpsertTenantApprovalRuleCommand`
- add `ReorderTenantApprovalRulesCommand`
- add `EvaluateTenantApprovalRuleCommand`
- expose tenant rule list/detail/evaluate/mutation API surface
- ensure approver descriptors can reference cost-center owner semantics
- pass `pnpm --filter @drts/api typecheck`
- pass `pnpm --filter @drts/api test`

This packet does not approve the parent by itself. Parent closeout still
requires the canonical owner to land implementation changes, record executable
verification, and hand off to the assigned reviewer through machine truth.

---

## 1. Scope Boundary

In scope:

- convert the parent acceptance lines into a reviewer checklist tied to the
  approval-rule contract surface
- pin the dependency chain from `BE-CC-001` to `BE-RULE-001` to downstream
  consumers `TEN-UI-RD-014` and `TEN-UI-RD-010`
- capture the open spec choices from the 2026-05-13 follow-up packet that
  materially affect the approval-rule contract shape
- note the current working-tree signal: approval-rule contract types are
  already appearing in `packages/contracts/src/index.ts`, while the parent API
  and API-client surfaces still need to be verified as part of canonical
  acceptance

Out of scope:

- changing L1/L2 product truth, `ai-status.json`, `current-work.md`, or any
  parent implementation file as part of this sidecar packet
- approving `TEN-UI-RD-014` or `TEN-UI-RD-010`; this packet only supports the
  upstream backend contract review
- deciding unresolved product semantics beyond documenting the current defaults
  already proposed in the follow-up packet

---

## 2. Machine Truth Anchors

### 2.1 Sidecar task snapshot

Machine-truth row: `ai-status.json` → `BE-RULE-001-SIDECAR-ACCEPTANCE`

- owner=`Gemini2`
- reviewer=`Codex2`
- status=`review`
- depends_on=`[BE-CC-001]`
- helper_parent=`BE-RULE-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/BE-RULE-001/BE-RULE-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 2.2 Parent task snapshot

Machine-truth row: `ai-status.json` → `BE-RULE-001`

- title=`Tenant Approval Rules canonical contract`
- owner=`Codex2`
- reviewer=`Claude`
- status=`in_progress`
- depends_on=`[BE-CC-001]`
- planning_ref=`docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
- unblocks=`[TEN-UI-RD-014, TEN-UI-RD-010]`
- mutates_canonical=`true`
- artifacts:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/product-rule/`
  - `packages/api-client/src/index.ts`
  - `docs/05-ui/tenant-console-parity-decisions-20260510.md`

### 2.3 Hard upstream dependency

Machine-truth row: `ai-status.json` → `BE-CC-001`

- status=`done`
- commit_hash=`a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- commit_subject=`feat(BE-CC-001): add tenant cost-center directory contract`
- push_remote=`origin`
- push_branch=`feat/claude2-ui-redesign-foundation`

Reviewer implication:

- `BE-RULE-001` is allowed to rely on the shipped cost-center directory as the
  canonical source for `cost_center.code` and cost-center-owner resolution.
- The rule contract should not re-invent cost-center identity, lifecycle, or
  route placement that `BE-CC-001` already froze.

---

## 3. Planning Anchors

### 3.1 Why this parent exists

`docs/05-ui/tenant-console-parity-decisions-20260510.md` section
`TEN-UI-RD-014 — TN_Rules contract validation` records that the tenant/backend
surface did not publish:

- a tenant approval-rule read model with priority, condition, action,
  approver, and active state
- a tenant-visible quota/usage model for quota-aware rule conditions
- approver resolution semantics such as `cost_center.owner`
- create / update / pause / reorder rule operations

That parity decision explicitly blocks `TEN-UI-RD-014` until a canonical tenant
approval-rule and quota contract lands.

### 3.2 Requested contract surface

`docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
section `Contract 2 — Tenant Approval Rules` asks for:

- `TenantApprovalRuleRecord`
- `ListTenantApprovalRulesQuery`
- `UpsertTenantApprovalRuleCommand`
- `ReorderTenantApprovalRulesCommand`
- `EvaluateTenantApprovalRuleCommand`
- a `TenantRuleApproverDescriptor`
- read surface:
  - `GET /tenant/rules`
  - `GET /tenant/rules/{id}`
  - `POST /tenant/rules/evaluate`
- write surface:
  - create / update / disable / reorder

### 3.3 Follow-up defaults that affect review

`docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md` records the
current proposed defaults the reviewer should expect the parent to either adopt
or explicitly override in handoff evidence:

- `Q1`: define `TenantApprovalEvaluationResult`
- `Q2`: default multi-rule combination semantics to one approval request per
  matched `require_approval` rule
- `Q3`: split `TenantPrincipalRef` from `TenantRuleApproverDescriptor` so
  `cost_center_owner` is not circular
- `Q5`: re-evaluate rule snapshots only when booking fields in the proposed
  trigger whitelist change
- `Q6`: pending approvals time out to manual `tenant_admin` escalation, not
  auto-approve or auto-reject
- item `J`: ship a finite rule-condition whitelist, including quota-derived
  fields supplied by `BE-QUOTA-001`

---

## 4. Dependency Map

### 4.1 Hard dependency

| Dependency  | Status | Relevance                                                                                                                                                                                                                                           |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001` | `done` | Approval rules depend on the shipped cost-center directory for `cost_center.code` and `cost_center_owner` semantics. The approver descriptor layer may reference a cost center by code, but ownership truth itself remains anchored in `BE-CC-001`. |

### 4.2 Sibling / coupled slices

| Task            | Relationship                       | Relevance                                                                                                                                                                 |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-QUOTA-001`  | sibling, no hard `depends_on` edge | Quota-aware rule conditions rely on tenant/cost-center remaining-usage fields. The rule contract should consume quota field names without duplicating quota-domain types. |
| `TEN-UI-RD-014` | direct downstream unblock          | The TN_Rules route requires rule list/read/mutation semantics and quota-aware condition vocabulary before it can reopen.                                                  |
| `TEN-UI-RD-010` | partial downstream unblock         | TN_NewBooking needs approval-rule evaluation and auto-applied approval copy; full unblock also depends on quota read-model availability.                                  |

### 4.3 Code-surface coupling the reviewer should inspect

| Surface                                                  | What to verify                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/index.ts`                        | Contract exports exist for rule actions, approval modes, approver descriptors, conditions, records, commands, and evaluation result. |
| `apps/api/src/modules/product-rule/`                     | Tenant rule list/detail/evaluate/mutation endpoints exist and use the published contract types instead of ad hoc shapes.             |
| `packages/api-client/src/index.ts`                       | Typed helpers exist for the tenant rule routes, matching the published REST paths and payloads.                                      |
| `docs/05-ui/tenant-console-parity-decisions-20260510.md` | A dated implementation update should record the new backend rule contract/API surface and downstream unblock note.                   |

Current working-tree snapshot at packet refresh:

- `packages/contracts/src/index.ts` already contains:
  - `tenantApprovalRuleVocabulary` on `ProductRuleCatalog`
  - `TenantApprovalRuleAction`
  - `TenantApprovalMode`
  - `TenantPrincipalRef`
  - `TenantRuleApproverDescriptor`
  - `TenantApprovalRuleCondition`
  - `TenantApprovalRuleRecord`
  - `ListTenantApprovalRulesQuery`
  - `UpsertTenantApprovalRuleCommand`
  - `ReorderTenantApprovalRulesCommand`
  - `EvaluateTenantApprovalRuleCommand`
  - `TenantApprovalEvaluationResult`
- `apps/api/src/modules/product-rule/product-rule.controller.ts` still exposes
  only `GET /product-rule/catalog` in the current snapshot, so tenant rule
  endpoints still need explicit reviewer verification before the parent can
  pass.
- `packages/api-client/src/index.ts` imports the rule-related contract types in
  the current snapshot, but reviewer evidence must still show actual tenant
  rule helper methods, not just type availability.

---

## 5. Parent Acceptance Checklist

The reviewer should treat every item below as required for parent acceptance.

### A. Contract exports

- [ ] `packages/contracts/src/index.ts` exports
      `TenantApprovalRuleRecord`,
      `ListTenantApprovalRulesQuery`,
      `UpsertTenantApprovalRuleCommand`,
      `ReorderTenantApprovalRulesCommand`, and
      `EvaluateTenantApprovalRuleCommand`.
- [ ] The contract also exports the supporting enums/types needed to interpret
      those commands and records:
      `TenantApprovalRuleAction`,
      `TenantApprovalMode`,
      `TenantRuleApproverDescriptor`,
      `TenantApprovalRuleCondition`,
      `TenantApprovalEvaluationResult`.
- [ ] `ProductRuleCatalog` (or the final approved contract surface) publishes
      the tenant approval-rule vocabulary used by downstream UI/API clients.

### B. Tenant API surface

- [ ] The API exposes tenant rule list/detail/evaluate/mutation routes, not
      just the existing platform `product-rule/catalog` route.
- [ ] Route request/response bodies are typed with the canonical contracts
      above and are tenant-scoped.
- [ ] The mutation surface covers create/update and reorder; if disable/pause
      lands under a separate route or as `activeFlag=false` upsert semantics, that
      behavior is explicitly documented in the closeout handoff.

### C. Approver resolution semantics

- [ ] Approver descriptors can reference direct principals and cost-center
      owner semantics without circular type definitions.
- [ ] If `cost_center_owner` is supported, reviewer evidence shows where the
      owner is resolved from the `BE-CC-001` shape.
- [ ] The parent does not overwrite or contradict the shipped `BE-CC-001`
      ownership model without an explicit follow-up note.

### D. Review evidence for unresolved defaults

- [ ] Parent handoff states whether it accepted the follow-up defaults for Q1,
      Q2, Q3, Q5, and Q6, or cites any deviations.
- [ ] If quota-derived rule fields are included, the handoff identifies the
      exact field names and any coordination point with `BE-QUOTA-001`.
- [ ] The parity-decisions doc records an implementation update describing the
      rule contract surface that actually shipped.

### E. Executable verification

- [ ] `pnpm --filter @drts/api typecheck` passed and is quoted in the parent
      handoff.
- [ ] `pnpm --filter @drts/api test` passed and is quoted in the parent
      handoff.
- [ ] Parent review handoff includes commit/push evidence once the canonical
      slice reaches `review`.

---

## 6. Verification Steps

These are the concrete reviewer actions this packet expects for the parent.

1. Inspect `ai-status.json` for `BE-RULE-001` and confirm the parent still
   declares the same artifact set and acceptance lines this packet is based on.
2. Inspect `packages/contracts/src/index.ts` and verify all five machine-truth
   contract exports exist, along with the supporting enums/types listed in
   checklist section 5.A.
3. Inspect `apps/api/src/modules/product-rule/` and verify tenant rule routes
   now exist beyond `GET /product-rule/catalog`.
4. Inspect `packages/api-client/src/index.ts` and verify tenant rule helper
   methods exist for the published routes.
5. Inspect `docs/05-ui/tenant-console-parity-decisions-20260510.md` and verify
   it contains an implementation-update note for the rule contract slice.
6. Read the parent handoff message and confirm it documents any adopted
   defaults from the 2026-05-13 follow-up packet, especially Q1/Q2/Q3/Q5/Q6
   and any quota-field naming coordination.
7. Re-run the executable checks recorded by the parent:
   - `pnpm --filter @drts/api typecheck`
   - `pnpm --filter @drts/api test`
8. Only after steps 1-7 pass should the reviewer approve the parent. Failure
   on any single item should reopen the task with a precise gap list.

---

## 7. Reviewer Notes and Risk Flags

- The contract layer is ahead of the API layer in the current working-tree
  snapshot. Do not approve the parent on type additions alone.
- `ProductRuleCatalog` historically served pricing-authority vocabulary. If
  tenant approval-rule vocabulary is now added there, check that the parent
  still makes the tenant rule management endpoints explicit rather than
  expecting the UI to infer everything from catalog metadata.
- `BE-RULE-001` and `BE-QUOTA-001` are loosely coupled through quota-derived
  condition fields. Reviewer should reject any parent closeout that invents
  quota field names inconsistent with the quota slice without documenting the
  coordination.
- `TEN-UI-RD-014` remains blocked until both approval-rule and quota contract
  surfaces are actually present. Approval of this sidecar packet is not an
  unblock signal by itself.

---

## 8. Support-Only Verification Log

Read-only checks used to prepare this packet:

1. `sed -n '16978,17045p' ai-status.json`
2. `sed -n '17090,17135p' ai-status.json`
3. `sed -n '172360,172435p' ai-status.json`
4. `sed -n '295,380p' docs/05-ui/tenant-console-parity-decisions-20260510.md`
5. `sed -n '1,220p' docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`
6. `sed -n '540,760p' packages/contracts/src/index.ts`
7. `sed -n '1,260p' apps/api/src/modules/product-rule/product-rule.controller.ts`
8. `rg -n 'tenant/rules|ApprovalRule|approval rule|reorderTenantApprovalRules|evaluateTenantApprovalRule|TenantRuleApproverDescriptor|cost_center.owner' apps/api/src/modules/product-rule packages/api-client/src/index.ts docs/05-ui/tenant-canonical-contract-gaps-followup-20260513.md`

No canonical source files were edited while preparing this packet. Only this
support artifact was rewritten.
