# SR-BANK-002 planning decision routing

Date: 2026-09-08. Helper owner: Codex2. Reviewer: Codex.
Parent owner: Gemini; parent waiting_for: Claude (machine-truth snapshot).
Inspected integration base: `38173c7817dd2c15760978bfc64f9c30a53bc19e`.

## Decision and limits

Route `Q-SR-BANK-002` to supervisor/Claude for scope authorization and serialized
implementation. Preserve full three-role, cross-tenant HTML/JSON/CSV acceptance;
no scope cut is accepted. This helper changes planning only. It neither grants
new permissions nor authorizes the parent to edit shared files.

The blocker is concrete implementation ownership, not evidence that a new
product entitlement is needed. PRD §12.2 and §12.8 separate tenant administration
and finance responsibilities; service contracts §3.11 owns invoice/statement
truth. Neither source defines a new blanket BANK/OPS_VIEWER financial grant.
The parent execution prompt requires existing role policy and central IAM
integration. Any requested change to those entitlements must first be resolved
by the contract reviewer against canonical policy; unresolved product changes
remain open here for human decision.

## Current evidence

- `ai-status.sh show` reports `SR-BANK-001` merged at `6d4c47feb1c6` and
  `SR-IAM-001` at `548608e45841`; both are done. Their completed status does not
  extend the parent's write scopes.
- Parent next records repaired head `1171e91f0`, 49 passing in-scope tests and
  typecheck, plus five failing out-of-scope regressions. Those test results are
  inherited evidence, not rerun by this planning helper.
- At the inspected base, `apps/api/src/common/auth/auth.policy.ts` tenant
  billing branch includes `tenant/billing` and `tenant/invoices`, but omits
  `tenant/settlement-statements`. Required scope for the proposed financial
  read route is `tenant:billing:read`, not the platform `billing:read` grant.
- `loadBankStatementsData` in `apps/bank-console-web/lib/bank-dev-read-models.ts`
  returns `settlementStatements` on degraded/exception paths. Contracts and
  bookings loaders also expose seeded fallback, so scope review must consider
  their consumers before changing this shared loader.
- Read-only inspection of `1171e91f0:tests/unit/system-remediation/sr-bank-002/out-of-scope-blockers.spec.mts`
  confirms two list/detail scope checks, two denied tenant/role loads, and one
  Contoso CSV outage check excluding `STM-ACME`.

## Required supervisor action and parent next step

1. Review overlapping writers and record an explicit scope/dependency update
   through current-release task-board commands before dispatching edits.
   Preferred route: authorize a narrowly scoped parent extension for
   `apps/api/src/common/auth/auth.policy.ts`,
   `apps/bank-console-web/lib/bank-dev-read-models.ts`, and
   `apps/bank-console-web/app/api/statements/` (the existing CSV regression
   imports this currently out-of-scope route). Preserve `iam-policy` and
   `bank-data` serialization with any active overlapping writers. Obtain IAM
   reviewer confirmation; do not silently change the policy catalog.
2. If central IAM ownership requires a separate producer, supervisor must
   register that follow-up in machine truth with explicit scopes, owner,
   reviewer, and parent dependency before dispatch. `SR-IAM-001` is already
   done; its historical merge must not be reopened or treated as this fix.
   No additional implementation task is claimed registered by this document.
3. Gemini resumes the repaired parent rail from fresh `origin/dev`, verifies
   ancestry and reconstructs only authorized changes. Reuse existing role
   grants; enforce financial read authorization on list/detail/download and
   tenant isolation. On 403/503 preserve an explicit failure state without
   substituting ACME records or reporting a successful empty export.
4. Make the five regressions discoverable by the declared root Vitest command
   (the current evidence uses `.spec.mts`; parent validation requires `.test.ts`).
   Run `pnpm exec vitest run tests/unit/system-remediation/sr-bank-002/`,
   `pnpm --filter @drts/bank-console-web typecheck`, and affected API policy
   regression/typecheck when authorized. Verify three-role/cross-tenant
   HTML/JSON/CSV positive and negative cases and failure-state behavior.
5. Record actual commands, exit codes, base/candidate SHA and resource IDs;
   commit, normal push, PR and same-SHA handoff. Do not reuse old history-rail
   candidates or count this helper's review as parent acceptance.

Until step 1 is written to machine truth the parent remains blocked. This
routing is tracked by the existing parent and helper tasks and by
`PHASE1_OPEN_QUESTIONS.md`; it is not chat-only backlog.

## Helper verification

Read-only source and parent regression inspection above; `git diff --check`.
No application tests or live bank requests were run for this documentation-only
change. Commit/push/PR and locked candidate evidence are recorded in the helper
machine-truth handoff after publication.
