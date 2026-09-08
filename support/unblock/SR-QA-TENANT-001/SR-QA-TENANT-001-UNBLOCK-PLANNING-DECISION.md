# SR-QA-TENANT-001-UNBLOCK-PLANNING-DECISION

2026-09-08 · Owner Codex · Reviewer Codex2

## Decision and source precedence

Planning triage resolves the reported classification: the evidenced obstacle is
UAT provisioning, not a missing product/contract decision. No acceptance reduction,
new auth contract or shared-file scope expansion is approved. The outstanding
environment follow-up is routed through `PHASE1_OPEN_QUESTIONS.md`, item
`Q-SR-QA-TENANT-001`, and the existing canonical parent task.

- `phase1_prd_detailed_v1.md` §9.1.2 requires directory, cost centres, notification/SLA,
  users/roles and role-sensitive integration/billing/audit behavior.
- `phase1_service_contracts_v1.md` §3.2 assigns tenant metadata, directory and
  user-role truth to Tenant & Partner Service.
- Extracted acceptance scenarios §SC-035 and §SC-045 retain authorization and
  cross-tenant isolation expectations; synthetic identities do not prove them.
- `docs/03-runbooks/system-remediation-20260906/SR-QA-TENANT-001.md`, Execution
  prompt and Acceptance, requires every listed capability's positive/negative
  write/readback evidence and scoped repair tasks for reproduced defects.
- The manual-unblock and history-repair artifacts in this directory already
  identify provisioning and warn that helper merge may reset the parent to todo.

## Initial observations (historical; superseded below)

Fetch and rebase completed with exit 0 on base
`2a093872d05a7d0344adf9bb58f9e5c4c99861d1`. Parent remote head observed after fetch:
`1f9a6c4965c0af50ac0bb97f60af4a4e0a91d358`.
Canonical parent slice initially reported `todo`, with a Chairman resume message
following HISTORY-REPAIR, rather than provisioning evidence.

The parent evidence at that remote head records a later run at
`91d5880deddbc55a9c4cde1d20ebf15a8738b568`: four tenant tests failed for missing API
URL, four shared tests passed, zero HTTP calls/resources. This is historical
parent evidence, not a run by this helper.

A value-free Node environment presence check here (exit 0) found all six settings
missing: `DRTS_TENANT_UAT_API_URL`, `DRTS_TENANT_UAT_TENANT_A`,
`DRTS_TENANT_UAT_TENANT_B`, `DRTS_TENANT_UAT_TOKEN_A`,
`DRTS_TENANT_UAT_TOKEN_B`, `DRTS_TENANT_UAT_TOKEN_READONLY`.
This establishes absence in this worker only. No credential values were read out.

## Explicit follow-up and parent next step

1. Supervisor/Gemini coordinates an environment/IAM provisioner for an isolated
   local/sandbox API origin, distinct disposable tenants A/B and valid tenant_admin
   bearer sessions. Current parent specs require `DRTS_UAT_ENV=local|sandbox`,
   `DRTS_UAT_API_URL` (origin; specs construct `/api/tenant/*`),
   `DRTS_UAT_TENANT_A`, `DRTS_UAT_TENANT_B`, `DRTS_UAT_TOKEN_A`,
   `DRTS_UAT_TOKEN_B`, and a fresh authorized test receiver address in
   `DRTS_UAT_USER_EMAIL`. Record actual server deployment SHA separately from
   test `BASE_SHA`/`CANDIDATE_SHA`, identity expiry/refresh and DB teardown owner.
   Provision a read-only A identity for outstanding role-negative coverage; the
   current specs do not yet define an environment variable for that identity.
   Shared harness Map cleanup is not DB tenant teardown.
2. Keep the provisioning follow-up open while parent Codex2 continues scoped
   test development. Parent is currently `in_progress`, reviewer Codex; do not
   restore the historical owner or force it blocked solely on helper merge.
   Merge-evidence routing should preserve `PARENT_STATUS=in_progress` and a
   `PARENT_NEXT` that separates test development from the unmet live-access gate.
3. Parent Codex2 uses its assigned worktree, checks current base/history, extends
   the missing matrix cases, and after provisioning runs
   `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001`.
   Keep actual exit status, base/tested/server SHAs, HTTP statuses and same-ID
   resource write/readback evidence. Missing access must fail, never skip green.
4. Finish the users, addresses, passengers, cost centres, rules, SLA, invites,
   approvals, feature flags and tenant lifecycle matrix, including the parent
   quota/integration requirements and outstanding DB/mail/browser evidence.
   Provisioning or shared test passes alone do not satisfy parent acceptance.
   Reproduced product defects require canonical scoped repair tasks; any actual
   unresolved semantic choice returns to the questions board with citations.
5. Parent commits, ordinary-pushes and hands off its own exact candidate only
   after completing checks. Helper review/CI cannot substitute for parent evidence.

## Refreshed dispatch evidence (2026-09-08)

Canonical parent slice at 18:13:19Z assigns Codex2 / Codex and reports
`in_progress`. Its committed evidence at `590047596` records tested anchor
`c5d3d51aa85918247bab5c9f97abb0c789776d78`, 74 passing service tests, passing API
typecheck/lint, and Playwright exit 1: four harness passes, three HTTP failures
for missing `DRTS_UAT_ENV`, zero HTTP calls and no live IDs. These are parent
observations, not executions by this helper. Inspection of its `users.spec.ts`
confirms the current environment names above; the initial six
`DRTS_TENANT_UAT_*` checks do not describe the current parent harness contract.

Rebased this helper onto `ab15cc21e0e3807f14462017273c27f94971f7f5`, resolving
the questions-index insertion conflict by retaining both Q-SR-ENV-COPY-001 and
Q-SR-QA-TENANT-001. Merged the already-published helper ancestry back afterward;
merge tree diff against its first parent was empty, and ordinary push succeeded.

## Verification and delivery boundary

This helper changes the planning index and routing artifact only. Verification:
source/task-slice inspection, `git diff --check`, retained unrelated planning
entries and normal push ancestry. No live HTTP, DB, mail or browser acceptance
was executed here. PR #1805 carries this helper; final candidate is locked through
canonical handoff. Independent review/CI/merge remain pending.
