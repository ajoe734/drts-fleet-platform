# SR-QA-WEBHOOK-001 planning decision routing

Date: 2026-09-08. Owner: Codex. Reviewer: Codex2.
Parent: `SR-QA-WEBHOOK-001` (Codex / Gemini).
Disposition: existing isolation contract confirmed; scope authorization and
transport deadline decision routed to Supervisor/Claude. Parent remains blocked.

## Evidence and contract

- Planning baseline after fetch/rebase: `fa0fd8257950764526a522d091be9d97effa82b9`.
- Canonical task slices report `SR-UAT-HARNESS-001` merged at
  `1106728a6b5313a552757f745ec96c2be77a29e2`; the harness is not the current blocker.
- Parent evidence commit `92fa573c4`, reproduction commit
  `6b9de8287abb48e5770524c3addf5e5e41f8f663`, base
  `e2df37f821ce76d8a3639ceaac6d253299c0a31c`: a real tenant JWT plus another
  tenant's `x-tenant-id` returned 200 with victim key metadata in the narrow
  Nest/PG harness. This is historical reproduction evidence, not a new test on
  this planning candidate or proof of the full deployed AppModule behavior.
- [PRD §9.1.2](../../../phase1_prd_detailed_v1.md) restricts sensitive API/webhook
  management; [SA §11.1](../../../phase1_system_analysis_v1.md) requires domain
  isolation; [service contracts §3.2](../../../phase1_service_contracts_v1.md)
  assigns tenant credentials and role mapping to Tenant & Partner Service.
- [Execution scenarios SC-045](../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md)
  forbid cross-tenant exposure (own-tenant data or 403). The registered repair
  requires 403 for a mismatched management request. This does not invent a
  universal 403 requirement for every tenant API.

## Scope and routing decision

1. Keep `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING` as the existing P0 implementation
   follow-up; do not create a duplicate or waive C111. Its machine truth currently
   has empty `write_scopes`, no dependencies, and `waiting_for: Claude`.
2. Supervisor/Claude must inspect active IAM/tenant ownership, authorize the
   minimal repair scope and serialize shared auth changes. Suggested inspection
   targets are `apps/api/src/common/auth/internal-key.middleware.ts`,
   `bootstrap-auth.guard.ts` in the same directory, and
   `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`.
   These are proposed targets, not a grant to edit all three. Add dedicated
   regression paths and any necessary module wiring only after the actual
   full-AppModule path is confirmed. Record concrete IAM/tenant dependencies
   through canonical task commands; do not guess dependency IDs.
3. Supervisor must add the existing repair as a dependency of the parent while
   retaining `SR-UAT-HARNESS-001`. The repair owner then reproduces on current
   dev using full AppModule, verifies cross-tenant GET/issue/rotate/revoke reject
   with no DB mutation or exposure, and verifies the same-tenant lifecycle.
   If current dev already fixes this, deliver current-SHA regression evidence.
4. After repair review/CI/merge, parent owner reruns
   `bash tests/unit/system-remediation/sr-qa-webhook-001/run-auth-http.sh` and
   `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001`
   on a baseline containing the repair. Record SHA, exits, resource IDs and SQL
   readback. Keep the remaining capability gates open.

## Remaining contract and environment follow-ups

- C112: [governance runbook](../../../docs/03-runbooks/tenant-api-webhook-governance-runbook.md)
  specifies retry/backoff but no per-attempt transport deadline. At the planning
  baseline `WebhookDispatchService.dispatchAttempt` uses default fetch without
  an AbortSignal. Supervisor/Claude must route a reviewed contract specifying
  deadline value, configuration bounds, whether response-body time is included,
  abort/retry persistence behavior, and restart handling. An implementation
  follow-up must be registered and scoped before product changes. No default
  number is accepted here; injected 100ms timeout proves only the test transport.
- C111 usage: identify the authoritative tenant API-key consumer and persisted
  usage readback; partner credential activity is not substitute evidence.
- C113 ERP/SSO/bank sandbox, C114 real provider and C115 deployed scheduler,
  backlog/restart and alert receipt evidence remain with the parent. Supervisor
  coordinates environment access/owners through the existing parent; local
  fixtures do not close these requirements.
- No acceptance scope cut. If governance proposes deferral, obtain explicit
  product acceptance and update canonical planning/task acceptance first.

## Delivery and validation

This task changes planning only; no UI or product implementation is changed.
The canonical open question `Q-SR-QA-WEBHOOK-001` tracks these unresolved routes.
The parent machine-truth next step must point here and remain blocked pending
scope/contract decisions. This helper may enter review for routing delivery;
that does not certify the parent as unblocked or accepted.

Validation: source/task-slice review and `git diff --check`; no runtime tests
rerun for this documentation change. Commit/push/PR and the exact candidate SHA
are recorded in the helper handoff, avoiding self-referential commit hashes.
