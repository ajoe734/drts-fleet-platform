# P2-UI-SAFE-001 Unblock Planning Decision

## Scope

- Task: `P2-UI-SAFE-001-UNBLOCK-PLANNING-DECISION`
- Parent: `P2-UI-SAFE-001`
- Owner: `Codex`
- Reviewer: `Claude2`
- Decision date: `2026-06-26`

## Diagnosis

`P2-UI-SAFE-001` was already correctly stopped on missing visual authority: the
repo has no canonical safety-operator canvas under `docs/05-ui/drts-design-canvas/`,
and the driver realm tokens / shell are still general-driver only.

But one product / contract interpretation was still ambiguous inside the stop
point:

1. The task brief requires takeover time to be editable with audit preserved.
2. The backend contract already exists for takeover-report submission and
   offline replay.
3. The earlier safety-operator screen-requirements note called out a potential
   gap around `occurredAt`, which left the parent unclear on whether it needed
   to invent new UI-only fields or wait for another contract round.

The missing decision was whether `P2-UI-SAFE-001` should treat takeover time as
an editable-on-submit field within the current contract, or block on new fields
such as `originalOccurredAt`, `editedOccurredAt`, or `editReason`.

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `phase1_prd_detailed_v1.md` §15.3, §16.2
2. `phase1_system_analysis_v1.md` §3.2, §14.2
3. `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` §3.5
4. `apps/api/src/modules/safety-operator/safety-operator.service.ts`
5. `apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`
6. `packages/ui-tokens/src/realms.ts`
7. `apps/driver-app/app/_layout.tsx`

## Decision

`P2-UI-SAFE-001` is unblocked on product / contract semantics by **scoping the
takeover-time behavior to the current submit-only contract**.

Concretely:

1. `occurredAt` is editable only during the initial takeover-report entry flow.
   The UI may prefill it and let the safety operator adjust it before the first
   submit.
2. The canonical write surface is the existing
   `SubmitSafetyOperatorTakeoverReportCommand`, which carries a single
   `occurredAt` field.
3. After first acceptance for a `clientGeneratedReportId`, the takeover report
   is immutable for this wave. Duplicate offline replay returns the original
   record and receipt and must not overwrite `occurredAt` or any other payload
   fields.
4. `P2-UI-SAFE-001` must not invent extra contract fields or post-submit edit
   controls such as `originalOccurredAt`, `editedOccurredAt`, `editReason`, or
   a client-only "correction history" timeline.
5. Audit for this wave is the immutable submitted report plus backend audit-log
   recording on submission. It is not a second mutable editing protocol inside
   the driver app.
6. The parent remains blocked only on missing visual authority:
   `driver-safety-operator` canvas coverage and any resulting safety-operator
   realm-token decisions.

## Scope Cut And Routing

Out of scope for `P2-UI-SAFE-001` unless separately assigned:

1. Post-submit takeover-time correction.
2. New takeover-report fields for original-vs-corrected timestamps or edit
   reasons.
3. Engineer-invented safety-operator palette / shell decisions without a design
   canvas.
4. UI implementation before the visual design team lands canonical
   `SOFrame` / `SOModeBar` / `SOSyncStrip` / screen authority.

If product later wants explicit correction history or extra timing fields, that
must be a new backend/contracts follow-up before the driver app claims support.

## What Changed In Canonical Planning

Added `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`
on this branch as the canonical planning note for the missing canvas stop point.
The note now records both:

- the visual-authority blocker that still prevents UI implementation
- the resolved `occurredAt` submit-only contract boundary for the takeover
  report flow

## Parent Unblocked Next Step

`P2-UI-SAFE-001` should remain blocked on missing design, but it no longer
needs another product / contract ruling.

When the visual design team provides the canonical safety-operator canvas:

1. resume the parent on `codex/p2-ui-safe-001`
2. rebase it onto `dev`
3. implement the Safety Operator screens against the current takeover-report
   contract
4. allow pre-submit editing of `occurredAt`
5. surface duplicate receipt / unsynced merge behavior
6. omit post-submit correction controls and extra timestamp-history fields

## Verification Basis

- `phase1_prd_detailed_v1.md` §15.3, §16.2
- `phase1_system_analysis_v1.md` §3.2, §14.2
- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
- `apps/api/src/modules/safety-operator/safety-operator.service.ts`
- `apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`
- `packages/ui-tokens/src/realms.ts`
- `apps/driver-app/app/_layout.tsx`
