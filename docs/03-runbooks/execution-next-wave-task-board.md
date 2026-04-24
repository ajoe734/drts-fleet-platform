# Execution Next-Wave Task Board

## Purpose

This board reflects the current supervisor-managed execution board after the
system closeout wave and the newly materialized post-closeout hardening /
parity / evidence wave.

It is the practical bridge between:

- the broader system-closeout blueprint
- the current `ai-status.json` execution backlog
- the one remaining external auth blocker
- the repo-executable next-wave backlog now opened from
  `docs/03-runbooks/execution-mode-candidate-backlog.md`

## Decision Anchors

- `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`

## 1. Execution-Ready Now

These tasks were materialized and are now effectively closed.

1. `MSC-R1-001`
   - status: `done`
   - owner / reviewer: `Codex2` / `Claude`
   - objective: close the remaining staging-evidence narrative drift, confirm the resolved `FBP-013A` credential blocker state, and produce the rollout-evidence closeout packet

2. `MSC-T1-001`
   - status: `done`
   - owner / reviewer: `Codex` / `Claude`
   - objective: verify the `tenant-commute-hub` contract, authority boundary, and retired shell assumptions

3. `MSC-P1-001`
   - status: `done`
   - owner / reviewer: `Claude` / `Codex`
   - objective: produce an explicit decision packet for Passenger / Call Point / Concierge / complaint-entry completion scope

4. `MSC-F1-001`
   - status: `done`
   - owner / reviewer: `Codex2` / `Claude`
   - objective: audit finance / reporting / filing completeness against the PRD and actual operator workflow

## 2. Dependency-Gated Execution

These tasks were real and materialized; only one remains open now.

1. `MSC-I1-001`
   - status: `done`
   - owner / reviewer: `Gemini` / `Codex`
   - depends on: `MSC-T1-001`, `MSC-F1-001`
   - objective: verify cross-surface workflow integrity and remaining operational hardening gaps

2. `MSC-N1-001`
   - status: `done`
   - owner / reviewer: `Codex` / `Claude`
   - depends on: `MSC-R1-001`, `MSC-T1-001`, `MSC-P1-001`, `MSC-F1-001`, `MSC-I1-001`, `GAP-P2S3-001`
   - objective: align `ai-status.json`, `current-work.md`, evidence packets, and control-plane views to one final closeout story

## 3. Visible But Blocked

1. `GAP-P2S3-001`
   - status: `blocked`
   - owner: `Gemini`
   - objective: Cloud IAP / OIDC JWT production for the staged internal control-plane cutover, replacing bootstrap-header trust
   - blocker: manual GCP / Cloud IAP / IAM / secret setup still required before repo execution can proceed
   - unblock path: `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`

## 4. Dispatch Rule Right Now

If supervisor execution mode keeps running, the intended behavior is:

1. keep `GAP-P2S3-001` visible but blocked as the only active product-critical blocker
2. allow the post-closeout execution slices to proceed in parallel where their dependency graph permits
3. use `docs/03-runbooks/master-system-closeout-checklist.md` plus `docs/03-runbooks/execution-mode-candidate-backlog.md` as the planning anchors
4. avoid reopening product-surface scope that is intentionally out of strategy or externally gated

## 5. Current Interpretation

- The switchboard follow-up wave is already closed.
- The substantive closeout wave (`MSC-R1-001`, `MSC-T1-001`, `MSC-P1-001`, `MSC-F1-001`, `MSC-I1-001`) and the final narrative sync (`MSC-N1-001`) are done.
- A fresh repo-only execution wave is now open for hardening, workflow parity, and evidence expansion.
- The final “all-clear” narrative still cannot close until `GAP-P2S3-001` is unblocked.

## 6. Materialized Post-Closeout Wave

On `2026-04-22`, the repo-executable candidates were materialized into
`ai-status.json` so the supervisor and auto workers could start execution.

Current active families:

1. `EMC-H1-001` through `EMC-H1-004`
   - persistence and source-of-truth hardening
2. `EMC-H2-001`
   - driver-task runtime bus externalization
3. `EMC-W1-001` through `EMC-W1-003`
   - workflow parity and authority hardening
4. `EMC-I1-001` and `EMC-I1-002`
   - evidence expansion and repo-controlled automation

Execution notes:

1. `EMC-X1-001` remains partner-gated, while `EMC-X1-002` is now materially closed as code work: `ajoe734/tenant-commute-hub#1` and `#3` plus `ajoe734/drts-fleet-platform#1` and `#12` are merged, local live smoke passed through the landing branch plus local `drts-api`, and the former tenant identity-hardening remainder is no longer a remote-main code gap; only docs/evidence sync remains if the team wants a fresh post-merge annex packet
2. first-party Passenger App / Web and passenger-surface receipt UI remain intentionally out of scope
3. `GAP-P2S3-001` stays visible as the only product-critical blocker even while this wave runs
4. staged identity-cutover planning now assumes internal control-plane callers move first; tenant, driver, adapter, and webhook flows are not default IAP targets

## 7. Backlog Source

For the detailed rationale, ordering, and non-materialized remainder, use
`docs/03-runbooks/execution-mode-candidate-backlog.md`.
