# Referral Embed Release Evidence Recovery — Execution Tasks

Date: 2026-08-02

## Objective

Repair the false closeout of `REL-REF-EMBED-001`, harden the supervisor state
machine so a deployment-required task cannot bypass its acceptance contract,
then perform and independently verify the real Referral Embed dev deployment.

This packet is execution authority for supervisor-managed auto workers. Do not
spawn conversational subagents for this work.

## Incident truth

`REL-REF-EMBED-001` required `INTEGRATION_STATUS=dev_deployed` with PR, CI,
merge, Deploy-Dev and live verification evidence. It was nevertheless closed
at 2026-08-01T20:53:37Z with `INTEGRATION_STATUS=not_applicable`.

The committed sidecar asserted that URLs were active and verified, but it did
not contain a deployment run URL, deployed SHA, timestamped HTTP evidence or an
authorized/unauthorized iframe transcript. The owner log also reported two
PostgreSQL integration suites as failed while the sidecar labelled the task
`PASS`. Preserve this history; do not rewrite or delete it. This packet and the
new tasks supersede that closeout claim.

## Evidence rules

- A prose claim or sidecar self-assertion is not deployment evidence.
- `not_applicable` is forbidden for a task whose
  `required_integration_status` is `dev_deployed`.
- A deployment closeout must record the PR URL, successful required CI run,
  merge commit, successful Deploy-Dev run URL, deployed SHA and timestamped
  live verification results in machine truth.
- The deployed SHA must be the reviewed tree or a documented descendant that
  contains it, and must be reachable from `origin/dev`.
- Live checks must identify the command/request, UTC timestamp, URL, expected
  result, actual HTTP status, security headers and a body hash or screenshot.
- Local build, typecheck, unit tests and Playwright mocks do not substitute for
  deployment or live checks.
- `partner-booking-web` and `concierge-portal-web` remain paused. This recovery
  must not deploy or restart them.

## Execution graph

### ORCH-REL-GATE-002 — Enforce acceptance-driven integration closeout

Owner: Codex2  
Reviewer: Codex  
Dependencies: none

Implement an explicit task-level `required_integration_status` and required
evidence contract in the machine-truth lifecycle.

Acceptance:

1. `done` rejects `not_applicable`, `merged_to_dev` and other weaker statuses
   when the task requires `dev_deployed`.
2. `dev_deployed` requires PR, CI, merge, deploy-run, deploy-SHA and live
   verification evidence configured by the task.
3. Git merge reconciliation cannot auto-close a deployment-required task just
   because a Task-ID commit reached `origin/dev`.
4. Sidecar/support-only tasks can still use `not_applicable` when explicitly
   classified as non-canonical and no stronger status is required.
5. Regression tests reproduce the `REL-REF-EMBED-001` bypass and prove it is
   rejected.
6. The change is reviewed, merged to `dev`, and recorded as
   `INTEGRATION_STATUS=merged_to_dev` before the deployment recovery is ready.

### REL-REF-EMBED-002 — Perform the real Referral Embed dev release

Owner: Codex  
Reviewer: Codex2  
Dependencies: `ORCH-REL-GATE-002`

Use the current reviewed `origin/dev` tree, including PR #1247 and PR #1249.
Run the required CI, merge any release-only correction through a PR, trigger
Deploy-Dev once, and wait for the exact deployment result.

Acceptance:

1. Required PR/CI evidence is successful and recorded.
2. A successful Deploy-Dev run identifies the deployed SHA.
3. `https://refer.smarttransport.tw/embed/yuhe-residence` and the intended
   Cloud Run service are checked after that deployment.
4. Authorized session-driven entry works; missing, replayed and cross-entry
   handoffs fail closed; CSP/frame-ancestors is correct.
5. The runtime matches the canonical Passenger Embed HTML/JSX rather than a
   chat screenshot or newly invented design.
6. Partner Booking and Concierge remain stopped.
7. Machine truth closes only with `INTEGRATION_STATUS=dev_deployed` and all
   required evidence fields.

### AUDIT-REF-LIVE-002 — Independent live evidence audit

Owner: Codex2  
Reviewer: Codex  
Dependencies: `REL-REF-EMBED-002`

Independently verify the deployment evidence and live behavior without trusting
the release sidecar's conclusions.

Acceptance:

1. Deploy run conclusion, deployed SHA and `origin/dev` ancestry agree.
2. Timestamped formal-domain and Cloud Run HTTP evidence is reproducible.
3. Authorized and denial-path behavior is independently observed.
4. Paused services remain down.
5. Any mismatch reopens or blocks the release claim; only a clean independent
   audit may close this support-only task as `not_applicable`.

## Completion definition

The recovery is complete only when all three tasks are `done`,
`REL-REF-EMBED-002.integration_status` is exactly `dev_deployed`, its machine
truth contains the required evidence, and `AUDIT-REF-LIVE-002` independently
confirms that evidence.
