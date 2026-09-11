# SR-FLEET-SETTLE-001 Unblock Planning Decision

## Scope

- Task: `SR-FLEET-SETTLE-001-UNBLOCK-PLANNING-DECISION`
- Parent: `SR-FLEET-SETTLE-001`
- Owner: `Gemini2`
- Reviewer: `Claude`
- Decision date: `2026-09-11`

## Diagnosis

`SR-FLEET-SETTLE-001` ("車行 statement 真資料與確認／爭議") was marked `blocked` by owner `Claude2` (`waiting_for: Claude`), citing inability to complete backend persistent statement confirmation/dispute and cancellation reversal traceability within the assigned `write_scopes` and current contracts.

A comprehensive review of the codebase, commit history, and canonical planning artifacts reveals four key facts:

1. **Finding R13 is completely fixed by Claude2's candidate commit**:
   - Source finding `R13` (`docs/04-uat/system-remediation-20260906/source/findings.json`) identified a UI self-contradiction:
     "分潤頁同時說本期對帳單已產生及沒有可操作對帳單；對帳清單空白" with recommended fix "由同一單據狀態驅動提示，無單據時提供原因及下一步".
   - On branch `claude2/sr-fleet-settle-001` at commit `13a7fc1fab189bad3b2e08c297e92daa5992e2e0` (base `69e31e793489202c612c5f46dbc801099b5cf5c0`), Claude2 delivered:
     - Pure tri-state banner resolver (`apps/fleet-partner-portal-web/app/revenue/statement-banner.ts`: `resolveStatementBannerState(currentStatement)`) mapping strictly to `no_statement`, `pending`, or `paid`, preventing contradictory banners.
     - Real statement detail view (`apps/fleet-partner-portal-web/app/statements/[id]/page.tsx`) rendering DL summary and line item tables directly from `loadStatementDetail`.
     - Real CSV export (`apps/fleet-partner-portal-web/app/statements/export/route.ts`) supporting query parameters (`?statementId=`) for line item details or full list summary.
     - Cross-fleet partner security isolation: `loadStatementDetail` in `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` validates that the requested statement belongs to the authenticated fleet partner; foreign IDs return `null` and render a 404 page, preventing cross-tenant leakage.
     - Honest empty list state in `apps/fleet-partner-portal-web/app/statements/page.tsx`.
     - 8 unit tests in `tests/unit/system-remediation/sr-fleet-settle-001/sr-fleet-settle-001.test.ts` (100% passing).

2. **Assigned Backend `write_scopes` Suffers from a Canonical Assignment Mismatch**:
   - `docs/03-runbooks/system-remediation-20260906/SR-FLEET-SETTLE-001.md` and `ai-status.json` listed `apps/api/src/modules/billing-settlement/billing-settlement.service.ts` as the sole backend write scope.
   - In reality, `billing-settlement.service.ts` is responsible for tenant billing, tenant invoices, reimbursements, and driver statements (`DriverStatementRecord`). It contains **zero** references to `FleetPartnerStatementRecord`.
   - Fleet partner statements are completely owned by `apps/api/src/modules/fleet-partner/`:
     - `fleet-partner.service.ts` (`listFleetPartnerStatements`, `buildFleetPartnerStatements`)
     - `fleet-partner.repository.ts` (`billing.phase1_fleet_partner_statements`)
     - `fleet-partner.controller.ts` (`GET admin/fleet-partners/:id/statements`, `GET fleet-partner/statements`)
   - None of the `apps/api/src/modules/fleet-partner/` files were included in `SR-FLEET-SETTLE-001.write_scopes`.

3. **Legacy Frontend Mock & Missing Canonical Contract Surface**:
   - The preexisting confirmation/dispute UI (`apps/fleet-partner-portal-web/components/fleet-statement-actions.tsx` and `apps/fleet-partner-portal-web/lib/fleet-portal-statement-actions.ts`, introduced in PR #1350 / `S1F-FLT-003`) was a client-side mock storing decisions in `window.localStorage` and generating client-side text blobs.
   - Neither of those files was in `SR-FLEET-SETTLE-001.write_scopes`.
   - In `packages/contracts/src/index.ts`, `FleetPartnerStatementRecord` has only `payoutStatus: DriverPayoutStatus` (`"pending" | "paid"`). It lacks fields for confirmation status, dispute status, timestamps, notes, and reversal traceability.
   - No migration was allocated for fleet statement decisions in `docs/04-uat/system-remediation-20260906/schema-allocation.json`.

4. **Owner Claude2 Quota Rejection**:
   - Claude2 hit a quota terminal failure streak with an active dispatch pause.
   - Expecting Claude2 to implement a massive cross-tier refactor (contracts, migrations, repository, controller, UI rewiring) while paused is impossible and unnecessary when R13 is already solved.

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `phase1_prd_detailed_v1.md` §9.8 (Financial & Billing Requirements)
2. `phase1_system_analysis_v1.md`
3. `phase1_service_contracts_v1.md`
4. `docs/04-uat/system-remediation-20260906/source/findings.json` (Finding `R13`)
5. `docs/04-uat/system-remediation-20260906/source/capabilities.json` (Capability `C068`)
6. `docs/03-runbooks/system-remediation-20260906/SR-FLEET-SETTLE-001.md`
7. `docs/04-uat/system-remediation-20260906/schema-allocation.json`
8. `packages/contracts/src/index.ts` (`FleetPartnerStatementRecord`, `FleetPartnerStatementLineRecord`)
9. `apps/api/src/modules/fleet-partner/fleet-partner.service.ts`, `fleet-partner.repository.ts`, `fleet-partner.controller.ts`
10. `origin/claude2/sr-fleet-settle-001` at commit `13a7fc1fab189bad3b2e08c297e92daa5992e2e0`

## Decision

`SR-FLEET-SETTLE-001` is **unblocked** via a canonical scope cut and routing decision:

1. **Accept In-Scope Delivery for `SR-FLEET-SETTLE-001`**:
   `SR-FLEET-SETTLE-001` is scoped as the **Portal Statement Remediation & Authoritative Read-Side Implementation**.
   - Primary charter Finding R13 ("對帳狀態自相矛盾") is 100% resolved by commit `13a7fc1fab189bad3b2e08c297e92daa5992e2e0`.
   - Statement period, list, detail (`/statements/[id]`), and export (`/statements/export`) are unified under authoritative DB data via `loadStatementDetail` in `lib/fleet-portal-data.server.ts` (no fixtures).
   - Cross-fleet isolation is strictly enforced (returns `null` / 404).
   - Empty lists display an honest explanatory state rather than a blank table.
   - The UI explicitly discloses that backend persistent confirm/dispute is pending integration (via `CanvasBanner` on `app/statements/[id]/page.tsx`), upholding the core rule of not using mock delivery to fake completion.

2. **Scope Cut for `SR-FLEET-SETTLE-001`**:
   The following requirements are officially cut from `SR-FLEET-SETTLE-001`:
   - Backend database persistence for statement confirmation and dispute mutations.
   - Cancellation reversal traceability columns in `billing.phase1_fleet_partner_statements`.
   - Modifying `apps/api/src/modules/fleet-partner/*` or central contracts `packages/contracts/src/index.ts`.

3. **Follow-Up Routing: `SR-FLEET-SETTLE-002`**:
   The backend persistent confirmation, dispute, and cancellation reversal capabilities are routed to an explicit follow-up task `SR-FLEET-SETTLE-002` (or a dedicated backend contract task).
   The canonical specifications for `SR-FLEET-SETTLE-002` are established as follows:
   - **Data Model Extensions (`FleetPartnerStatementRecord`)**:
     ```typescript
     export type FleetPartnerStatementDecisionStatus = "unreviewed" | "confirmed" | "disputed";

     export interface FleetPartnerStatementRecord {
       // ... existing fields ...
       decisionStatus?: FleetPartnerStatementDecisionStatus;
       confirmedAt?: string | null;
       confirmedBy?: string | null;
       confirmNote?: string | null;
       disputedAt?: string | null;
       disputedBy?: string | null;
       disputeReason?: string | null;
       disputeCaseId?: string | null; // links to crm.phase1_complaint_cases (category: settlement_dispute)
     }
     ```
   - **Line-Level Reversal Traceability (`FleetPartnerStatementLineRecord`)**:
     ```typescript
     export interface FleetPartnerStatementLineRecord {
       // ... existing fields ...
       isReversal?: boolean;
       reversalSourceOrderId?: string | null;
       reversalReason?: string | null;
     }
     ```
   - **Endpoints on `FleetPartnerController`**:
     - `POST /fleet-partner/statements/:statementId/confirm` — accepts `{ note?: string }`, sets `decisionStatus = 'confirmed'`.
     - `POST /fleet-partner/statements/:statementId/dispute` — accepts `{ reason: string }`, creates linked `ComplaintCase` (`settlement_dispute`) and sets `decisionStatus = 'disputed'`.
   - **Migration Allocation**:
     - To be allocated as `V0101__sr_fleet_partner_statement_decisions.sql` in `schema-allocation.json`.

## Scope Cut And Routing Summary

| Item | Status | Handling |
|---|---|---|
| R13 Revenue Banner Self-Contradiction | **In Scope** | Delivered by commit `13a7fc1fa` (`statement-banner.ts`). |
| Statement List / Detail / Export Consistency | **In Scope** | Delivered by commit `13a7fc1fa` (`loadStatementDetail`, `[id]/page.tsx`, `export/route.ts`). |
| Cross-Fleet Partner Security Isolation | **In Scope** | Delivered by commit `13a7fc1fa` (rejection of foreign IDs). |
| Honest Empty State UI | **In Scope** | Delivered by commit `13a7fc1fa` (`app/statements/page.tsx`). |
| Regression Unit Tests | **In Scope** | Delivered by commit `13a7fc1fa` (8 tests passing in `tests/unit/system-remediation/sr-fleet-settle-001/`). |
| Backend Confirm/Dispute API & Persistence | **Scope Cut** | Routed to follow-up task `SR-FLEET-SETTLE-002`. |
| Cancellation Reversal Line Traceability | **Scope Cut** | Routed to follow-up task `SR-FLEET-SETTLE-002`. |
| Contract Extension & Schema Migration | **Scope Cut** | Routed to follow-up task `SR-FLEET-SETTLE-002`. |

## Parent Unblocked Next Step

1. **Acknowledge the Planning Decision & Scope Cut**:
   The parent task `SR-FLEET-SETTLE-001` is no longer blocked on missing product/contract semantics. Its scope is confirmed to be the Portal Statement Remediation & Authoritative Read-Side delivery.
2. **Accept Existing Delivery Candidate**:
   Commit `13a7fc1fab189bad3b2e08c297e92daa5992e2e0` on `origin/claude2/sr-fleet-settle-001` satisfies all in-scope acceptance criteria.
3. **Task Board Transition**:
   - Because Claude2 is currently paused under quota limits, the Chair/Supervisor can either:
     a) Reassign owner of `SR-FLEET-SETTLE-001` to `Gemini2` to perform the handoff of candidate SHA `13a7fc1fab189bad3b2e08c297e92daa5992e2e0`, OR
     b) Directly handoff `SR-FLEET-SETTLE-001` using `CANDIDATE_SHA=13a7fc1fab189bad3b2e08c297e92daa5992e2e0 CANDIDATE_BRANCH=claude2/sr-fleet-settle-001` into `review`.
4. **Follow-Up Backlog Registration**:
   Register `SR-FLEET-SETTLE-002` in machine truth for backend persistent confirm/dispute endpoints, migration, and reversal tracking per the contract specified in §Decision above.

## Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved: Diagnosed root cause, updated canonical runbook `docs/03-runbooks/system-remediation-20260906/SR-FLEET-SETTLE-001.md`, and defined the canonical data model & endpoints for follow-up in this artifact. |
| Record the decision | Recorded in §Decision: R13 resolution is complete; confirm/dispute persistence is decoupled from UI remediation and routed to follow-up. |
| scope cut | Recorded in §Scope Cut And Routing Summary: backend persistent mutation and reversal tracking are cut from `SR-FLEET-SETTLE-001` and deferred to `SR-FLEET-SETTLE-002`. |
| or explicit follow-up needed by the parent task | Recorded in §Decision and §Parent Unblocked Next Step: `SR-FLEET-SETTLE-002` specified with DTOs, endpoints, and migration allocation. |
| Produce task-scoped commit/push/PR evidence for any canonical change | Committed and pushed on `gemini2/sr-fleet-settle-001-unblock-planning-decision`. |
| Update the parent task with the concrete unblocked next step | Updated `SR-FLEET-SETTLE-001` in machine truth using `ai-status.sh note`. |

## Verification Basis

- `phase1_prd_detailed_v1.md` §9.8
- `docs/04-uat/system-remediation-20260906/source/findings.json` (Finding `R13`)
- `docs/04-uat/system-remediation-20260906/source/capabilities.json` (Capability `C068`)
- `docs/03-runbooks/system-remediation-20260906/SR-FLEET-SETTLE-001.md`
- `docs/04-uat/system-remediation-20260906/schema-allocation.json`
- Commit `13a7fc1fab189bad3b2e08c297e92daa5992e2e0` on `origin/claude2/sr-fleet-settle-001`
- `tests/unit/system-remediation/sr-fleet-settle-001/sr-fleet-settle-001.test.ts` (8/8 pass)
