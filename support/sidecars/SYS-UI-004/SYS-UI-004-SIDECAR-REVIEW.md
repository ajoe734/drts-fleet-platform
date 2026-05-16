# SYS-UI-004 Sidecar Review Packet

- Sidecar Task: `SYS-UI-004-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Codex2` / `Claude`
- Parent Task: `SYS-UI-004` — Passenger Booking, Status, And Negative-Flow Materialization
- Parent Owner / Reviewer: `Claude` / `Codex2`
- Companion Sidecar: `SYS-UI-004-SIDECAR-ACCEPTANCE` (`done`, owner `Codex2`)
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-09

## Purpose

Provide a parallel **review** packet for `SYS-UI-004` that captures the
evidence and review trail after the parent task moved from `in_progress` to
`done` while this sidecar was being prepared.

This packet exists so sidecar reviewer `Claude` can confirm, in one place:

1. what the parent slice actually landed in `apps/passenger-web`;
2. how the 14-item acceptance decomposition from the companion sidecar maps to
   concrete file anchors;
3. how the parent review reopened on two nav regressions and then closed after
   commit `2a46188`;
4. what verification posture was recorded for the parent task at closeout.

This packet does **not** re-authorize the parent slice. Parent acceptance was
already performed by parent reviewer `Codex2`, `SYS-UI-004` is now `done` in
`ai-status.json`, and this sidecar has already passed reviewer approval.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/SYS-UI-004/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify the parent write scope under `apps/passenger-web/**`.
- Do not modify canonical runbook execution packets or topology truth.
- Hand the packet off to the assigned reviewer (`Claude`) via
  `scripts/ai-status.sh handoff`.

## Parent Anchors

- Parent task record: `ai-status.json::tasks[id="SYS-UI-004"]`
  (status `done`, owner `Claude`, reviewer `Codex2`).
- Parent implementation commits on
  `origin/codex/dev-deploy-backend-android`:
  - `3ea3dac561519fc8bce20c3bfde647aaeb91d843` —
    `feat(SYS-UI-004): materialize passenger booking + negative-flow routes`
  - `2a461886abbc683270c90bfe54618bfc8e81c08b` —
    `fix(SYS-UI-004): correct passenger nav route matching for subroutes`
- Parent closeout commit:
  `4b0fe88ce256cf09ddbc7ca9fe64f433f2c5a36d` —
  `docs(SYS-UI-004): finalize sidecar acceptance packet`
- Parent execution packet:
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
  (`SYS-UI-004` block at lines 247-275; surface map at lines 96-99).
- Companion acceptance sidecar:
  `support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-ACCEPTANCE.md`.

## Dependency Snapshot

The declared parent dependencies remain settled `done` tasks in machine truth:

- `SYS-UI-003` — commit `1b97717`; establishes the passenger shell baseline
  and the `/`, `/auth`, `/trips`, `/receipts`, `/unauthenticated`, and
  `/unsupported` routes that `SYS-UI-004` extends.
- `XS-UI-001` — commit `ac44883`; keeps passenger status folded into
  `apps/passenger-web` and prevents a separate public booking-status app
  (`docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:96-99`).
- `XS-UI-003` — commit `7b76d9f`; supplies the command/action authority guardrail
  that the read-only and cancel routes must honor.

This packet does not recreate the full dependency map; that remains in the
companion acceptance sidecar. It records only the status needed for sidecar
review.

## Parent Review Timeline (Recorded)

The important machine-truth sequence for `SYS-UI-004` is:

1. `2026-05-09T18:01:24Z` — owner `Claude` handed parent review to `Codex2`
   with commit `3ea3dac`, route inventory summary, and recorded
   `pnpm --filter @drts/passenger-web typecheck/lint/test/build PASS`.
2. `2026-05-09T18:05:01Z` — reviewer `Codex2` reopened the task for two route
   chrome regressions:
   - `/trips` was colliding with `/trip` because `findPassengerNavItem()`
     matched with `startsWith()`;
   - `/book/*` and `/trip/*` subroutes did not highlight their parent nav item
     because sidebar state compared `item.href === pathname`.
3. `2026-05-09T18:18:16Z` — owner `Claude` handed back commit `2a46188`,
   documenting the fix:
   - `apps/passenger-web/lib/navigation.ts` now boundary-matches each href and
     picks the longest match;
   - `apps/passenger-web/components/passenger-shell.tsx` now derives sidebar
     active state from the resolved active nav item.
     The same note records a rerun of `typecheck/lint/test/build`, all PASS.
4. `2026-05-09T18:22:28Z` — reviewer `Codex2` approved the fix and returned the
   task to owner `Claude`, again recording
   `pnpm --filter @drts/passenger-web typecheck/lint/test/build PASS`.
5. `2026-05-09T18:27:08Z` — owner `Claude` finalized `SYS-UI-004` as `done`
   with closeout commit `4b0fe88`, push ref
   `origin/codex/dev-deploy-backend-android`, and the `next` summary:
   implementation lives in `3ea3dac+2a46188`; reviewer verified passenger-web
   `typecheck/lint/test/build`.

Why this matters for the sidecar review: the support packet should reflect the
**final** reviewed state, not the stale pre-fix reopen snapshot that the
companion acceptance sidecar still describes.

## Parent Verification Posture (As Recorded)

The parent slice declared verification in three aligned machine-truth places:

1. Initial parent handoff (`2026-05-09T18:01:24Z`) recorded
   `typecheck/lint/test/build PASS` with 17 application routes registered.
2. Post-fix parent handoff (`2026-05-09T18:18:16Z`) recorded the same command
   family as PASS after commit `2a46188`.
3. Parent reviewer approval handoff (`2026-05-09T18:22:28Z`) repeated the PASS
   result and explicitly called out the `/trips` vs `/trip` collision and
   parent-nav highlighting as fixed.

Sidecar policy: this packet records the declared parent verification posture. It
does **not** rerun the parent verification commands itself.

## Evidence Summary — 14-Item Acceptance Decomposition

The item numbers below are keyed to
`SYS-UI-004-SIDECAR-ACCEPTANCE.md` § "Acceptance Decomposition (Parent
SYS-UI-004)".

Verdict meanings:

- `met` — expected evidence exists in the post-review repo state.
- `met-with-note` — expected evidence exists, but the review trail contains a
  noteworthy caveat or reopened issue that was later fixed.
- `parent-only` — verification is recorded by the parent owner / reviewer, not
  re-attested by this sidecar.

| #   | Verdict       | Evidence anchor                                                                                                                                                                                                                                                                                                       |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | met           | `apps/passenger-web/app/book/page.tsx:32-106` materializes the booking entry; `apps/passenger-web/lib/navigation.ts:67-103` lists `/book` plus the named booking-negative subroutes.                                                                                                                                  |
| 2   | met           | `apps/passenger-web/app/trip/page.tsx:45-146` materializes the active-trip route; `apps/passenger-web/lib/navigation.ts:105-148` lists `/trip` plus the trip subroute inventory.                                                                                                                                      |
| 3   | met           | `apps/passenger-web/app/trip/cancel/page.tsx:28-105` frames cancel as authority-bound; `apps/passenger-web/app/trip/page.tsx:91-118` keeps cancel visibility tied to the direct-passenger authority snapshot.                                                                                                         |
| 4   | met           | `apps/passenger-web/app/trip/completed/page.tsx:31-90` provides the completion view; `apps/passenger-web/app/receipts/page.tsx:27-65` routes receipt ownership to concrete trip outcomes without inventing a new receipt channel.                                                                                     |
| 5   | met           | `apps/passenger-web/app/trip/read-only/page.tsx:48-126` makes the rider read-only when another channel owns mutation authority and includes a cross-channel ownership matrix.                                                                                                                                         |
| 6   | met           | `apps/passenger-web/app/book/denied/page.tsx:18-83` isolates denied-by-policy behavior, keeps internal decision graphs hidden, and offers support-safe exits instead of silent retry.                                                                                                                                 |
| 7   | met           | `apps/passenger-web/app/book/ineligible/page.tsx:21-88` gives a gate-by-gate eligibility result and explicitly avoids PII leakage or silent fare-program downgrade.                                                                                                                                                   |
| 8   | met           | `apps/passenger-web/app/book/no-supply/page.tsx:21-80` separates supply failure from denial / unsupported semantics and offers explicit retry / later / alternate-channel fallbacks.                                                                                                                                  |
| 9   | met           | `apps/passenger-web/app/book/degraded/page.tsx:26-82` renders degraded mode as a read-only fallback with an affordance matrix that names what is available and what is blocked.                                                                                                                                       |
| 10  | met           | `apps/passenger-web/app/trip/cancelled/page.tsx:21-80` gives cancelled trips their own route, names the cancelling actor, and preserves receipt/source follow-up semantics.                                                                                                                                           |
| 11  | met           | `apps/passenger-web/app/trip/reauth-required/page.tsx:18-68` withholds trip data until the rider re-verifies and links back to `/auth` and `/unauthenticated` instead of leaking stale trip data.                                                                                                                     |
| 12  | met-with-note | Current approved fix lives in `apps/passenger-web/lib/navigation.ts:150-160` and `apps/passenger-web/components/passenger-shell.tsx:8-35`. This item was the reason for the parent reopen at `2026-05-09T18:05:01Z`; commit `2a46188` resolved it and `Codex2` approved the result at `18:22:28Z`.                    |
| 13  | met           | Guardrails align across `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:96-99`, `apps/passenger-web/app/page.tsx:116-121`, `apps/passenger-web/app/receipts/page.tsx:35-39`, `apps/passenger-web/app/trip/read-only/page.tsx:55-60`, and `apps/passenger-web/app/unsupported/page.tsx:7-31`. |
| 14  | parent-only   | Verification posture is recorded in the parent handoff / review sequence and in `ai-status.json::tasks[id="SYS-UI-004"].next`: `pnpm --filter @drts/passenger-web typecheck/lint/test/build PASS`.                                                                                                                    |

Result: 12 items `met`, 1 item `met-with-note` (navigation coherence reopened
once, then fixed), and 1 item `parent-only` (verification posture is recorded
by the parent owner / reviewer).

## Cross-Cuts For The Sidecar Reviewer

Checks the sidecar reviewer (`Claude`) may want to spot-check before approving
this support packet:

1. Confirm the packet reflects the **final** machine truth: parent
   `SYS-UI-004` is `done`, not `in_progress`.
2. Confirm item `#12` records both halves of the review trail: the original
   reopen and the approved fix in `2a46188`.
3. Confirm the evidence table stays keyed to the 14 numbered items in the
   companion acceptance sidecar rather than inventing a new acceptance scheme.
4. Confirm the sidecar write scope is limited to
   `support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-REVIEW.md`.
5. Confirm the packet introduces no new product truth claims beyond what is
   already observable in `apps/passenger-web`, the execution packet, and
   `ai-status.json`.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — this packet lives entirely under
      `support/sidecars/SYS-UI-004/`.
- [x] Do not edit canonical truth — no L1 docs, parent implementation files, or
      canonical runbook truth were modified by this sidecar.
- [x] Hand off the packet to the assigned reviewer (`Claude`) — completed, and
      the packet is now `review_approved` awaiting owner closeout.

## Out Of Scope For The Sidecar

- Re-running parent typecheck / lint / test / build.
- Approving or rejecting the parent `SYS-UI-004` task; parent is already
  `done`.
- Editing `apps/passenger-web/**`, canonical docs, or control-plane truth.
- Finalizing the companion sidecar `SYS-UI-004-SIDECAR-ACCEPTANCE`; that
  remains owned by `Codex2`.
- Creating new canonical backlog from sidecar observations.

Per `AI_COLLABORATION_GUIDE.md` and the dispatch closeout rules for this
`review_approved` owner handoff, finalization still requires a task-scoped
commit, normal non-force push, and `scripts/ai-status.sh done` evidence.

## Files Added By The Sidecar

```text
support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-REVIEW.md   (this file)
```
