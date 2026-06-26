# P2-UI-SAFE-001 Unblock Planning Decision

## Scope

- Task: `P2-UI-SAFE-001-UNBLOCK-PLANNING-DECISION`
- Parent: `P2-UI-SAFE-001`
- Owner: `Codex`
- Reviewer: `Claude2`
- Decision date: `2026-06-26`

## Diagnosis

The previous unblock note and screen-requirements note were reopened because
they rested on a false "canvas absent" premise and then used that premise to
lock the takeover-time behavior to a submit-only interpretation that conflicts
with the actual design authority.

The corrected diagnosis is:

1. The canonical Safety Operator canvas already exists upstream at
   `origin/phase2-tesla-sandbox-docs-20260625@67113d786` as
   `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx`. It includes
   `SOFrame`, `SOModeBar`, `SOSyncStrip`, and a dedicated
   `SO_TakeoverReport` screen.
2. `SO_TakeoverReport` explicitly requires three capture-time concepts:
   editable takeover time, separately displayed original system time, and an
   edit audit preserved when the time is corrected.
3. The current backend/API contract still exposes only one submitted
   `occurredAt` plus `serverReceivedAt`, and duplicate replay keeps the first
   accepted report immutable.

The real planning question is therefore not "is design missing?" but:

- how `P2-UI-SAFE-001` should preserve the canvas-required original system time
  and edit audit while still using the current single-`occurredAt` backend
  contract
- whether any part of that data must become a future contract/backend follow-up
  rather than a local draft-only behavior
- how the parent blocker should be reframed now that the design exists upstream
  but is not yet published to `dev`

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `phase1_prd_detailed_v1.md` §15.3, §16.2
2. `phase1_system_analysis_v1.md` §3.2, §14.2
3. `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` §3.5
4. `apps/api/src/modules/safety-operator/safety-operator.service.ts`
5. `apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`
6. `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx`
   at `origin/phase2-tesla-sandbox-docs-20260625@67113d786`
7. `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`
8. `packages/ui-tokens/src/realms.ts`
9. `apps/driver-app/app/_layout.tsx`

## Decision

`P2-UI-SAFE-001` is unblocked on the missing product/contract interpretation by
**routing the takeover-time behavior into two layers instead of collapsing it to
a single submit-only UI field**.

Concretely:

1. The upstream canvas is the binding UI authority. The parent must preserve
   the capture semantics shown in `SO_TakeoverReport`: an editable displayed
   takeover time, a separately visible original system-captured time, and a
   correction audit during draft entry.
2. The existing backend submit surface remains
   `SubmitSafetyOperatorTakeoverReportCommand`, which carries a single
   persisted `occurredAt` field. No current API shape returns an original
   system time or correction-history payload for a synced report.
3. Therefore, `P2-UI-SAFE-001` should preserve original system time and
   pre-submit correction audit in local draft / offline-queue state, then send
   only the final corrected `occurredAt` through the current submit contract.
4. After first acceptance for a `clientGeneratedReportId`, the takeover report
   remains immutable for this wave. Duplicate offline replay still returns the
   original record and receipt and must not overwrite `occurredAt` or other
   submitted payload fields.
5. No immediate backend contract change is required for the parent to implement
   the canvas capture flow on-device. However, the current contract does **not**
   support cross-device or post-submit readback of original system time or
   correction history.
6. If product later wants original-system-time or correction-audit data to
   survive submission and appear in synced/read surfaces, that is a separate
   contracts/backend follow-up. It is not solved by the current `P2-SAFE-001`
   runtime alone.
7. The parent blocker is no longer "missing safety-operator canvas". The real
   blocker is publication / integration of the already-authored
   `driver-safety-operator.jsx` canvas wave into `dev`, plus any resulting
   implementation work on the parent branch.

## Scope Cut And Routing

Out of scope for `P2-UI-SAFE-001` unless separately assigned:

1. Post-submit mutation of an accepted takeover report.
2. Server-persisted original-vs-corrected takeover timestamps or a queryable
   correction-history read model.
3. Engineer-invented safety-operator palette / shell decisions outside the
   canonical canvas.
4. Pretending the parent is blocked on "missing design" after
   `driver-safety-operator.jsx` has already landed upstream.

If product later wants original-system-time or explicit correction-history data
to survive submission and round-trip through synced report reads, that must be
a new backend/contracts follow-up before the driver app claims support for it.

## What Changed In Canonical Planning

Added `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`
on the earlier pass; on this reopened pass, that note is corrected to record:

- that the canonical Safety Operator canvas already exists upstream at
  `67113d786` and the blocker is publication / integration to `dev`
- that the takeover-report flow must preserve original system time and
  correction audit in local draft state even though the synced backend contract
  still persists only a single `occurredAt`
- that any requirement for synced readback of original-system-time or
  correction-history data must become a separate contracts/backend follow-up

## Parent Unblocked Next Step

`P2-UI-SAFE-001` should remain blocked on canvas publication / integration to
`dev`, but it no longer needs the incorrect "submit-only UI" ruling.

Once `driver-safety-operator.jsx` from `67113d786` is published or replayed
onto `dev`:

1. resume the parent on `codex/p2-ui-safe-001`
2. rebase it onto `dev`
3. implement the Safety Operator screens and shell against the published canvas,
   including `SOFrame`, `SOModeBar`, `SOSyncStrip`, and the dedicated
   `SO_TakeoverReport` capture flow
4. preserve original system-captured takeover time plus correction audit in the
   local draft / offline queue until first acceptance
5. submit only the final corrected `occurredAt` through the existing
   takeover-report contract and preserve duplicate receipt / offline replay
   semantics
6. keep the synced report immutable after first acceptance
7. if synced readback of original-system-time or correction-history data is
   still required after canvas publication, route that need to a new
   backend/contracts follow-up rather than inventing an ad hoc UI contract

## Verification Basis

- `phase1_prd_detailed_v1.md` §15.3, §16.2
- `phase1_system_analysis_v1.md` §3.2, §14.2
- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
- `apps/api/src/modules/safety-operator/safety-operator.service.ts`
- `apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`
- `git show 67113d786:docs/05-ui/drts-design-canvas/driver-safety-operator.jsx`
- `packages/ui-tokens/src/realms.ts`
- `apps/driver-app/app/_layout.tsx`
