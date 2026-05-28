# Acceptance Packet: UI-FE-DRV-UMBRELLA-SIDECAR-ACCEPTANCE

- **Task ID:** `UI-FE-DRV-UMBRELLA-SIDECAR-ACCEPTANCE`
- **Parent Task:** `UI-FE-DRV-UMBRELLA` (Driver App rebuild — umbrella status / closeout)
- **Owner:** `Claude2`
- **Reviewer:** `Codex`
- **Helper kind:** `acceptance_packet` (sidecar, support-only)
- **Date:** 2026-05-28
- **Phase:** `phase1-ui-implementation-wave-202605`
- **Canonical mutation:** none — this packet only adds support artifacts under `support/sidecars/`.

## 1. Purpose

This packet supports the `UI-FE-DRV-UMBRELLA` closeout by giving the parent
owner (`Codex`) and parent reviewer (`Claude2`) a single place to verify:

1. that every sub-task the umbrella depends on is in `done` with a recorded
   commit hash and the per-screen acceptance criterion is satisfied at task
   level;
2. the visual / behavioural authority chain the umbrella has to honour
   (canvas → Driver App handoff packet → service contracts);
3. the umbrella-level closeout deliverables that still need to land
   (closeout doc, two-device screenshots, SOS press-and-hold 2s evidence).

It does **not** rerun the acceptance commands itself and it does **not**
re-author the canonical closeout doc. The umbrella owner is responsible for
producing `docs/05-ui/driver-app-rebuild-closeout-*.md` and the device-class
screenshot evidence.

## 2. Source documents (read order)

| # | Document                                                                 | Role for the umbrella closeout                                  |
|---|--------------------------------------------------------------------------|------------------------------------------------------------------|
| 1 | `AI_COLLABORATION_GUIDE.md`                                              | Collaboration rules + commit-evidence rule for canonical `done`. |
| 2 | `ai-status.json`                                                         | Machine truth for all sub-task statuses, commits, and reviewers. |
| 3 | `docs/05-ui/driver-app-design-handoff-packet-20260525.md`                | Driver-app behaviour / data / API authority.                     |
| 4 | `docs/05-ui/drts-design-canvas/Driver App.html`                          | Visual authority for the 10 driver-app routes.                   |
| 5 | `docs/05-ui/drts-design-canvas/driver-tokens.jsx` + `driver-primitives.jsx` | Independent driver design system (cannot import `@drts/ui-web`). |
| 6 | `docs/05-ui/driver-app-redesign-closeout-20260512.md`                    | Prior wave-4 closeout shape — reference for closeout format.     |
| 7 | `phase1_service_contracts_v1.md`                                         | Canonical contract truth for `availableActions` + state codes.   |

When this packet disagrees with any source above, the source wins.

## 3. Dependency map

The umbrella depends on nine implementation slices. Each one lives in one
Expo Router route under `apps/driver-app/app/` (per the canvas, `apps/driver-app`
is React Native via Expo and uses an **independent** design system).

| # | Sub-task ID       | Route file                              | Canvas screen on `Driver App.html`        | Status | Owner / Reviewer | Recorded commit (subject)                                                        |
|---|-------------------|-----------------------------------------|-------------------------------------------|--------|------------------|----------------------------------------------------------------------------------|
| 1 | `UI-FE-DRV-ONB`   | `apps/driver-app/app/onboarding.tsx`    | Onboarding (provisioning)                 | done   | Codex / Claude2  | `1b5e58570123e23897b5e02082e28a5bfef0e599` — UI-FE-DRV-ONB: finalize approved onboarding closeout |
| 2 | `UI-FE-DRV-IDX`   | `apps/driver-app/app/index.tsx`         | Workspace cockpit (index)                 | done   | Codex / Claude2  | `e687d13d1b2de6d20a3b909959cd45723f218190` — UI-FE-DRV-IDX: finalize approved workspace cockpit closeout |
| 3 | `UI-FE-DRV-JOB`   | `apps/driver-app/app/jobs.tsx`          | Unified task inbox                        | done   | Codex2 / Codex   | `2fccea771970b00c57d27a3c3cf6e587d20ab39b` — UI-FE-DRV-JOB: finalize owner closeout |
| 4 | `UI-FE-DRV-TRP`   | `apps/driver-app/app/trip.tsx`          | Trip operation (one primary action)       | done   | Codex2 / Claude2 | `c3f68db6bb2483c9ae2c570400e994b1c4e02069` — UI-FE-DRV-TRP: rebuild trip operation screen |
| 5 | `UI-FE-DRV-PP`    | `apps/driver-app/app/platform-presence.tsx` | Platform presence (4 reauth mechanisms) | done | Codex2 / Claude2 | `9b940f78657c44c0a06a1d50e8cf5bcbd02ce1b8` — UI-FE-DRV-PP: finalize review-approved closeout |
| 6 | `UI-FE-DRV-EAR`   | `apps/driver-app/app/earnings.tsx`      | Earnings                                  | done   | Codex2 / Codex   | `45bc2178` — UI-FE-DRV-EAR: closeout after review approval                       |
| 7 | `UI-FE-DRV-SHF`   | `apps/driver-app/app/shift.tsx`         | Shift / clock in-out (Q-DRV09)            | done   | Codex2 / Codex   | `ac16c0753b464182bd7cb08f6248506e1f004a21` — UI-FE-DRV-SHF: finalize shift screen closeout |
| 8 | `UI-FE-DRV-SOS`   | `apps/driver-app/app/incident.tsx`      | SOS incident (press-and-hold 2s)          | done   | Codex / Codex2   | `cee0171b` — UI-FE-DRV-SOS: reconcile remote branch ancestry                     |
| 9 | `UI-FE-DRV-SET`   | `apps/driver-app/app/settings.tsx`      | Settings + platform binding               | done   | Codex / Codex2   | `cfaa53615aabc5c1fd4f310d5d3b94b2eb776a76` — UI-FE-DRV-SET: finalize settings binding closeout |

Layout shell: `apps/driver-app/app/_layout.tsx` (Expo Router root layout —
not a sub-task; shared by every route above).

Reviewer note: every commit listed above is the value of `commit_hash` /
`commit_subject` in the corresponding `ai-status.json` task entry at the time
this packet was authored (`2026-05-28T12:45:52Z`). The umbrella reviewer
should not rerun the sub-task acceptance suites; they only need to confirm
the per-row evidence is still resolvable inside the canonical root.

## 4. Per-sub-task acceptance reuse

Every sub-task in §3 was finalized against the same shared acceptance shape
(taken verbatim from each task's `acceptance[0]` in `ai-status.json`):

> Visual matches `Driver App.html` corresponding artboard; behaviour matches
> handoff packet §5 entry for that screen; `availableActions` drives CTAs;
> `EmptyReason` 6 states rendered distinctly; refresh tier wired;
> `pnpm --filter @drts/driver-app typecheck + build` pass.

The umbrella does not need to re-prove any of those clauses at sub-task
level — it inherits them through the `done` status + commit evidence. The
umbrella adds **only** the cross-screen / device-class clauses in §5.

## 5. Umbrella-level acceptance (gates `UI-FE-DRV-UMBRELLA` → `done`)

These are the **additional** gates the umbrella owner must satisfy beyond the
nine inherited sub-task acceptances:

| # | Umbrella gate                                                                                   | Source authority                                              | Evidence the umbrella owner should attach to the closeout doc |
|---|-------------------------------------------------------------------------------------------------|---------------------------------------------------------------|---------------------------------------------------------------|
| A | Closeout doc exists under `docs/05-ui/driver-app-rebuild-closeout-*.md`.                        | Umbrella task `artifacts` field.                              | Path of the closeout doc + first commit that introduced it.   |
| B | Two device-class screenshots captured: **412×892** + **360×780** (per `Driver App.html`).       | Driver handoff packet §3 + canvas device frames.              | Both screenshot files committed under the closeout doc directory or under `docs/05-ui/driver-app-design-20260507/`. |
| C | SOS submit verified to be **press-and-hold 2s** (Q-DRV ack contract).                           | Handoff packet §5 SOS entry + canvas SOS screen.              | Either an automated test reference or a manual evidence note pinned in the closeout doc. |
| D | Independent design system honoured: no `@drts/ui-web` import inside `apps/driver-app/**`.       | Handoff packet §1 (Q-X04) + canvas `driver-tokens.jsx`.       | Greppable evidence (a quick `grep -R "@drts/ui-web" apps/driver-app/` line in the closeout doc, or a CI guard reference). |
| E | All nine sub-tasks resolvable as `done` with `commit_hash` in canonical `ai-status.json`.       | This packet §3.                                               | Inherits from §3 — reviewer reads the canonical status root.  |
| F | Umbrella closeout commit references the task id `UI-FE-DRV-UMBRELLA` + reviewer `Claude2`.      | `AI_COLLABORATION_GUIDE.md` §5 commit-evidence rule.          | `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH` recorded at `done`. |

Gates A–D are scope work for the umbrella owner. Gate E is informational
(this packet preserves it for reviewers who do not want to re-walk the task
board). Gate F is the standard canonical-task finalize rule from the
collaboration guide.

## 6. Acceptance checklist (this sidecar packet)

| Criteria                            | Status | Notes                                                                                          |
|-------------------------------------|--------|------------------------------------------------------------------------------------------------|
| **Dependency map present**          | [X]    | §3 lists all nine sub-tasks with route, canvas screen, status, owner/reviewer, and commit.     |
| **Acceptance criteria documented**  | [X]    | §4 inherits sub-task acceptance; §5 enumerates umbrella-only gates A–F.                        |
| **Authority chain cited**           | [X]    | §2 links canvas, handoff packet, service contracts, and prior closeout reference.              |
| **No canonical edit**               | [X]    | Files touched live only under `support/sidecars/UI-FE-DRV-UMBRELLA/`.                          |
| **Support artifacts only**          | [X]    | This sidecar is `helper_kind=acceptance_packet`, `mutates_canonical=false`.                    |
| **Sub-task commit hashes resolved** | [X]    | All nine hashes read from canonical `ai-status.json` at `2026-05-28T12:45:52Z`.                |
| **Handoff to reviewer prepared**    | [ ]    | Filled in by Claude2 via `scripts/ai-status.sh handoff … Codex …` after this packet commits.   |

## 7. Reviewer instructions (`Codex`)

1. Confirm the dependency map in §3 matches the current task board for the
   nine `UI-FE-DRV-*` sub-tasks (status, owner/reviewer, `commit_hash`).
2. Confirm §5 gates A–F are the right umbrella-level acceptance shape — i.e.
   that this packet has neither under- nor over-specified what the umbrella
   needs to prove beyond the nine inherited acceptances.
3. Confirm the cited canvas / handoff packet / collaboration-guide
   references in §2 and §5 still resolve in the repo today.
4. If everything checks out, approve this packet via:
   `AI_NAME=Codex scripts/ai-status.sh approve UI-FE-DRV-UMBRELLA-SIDECAR-ACCEPTANCE "<review notes>"`
   and let the umbrella owner (`Codex`) decide whether to absorb gates A–F
   directly into the umbrella closeout doc.
5. If any row in §3 or any gate in §5 is wrong, reopen via
   `AI_NAME=Codex scripts/ai-status.sh reopen UI-FE-DRV-UMBRELLA-SIDECAR-ACCEPTANCE "<reason>"`
   so Claude2 can correct the packet.

## 8. Out of scope

- This packet does **not** modify any canonical L1/L2 product truth.
- This packet does **not** modify any driver-app route under `apps/driver-app/`.
- This packet does **not** modify the umbrella task's canonical
  `artifacts` / `acceptance` arrays in `ai-status.json`.
- Device-class screenshots and the umbrella closeout doc itself remain the
  parent umbrella's responsibility — this sidecar only enumerates them.

_This is a support artifact for `UI-FE-DRV-UMBRELLA`._
