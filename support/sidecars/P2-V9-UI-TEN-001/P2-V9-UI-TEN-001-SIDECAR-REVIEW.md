# P2-V9-UI-TEN-001 Review Packet & Evidence Summary

**Sidecar Task:** `P2-V9-UI-TEN-001-SIDECAR-REVIEW`  
**Parent Task:** `P2-V9-UI-TEN-001`  
**Helper Kind:** `review_packet`  
**Current Sidecar Owner / Reviewer:** `Codex2` / `Codex`  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Prepared In:** `codex/p2-v9-ui-ten-001-sidecar-review`  
**Generated:** `2026-06-29` (UTC)  
**Status:** `ACTIVE SUPPORT ARTIFACT`

This packet exists because the sidecar handoff at `2026-06-29T03:29:01Z`
claimed the review artifact had been added, but the assigned path was still
missing in this isolated reviewer worktree. The packet below materializes that
missing support artifact and preserves the evidence already recorded in machine
truth for the parent review failure.

---

## 1. Scope Boundary

This sidecar is support-only.

- In scope: summarize the parent reopen evidence, anchor commit, missing design
  source, branch drift, and reviewer handoff trail.
- Out of scope: modifying parent implementation, revising canonical design
  truth, or changing any runtime / contract file under the parent task.

The only file created by this sidecar is:

- `support/sidecars/P2-V9-UI-TEN-001/P2-V9-UI-TEN-001-SIDECAR-REVIEW.md`

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar row

`scripts/ai-status.sh show P2-V9-UI-TEN-001-SIDECAR-REVIEW` reports:

- owner=`Codex2`
- reviewer=`Codex`
- status=`review`
- last_update=`2026-06-29T03:29:01Z`
- helper_parent=`P2-V9-UI-TEN-001`
- helper_kind=`review_packet`
- next=`review packet added; captures parent reopen evidence, anchor commit abf73cd5a, missing tenant archive source, and branch drift vs origin/dev`

### 2.2 Parent row

`scripts/ai-status.sh show P2-V9-UI-TEN-001` reports:

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- last_update=`2026-06-29T03:26:48Z`
- artifacts include:
  - `apps/tenant-console-web/`
  - `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/Tenant Console.html`
  - `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/tenant-av-fallback.jsx`
- recorded `next` / reopen note:

> Review failed: repo lacks the briefed tenant-av-fallback canvas, but owner replaced the existing notFound gate with invented tenant list/detail UI derived from ops concepts (see apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx and app/bookings/av-fallback/page.tsx vs docs/05-ui/drts-design-canvas/ops-av-fallback.jsx). Owner branch codex/p2-v9-ui-ten-001 is also 9 commits behind origin/dev and currently carries a large non-task diff, so it is not integration-ready.

### 2.3 Activity trail relevant to this packet

Filtered `ai-activity-log.jsonl` lines under the canonical status root show:

- `2026-06-29T03:23:58Z` sidecar owner reassigned from `Copilot` to `Codex2`
  after Copilot quota pause.
- `2026-06-29T03:24:36Z` `Codex2` started assembling the review packet.
- `2026-06-29T03:26:48Z` `Codex2` reopened parent `P2-V9-UI-TEN-001` with the
  review-failure note quoted above.
- `2026-06-29T03:29:01Z` `Codex2` handed this sidecar to reviewer `Codex`.
- `2026-06-29T03:30:07Z` orchestrator queued `review_ready_dispatch` for
  reviewer `Codex`.

---

## 3. Evidence Summary

### 3.1 Parent anchor commit

The current parent branch tip is:

- branch=`codex/p2-v9-ui-ten-001`
- commit=`abf73cd5a`
- subject=`wip(P2-V9-UI-TEN-001): anchor tenant AV fallback runtime`

`git show --stat --summary abf73cd5a` reports these task files:

- `apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx`
- `apps/tenant-console-web/app/bookings/av-fallback/page.tsx`
- `apps/tenant-console-web/app/bookings/page.tsx`
- `apps/tenant-console-web/lib/tenant-av-fallback.tsx`
- `apps/tenant-console-web/lib/translations.ts`
- `apps/tenant-console-web/tests/unit/tenant-av-fallback.test.ts`

Stat summary:

- `6 files changed, 765 insertions(+), 5 deletions(-)`
- the list route is new
- the unit test file is new
- the detail route replaces the previous `notFound()` gate

### 3.2 Detail route evidence for the reopen

On `origin/dev`, the tenant detail route is still a hard block:

- `apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx`
  exports `dynamic = "force-dynamic"` and immediately calls `notFound()`
  with a comment stating Tenant Console has no canonical canvas for a dedicated
  AV fallback detail surface.

On `codex/p2-v9-ui-ten-001`, that same route is replaced by a full tenant UI
page with:

- page header / cards / comparison panels
- fallback-stage pills
- planned-vs-actual fulfillment rendering
- billing / SLA summary blocks
- tenant-facing message-code translation helpers

This confirms the parent branch did not preserve the existing "no tenant canvas,
do not render" guard.

### 3.3 New list route evidence

`origin/dev` does not contain
`apps/tenant-console-web/app/bookings/av-fallback/page.tsx`.

The parent branch adds that page and also wires `/bookings/av-fallback` from
the bookings page. The new list UI includes:

- a fallback dashboard banner
- a dedicated table of AV fallback rows
- per-row fallback detail links
- stage / ETA / surcharge columns

The helper layer `apps/tenant-console-web/lib/tenant-av-fallback.tsx` and
`tests/unit/tenant-av-fallback.test.ts` also show the branch introduced a new
tenant-specific AV fallback surface rather than keeping the route disabled until
the missing tenant design source exists.

### 3.4 Missing tenant archive source

The parent task brief and machine-truth artifact list point to:

- `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/Tenant Console.html`
- `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/tenant-av-fallback.jsx`

Those paths do not exist in the current repo snapshot.

Direct filesystem inspection shows:

- `docs/05-ui/drts-design-canvas/archive/` exists
- it contains archived partner-booking files only
- there is no `driver-app-9-20260628/` directory under that archive root
- the only relevant files presently available are:
  - `docs/05-ui/drts-design-canvas/Tenant Console.html`
  - `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`

Additional grep across:

- `docs/05-ui/drts-design-canvas/Tenant Console.html`
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx`
- `docs/05-ui/drts-design-canvas/tenant-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/tenant-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/tenant-screens-3.jsx`

finds no tenant-canonical `av-fallback` screen or route definition.

### 3.5 Ops-canvas substitution evidence

The only concrete fallback canvas available in-repo is
`docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`, whose own header says:

- `Ops Console AV fallback / passenger recovery / sandbox exceptions`
- `EXTENDS Ops Console (red realm)`
- it uses `OPS_NAV`, `OPS_ACTOR`, and dispatch / exception handling concepts

That file models:

- Ops-side AV fallback monitoring
- passenger recovery messaging
- sandbox exception lists

This aligns with the parent reopen note: the branch appears to have derived a
tenant UI from ops concepts because the tenant-specific v9 archive source named
in the brief is absent.

### 3.6 Branch drift vs `origin/dev`

`git rev-list --left-right --count origin/dev...codex/p2-v9-ui-ten-001`
returns:

- left=`9`
- right=`1`

Practical meaning:

- parent branch is `9` commits behind `origin/dev`
- parent branch is `1` commit ahead of `origin/dev`
- that one ahead commit is only the WIP anchor `abf73cd5a`

This is sufficient to support the "branch drift vs origin/dev" part of the
handoff summary. It also explains why the parent branch was not reviewable as
an integration-ready closeout branch.

### 3.7 Non-task-diff caveat

The parent reopen note additionally states the owner branch carried a large
non-task diff. From this isolated sidecar worktree, there is no live worktree
currently attached to `codex/p2-v9-ui-ten-001`, so that specific dirty-tree
claim cannot be freshly re-inspected here. This packet preserves it as recorded
machine truth from the `2026-06-29T03:26:48Z` parent reopen event rather than
recasting it as independently re-verified filesystem evidence.

---

## 4. Reviewer Hotspots

Reviewer `Codex` should confirm:

1. This sidecar remains support-only and does not edit parent runtime or
   canonical design truth.
2. The parent reopen reason is faithfully copied from machine truth, including
   the explicit route paths and missing archive source claim.
3. `abf73cd5a` is correctly represented as a WIP anchor commit, not a closeout.
4. The missing design-source evidence is concrete: the briefed archive path is
   absent, while `ops-av-fallback.jsx` is present and tenant canvas files do
   not expose an equivalent screen.
5. The branch drift statement is backed by direct git evidence:
   `behind 9 / ahead 1` versus `origin/dev`.
6. The packet does not overclaim fresh proof for the recorded "large non-task
   diff" beyond what machine truth already states.

Suggested approval wording:

> 審查通過：P2-V9-UI-TEN-001 sidecar review packet 已補齊缺失 artifact，並正確固化 parent `reopen` 證據、anchor commit `abf73cd5a`、brief 指向的 tenant archive source 缺失，以及 `codex/p2-v9-ui-ten-001` 相對 `origin/dev` 的 `behind 9 / ahead 1` drift。packet 僅新增 support artifact，未改 canonical truth 或 parent runtime。

Suggested reopen wording:

> packet needs refresh: [machine-truth mismatch / wrong git evidence / support-scope violation]

---

## 5. Commands

Reviewer approval:

```bash
AI_NAME=Codex scripts/ai-status.sh approve P2-V9-UI-TEN-001-SIDECAR-REVIEW \
  "審查通過：P2-V9-UI-TEN-001 sidecar review packet 已補齊缺失 artifact，並正確固化 parent reopen 證據、anchor commit abf73cd5a、brief 指向的 tenant archive source 缺失，以及 codex/p2-v9-ui-ten-001 相對 origin/dev 的 behind 9 / ahead 1 drift。support artifact only，未改 canonical truth 或 parent runtime。"
```

Reviewer reopen:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen P2-V9-UI-TEN-001-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / wrong git evidence / support-scope violation]"
```

Owner closeout after sidecar approval:

```bash
AI_NAME=Codex2 INTEGRATION_STATUS=not_applicable NO_COMMIT_REQUIRED=1 scripts/ai-status.sh done \
  P2-V9-UI-TEN-001-SIDECAR-REVIEW \
  "Done: review packet recorded the parent reopen evidence, anchor commit abf73cd5a, missing tenant archive source, and branch drift versus origin/dev without changing canonical truth."
```

---

## 6. Change Log

- `2026-06-29` - Materialized the missing sidecar artifact at the assigned path.
- `2026-06-29` - Captured parent reopen evidence from machine truth and activity
  history.
- `2026-06-29` - Added direct git / filesystem evidence for `abf73cd5a`, the
  missing tenant archive source, and the `behind 9 / ahead 1` branch drift.
