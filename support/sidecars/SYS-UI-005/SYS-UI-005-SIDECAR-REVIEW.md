# SYS-UI-005 Sidecar Review Packet

- Sidecar Task: `SYS-UI-005-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Claude2` / `Codex`
- Parent Task: `SYS-UI-005` — Call Point / Concierge Portal Materialization
- Parent Owner / Reviewer: `Codex` / `Claude2`
- Companion Sidecar: `SYS-UI-005-SIDECAR-ACCEPTANCE` (`done`, commit `c19db28`)
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-09

## Purpose

Provide a parallel **review** packet for `SYS-UI-005` that, together with the
already-landed `SYS-UI-005-SIDECAR-ACCEPTANCE`, gives the sidecar reviewer
(`Codex`, who is also the parent owner) a single artifact summarizing:

1. the evidence the parent slice produced for each item in the 17-item
   acceptance decomposition;
2. the parent verification posture (typecheck / lint / test / build);
3. the resolution chosen for the assisted-entry vs concierge-portal naming
   seam;
4. cross-cuts a sidecar reviewer should glance at before approving this
   support-only artifact.

This packet does **not** re-authorize the parent slice. Parent
acceptance was already performed by parent reviewer `Claude2`
(`SYS-UI-005` → `done`, commit `4041817`). This packet records what that
review found in a form that survives the parent-task closeout, so a future
reader does not have to reconstruct it from `ai-status.json` review notes
alone.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/SYS-UI-005/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify the parent's write scope (`apps/concierge-portal-web/**`,
  `apps/assisted-entry-web/**`).
- Do not modify canonical decision records, runbook execution packets, or the
  central task board (`ai-status.json`).
- Hand the packet off to the assigned reviewer (`Codex`) via
  `scripts/ai-status.sh handoff`.

## Parent Anchors

- Parent task record: `ai-status.json::tasks[id="SYS-UI-005"]`
  (status `done`, owner `Codex`, reviewer `Claude2`).
- Parent commit: `40418171b7b589d8f0d35f6e7e87b692ed975616` —
  `feat(SYS-UI-005): materialize concierge portal web` on
  `origin/codex/dev-deploy-backend-android`.
- Parent execution packet:
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
  (`SYS-UI-005` block lines 276–304; surface map row 98–99).
- Topology decision: `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`.
- Acceptance sidecar (this packet's companion):
  `support/sidecars/SYS-UI-005/SYS-UI-005-SIDECAR-ACCEPTANCE.md` (commit `c19db28`).

## Naming-Seam Resolution (Recorded)

The acceptance sidecar listed three conformant resolutions for the
`apps/assisted-entry-web` vs `apps/concierge-portal-web` divergence. The
parent slice landed **option 3**:

- `apps/concierge-portal-web/` is the materialized implementation
  (Next.js 16 / React 19, port `3006`, package `@drts/concierge-portal-web`,
  full route inventory below).
- `apps/assisted-entry-web/` is retained as a forward-gated naming bridge
  (`apps/assisted-entry-web/README.md:1-12`), so canonical topology /
  execution-packet references to `apps/assisted-entry-web` continue to
  resolve to a real path while the topology decision itself is amended in a
  later control-plane update.
- Rationale is captured in two places that survive the parent closeout:
  - parent commit message body: "keep apps/assisted-entry-web as the
    forward-gated naming bridge per review option 3";
  - in-app shell copy: `apps/concierge-portal-web/components/concierge-shell.tsx:55-57`
    explicitly states "Task artifact path is `apps/concierge-portal-web`;
    topology docs still refer to the assisted-entry family. The support
    packet records that naming seam explicitly."
- Parent reviewer note (in `ai-status.json::tasks[SYS-UI-005].review_notes_zh[0]`)
  records that the docs amendment for the topology decision and execution
  packet write-scope rows is deferred to a later control-plane update and
  does **not** block this slice's approval.

The sidecar review treats the seam as resolved (option 3) for the purpose
of this support packet. The follow-up canonical docs amendment is out of
scope for both this sidecar and `SYS-UI-005` itself.

## Parent Verification Posture (As Recorded)

The parent slice declared verification in two places that the sidecar
reviewer can re-derive without rerunning anything:

1. Parent commit trailer (commit `4041817` body):
   > Verification: pnpm --filter @drts/concierge-portal-web typecheck;
   > pnpm --filter @drts/concierge-portal-web lint;
   > pnpm --filter @drts/concierge-portal-web test;
   > pnpm --filter @drts/concierge-portal-web build
2. Parent task `next` field in `ai-status.json`:
   > pnpm --filter @drts/concierge-portal-web typecheck PASS; lint PASS;
   > test PASS (3 passed); build PASS.
3. Parent reviewer note:
   > 本地驗證 PASS：typecheck / lint / test (3 passed) / build (Next.js
   > 16.2.3 webpack, 12/12 pages, /degraded /denied /ineligible 為 dynamic
   > server-rendered).

Sidecar policy: per `AI_COLLABORATION_GUIDE.md` §5 the sidecar does **not**
rerun parent verification. Recording the declared posture is the sidecar
deliverable. If the sidecar reviewer wants independent re-verification,
that is parent-side authority, not sidecar authority.

Test surface present in the repo at packet write-time:

- `apps/concierge-portal-web/tests/unit/desk-catalog.test.ts` is the only
  unit-test file in the slice; the parent declares 3 passed cases.

## Evidence Summary — 17-Item Acceptance Decomposition

The columns are:

- **#** — item number from `SYS-UI-005-SIDECAR-ACCEPTANCE.md` § "Acceptance
  Decomposition (Parent SYS-UI-005)".
- **Verdict** — sidecar-reviewer-facing posture: `met` (evidence found at
  expected anchor), `met-with-note` (met with a recorded sidecar comment),
  `parent-only` (verification owned by parent reviewer, sidecar does not
  attest), or `deferred` (explicitly carried forward to a later canonical
  task).
- **Evidence anchor** — file:line or task-record citation that resolves
  in the repo at packet write-time.

| #   | Verdict       | Evidence anchor                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | met           | `apps/concierge-portal-web/package.json` (`@drts/concierge-portal-web`, port `3006`); 26-file parent commit (`git show --stat 4041817`) materializes the workspace; build PASS recorded in commit trailer.                                                                                                                                                      |
| 2   | met           | `apps/concierge-portal-web/components/concierge-shell.tsx` (assisted-entry chrome, `brand-badge` "Phase 1 assisted-entry surface"); `lib/navigation.ts` defines the dedicated nav inventory; no imports from `apps/ops-console-web` or `apps/platform-admin-web`.                                                                                               |
| 3   | met           | `apps/concierge-portal-web/app/login/page.tsx`; `lib/portal-state.tsx::signIn` (line 37, called at 118); `lib/api-client.ts` `LIMITED_SCOPES` (line 9) with `x-realm: ops` and `x-roles: <mode>` headers (lines 25–27).                                                                                                                                         |
| 4   | met           | `apps/concierge-portal-web/app/start/page.tsx`; `lib/desk-catalog.ts::conciergeDeskCatalog` (3 seeded desks, lines 50-100); `lib/portal-state.tsx` exposes `selectDesk` / `useSelectedDesk`.                                                                                                                                                                    |
| 5   | met           | `apps/concierge-portal-web/app/bookings/new/page.tsx` (581 lines per `git show --stat`); eligibility via `lib/desk-catalog.ts::evaluateDeskEligibility`; mode access via `resolveDeskAccess`; submission through the limited-scope bearer client in `lib/api-client.ts`.                                                                                        |
| 6   | met           | `apps/concierge-portal-web/app/lookup/page.tsx` (233 lines); `recentOrderIds` / `recentCallIds` from `lib/portal-state.tsx`.                                                                                                                                                                                                                                    |
| 7   | met           | `lib/portal-state.tsx` provides `recordCall` / `clearActiveCall` / `activeCallId` / `recentCallIds`; surfaced in `components/concierge-shell.tsx` topbar.                                                                                                                                                                                                       |
| 8   | met           | `apps/concierge-portal-web/app/callbacks/page.tsx` (307 lines); `recordCallbackTask` / `recentCallbackTaskIds` in `lib/portal-state.tsx`.                                                                                                                                                                                                                       |
| 9   | met           | `apps/concierge-portal-web/app/ineligible/page.tsx`; `lib/desk-catalog.ts:41` defines `reasonCode: "product_not_authorized" \| "service_area_mismatch"`; `evaluateDeskEligibility` returns those codes (lines 137, 150).                                                                                                                                        |
| 10  | met           | `apps/concierge-portal-web/app/denied/page.tsx`; `lib/desk-catalog.ts::resolveDeskAccess` returns `{ allowed: false, reasonCode: "mode_denied" }` (line 35, 123).                                                                                                                                                                                               |
| 11  | met           | `apps/concierge-portal-web/app/degraded/page.tsx`; sample seeded `health: "degraded"` desk (Taoyuan T1 row in `desk-catalog.ts`) makes the fallback reachable; route is dynamic server-rendered per parent reviewer's build readout.                                                                                                                            |
| 12  | met           | `apps/concierge-portal-web/app/recording-unavailable/page.tsx`; `recordingAvailability: "ops_callback_only"` set on every seeded desk (`desk-catalog.ts:57, 76, 95`); copy explicitly defers raw recording-callback binding to ops.                                                                                                                             |
| 13  | met           | `grep -nrE "from ['\"]@drts/(ops-console-web\|platform-admin-web)" apps/concierge-portal-web/` returned no matches; nav inventory is limited to `lib/navigation.ts`. No internal-ops surface is re-exported.                                                                                                                                                    |
| 14  | met           | `apps/concierge-portal-web/lib/api-client.ts:9` — `LIMITED_SCOPES = ["callcenter:read", "callcenter:write", "owned:read", "dispatch:read"]`. Lines 25–28 set `x-realm: ops`, `x-roles: <mode>`, `x-scopes: <space-joined limited scope>`. No full-ops scope leakage in this slice.                                                                              |
| 15  | met           | No live-board route was added under `apps/concierge-portal-web/app/`. Status visibility is folded into `/lookup` and `/bookings/new`; consistent with `SD-DP-20260509-005` row "Public booking-status surface → folded into passenger and assisted-entry".                                                                                                      |
| 16  | parent-only   | Verification PASS asserted by parent commit trailer + parent task `next` + parent reviewer note (see "Parent Verification Posture (As Recorded)" above). Sidecar does not rerun.                                                                                                                                                                                |
| 17  | met-with-note | Naming-seam resolution captured as **option 3** in the parent commit body and in `concierge-shell.tsx:55-57`. Parent reviewer note explicitly records that the canonical topology decision / execution-packet docs amendment is deferred to a later control-plane update and does not block this slice. Recorded above in §"Naming-Seam Resolution (Recorded)". |

Result: 15 items `met`, 1 `parent-only` (item 16, by sidecar policy), 1
`met-with-note` (item 17, naming seam recorded as option 3 with a
follow-up docs amendment outside this slice). No `deferred`, no `not-met`.

## Cross-Cuts For The Sidecar Reviewer

Items the sidecar reviewer (`Codex`) may want to spot-check before
approving the sidecar:

1. **Sidecar write scope** — confirm the only path mutated by the sidecar
   owner is `support/sidecars/SYS-UI-005/SYS-UI-005-SIDECAR-REVIEW.md`. No
   edits to `apps/concierge-portal-web/**`, `apps/assisted-entry-web/**`,
   `docs/01-decisions/**`, `docs/03-runbooks/**`, or `ai-status.json` (the
   `ai-status.sh` lifecycle commands are the only mutators of the task
   board for this packet).
2. **Companion sidecar consistency** — every numbered item in the table
   above is keyed off the 17 items in the acceptance sidecar. If a
   numbered item is added or renumbered there, this packet has to track
   that change.
3. **Parent verification posture** — sidecar policy is to record, not
   rerun. If `Codex` (parent owner) wants to re-attest verification, that
   is parent-side authority. The sidecar reviewer may still flag a
   posture mismatch if any of the three sources cited under "Parent
   Verification Posture (As Recorded)" diverge.
4. **Naming-seam follow-up** — the docs amendment for the topology
   decision and execution-packet write-scope rows is **not** owned by this
   sidecar nor by `SYS-UI-005`. If `Codex` wants it tracked as official
   backlog, it must enter `ai-status.json` as a new task per the machine
   truth discipline in `AI_COLLABORATION_GUIDE.md` §0.5; the sidecar does
   not create canonical backlog by itself.
5. **No new canonical claims** — this packet asserts only what the parent
   slice already asserted plus what is observable in the post-parent-commit
   repo state. It introduces no new product semantics.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — this packet lives entirely under
      `support/sidecars/SYS-UI-005/`.
- [x] Do not edit canonical truth — no L1 product truth, contract truth,
      migration plan, topology decision record, runbook execution packet, or
      `apps/concierge-portal-web/**` content was modified by the sidecar
      owner.
- [ ] Hand off the packet to the assigned reviewer (`Codex`) — to be
      performed via `scripts/ai-status.sh handoff` after this content lands.

## Out Of Scope For The Sidecar

- Re-running parent typecheck / lint / test / build. Parent owner /
  parent reviewer authority.
- Approving or rejecting the parent `SYS-UI-005` task. Parent is already
  `done` in `ai-status.json` (commit `4041817`); the sidecar approves only
  the support packet itself.
- Mutating any path outside `support/sidecars/SYS-UI-005/`.
- Creating new canonical backlog (e.g., for the topology-decision docs
  amendment). That belongs in `ai-status.json` via the normal supervisor
  flow, not in a sidecar.
- Recording commit evidence on the sidecar finalize step — sidecar
  closeout uses `NO_COMMIT_REQUIRED=1` per `AI_COLLABORATION_GUIDE.md` §5
  "Commit evidence rule" (sidecar / explicit non-canonical closeout
  tasks).

## Files Added By The Sidecar

```
support/sidecars/SYS-UI-005/SYS-UI-005-SIDECAR-REVIEW.md   (this file)
```
