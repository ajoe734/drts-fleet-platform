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

## Fresh observations

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

1. Supervisor/Gemini coordinates a provisioner for an isolated local/sandbox API
   root including `/api`, distinct disposable tenants A/B, valid writable A/B
   bearer identities and a valid read-only A identity. Inject the six settings
   into the parent worker; record nonsecret environment provenance, identity
   expiry/refresh instructions and the provisioner's DB teardown ownership.
   Shared harness Map cleanup is not DB tenant teardown.
2. Preserve parent `blocked`, waiting for Gemini, until that evidence exists.
   The merge-evidence actor must use `PARENT_STATUS=blocked`,
   `PARENT_WAITING_FOR=Gemini`, and `PARENT_NEXT` preserving this resume condition.
   These are closeout instructions, not a claim that handoff persists overrides.
3. Parent Codex resumes its assigned worktree, rechecks current base and branch
   history using the history-repair artifact, then runs
   `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001`.
   Keep actual exit status, base/tested SHA, HTTP statuses and same-ID resource
   write/readback evidence. Missing access must fail, never skip into green.
4. Finish the users, addresses, passengers, cost centres, rules, SLA, invites,
   approvals, feature flags and tenant lifecycle matrix, including the parent
   quota/integration requirements and outstanding DB/mail/browser evidence.
   Provisioning or shared test passes alone do not satisfy parent acceptance.
   Reproduced product defects require canonical scoped repair tasks; any actual
   unresolved semantic choice returns to the questions board with citations.
5. Parent commits, ordinary-pushes and hands off its own exact candidate only
   after completing checks. Helper review/CI cannot substitute for parent evidence.

## Verification and delivery boundary

This helper changes the planning index and this routing artifact only. Source
inspection and the value-free environment check support the diagnosis; no live
HTTP, DB, mail or browser acceptance was executed. Validate with
`git diff --check`; commit, ordinary push and PR evidence are attached to this
helper's canonical candidate handoff. Independent review/CI/merge remain pending.
