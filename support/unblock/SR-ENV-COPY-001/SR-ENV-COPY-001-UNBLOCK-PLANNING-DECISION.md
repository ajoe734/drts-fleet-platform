# SR-ENV-COPY-001 planning decision routing

Date: 2026-09-08 UTC. Owner: Codex. Reviewer: Codex2.
Disposition: existing acceptance confirmed; missing runtime integration scope
and source binding routed to Supervisor/Chairman as Q-SR-ENV-COPY-001.

## Evidence and authority

Fresh `git fetch origin` and `git rebase origin/dev` both exited 0. Inspected
base: `2a093872d05a7d0344adf9bb58f9e5c4c99861d1`. The canonical status CLI
reports this helper backlog at dispatch and the parent todo after history
repair. That resumption permits work; it is not evidence of runtime integration.

- [Parent execution contract](../../../docs/03-runbooks/system-remediation-20260906/SR-ENV-COPY-001.md),
  Execution prompt, writable scope and acceptance: actual runtime authority,
  no domain inference, fixture/dev never called production; shell changes need
  supervisor scope/dependency authorization.
- [History repair](SR-ENV-COPY-001-UNBLOCK-HISTORY-REPAIR.md), recovery steps 1–6:
  preserve published history, request replacement-branch routing and selectively
  recover authorized changes. This helper does not execute that recovery.
- At the inspected base, `packages/ui-web/src/environment-badge/` is absent.
  `apps/ops-console-web/app/layout.tsx:61` renders the production translation;
  `apps/fleet-partner-portal-web/components/fleet-portal-shell.tsx:36` passes
  literal production. `apps/tenant-console-web/components/tenant-shell.tsx:909`
  uses `shell.env`, while `lib/navigation.ts:6` defaults its environment to
  production. `apps/platform-admin-web/components/admin-shell.tsx:638` renders
  a catalog environment label. Bank `components/bank-shell.tsx:137` passes
  BANK_CONSOLE_ENV; its provenance must be traced before changing it.
- Ops catalog still exposes ActionIntent at lines 283 and 4813. Thus useful
  authorized copy cleanup remains, independently of runtime wiring.

## Decision and explicit follow-up

No product acceptance is removed. Environment describes deployment; data source
and health are separate claims. Production alone cannot prove data health.
Unknown or missing authoritative values must remain unknown; neither a
translated production label nor NODE_ENV alone establishes deployment truth.
This confirms the parent acceptance, not a newly approved API contract.

Supervisor/Chairman must review the following before integration proceeds:

1. Route the recovery worktree described by the history helper, or record a
   reviewed alternative preserving old refs and PR #1738. Do not assume this
   helper branch is the parent recovery branch.
2. Have the parent owner trace the existing configuration producer and record
   exact variable/config names, allowed values, data-source provenance and
   server-to-client propagation in the parent UAT evidence. If no producer
   exists, Supervisor/Chairman must assign that producer and its dependency
   before consumers are wired. This helper does not invent an env contract.
3. Extend the parent machine write_scopes and reviewed runbook, or register a
   prerequisite with an owner/reviewer, for the ops layout, fleet shell, tenant
   shell/navigation, platform admin shell, and bank shell/navigation as needed
   after tracing. Inspect enterprise render sites as well; absence from the
   matches above is not a clean bill of health. Authorize deployment plumbing
   and shared exports only when the actual required paths are identified.
   Sequence overlapping tasks through dependencies before shared-file writes.
4. Codex2 reviews the source mapping and full render coverage. Only explicit
   user/product approval may reduce acceptance; no reduction is proposed here.

These follow-ups belong to the existing SR-ENV-COPY-001 task and are recorded
through its canonical progress command; no unregistered implementation task is
being declared. Q-SR-ENV-COPY-001 remains open until source mapping and scope
authorization are recorded, or a reviewed prerequisite supplies integration.

## Concrete parent next step and validation gate

Parent can proceed with read-only source/render inventory, authorized catalog
cleanup and scoped resolver regression work after recovery routing. It must
not edit the unlisted shell/config paths or hand off full acceptance solely
because a standalone resolver passes. Before parent handoff, integrate all
affected render sites under authorized scopes and verify explicit production,
development/fixture, missing/invalid environment and unknown data health in
both locales. Record current base/candidate SHAs, scoped regression results,
all six required app typechecks and actual browser/live coverage in parent UAT.

Helper validation is documentation-only: source inspection above, parent/task
CLI slices, and `git diff --check` (exit 0). No app tests, browser, live/device,
recovery implementation or deployment were performed. Helper candidate SHA,
ordinary push and PR evidence are recorded in its handoff and PR metadata.
