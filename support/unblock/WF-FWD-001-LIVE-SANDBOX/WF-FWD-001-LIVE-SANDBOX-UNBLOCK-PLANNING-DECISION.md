# WF-FWD-001-LIVE-SANDBOX — Unblock Planning Decision

Last updated: 2026-05-19
Owner: Codex2
Reviewer: Codex
Parent task: `WF-FWD-001-LIVE-SANDBOX`
Unblock task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION`
Kind: `planning_decision`

## Decision

`WF-FWD-001-LIVE-SANDBOX` is not blocked on new repo-local product semantics.
It is blocked on external forwarder partner authority and live sandbox inputs.

The canonical routing decision is:

1. `FWD-SPEC-001` remains the v3 documentation-wave task that formalizes the
   repo-local `forwarder_sandbox` harness and the proof boundary around it.
2. `WF-FWD-001-LIVE-SANDBOX` remains `blocked` / external-gated until the
   external owner supplies the concrete partner contract authority plus the
   `EXT-002` blocker inputs.
3. `forwarder_sandbox` evidence must not be restated as live Grab Taiwan or
   other partner proof.

## Why this resolves the blocker

The planning gap was that the parent task named "Grab Taiwan or equivalent"
without recording whether v3 needed a live-partner choice before the
documentation wave could continue.

Canonical sources already converge on the answer:

- `docs/02-architecture/forwarder-sandbox-provider.md` says
  `forwarder_sandbox` is a non-production harness and "must never be presented
  as production evidence."
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` keeps
  `WF-FWD-001` at `EXTERNAL-GATED`.
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` names the
  concrete live-proof blockers: contract authority, credentials, signature,
  live seed, callback lifecycle, lost-race proof, and no-owned-assignment
  evidence.
- `docs/02-architecture/system-design-input-requests-20260422.md` classifies
  Grab Taiwan real adapter integration as an execution-input problem, not a
  system-design ambiguity.
- `docs/03-runbooks/phase1-productization-execution-packet-20260428.md` says
  not to implement the real Grab Taiwan adapter until the partner contract and
  credentials exist.

So the missing planning decision is resolved by routing the parent back to the
existing external gate instead of inventing a new product contract in-repo.

## Canonical planning change recorded

`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
now explicitly states:

- `FWD-SPEC-001` is sandbox-boundary formalization only.
- `WF-FWD-001-LIVE-SANDBOX` still requires the `EXT-002` live-partner inputs.
- The v3 docs wave may proceed without naming the final live partner, while the
  parent task stays blocked pending the external owner.

## Parent next step

Keep `WF-FWD-001-LIVE-SANDBOX` out of live-evidence execution until both the
repo-local and external prerequisites are satisfied:

1. Finish `FWD-SPEC-001` so the canonical forwarder proof spec records the
   sandbox boundary and non-claim language in repo truth.
2. Keep `WF-FWD-001-LIVE-SANDBOX` blocked on the external owner path:
   confirm the concrete live partner contract authority for the forwarder proof
   run and supply `EXT-002-BLK-001` to `EXT-002-BLK-007`.
3. Only then resume the parent task to collect the live sandbox evidence pack.

## Delivery evidence

- Anchor commit: `271b458` — `wip(WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION): anchor planning routing`
- Evidence clarification commit: `ecc0482` — `docs(WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION): clarify next step and evidence`
- Push remote/branch: `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision`
- PR: `#166` — <https://github.com/ajoe734/drts-fleet-platform/pull/166>

## Scope cut

Out of scope for this unblock:

- changing L1 product truth
- claiming `forwarder_sandbox` as live partner proof
- implementing a real partner adapter without the external contract and
  credentials
- closing `WF-FWD-001-LIVE-SANDBOX` from repo-local evidence alone
