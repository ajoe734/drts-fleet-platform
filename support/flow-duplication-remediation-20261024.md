# FLOW-DUPLICATION-REMEDIATION-20261024

Owner: Codex. Independent reviewer: Claude. Base: c3ed5514c73e86f252b62cc004eee94f34f73b94.

User authorized repair of the 2026-10-24 duplication audit. Preserve existing product flows and active task owners.

## Findings and bounded implementation

- C1: Historical branch/commit words incorrectly classify a read-only release gate as history repair. Hold noncanonical release parents in the existing delivery lifecycle and require concrete recovery wording for history classification. Preserve actual source recovery, archived-helper guard and helper resolution fences.
- C2: CRC-WP0 foundation-only Referral scaffold services have no product callers. Remove their module providers/exports and use the real settlement service in affected tests. Keep the real canonical rate, identity and order services.
- C3: Close superseded PRs #2962 and #2954. Replacement #2963 has identical task-owned blobs; replacement #2959 has an identical tree. Both replacements are merged. Closed 2026-10-24 with provenance in each PR body.
- C4: Share the two existing datetime regex constants across four contracts without changing grammar, error behavior, UTC/offset distinction or UUID/record security fixes from #2966.

No new delivery pipeline, task platform, product server or deployment. Original root and live worker worktrees remain untouched.

## Verification

- C1 baseline: with the two new tests and unchanged c3ed5514c production code, both regressions failed (incorrect helper creation; metadata-only history classification). After repair, the chairman suite, dispatch policy and chair policy pass 116 tests; archived-unblock guard passes 3 tests. These call the production routing functions; task-board writes are mocked only at the external mutation boundary.
- C2: 13 billing service tests, 5 C103 tests and 28 canonical referral-rate flow tests pass. The C103 former scaffold test now calls BillingSettlementService.getReferralStatement and verifies actual statement direction, GMV and share. The canonical flow suite exercises real services/repositories with an explicitly simulated database transport; it is not live PostgreSQL acceptance.
- C3: #2962 and #2954 are closed with replacement/merge provenance. No source branch was deleted or rewritten.
- C4: uv-exec-001 (113 tests), uv-exec-003 (27 tests) and uv-exec-012 (36 tests) pass. Each of the four former regex literals matches its shared replacement byte-for-byte against base c3ed5514c.
- Total scoped passing tests: 119 Python + 222 TypeScript = 341.
- Contracts and control-plane-auth builds pass. ESLint on changed TypeScript paths and git diff --check pass.
- API and root TypeScript checks both pass (exit 0).
- The first expanded Python invocation named a nonexistent test_governance_workload module; that invocation failed discovery. The corrected explicit suites above completed successfully. Initial uv-exec-003/012 arguments used the wrong directory and were not selected; both were subsequently run from their actual paths and passed.

Reproduction commands (from the isolated task worktree):

- PYTHONPATH=tools/development-orchestrator python3 -m unittest test_chair_review control_plane.tests.test_dispatch_policy control_plane.tests.test_chair_policy
- PYTHONPATH=tools/development-orchestrator python3 -m unittest test_supervisor.ArchivedUnblockGuardTests
- pnpm exec vitest run tests/contract/uv-exec-001.test.ts tests/security/uv-exec-003.test.ts tests/unit/uv-exec-012.test.ts tests/unit/partner-referral-rate-canonical-settlement-flow-20261015/canonical-rate.test.ts tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts --no-file-parallelism
- Billing suite uses a temporary local Vitest config spreading the root config and setting test.include to apps/api/tests/unit/billing-settlement.service.test.ts; no source behavior is mocked or altered.
- pnpm --filter @drts/contracts build; pnpm --filter @drts/control-plane-auth build; pnpm --filter @drts/api typecheck; pnpm exec tsc --noEmit

## Delivery limits and retained work

Independent review and hosted CI must check the frozen final candidate. This task does not claim deployment, product runtime, browser or live database acceptance. The active orchestrator release is unchanged; the C1 guard takes effect only through the existing reviewed release procedure.

The already-created shared-dev helper remains with its original Claude2 owner/Claude reviewer. The old fixture helper's duplicate blocked live record also remains visible: there is no verified withdrawal/archive-restore transaction, and marking it done would fabricate completion. Its original archived completion and the already-merged archived-ID guard remain authoritative; no replacement recovery task or direct board-JSON edit was introduced.
