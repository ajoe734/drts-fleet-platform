# SR-ENV-COPY-001 — partial implementation and scope blocker

Owner: Codex. Reviewer: Gemini. Updated: 2026-09-08.

## Reproduction and commit evidence

- Current fetched base `origin/dev`: `3b60a3757238663572f16f010c94f446f2c71eaa`.
- Dispatched candidate: `a480557fde8a27e2313a4e809b4a23e5336e04fe`.
- Verified implementation SHA: `5f1c5d02d20d46569f0ca1815fd8508a7239d4e2`.
- Branch: `codex/sr-env-copy-001`; PR resource: https://github.com/ajoe734/drts-fleet-platform/pull/1738.
- Sources: execution task SR-ENV-COPY-001; findings R27; capability C110. Historical audit is not current implementation evidence.
- Rebased onto current origin/dev. Initial ordinary push was rejected (non-fast-forward, exit 1); merged published branch ancestry, retaining the corrected resolver and tests in the two add/add conflicts. No force push used.

## Current result

Existing translations remove ActionIntent from the ops assistant empty state, internal supply-review error identifiers, and fleet submissionId labels. Existing badge uses ui-tokens; this dispatch changes no visual design.

Fixed the resolver so NODE_ENV=production alone returns unknown. An explicit DRTS_ENV or APP_ENV production value is required. Regression covers build-only production, explicit production, and a fixture signal overriding production build mode. This intentionally differs from authentication fallback: a production-mode build is not evidence of a production deployment.

## Blockers requiring supervisor scope/dependency update

1. Current app render sites remain fixed translation keys: `apps/ops-console-web/app/layout.tsx:61`, `apps/platform-admin-web/components/admin-shell.tsx:638`, `apps/tenant-console-web/components/tenant-shell.tsx:909`. Runtime badge wiring requires these files and any relevant deployment-value plumbing to be assigned with dependencies before editing. The shared badge currently has no app integration; environment acceptance is incomplete.
2. The inherited candidate already adds `packages/ui-web/tests/unit/environment-badge.test.ts` outside the authorized scopes. Its test named “does not trust NODE_ENV=production” actually expects production. The corrected implementation makes that contradictory assertion fail. Supervisor must authorize correcting/removing or relocating this existing file; this dispatch did not write it. Prior evidence claiming this directory was inside scope was incorrect.
3. Other technical copy (availableActions, EmptyReason, etc.) remains in authorized translations and still needs cleanup; the previous evidence's claim that these were outside scope was incorrect. No claim of complete bilingual normal/error/empty-state acceptance is made.

## Commands and observed results

Executed on the corrected implementation (merge retained the same source/test content):

| Command | Exit | Result |
| --- | --- | --- |
| `git diff --check` | 0 | clean |
| `pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/sr-env-copy-001.test.ts` | 0 | 7 passed |
| `pnpm --filter @drts/ui-web exec vitest run tests/unit/environment-badge.test.ts` | 1 | 5 passed; 1 contradictory legacy assertion failed |
| `pnpm --filter @drts/bank-console-web typecheck` | 0 | passed |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` | 0 | passed |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | 0 | passed |
| `pnpm --filter @drts/ops-console-web typecheck` | 0 | passed |
| `pnpm --filter @drts/platform-admin-web typecheck` | 0 | passed |
| `pnpm --filter @drts/tenant-console-web typecheck` | 0 | passed |

Dispatched CI resource: https://github.com/ajoe734/drts-fleet-platform/actions/runs/34223457142/job/102051836587 . Machine truth reported failure; `gh run view 34223457142 --job 102051836587 --log-failed` exited 1 because the run was still in progress and logs unavailable. No assertion about that CI failure's root cause or fresh-candidate CI success.

No live deployment, browser screenshots, E2E, or device validation performed. No business resources created or modified. No review/merge/deployment acceptance claimed. This is an anchored partial implementation, not a completion handoff.
