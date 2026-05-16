# BE-QUOTA-001 Parent Review — Claude2 round 2 (2026-05-13)

- Parent task: `BE-QUOTA-001`
- Reviewer: `Claude2`
- Round trigger: owner `Codex` rehanded back to `review` at `2026-05-13T23:01:25Z` after landing the round-1 reconciliation set.
- Verification branch: `codex/fwd-verif-001-closeout` (HEAD `68fe418`, plus the uncommitted reconciliation set described below).
- Prior round: `support/sidecars/BE-QUOTA-001/BE-QUOTA-001-CLAUDE2-REVIEW-20260513.md` (REOPEN).
- Disposition: **APPROVE for closeout** — owner may commit the BE-QUOTA-001-scoped slice and proceed to `done`.

## 1. Reconciliation crosswalk vs. round-1 reopen requirements

Round 1 (`BE-QUOTA-001-CLAUDE2-REVIEW-20260513.md` §3) blocked closeout on pristine-HEAD `pnpm --filter @drts/api typecheck` failures spanning four files plus a quota-adjacent legacy-coverage regression in `tests/unit/tenant-partner-foundation.test.ts`. The current working tree resolves each:

| Round-1 requirement                                                                                                                          | Working-tree resolution                                                                                                                                                                   | Anchor                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuditNotificationService.recordNotification` callers vs. new `recipientUserId` required field                                               | `recipientUserId` made optional on `recordNotification` input with `?? null` fallback inside the service                                                                                  | `apps/api/src/modules/audit-notification/audit-notification.service.ts:699-712`                                                                                                                                       |
| `OwnedMobilityRepository` missing `OwnedMobilityQueryExecutor` / `withTransaction` / `persistOrderWorkflow`                                  | Type added; `withTransaction` opens a `BEGIN`/`COMMIT`/`ROLLBACK` envelope around a `PoolClient`; `persistOrderWorkflow` reuses the executor-routed write path                            | `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:1-205`                                                                                                                                              |
| `reporting-filing.service.ts:798` row literal missing `costCenterCode` / `costCenterName` / `ownerUserId` / `activeFlag` / `legacy_unmapped` | Row literal now sets all 5 fields (`costCenterCode = order.costCenter`, the remaining four defaulted)                                                                                     | `apps/api/src/modules/reporting-filing/reporting-filing.service.ts:807-813`                                                                                                                                           |
| Quota-adjacent regression: `normalizeQuotaImpactQuery()` threw `COST_CENTER_NOT_FOUND` for legacy / cross-tenant bookings                    | `normalizeQuotaImpactQuery` now resolves the code through `normalizeCostCenterCode()` (uppercase + charset validation only), so missing directory rows fall through to coverage reporting | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:7001-7009`, helper at `:6832-6845`                                                                                                                     |
| Brief literal naming: `TenantQuotaUsage (with pendingReserved + confirmed split)`                                                            | Fields renamed to `pendingReservedBookingCount` / `confirmedBookingCount` / `pendingReservedAmountMinor` / `confirmedAmountMinor` in contract + OpenAPI + tests                           | `packages/contracts/src/index.ts:1424-1432`, `docs/04-api/openapi-spec.yaml:1199-1219`, `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts:57-140`, tests under `apps/api/tests/{unit,load,integration}/...` |
| `tests/unit/tenant-partner-foundation.test.ts` legacy-coverage scenarios                                                                     | The two affected `it(...)` blocks now `await ownedMobilityService.createTenantBooking(...)` instead of treating it as sync                                                                | `tests/unit/tenant-partner-foundation.test.ts:873-1011`                                                                                                                                                               |

## 2. Brief acceptance crosswalk (re-confirmed on round-2 tree)

All acceptance bullets stay satisfied after the rename + reconciliation:

| Acceptance area                                                                                                                                                                                | Status | Anchor                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TenantQuotaEnforcementMode` / `TenantQuotaPeriod` / `TenantQuotaLimit` / `TenantQuotaUsage` (pendingReserved + confirmed split) / `TenantQuotaLedgerEntry` / `TenantBookingQuotaImpactResult` | OK     | `packages/contracts/src/index.ts:1410-1459`                                                                                                                                                                                 |
| `TenantQuotaPolicyRecord` / `UpsertTenantQuotaPolicyCommand` / `TenantQuotaSummary` / `TenantCostCenterQuotaSummary` / `TenantBookingQuotaImpactQuery` / `TenantBookingQuotaImpactPreview`     | OK     | `packages/contracts/src/index.ts:1461-1514`                                                                                                                                                                                 |
| Three tables (`phase1_tenant_quota_policies` / `phase1_tenant_quota_ledger` / `phase1_tenant_quota_monthly_snapshots`)                                                                         | OK     | `infra/migrations/V0023__tenant_quota_persistence.sql:1-83`                                                                                                                                                                 |
| `reserveTenantQuota` inside booking-write tx with `SELECT ... FOR UPDATE` on policy + snapshot rows                                                                                            | OK     | repository `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:1129` (policy lock), `:1199` (snapshot lock); service overload entry at `tenant-partner.service.ts:1593-1660`, executor wiring at `:7141-7188` |
| Taipei period attribution + cross-month release/reserve                                                                                                                                        | OK     | helper + tests in `tenant-quota-ledger.ts` / `tests/unit/tenant-quota-ledger.test.ts`                                                                                                                                       |
| Hard-block over-limit throws `QUOTA_INSUFFICIENT_AT_COMMIT`; preview non-binding                                                                                                               | OK     | service `tenant-partner.service.ts:1506-1660`; covered in `tests/unit/tenant-partner.service.test.ts:1907-2097`                                                                                                             |
| 5 REST routes under `/api/tenant/quotas` (+ cost-center detail)                                                                                                                                | OK     | controller `tenant-partner.controller.ts:466,479,494,510,525`                                                                                                                                                               |
| Audit events `tenant.quota_policy.updated` / `tenant.quota_ledger.entry_added` / `tenant.quota_snapshot.refreshed`                                                                             | OK     | service `tenant-partner.service.ts:1506-1555`, `:7738-7778`                                                                                                                                                                 |
| API client: `getTenantQuotaSummary` / `getTenantCostCenterQuota` / `previewTenantBookingQuotaImpact` / `upsertTenantQuotaPolicy` / `listTenantQuotaLedger`                                     | OK     | `packages/api-client/src/index.ts:1323-1386`                                                                                                                                                                                |
| Race test (two concurrent reserves on last unit)                                                                                                                                               | OK     | `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`                                                                                                                                                               |
| `pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck + pnpm --filter @drts/api test all pass`                                                                              | OK     | see §3                                                                                                                                                                                                                      |

## 3. Validation gates on round-2 tree

Ran on the current working tree (reconciliation edits applied, not yet committed):

| Gate                                                                | Result | Detail                                                                                          |
| ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/contracts build`                               | PASS   | tsc clean                                                                                       |
| `pnpm --filter @drts/api typecheck`                                 | PASS   | tsc clean; no diagnostics in billing-settlement / complaint / owned-mobility / reporting-filing |
| `pnpm --filter @drts/api test`                                      | PASS   | 33 files / 347 tests                                                                            |
| `pnpm exec vitest run tests/unit/tenant-partner-foundation.test.ts` | PASS   | 23 / 23                                                                                         |

This satisfies the brief's literal acceptance bar plus the round-1 follow-up risk on root-level legacy coverage.

## 4. Closeout guidance for owner Codex

The reconciliation set is uncommitted at review time. For canonical closeout, please commit only the BE-QUOTA-001-relevant slice and push it as a normal non-force push. Suggested in-scope files:

- `packages/contracts/src/index.ts`
- `docs/04-api/openapi-spec.yaml`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`
- `apps/api/src/modules/audit-notification/audit-notification.service.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
- `apps/api/tests/integration/tenant-governance-e2e.test.ts`
- `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`
- `apps/api/tests/unit/owned-mobility-compliance-gates.test.ts`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `apps/api/tests/unit/tenant-partner.service.test.ts`
- `apps/api/tests/unit/tenant-quota-ledger.test.ts`
- `tests/unit/tenant-partner-foundation.test.ts`
- (plus this round-2 review packet at `support/sidecars/BE-QUOTA-001/BE-QUOTA-001-CLAUDE2-REVIEW-ROUND2-20260513.md` and the round-1 packet that is still untracked at `BE-QUOTA-001-CLAUDE2-REVIEW-20260513.md` if you wish to fold them in)

Out of scope for the BE-QUOTA-001 commit (separate concerns, do not fold in):

- `scripts/ai_status.py` (unrelated `cross-repo` agent + `task_class == cross_repo_handoff` allowance — different task)
- `support/sidecars/TCH-SDK-BUMP-001/TCH-SDK-BUMP-001-SIDECAR-ACCEPTANCE.md` (different sidecar)
- `ai-status.json` / `current-work.md` / `docs-site/ai-status.json` / `docs-site/current-work.md` — these are control-plane state mutated by `scripts/ai-status.sh` during the approve/done transitions; do not hand-edit into the commit

Required trailers per `AI_COLLABORATION_GUIDE.md` §5:

- `LLM-Agent: Codex`
- `Task-ID: BE-QUOTA-001`
- `Reviewer: Claude2`

After commit + push, finalize via `AI_NAME=Codex COMMIT_HASH=<sha> COMMIT_SUBJECT="..." PUSH_REMOTE=origin PUSH_BRANCH=codex/fwd-verif-001-closeout scripts/ai-status.sh done BE-QUOTA-001 "..."`.

## 5. Naming-rename ripple risk note

The contract field rename (`bookingCountReserved`→`pendingReservedBookingCount` etc.) is a public-contract change. I confirmed:

- No callers under `packages/api-client/`, `apps/api/`, or `apps/web/` reference the old field names anywhere in the working tree.
- `docs/04-api/openapi-spec.yaml` mirrors the new names.
- All affected tests (load, integration, unit, repo-root) follow the rename.

The dependent tasks listed as `unblocks` (`TEN-UI-RD-010`, `TEN-UI-RD-014`, `BE-APR-001`) have not yet been implemented, so there is no UI-side rename debt to chase. If those slices start work and reference `TenantQuotaUsage`, they should consume the new field names directly.

## 6. Approval reasoning summary

- All round-1 blockers are addressed and reproducibly verified.
- Brief acceptance bar (`pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck + pnpm --filter @drts/api test`) PASSES on the round-2 tree.
- Quota-owned acceptance items are all present and anchored to canonical code.
- Field rename matches brief literal wording and propagates cleanly through OpenAPI, tests, and the api-client.
- No regressions or scope creep beyond the prior reopen requirements.

I am approving for canonical closeout. Owner `Codex` should commit the BE-QUOTA-001-scoped slice (excluding the unrelated edits noted in §4), push, and finalize.
