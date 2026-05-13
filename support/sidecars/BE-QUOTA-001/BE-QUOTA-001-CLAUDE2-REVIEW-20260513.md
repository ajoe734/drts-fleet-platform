# BE-QUOTA-001 Parent Review — Claude2 round (2026-05-13)

- Parent task: `BE-QUOTA-001`
- Reviewer: `Claude2`
- Round trigger: availability-first claim moved parent reviewer to `Claude2` at `2026-05-13T22:42:03Z`.
- Verification branch: `codex/fwd-verif-001-closeout` (HEAD `68fe418`).
- Disposition: **REOPEN** — acceptance bar `pnpm --filter @drts/api typecheck` fails on pristine HEAD.

## 1. Acceptance crosswalk on committed HEAD

Quota-owned items (all satisfied by committed code at HEAD):

| Acceptance area                                                                                                                                                                                     | Status | Anchor                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `TenantQuotaEnforcementMode` / `TenantQuotaPeriod` / `TenantQuotaLimit` / `TenantQuotaUsage` / `TenantQuotaLedgerEntry` / `TenantBookingQuotaImpactResult` declared                                 | OK     | `packages/contracts/src/index.ts:1410-1465`                                                                   |
| `TenantQuotaPolicyRecord` / `UpsertTenantQuotaPolicyCommand` / `TenantQuotaSummary` / `TenantCostCenterQuotaSummary` / `TenantBookingQuotaImpactQuery` / `TenantBookingQuotaImpactPreview` declared | OK     | `packages/contracts/src/index.ts:1466-1514`                                                                   |
| Three tables (`phase1_tenant_quota_policies` / `phase1_tenant_quota_ledger` / `phase1_tenant_quota_monthly_snapshots`)                                                                              | OK     | `infra/migrations/V0023__tenant_quota_persistence.sql:1-83`                                                   |
| `reserveTenantQuota` inside booking-write tx with `SELECT ... FOR UPDATE` on policy + snapshot                                                                                                      | OK     | service `tenant-partner.service.ts:1593-1660`, repo `tenant-partner.repository.ts:1118-1139` and `:1178-1210` |
| Taipei period attribution + cross-month release/reserve                                                                                                                                             | OK     | helper `tenant-quota-ledger.ts:toTenantQuotaPeriodKey` + tests `tests/unit/tenant-quota-ledger.test.ts`       |
| Hard-block over-limit throws `QUOTA_INSUFFICIENT_AT_COMMIT`; preview non-binding                                                                                                                    | OK     | service `tenant-partner.service.ts:1506-1660`                                                                 |
| 5 REST routes under `/api/tenant/quotas` (+ cost-center detail)                                                                                                                                     | OK     | controller `tenant-partner.controller.ts:466-543`                                                             |
| Audit events `tenant.quota_policy.updated` / `tenant.quota_ledger.entry_added` / `tenant.quota_snapshot.refreshed`                                                                                  | OK     | service `tenant-partner.service.ts:1506-1555`, `:7738-7778`                                                   |
| API client: `getTenantQuotaSummary` / `getTenantCostCenterQuota` / `previewTenantBookingQuotaImpact` / `upsertTenantQuotaPolicy` / `listTenantQuotaLedger`                                          | OK     | `packages/api-client/src/index.ts:1335-1386`                                                                  |
| Race test (two concurrent reserves on last unit)                                                                                                                                                    | OK     | `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` covers contention + serialization               |

Naming note: brief says `TenantQuotaUsage (with pendingReserved + confirmed split)`. Committed fields are `bookingCountReserved` / `bookingCountConsumed` / `amountMinorReserved` / `amountMinorConsumed`. Semantically this IS the pending-vs-confirmed split (reserve→pending, consume→confirmed), so I am NOT raising this as a blocker — only flagging that downstream tasks (`TEN-UI-RD-010`, `TEN-UI-RD-014`) may want to align field names if the literal wording is meant to be enforced.

## 2. Validation gates on pristine HEAD (working tree stashed)

Ran with all uncommitted edits temporarily stashed so the result reflects only canonical evidence:

| Gate                                                      | Result    | Detail                                              |
| --------------------------------------------------------- | --------- | --------------------------------------------------- |
| `pnpm --filter @drts/contracts build`                     | PASS      | tsc clean                                           |
| `pnpm --filter @drts/api typecheck`                       | **FAIL**  | see §3                                              |
| `pnpm --filter @drts/api test` (running on pristine HEAD) | NOT RERUN | typecheck failed first; brief requires both to pass |

## 3. Pristine-HEAD typecheck failure inventory

Exact errors reproduced with no working-tree edits applied:

- `src/modules/billing-settlement/billing-settlement.service.ts:495,734,779,1235,1333` — `AuditNotificationService.recordNotification` argument now requires `recipientUserId`. Origin: `BE-APR-NOTIFY-001` widened `NotificationRecord` to include `recipientUserId`. Callers in billing-settlement/complaint/owned-mobility/etc. were not updated.
- `src/modules/complaint/complaint.service.ts:527` — same `recipientUserId` drift.
- `src/modules/owned-mobility/owned-mobility.service.ts:75,750,752,1242,1244,2600,4378,4385` — references `OwnedMobilityQueryExecutor`, `withTransaction`, and `persistOrderWorkflow` on the repository that don't exist at HEAD, and also hits the `recipientUserId` drift.
- `src/modules/reporting-filing/reporting-filing.service.ts:798` — row literal is missing `costCenterCode` / `costCenterName` / `ownerUserId` / `activeFlag` / `legacy_unmapped` required by `PartnerRevenueSummaryRowRecord`. Origin: `BE-CC-001-FU-BILLING` widened the row type.

These are cross-task drift, not BE-QUOTA-001 internal defects. But the parent task's literal acceptance bar (`pnpm --filter @drts/api typecheck + test all pass`) is unmet at HEAD, so the parent cannot finalize without either:

- (a) BE-QUOTA-001 owner Codex absorbing these reconciliations into the BE-QUOTA-001 commit chain, or
- (b) the supervisor splitting reconciliation work into a dedicated drift-cleanup task that lands before BE-QUOTA-001 can close.

## 4. Quota-adjacent regression in root-level cross-module test

Running `pnpm exec vitest run tests/unit/tenant-partner-foundation.test.ts` on the working tree (which still includes the field-rename + reconciliation edits) reproduces the same 2-of-23 failures that the prior `BE-QUOTA-001-SIDECAR-REVIEW.md` flagged:

```
TenantPartnerService.getCostCenter            apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1425:13
TenantPartnerService.normalizeQuotaImpactQuery    .../tenant-partner.service.ts:7004:16
TenantPartnerService.previewBookingQuotaImpact    .../tenant-partner.service.ts:1562:29
OwnedMobilityService.evaluateTenantBookingGovernance owned-mobility.service.ts:4451:52
... -> tests/unit/tenant-partner-foundation.test.ts:879 / :996
```

The failing scenarios are legacy-coverage tests:

- "summarizes cost-center coverage across resolved, unresolved, disabled, and cross-tenant legacy bookings"
- "reports grandfather tenants with no directory rows as unresolved coverage instead of failing validation"

Root cause: `normalizeQuotaImpactQuery()` resolves `costCenterCode` via `getCostCenter()`, which throws `COST_CENTER_NOT_FOUND` for legacy bookings whose cost-center either belongs to another tenant or has no directory row yet. This short-circuits before the unresolved-coverage reporting path can classify the booking.

Strictly speaking this lives at the repo-root vitest config (`tests/unit/**`), not under `pnpm --filter @drts/api test`. So it is OUTSIDE the literal acceptance filter. I am calling it out as a follow-up risk, not as the primary blocker. If the supervisor decides the root-level vitest run is part of the wider acceptance posture for the tenant-governance wave, this needs a fix in the same slice (e.g., `normalizeQuotaImpactQuery` should soft-resolve missing cost centers and let `previewBookingQuotaImpact` produce a `legacy_unmapped` shape instead of throwing).

## 5. Working tree observations (not canonical evidence)

The working tree on this branch carries a pile of uncommitted edits that, taken together, are exactly the reconciliation work §3 calls for plus a contract rename:

- contract rename: `TenantQuotaUsage.{bookingCountReserved,bookingCountConsumed,amountMinorReserved,amountMinorConsumed}` → `{pendingReservedBookingCount,confirmedBookingCount,pendingReservedAmountMinor,confirmedAmountMinor}` to match the brief's literal naming
- OpenAPI spec mirrored to the rename
- audit-notification: `recipientUserId` optional with null fallback
- owned-mobility repository: `OwnedMobilityQueryExecutor` + `withTransaction` + `persistOrderWorkflow` added
- reporting-filing: adds the 5 missing `PartnerRevenueSummaryRowRecord` fields
- owned-mobility tests: tenantPartnerService mock now exposes `previewBookingQuotaImpact` / `evaluateApprovalRules` / `reserveTenantQuota`, and `audit` mock exposes `dispatchApprovalNotification`
- quota tests + integration/load tests follow the rename

I did NOT commit or stage these. As reviewer I have no mandate to author them onto the canonical chain — that is for owner `Codex` to land if they accept the reconciliation as part of BE-QUOTA-001's scope.

Sanity result: with the working-tree edits applied, `pnpm --filter @drts/contracts build`, `pnpm --filter @drts/api typecheck`, and `pnpm --filter @drts/api test` (33 files / 347 tests) all pass. So the reconciliation is in fact sufficient; it just needs to land in the canonical evidence chain.

## 6. Reopen reasoning summary

- Quota-owned acceptance items: PRESENT and committed on HEAD.
- Acceptance gate `pnpm --filter @drts/api typecheck`: **FAILS on pristine HEAD** because of cross-task drift in `NotificationRecord` / `OwnedMobilityRepository` / `PartnerRevenueSummaryRowRecord`. This blocks parent closeout under the brief's literal wording.
- Quota-adjacent root-level legacy-coverage regression: real, reproducible, FYI follow-up.

Recommended next move: Codex (owner) absorbs the working-tree reconciliation edits (or a supervisor-routed equivalent) into the BE-QUOTA-001 commit chain, then re-runs the three gates against a clean tree and hands off to `Claude2` again.
