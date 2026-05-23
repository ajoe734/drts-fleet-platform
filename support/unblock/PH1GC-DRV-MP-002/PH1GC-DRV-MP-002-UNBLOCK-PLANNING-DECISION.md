# PH1GC-DRV-MP-002 Planning Decision Unblock

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-PLANNING-DECISION`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Claude`
- Reviewer: `Codex`
- Decision date: `2026-05-22`
- Sibling unblock already closed: `PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK`
  (commit `6de297ffd51ed1072522432b43a93979c5b2d61d`,
  push `origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock`).

## Question Routed Here

The chairman triage created this helper because `PH1GC-DRV-MP-002` carries an
unanswered product/contract question that the parent task itself cannot
resolve:

> Given that the parent's required device-evidence packet cannot be produced
> from inside the workspace, is the canonical directive §C DRV-MP-002
> requirement (a) scope-cut for this Phase 1 gap-closure wave, or (b) kept
> in scope as explicit external follow-up?

## Canonical Sources Consulted

Citing higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2.

1. Directive § C `DRV-MP-002` —
   `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
   (mandates the 11 Android/iOS evidence items and a `PASS (sandbox +
   device evidence)` gate read).
2. Implementation spec — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
   `## DRV-MP-002 — Mobile Device Evidence Packet` (§ lines 463–489).
   The spec lists the same 11 items as a closed set and supplies no synthetic
   or fixture-based substitute.
3. Status truth — `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`
   §2 row for `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` (`MISSING`)
   and §4 row #9 listing the parent dependency as `external device access`.
4. Wave-planning runbook —
   `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
   classifies the device evidence as held on physical Android + iPhone
   hardware, an Expo/EAS account, an Apple team / TestFlight signing path,
   a weak-network environment, and human-in-loop execution.
5. Sibling artifact —
   `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
   established the accepted HOLD posture for `WF-DRV-MP-001-DEVICE-EVIDENCE`
   (`done` with a provisional hold report and a documented resume gate).
6. Parent acceptance — `PH1GC-DRV-MP-002` row in `ai-status.json` already
   says: "If sandbox device access is blocked, brief status remains
   `blocked_external` with the missing dependency surfaced — do NOT mark
   done." This is the parent's own self-route to follow-up.
7. Sibling unblock —
   `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`
   confirmed the blocker is external provisioning, not code.
8. Open questions — `PHASE1_OPEN_QUESTIONS.md` carries no Q-row about
   scope-cutting `DRV-MP-002`, so no prior open product question authorizes
   a descope.

## Decision

**Option (b) — explicit external follow-up. No scope cut.**

Rationale, anchored in the precedence chain above:

- The directive § C item and its 11 evidence rows are L2 product truth.
  Per `AI_COLLABORATION_GUIDE.md` §2, a scope cut at this layer requires
  either a higher-precedence (PRD / system analysis / service-contract)
  override or an explicit human authorization recorded in
  `PHASE1_DECISION_LEDGER.md`. Neither exists today.
- The parent task's own machine-truth acceptance row already routes the
  outcome to `blocked_external` rather than `done` whenever the external
  dependency is unavailable. That is the codified planning answer; this
  helper formalizes it as a decision rather than an interim state.
- A scope cut would also retroactively invalidate the
  `WF-DRV-MP-001-DEVICE-EVIDENCE` HOLD posture, because the matrix uplift
  to `PASS (sandbox + device evidence)` is the *gate-read consumer* of the
  parent's output. Holding the gate while removing its source would create
  a documented contradiction, which `0.5 Machine Truth Discipline` forbids.
- No synthetic substitute is feasible. Every one of the 11 items requires a
  real device or real signing credential. Simulator captures, fixture
  videos, and screenshots produced inside the worktree would not satisfy
  the directive's intent or the matrix gate read.

Therefore the parent remains in scope, in directive-aligned form, with the
work routed as explicit follow-up gated on external prerequisites.

## What This Decision Changes

Machine truth:

- `PH1GC-DRV-MP-002` keeps `status: blocked` until the named external
  prerequisites land. No descope, no silent close.
- Parent `next:` is reaffirmed; this artifact is added to the parent's
  evidence trail as the recorded planning decision.
- No change to `PHASE1_OPEN_QUESTIONS.md` (no new Q-row is needed because
  the decision routes through existing acceptance rather than introducing
  an unresolved product question).
- No change to `PHASE1_DECISION_LEDGER.md` (a decision-ledger entry would
  be added only if a future scope cut or override actually happens; this
  artifact records a *no-change* outcome that simply ratifies the directive
  and the parent's own acceptance).

Process:

- The supervisor should not auto-route `PH1GC-DRV-MP-002` to any other
  worker for repo-local completion. Any further unblock helper that
  attempts repo-local work should be rejected; the only valid resume path
  is external provisioning followed by the captured Resume Sequence.

## Concrete Unblocked Next Step For The Parent

To be reflected in `PH1GC-DRV-MP-002.next`:

1. Wait for the external device-lab provisioning bundle:
   - physical Android device and iPhone device
   - Expo/EAS build profile access
   - Apple team / TestFlight signing access
   - weak-network test environment
   - human-in-loop operator authorized to capture masked artifacts
2. Confirm `PH1GC-DRV-MP-001` (E2E-006 seed/gate hardening) is still
   merged into the evidence branch so the contract being proven is the
   active baseline.
3. Create `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` and populate
   all 11 directive § C evidence items, applying PII masking to every
   driver-name and phone reference.
4. Update `WF-DRV-MP-001` gate read from
   `PASS (sandbox only)` to `PASS (sandbox + device evidence)` and uplift
   the matrix row.
5. Closeout per directive §7 format.

## Disposition

- **Decision recorded**: option (b), explicit external follow-up, no scope
  cut.
- **Routing**: parent stays `blocked` against external device-lab
  provisioning. This artifact is the canonical planning-decision record
  for that posture.
- **No further repo-local unblock helpers should be spawned** for
  `PH1GC-DRV-MP-002` until the external bundle lands.
