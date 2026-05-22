# PH1GC-FWD-001 — Unblock Planning Decision

Last updated: 2026-05-22
Owner: Claude
Reviewer: Codex2
Parent task: `PH1GC-FWD-001`
Unblock task: `PH1GC-FWD-001-UNBLOCK-PLANNING-DECISION`
Kind: `planning_decision`

## Decision

`PH1GC-FWD-001` does not require a new product or contract decision.
The Phase 1 v3 gap-closure spec and the canonical workflow gates already name
both acceptance paths and already record the routing for forwarder sandbox
proof. The chairman-dispatched planning ambiguity is resolved by applying the
existing canonical routing.

The routing decision is:

1. `PH1GC-FWD-001` remains `blocked` on the same external gate that already
   gates `WF-FWD-001-LIVE-SANDBOX` and the `EXT-002` adapter sidecar.
2. The sandbox uplift path (Path A in the parent acceptance) requires the
   external owner to supply `EXT-002-BLK-001` through `EXT-002-BLK-007`:
   approved partner contract authority, reachable staging endpoint, a
   non-interactive credential path, signed webhook/replay samples, and at
   least one seeded forwarded-task flow.
3. The repo-local fallback path (Path B in the parent acceptance and the
   `FWD-001` spec section) does **not** unblock `PH1GC-FWD-001` on its own.
   Repo-local mock evidence can only satisfy the parent acceptance if the
   `support/sidecars/FWD-LIVE-001/` README states
   `classification = repo-local` explicitly and `WF-FWD-001` keeps gate read
   `PASS (repo-local)` / `EXTERNAL-GATED`. No purely-local fixture may be
   relabelled as sandbox proof.
4. The chairman's existing routing for `WF-FWD-001-LIVE-SANDBOX` carries
   forward: real partner sandbox uplift continues to be tracked through that
   task and through `EXT-002`. `PH1GC-FWD-001` does not duplicate that work
   and does not unilaterally close it.

## Why this resolves the blocker

The "missing product/contract decision" the chairman-blocked-task-triage
helper flagged for `PH1GC-FWD-001` is already resolved in canonical planning.
Three canonical sources converge on the same answer:

- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
  section `FWD-001` and section `MATRIX-001` item 8 say `WF-FWD-001` stays
  `EXTERNAL-GATED` until sandbox evidence lands, and that "若只有 internal
  mock，gate read 必須維持 `PASS (repo-local)`，不可宣稱 sandbox".
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` keeps
  `WF-FWD-001` at `EXTERNAL-GATED`.
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` keeps
  `EXT-002-BLK-001` through `EXT-002-BLK-007` open and names the concrete
  partner-side inputs that must arrive before sandbox uplift is possible.

The sibling planning decision `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION`
(closed `done` on 2026-05-19 with commit `c215f93` on
`origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision`) already
routed the live-sandbox parent the same way:

- `forwarder_sandbox` is a non-production harness and must never be presented
  as production proof.
- The parent stays blocked pending the external owner and `EXT-002` inputs.
- The v3 docs wave may proceed without inventing a new in-repo product
  contract for a live partner.

The `PH1GC-FWD-001-UNBLOCK-MANUAL-UNBLOCK` packet (closed `done` on
2026-05-22 with commit `4944acc9` on
`origin/codex2/ph1gc-fwd-001-unblock-manual-unblock`) confirmed the
environment boundary: `gcloud auth print-identity-token` needs interactive
re-auth, the older Cloud Run host returns 404 on health probes, and
`api-staging.drts.internal` is not resolvable. No repo-only change can
legitimately collect §D items 3 through 11 as sandbox evidence right now.

Therefore the routing decision is to keep `PH1GC-FWD-001` `blocked` on the
external owner path, citing the already-recorded canonical sources, rather
than inventing a new product contract in-repo or relabelling local fixtures
as sandbox proof.

## Canonical planning artifacts cited

This packet is the canonical planning artifact recording the routing for
`PH1GC-FWD-001`. It cites — without re-litigating — the following existing
canonical sources:

- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
  (`FWD-001` and `MATRIX-001`)
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (`WF-FWD-001`
  row)
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
  (`EXT-002-BLK-001`..`EXT-002-BLK-007`)
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
  (current partial repo-local field report)
- `support/unblock/PH1GC-FWD-001/PH1GC-FWD-001-UNBLOCK-MANUAL-UNBLOCK.md`
  (environment-boundary diagnosis)
- `support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION.md`
  (sibling routing decision, commit `c215f93`)

No L1 product truth (PRD / SA / service contracts / migration plan) is changed
by this packet. No new product semantics are introduced. No release-gate row
is uplifted.

## Parent next step

`PH1GC-FWD-001` should remain `blocked`, `waiting_for: Codex` (or be
re-routed to `Gemini2` if the supervisor wants an infra/external-ops lane to
own the follow-up coordination, per the manual-unblock recommendation), with
this exact next step:

> Wait for the forwarder integration owners to provide approved API contract
> authority, a reachable staging endpoint, a non-interactive credential path,
> signed webhook/replay-proof samples, and at least one seeded forwarded-task
> flow so `FWD-LIVE-001` can collect and verify `EXT-002-BLK-001` through
> `EXT-002-BLK-007` evidence without over-claiming `WF-FWD-001`.

When those external prerequisites arrive, the owner should:

1. Collect the 11 §D proof items into `support/sidecars/FWD-LIVE-001/` with
   `classification = sandbox` and masked credential references.
2. Uplift `WF-FWD-001` in
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` from
   `EXTERNAL-GATED` to `PASS (sandbox evidence)`.
3. Resolve `EXT-002-BLK-001`..`EXT-002-BLK-007` against the same evidence.

Until those arrive, the existing repo-local field report at
`support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` is the correct
state of the world and must not be relabelled as sandbox proof.

## Scope cut

Out of scope for this unblock:

- changing L1 product truth (PRD / SA / service contracts / migration plan)
- claiming `forwarder_sandbox` or any repo-local mock as live partner proof
- uplifting `WF-FWD-001` to `PASS (sandbox evidence)` without external inputs
- closing `PH1GC-FWD-001` from repo-local evidence alone
- duplicating the live-sandbox uplift work that `WF-FWD-001-LIVE-SANDBOX`
  already tracks
- editing the canonical gap-closure spec or release-gate matrix; both already
  encode the correct routing

## Non-claim

This packet does **not** claim:

- that `WF-FWD-001` passed
- that `PH1GC-FWD-001` is repo-locally finishable
- that a new sandbox attempt succeeded
- that a new product or contract decision was needed or was made

## Delivery evidence

Closeout commit / push / branch metadata will be appended to this packet by
the closeout commit once `ai-status.sh handoff` is recorded, matching the
pattern used by `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION`.
