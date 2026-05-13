# Sidecar Acceptance Packet: TCH-SDK-BUMP-001

- **Parent Task:** `TCH-SDK-BUMP-001` (`[CROSS-REPO PLACEHOLDER] tenant-commute-hub SDK bump + governance UI integration`)
- **Sidecar Task:** `TCH-SDK-BUMP-001-SIDECAR-ACCEPTANCE`
- **Status:** `in_progress` (packet refresh for re-handoff)
- **Owner:** `Codex`
- **Reviewer:** `Codex2`
- **Scope Guardrail:** support artifact only; no canonical truth or runtime implementation changes
- **Primary Machine Truth:** `ai-status.json`
- **Reference Planning Doc:** `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md` (§E.16, §E.18)

## 1. Purpose

This packet refreshes the acceptance checklist and dependency map for the cross-repo placeholder `TCH-SDK-BUMP-001` using current machine truth. The real implementation still belongs in the `tenant-commute-hub` repository. This file exists only to help the assigned reviewer confirm:

1. the placeholder row still points at the correct backend/doc gates,
2. the expected `@drts/api-client` surface is split correctly between already-landed governance APIs and the still-blocked approval workflow,
3. the UI acceptance scope for `TN_CostCenter`, `TN_Rules`, and `TN_NewBooking` is preserved without mutating canonical sources.

## 2. Machine-Truth Snapshot

Snapshot below is aligned to the current `ai-status.json` state captured during this sidecar refresh.

| Task ID            | Status    | Owner        | Reviewer     | Notes                                                        |
| ------------------ | --------- | ------------ | ------------ | ------------------------------------------------------------ |
| `BE-CC-001`        | `done`    | `Codex`      | `Codex2`     | Cost-center directory contract/API is closed and pushed.     |
| `BE-RULE-001`      | `done`    | `Claude`     | `Codex2`     | Approval-rule evaluator/backend chain is closed and pushed.  |
| `BE-QUOTA-001`     | `review`  | `Claude`     | `Gemini`     | Quota ledger/read-model is implemented but not yet `done`.   |
| `BE-APR-001`       | `todo`    | `Codex2`     | `Codex`      | Approval-request lifecycle is not landed yet.                |
| `DOC-API-GOV-001`  | `todo`    | `Codex`      | `Codex2`     | OpenAPI/audit taxonomy follow-up has not started.            |
| `TCH-SDK-BUMP-001` | `blocked` | `cross-repo` | `cross-repo` | Placeholder only; actual work stays in `tenant-commute-hub`. |

## 3. Dependency Map

### 3.1 Direct gating recorded on the parent placeholder

`TCH-SDK-BUMP-001` currently has these direct `depends_on` edges in `ai-status.json`:

| Direct dependency | Current status | Why it blocks the cross-repo task                                                                                                                         |
| ----------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-APR-001`      | `todo`         | The parent summary and acceptance both require approval-request methods and approval-state UI wiring that do not exist until the approval workflow lands. |
| `DOC-API-GOV-001` | `todo`         | The cross-repo consumer still needs stable OpenAPI/audit documentation before treating the governance surface as fully released.                          |

### 3.2 Recursive gating behind the direct dependencies

| Upstream dependency | Current status | Relationship                                                                            |
| ------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `BE-RULE-001`       | `done`         | Required by `BE-APR-001`; already cleared.                                              |
| `BE-QUOTA-001`      | `review`       | Required by `BE-APR-001`; still not closed, so APR cannot start from a fully done base. |
| `BE-CC-001`         | `done`         | Required transitively through rules/quota and already cleared.                          |

### 3.3 UI gate split from design/execution docs

The design and execution packets split frontend unlocks more precisely than the placeholder row alone:

| UI surface      | Earliest backend gate from source docs                                     | Current read                                                                        |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `TN_CostCenter` | `BE-CC-001` done                                                           | Base cost-center CRUD wiring is backend-unblocked now.                              |
| `TN_Rules`      | `BE-CC-001` + `BE-RULE-001`; quota-aware rule UI also needs `BE-QUOTA-001` | Basic rules UI is close, but quota-aware flows are still waiting on quota closeout. |
| `TN_NewBooking` | `BE-CC-001` + `BE-RULE-001` + `BE-QUOTA-001` + `BE-APR-001`                | Still blocked until quota is closed and APR is implemented.                         |

This means the cross-repo parent row should remain `blocked` even though part of the governance client surface is already available.

## 4. API Client Surface Expected By The Cross-Repo Consumer

### 4.1 Already present in this repo's shared client

Current `packages/api-client/src/index.ts` already exposes tenant-governance methods for:

- cost centers: list/detail/coverage/create-disable-update surface under `/api/tenant/cost-centers`
- quotas: tenant summary, cost-center summary, policy upsert, preview, ledger under `/api/tenant/quotas`
- approval rules: list/detail/create-update-disable/reorder/evaluate under `/api/tenant/approval-rules`

### 4.2 Still blocked behind `BE-APR-001`

The parent placeholder and `BE-APR-001` acceptance both expect a second client tranche that is not landed yet:

- `/api/tenant/approval-requests` list
- `/api/tenant/approval-requests/:id` detail
- `/api/tenant/approval-requests/:id/approve`
- `/api/tenant/approval-requests/:id/reject`
- `/api/tenant/approval-requests/:id/escalate`
- booking flow integration that surfaces `approvalState` / `approvalRequestIds`

Reviewer note: the acceptance packet should treat the client bump as a staged release. Cost-center/rule/quota methods already exist; approval-request methods are still gated on `BE-APR-001` and therefore remain the critical blocker for `TCH-SDK-BUMP-001`.

## 5. Acceptance Checklist For The Cross-Repo Team

### 5.1 Tracking and release prerequisites

- [ ] `tenant-commute-hub` creates or updates a task with the same ID `TCH-SDK-BUMP-001` in its own machine truth.
- [ ] `@drts/api-client` is bumped only to a released version that includes the governance methods required by the target screen set.
- [ ] The cross-repo team treats this repo as the contract source and does not invent local schema, rule, quota, or approval semantics.

### 5.2 Screen wiring expectations

- [ ] `TN_CostCenter` wires cost-center list/detail/create-update/disable flows to the shared client.
- [ ] `TN_Rules` wires rule list/detail/create-update/disable/reorder/dry-run flows to the shared client.
- [ ] `TN_NewBooking` wires cost-center selection/validation, quota preview, rule-evaluation outcome, and approval-state UX to the shared client as each backend gate closes.

### 5.3 Error handling expectations

- [ ] Handle `BOOKING_COST_CENTER_UNKNOWN`.
- [ ] Handle `BOOKING_COST_CENTER_INVALID`.
- [ ] Handle `BOOKING_COST_CENTER_DISABLED`.
- [ ] Handle `QUOTA_INSUFFICIENT_AT_COMMIT` by re-running preview and presenting the retry message from the design response.
- [ ] Handle `APPROVAL_NOT_AUTHORIZED`.
- [ ] Handle `APPROVAL_NO_RESOLVABLE_APPROVERS`.

Normalization note: the parent placeholder acceptance says "All 5 error codes", but the concrete UI-visible set is six distinct codes because `BOOKING_COST_CENTER_*` expands to three separate values. This packet preserves the exact machine-truth wording while listing the concrete keys reviewer-side to avoid ambiguity.

### 5.4 Cross-repo verification expectations

- [ ] Mock/API fixture coverage reflects the governance contract and error envelopes above.
- [ ] Integration validation runs against a build where `BE-APR-001` and `DOC-API-GOV-001` are both closed.
- [ ] Approval-required booking flows confirm the UI surfaces `approvalState` correctly after APR lands.
- [ ] Commit-time quota race failures confirm the UI handles `QUOTA_INSUFFICIENT_AT_COMMIT` rather than trusting preview as binding truth.

## 6. Reviewer Handoff Notes

What changed in this refresh:

1. sidecar ownership/reviewer metadata now matches `Codex` / `Codex2`,
2. lifecycle snapshot now reflects `BE-RULE-001=done`, `BE-QUOTA-001=review`, `BE-APR-001=todo`, `DOC-API-GOV-001=todo`, and parent `TCH-SDK-BUMP-001=blocked`,
3. the dependency map now distinguishes direct placeholder gates from recursive backend prerequisites,
4. the acceptance checklist now separates already-landed client methods from approval-request methods that remain blocked on `BE-APR-001`,
5. the error-handling section now expands `BOOKING_COST_CENTER_*` into its concrete keys and records the count mismatch as a reviewer note instead of changing canonical truth.

Review asks for `Codex2`:

- confirm the packet is aligned with current `ai-status.json`,
- confirm the staged client-surface split is faithful to `packages/api-client/src/index.ts` and `BE-APR-001` acceptance,
- confirm the support-only scope was preserved and no canonical file was edited.

## 7. Evidence Anchors

- `ai-status.json`
  - `TCH-SDK-BUMP-001`
  - `BE-APR-001`
  - `DOC-API-GOV-001`
  - `BE-QUOTA-001`
  - `BE-RULE-001`
  - `BE-CC-001`
- `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md`
  - §E.16 API documentation update
  - §E.18 `tenant-commute-hub` SDK bump + UI integration
- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  - §7 UI unblock map
  - quota race failure / `QUOTA_INSUFFICIENT_AT_COMMIT`
  - APR `APPROVAL_NOT_AUTHORIZED` and `APPROVAL_NO_RESOLVABLE_APPROVERS` semantics
- `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
  - UI unblock conditions
  - UI gate expectations
  - quota race failure UX wording
- `packages/api-client/src/index.ts`
  - current cost-center / quota / approval-rule methods
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - currently exposed governance routes

## 8. Sidecar Verification

This sidecar refresh changed only `support/sidecars/TCH-SDK-BUMP-001/TCH-SDK-BUMP-001-SIDECAR-ACCEPTANCE.md`.

No executable checks were run in this sidecar pass because the task scope is documentation/support-only and the packet is a machine-truth refresh rather than a runtime change.
