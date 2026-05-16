# SYS-UI-008 Sidecar Review Packet

- Sidecar Task: `SYS-UI-008-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Codex2` / `Codex`
- Parent Task: `SYS-UI-008` — Full-System UI Verification Packet
- Parent Owner / Reviewer: `Codex` / `Claude2`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-09

## Purpose

Provide a parallel review packet for `SYS-UI-008` so sidecar reviewer `Codex`
can validate, in one place, that the parent verification packet:

1. is grounded in machine truth rather than summary docs;
2. states the completion claim with the required precision;
3. preserves the route-level reasons that keep the system UI claim
   `incomplete`; and
4. stays within the support-artifact scope without rewriting canonical truth.

This sidecar does not approve the parent task. Parent `SYS-UI-008` remains
`review` in `ai-status.json` awaiting reviewer `Claude2`.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/SYS-UI-008/`.
- Do not modify L1 product truth, canonical execution packets, or runtime code.
- Do not rewrite the parent verification packet's conclusions.
- Hand this packet to the assigned sidecar reviewer (`Codex`) through
  `scripts/ai-status.sh handoff`.

## Parent Anchors

- Parent task record: `ai-status.json::tasks[id="SYS-UI-008"]`
  (status `review`, owner `Codex`, reviewer `Claude2`).
- Parent verification packet:
  `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md`.
- Parent execution packet:
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`.
- Parent handoff record in machine truth:
  `ai-status.json::handoffs[task_id="SYS-UI-008"]`
  (`Codex` -> `Claude2`, pending, `2026-05-09T20:43:30Z`).

## Parent Review State

At the time this sidecar was prepared:

1. Parent `SYS-UI-008` had already moved from `in_progress` to `review`.
2. The only active parent handoff is the pending review handoff from `Codex`
   to `Claude2` created at `2026-05-09T20:43:30Z`.
3. The parent `next` summary records the intended claim exactly as
   `incomplete with route-level reasons`, with the three named blockers:
   tenant selected-shell placeholder/bootstrap gaps, passenger product-closure
   gaps, and concierge bootstrap/CTI gating.

This matters because the sidecar should summarize the parent's current review
state, not an imagined `done` state.

## Dependency Snapshot

The seven declared dependencies of `SYS-UI-008` are all machine-truth `done`
tasks and already carry closeout evidence:

| Task         | Status | Commit    | Closeout note                                                                    |
| ------------ | ------ | --------- | -------------------------------------------------------------------------------- |
| `TEN-UI-009` | `done` | `16fea58` | Tenant-console route-by-route packet and selected-shell qualifications recorded. |
| `SYS-UI-002` | `done` | `beb0c7a` | Partner login, eligibility, create, and confirmation routes verified.            |
| `SYS-UI-003` | `done` | `1b97717` | Passenger shell baseline and receipt landing zone closed.                        |
| `SYS-UI-004` | `done` | `4b0fe88` | Passenger booking, active-trip, and negative-flow materialization closed.        |
| `SYS-UI-005` | `done` | `4041817` | Concierge portal materialization closed in repo-local form.                      |
| `SYS-UI-006` | `done` | `b5fc869` | Cross-surface auth / invite / revoke / denial matrix closed.                     |
| `SYS-UI-007` | `done` | `489ca1e` | Forwarded-authority explanation across tenant / ops / admin / driver closed.     |

This sidecar does not recreate those packets. It records only the dependency
closure needed to review whether the parent packet was allowed to make a
full-system claim at all.

## Evidence Summary

The evidence below is keyed to the parent packet sections and the two parent
acceptance requirements:

1. `verification packet filed`
2. `completion claim is stated precisely as complete, complete except named external blockers, or incomplete with route-level reasons`

| Review point                                                                            | Verdict         | Evidence anchor                                                                                                                                  | Why it matters                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packet exists and is scoped as the full-system evidence gate                            | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:1-15`                                                                             | Confirms the parent produced the required verification packet rather than a loose note.                                                                                                                                           |
| All seven formal dependencies are closed before the claim is made                       | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:17-21,51-70`; `ai-status.json` dependency task records                            | Prevents claiming full-system verification while prerequisite slices are still open.                                                                                                                                              |
| Every in-scope surface family has a named repo landing zone                             | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:22-30,72-84`                                                                      | Shows the packet is verifying the actual repo topology across tenant, partner, passenger, concierge, ops, admin, and driver.                                                                                                      |
| Tenant-admin selected shell is recorded as materially present but still incomplete      | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:36-40,97-123,335-347`                                                             | Preserves the tenant bootstrap and placeholder-route reasons that block a stronger claim.                                                                                                                                         |
| Passenger family is recorded as route-materialized but not fully productized            | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:41-43,147-183,349-356`                                                            | Preserves the auth / booking submit / trip mutation / complaint-support gap instead of overclaiming completion.                                                                                                                   |
| Concierge family is recorded as materially present but still repo-local/bootstrap-gated | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:44-46,185-210,358-367`                                                            | Preserves the production-auth and CTI/recording limits that prevent a complete-system claim.                                                                                                                                      |
| Cross-surface auth, accepted deviations, and external gates are separated cleanly       | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:296-328,369-379`                                                                  | Confirms the packet does not hide repo-local gaps behind external blockers.                                                                                                                                                       |
| Completion claim is stated with the required precision                                  | `met`           | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:381-413`                                                                          | The packet explicitly rejects `complete` and `complete except named external blockers`, and states only `incomplete with route-level reasons`.                                                                                    |
| Verification posture is limited to commands actually used for this docs-first packet    | `met-with-note` | `support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md:415-430`; parent handoff note in `ai-status.json::handoffs[task_id="SYS-UI-008"]` | The packet truthfully records machine-truth inspection and route scans, not fresh app test runs. That is acceptable for this support/docs scope, but the reviewer should ensure the wording does not imply more than was checked. |

Result: 8 review points `met`, 1 review point `met-with-note`.

## Reviewer Spot-Checks

The sidecar reviewer (`Codex`) should be able to approve this packet by
confirming the following:

1. Parent `SYS-UI-008` is still `review`, not `done`, in machine truth.
2. The dependency snapshot here matches both `ai-status.json` and the parent
   packet's dependency table.
3. The sidecar preserves the parent packet's central claim exactly as
   `incomplete with route-level reasons`.
4. The sidecar does not collapse repo-local incomplete reasons into external
   blockers only.
5. The sidecar write scope is limited to
   `support/sidecars/SYS-UI-008/SYS-UI-008-SIDECAR-REVIEW.md`.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — this sidecar adds one file under
      `support/sidecars/SYS-UI-008/`.
- [x] Do not edit canonical truth — no L1 docs, runtime code, or parent packet
      conclusions were rewritten.
- [x] Hand off the packet to the assigned reviewer (`Codex`) — required after
      local verification below.

## Local Verification For This Sidecar

This sidecar packet is support-only. Local checks for this slice should stay
limited to file-shape and whitespace safety:

- `git diff --check -- support/sidecars/SYS-UI-008/SYS-UI-008-SIDECAR-REVIEW.md`

The parent packet's broader evidence remains owned by parent task `SYS-UI-008`.

## Files Added By This Sidecar

```text
support/sidecars/SYS-UI-008/SYS-UI-008-SIDECAR-REVIEW.md
```
