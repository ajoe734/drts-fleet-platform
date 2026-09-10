# SR-QA-TENANT-001 — 租戶日常工作、配額與整合設定驗收

- Owner: `Claude`
- Reviewer: `Codex2`
- Task spec: `docs/03-runbooks/system-remediation-20260906/SR-QA-TENANT-001.md`
- Planning ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`

## Base / candidate SHA

- Base (`origin/dev` at claim time): `031cfc4c99320b79f6ad863996a43a5da8227edf`
- Candidate (this task's worktree branch `claude/sr-qa-tenant-001`): same as base plus this task's two new test files only — no `apps/api/src` or other business-code paths were modified. `CANDIDATE_SHA` is the commit created on top of `031cfc4c9` that adds only the files under **Artifacts** below.
- The 2026-09-06 audit (`docs/04-uat/system-remediation-20260906/source/findings.json` / `capabilities.json`) is a historical observation, not current program state. This task re-verified against the current `origin/dev` tip rather than re-deriving or trusting the audit SHA.

## Scope covered

The execution prompt lists 10 areas: users、addresses、passengers、cost centres、rules、SLA、invites、approvals、feature flags、tenant lifecycle. All ten are exercised below, each against the **existing, already-implemented** service/controller code in `apps/api/src` (no business logic was changed — this is a verification-only task; `write_scopes` is test/doc files only).

| Area | Capability ID(s) | Service under test | File |
| --- | --- | --- | --- |
| Users | C006, C008 | `TenantPartnerService.createTenantUser` / `.listTenantUsers` / `.updateTenantUserRole` | `tenant-directory-and-settings.test.ts` |
| Invites | C006 | `TenantPartnerService.{resend,revoke,accept}TenantInvitation` (+ `IdentityRepository`, `TenantInvitationDeliveryService`) | `tenant-directory-and-settings.test.ts` |
| Addresses | C027 | `TenantPartnerService.upsertAddress` / `.getAddressMasterRecord` / `.listAddresses` | `tenant-directory-and-settings.test.ts` |
| Passengers | C027 | `TenantPartnerService.upsertPassenger` / `.getPassengerMasterRecord` / `.listPassengers` | `tenant-directory-and-settings.test.ts` |
| Cost centres | C027 | `TenantPartnerService.upsertCostCenter` / `.disableCostCenter` / `.getCostCenter` / `.listCostCenters` | `tenant-directory-and-settings.test.ts` |
| Rules (approval rules) | C028 | `TenantPartnerService.upsertApprovalRule` / `.reorderApprovalRules` / `.disableApprovalRule` / `.getApprovalRule` | `tenant-directory-and-settings.test.ts` |
| SLA | C028 | `TenantPartnerService.updateSlaProfile` / `.getSlaProfile` / `.getSlaProfileView` / `.recalculateSlaBookings` | `tenant-directory-and-settings.test.ts` |
| Feature flags | C109 | `FeatureFlagsService.upsertTenantOverride` / `.isEnabled` / `.getByKey` | `tenant-directory-and-settings.test.ts` |
| Tenant lifecycle | C102 | `TenantsService.create` / `.updateSettings` / `.setStatus` / `.get` / `.list` | `tenant-directory-and-settings.test.ts` |
| Approvals (decision workflow) | C025 | `TenantPartnerService.{approve,reject,escalate}ApprovalRequest` via `OwnedMobilityService.approveTenantBookingApprovalRequest` | `tenant-approval-and-quota-lifecycle.test.ts` |
| Quota (額度, part of C027/C028) | C027, C028 | `TenantPartnerService.upsertTenantQuotaPolicy` / `.getCostCenterQuotaSummary` / `.listTenantQuotaLedger` via `OwnedMobilityService.createTenantBooking` | `tenant-approval-and-quota-lifecycle.test.ts` |

Already-implemented functionality was verified, not rewritten: every test in this task calls the real, unmodified service methods (`TenantPartnerService`, `TenantsService`, `FeatureFlagsService`, `OwnedMobilityService`) — no fixtures, no fixed percentages, no fake signatures, no fake delivery stand-ins for the assertions themselves. The one exception is the same in-memory `TenantInvitationDeliveryService` stub already used by the pre-existing `tests/unit/tenant-invitation-lifecycle.test.ts`, which is a delivery-capture test double for asserting on the raw token that a real transport would send — the invitation lifecycle (issue → deliver → resend invalidates old token → revoke closes acceptance → accept exactly once) runs entirely through `IdentityRepository`, the real durable persistence path.

## What is genuinely new coverage (gap-fill, not duplication)

Before writing tests, the existing baseline was inventoried (`tests/unit/tenant-partner-foundation.test.ts`, `tests/unit/tenant-invitation-lifecycle.test.ts`, `tests/unit/tenant-default-authority.test.ts`, `tests/integ/tenant-governance-negative.test.ts` — 40 pre-existing tests, all still passing at the current SHA, see **Regression confirmation** below). Two real gaps were found and are what this task's new tests concentrate on:

1. **The approval *approve* happy path was untested anywhere in the repository.** Verified via:
   `grep -rn "\.approveApprovalRequest(\|\.rejectApprovalRequest(\|\.escalateApprovalRequest(" tests/` — before this task, zero matches outside service/controller definitions. The existing `tests/integ/tenant-governance-negative.test.ts` only exercises `block`, `reject`, and `escalate`. `tenant-approval-and-quota-lifecycle.test.ts` adds the missing `approve` path end-to-end: booking created pending → dispatch blocked (`BOOKING_APPROVAL_PENDING`) → approved by the resolved approver → **read back through three independent resources** (the approval-request record via `getApprovalRequest`, the booking record via `getTenantBooking`, and dispatch itself, which now succeeds) → plus two negative cases (double-decision by the same approver while still pending under `all_of_parallel`, and decision by a non-resolved-approver actor).
2. **Successful quota consumption was never read back through the cost-center quota summary.** The existing negative test only asserts the *insufficient*-quota failure path leaves no ledger residue. This task adds the *sufficient*-quota success path: a booking against a cost center with real headroom produces a ledger entry keyed to that `bookingId`, and `getCostCenterQuotaSummary` reflects the increment on independent re-read.
3. **`revokeTenantInvitation` → `acceptTenantInvitation` was untested.** The existing invitation-lifecycle test only covers resend-invalidates-old-token; this task adds revoke-then-accept-fails, plus double-revoke-fails-closed.
4. **`FeatureFlagsService.upsertTenantOverride` had no test anywhere** (`grep -rln "upsertTenantOverride" tests/` matched nothing before this task). Added: tenant override write is visible only to that tenant, leaves the global flag and other tenants unaffected, and unknown flags resolve to `false` rather than throwing.

## Commands run and results

Run from the task worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-qa-tenant-001` at commit `031cfc4c9` (branch `claude/sr-qa-tenant-001`, base `origin/dev`).

```
$ pnpm exec vitest run tests/unit/system-remediation/sr-qa-tenant-001/
 Test Files  2 passed (2)
      Tests  24 passed (24)
```

24/24 new tests pass. Representative resource IDs generated by real service calls during this run (server logs, not fabricated): `invitation_55c20fa0-3cf9-4ec8-a087-182fc1543e25`, `tenant-qa-regression-1788878487058` / code `qa_regression_1788878487058`, `approval-request-5e6dd021-dc3c-4c9d-a3e2-ff4c1d7339e1` (new_request → approved).

Regression confirmation — the pre-existing baseline this task built on top of, re-run unmodified at the same SHA:

```
$ pnpm exec vitest run tests/unit/tenant-partner-foundation.test.ts tests/unit/tenant-invitation-lifecycle.test.ts tests/unit/tenant-default-authority.test.ts tests/integ/tenant-governance-negative.test.ts
 Test Files  4 passed (4)
      Tests  40 passed (40)
```

```
$ git diff --check --cached
(no output — no whitespace errors in the new files)
```

## What was NOT done — explicitly not claimed as passing

- **Browser/HTTP-level (Playwright) e2e was not executed.** `playwright.system-remediation.config.ts` has no runnable spec added under `tests/e2e/system-remediation/sr-qa-tenant-001/` by this task, so `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` finds zero matching specs — this is an honest "not done", not a passing empty suite. Reasons:
  - No local API + Postgres + tenant-console-web stack is running in this isolated task worktree (`docker ps` requires elevated approval not granted for this task, so it was not attempted), so there is no local/sandbox target to point a real HTTP/browser test at.
  - Hitting the live `dev`-deployed environment with synthetic `x-actor-type`/bootstrap headers would violate the explicit `SR-UAT-HARNESS-001` guardrail — "只能測試local/sandbox，live時需合法身份不fakeheaders" (live targets require genuine identity, not fake headers) — so that path was correctly not attempted rather than faked.
  - What *was* verified instead is deeper than a render/constants check: every test calls the real NestJS service classes that back these HTTP routes (e.g. `POST /tenant/cost-centers` → `TenantPartnerService.upsertCostCenter`, `POST /tenant/users/:userId/invitation/resend` → `.resendTenantInvitation`), writes through them, and reads back through an independent method/resource, matching the acceptance criterion "檢驗write後DB/API回讀以及必要資源間關聯" at the service layer that Nest's controllers are a thin pass-through over (see e.g. `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:1144` `POST tenant/cost-centers` calling `tenantPartnerService.upsertCostCenter` directly).
- **Real Postgres persistence (`TenantPartnerRepository`/`PlatformAdminRepository`/`FeatureFlagRepository`) was not exercised.** All services above run in their in-memory-repository fallback mode (the same mode `@Optional()`-injected across the constructors when no DB is wired), matching the pattern already established by `tests/unit/tenant-partner-foundation.test.ts` and `tests/integ/tenant-governance-negative.test.ts`. The DB-backed code paths (`persistChanges` → repository `loadState`/`persistChanges` SQL) are outside this task's write_scopes to add coverage for and are not claimed as verified here.
- No `apps/api/src` (or any other business-code) file was modified by this task — this is verification-only, consistent with `write_scopes`.

## Artifacts

- `tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts`
- `tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-QA-TENANT-001.md` (this file)

## Re-run

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-qa-tenant-001/
```
