# Execution Next-Wave Task Board

## Purpose

This board reflects the current supervisor-managed execution wave materialized from
`docs/03-runbooks/master-system-closeout-checklist.md`.

It is the practical bridge between:

- the broader system-closeout blueprint
- the current `ai-status.json` execution backlog
- the one remaining external auth blocker

## 1. Execution-Ready Now

These tasks are now materialized in shared truth and can be dispatched by supervisor
execution mode.

1. `MSC-R1-001`
   - status: `backlog`
   - owner / reviewer: `Codex2` / `Claude`
   - objective: close the remaining staging-evidence narrative drift, confirm the resolved `FBP-013A` credential blocker state, and produce the rollout-evidence closeout packet

2. `MSC-T1-001`
   - status: `backlog`
   - owner / reviewer: `Codex` / `Claude`
   - objective: verify the `tenant-commute-hub` contract, authority boundary, and retired shell assumptions

3. `MSC-P1-001`
   - status: `backlog`
   - owner / reviewer: `Claude` / `Codex`
   - objective: produce an explicit decision packet for Passenger / Call Point / Concierge / complaint-entry completion scope

4. `MSC-F1-001`
   - status: `backlog`
   - owner / reviewer: `Codex2` / `Claude`
   - objective: audit finance / reporting / filing completeness against the PRD and actual operator workflow

## 2. Dependency-Gated Execution

These tasks are real and materialized, but they should wait for prerequisite closeout work.

1. `MSC-I1-001`
   - status: `backlog`
   - owner / reviewer: `Gemini` / `Codex`
   - depends on: `MSC-T1-001`, `MSC-F1-001`
   - objective: verify cross-surface workflow integrity and remaining operational hardening gaps

2. `MSC-N1-001`
   - status: `backlog`
   - owner / reviewer: `Codex` / `Claude`
   - depends on: `MSC-R1-001`, `MSC-T1-001`, `MSC-P1-001`, `MSC-F1-001`, `MSC-I1-001`, `GAP-P2S3-001`
   - objective: align `ai-status.json`, `current-work.md`, evidence packets, and control-plane views to one final closeout story

## 3. Visible But Blocked

1. `GAP-P2S3-001`
   - status: `blocked`
   - owner: `Gemini`
   - objective: Cloud IAP / OIDC JWT production, replacing bootstrap-header trust
   - blocker: manual GCP / Cloud IAP / IAM / secret setup still required before repo execution can proceed
   - unblock path: `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`

## 4. Dispatch Rule Right Now

If supervisor execution mode keeps running, the intended behavior is:

1. dispatch the four execution-ready `MSC-*` tasks
2. keep `MSC-I1-001` and `MSC-N1-001` dependency-gated until prerequisites clear
3. keep `GAP-P2S3-001` visible but blocked
4. use `docs/03-runbooks/master-system-closeout-checklist.md` as the planning anchor for any new closeout work

## 5. Current Interpretation

- The switchboard follow-up wave is already closed.
- A new closeout wave is now materialized for rollout evidence, tenant boundary, product-surface decision, and finance/reporting completeness.
- The final “all-clear” narrative cannot close until `GAP-P2S3-001` is unblocked.
