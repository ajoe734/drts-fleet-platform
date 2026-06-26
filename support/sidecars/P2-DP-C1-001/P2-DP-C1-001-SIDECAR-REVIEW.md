# P2-DP-C1-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `P2-DP-C1-001`
**Parent Owner / Reviewer:** `Codex` / `Codex2`
**Sidecar Owner / Reviewer:** `Claude` / `Codex`
**Generated:** `2026-06-26` (UTC)
**Snapshot Basis:** `ai-status.json` (via `scripts/ai-status.sh show`), `ai-activity-log.jsonl`, `git show`, and `git log`
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet supports the review of `P2-DP-C1-001` (platform-admin
Compliance/Investigation route group + scopes + backend deep-links). It is
support-only and does not modify canonical truth. As of this refresh the parent
is **back at `in_progress`** (owner `Codex`, last_update `2026-06-26T18:49:59Z`).
Parent reviewer `Codex2` **did approve** the slice at `2026-06-26T18:32:14Z`
against deliverable tip `71a784abd`, but that approval has since been **superseded
by owner closeout work**: the owner took the `owned_finalize_dispatch`, pushed two
post-approval commits, and recorded `progress` events that demoted the row from
`review_approved` back to `in_progress`. The current branch tip is now
`ad5caf3dd`, **two commits past** the approved `71a784abd`. This packet therefore
serves two audiences: the **historical** approval that parent reviewer `Codex2`
recorded against `71a784abd`, and the **current** finalize/integration state that
parent owner `Codex` is now working through. It gives one place to audit:

- the parent's recorded lifecycle, including the `review → reopen → review →
  review_approved → in_progress` cycle (approval landed, then owner closeout
  reopened the row as `in_progress`)
- all four deliverable commits, their trailers, and the branch position vs `dev`
- a per-criterion acceptance-to-evidence map with concrete files and anchors
- the two reopen findings and exactly how each was addressed in the fix commit
- the verification caveats the parent itself recorded, including the regressions
  the post-approval closeout commit fixed

The most important reviewer caveat is that **the approved commit and the branch
tip now differ by two commits**. The **approved** commit remains `71a784abd` (the
tip `Codex2` approved at `2026-06-26T18:32:14Z`). After approval the owner pushed:
(1) an **integration merge** `94e6721c7` ("P2-DP-C1-001: integrate origin/dev for
closeout") merging `origin/dev` tip `99836f121` into the branch, and (2) a
**closeout fix** `ad5caf3dd` ("P2-DP-C1-001: fix platform-admin i18n placeholders
and route-context test") that repaired an i18n-guard failure and a route-context
unit-test regression present at the approved tip. The branch is now **0 commits
behind / 4 ahead of `origin/dev`** (merge-base is the dev tip `99836f121`), so the
earlier "3 behind dev, needs rebase" caveat is **resolved** — but it was resolved
with a **merge commit** (`94e6721c7`) that `dev` branch protection forbids on a
direct push, so landing still requires a **squash PR** (a squash collapses the
merge commit and the four commits into one trailer-clean subject; a
merge-preserving land would be rejected). The owner's current `next` flags a
**commit-trailers failure** and an open question of whether the task can reach
`review`/`done` **without a history rewrite** (see §3.2). The parent also recorded
that `pnpm --filter @drts/api typecheck` failed on a **pre-existing**
`regulatory-reporting.controller` `actorType` mismatch unrelated to this diff; the
integration merge now brings in dev's P2-REG-001 (#960) regulatory changes, so the
owner should re-confirm a full `@drts/api` typecheck on the merged tree before
merge. None of the post-approval commits landed on `dev`, so the squash-PR land,
the trailer reconciliation, and the `@drts/api` typecheck re-confirmation remain
open **finalize/integration** concerns. All are explained in §3, §5, and §6.

---

## 1. Scope Boundary

In scope:

- snapshot the parent row and lifecycle exactly as machine truth records them
- summarize the deliverable commits, trailers, and branch position vs `dev`
- map each acceptance clause to concrete files, scopes, and code anchors
- record the reopen findings and their fixes so the reviewer can confirm closure
- record the parent's own verification evidence and its open caveats
- hand the packet to the assigned reviewer without changing the parent task

Out of scope:

- editing L1/L2 product truth or the parent implementation files
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through official status commands
- rerunning the parent's full verification suite (this packet records the
  parent-recorded evidence; it does not re-execute it)
- deciding whether the pending-design placeholder screens are acceptable for
  parent `done`; this packet only records that they exist and why
- deciding the owner's finalize path (squash PR vs history rewrite); this packet
  records the trailer/branch facts the owner is acting on, not the decision

---

## 2. Machine-Truth Snapshot

### 2.1 Parent row

`scripts/ai-status.sh show P2-DP-C1-001` currently records:

- id=`P2-DP-C1-001`
- title=`platform-admin Compliance/Investigation route group + scopes + deep-links`
- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` (was `review_approved` at `18:32:14Z`; owner closeout
  `progress` events demoted it back)
- phase=`phase2-tesla-fsd-sandbox-202606`
- depends_on=`P2-WP0`, `P2-ACC-002`, `P2-EVD-002`
- last_update=`2026-06-26T18:49:59Z`
- artifacts=`apps/api/src/modules/accident-investigation/`,
  `apps/api/src/modules/platform-admin/`, `apps/platform-admin-web/`

Recorded `next` field (parent owner `Codex`, resumed closeout):

> Resumed owner closeout: verifying branch/PR/CI state, commit trailers failure,
> and whether task can move to review/done without history rewrite.

The deliverable tip the reviewer approved (`71a784abd`) is unchanged from the
second handoff, so the acceptance-to-evidence map (§4), reopen-fix map (§5), and
the parent-recorded approval verification (§6) below still describe `71a784abd`.
What changed since approval is the **branch tip**: two owner commits
(`94e6721c7`, `ad5caf3dd`) now sit on top of the approved commit, and the row is
back at `in_progress`. The historical approval `next` (sandbox compliance route
group + scopes + four-eyes + backend-provided links + APIs live) is preserved in
§2.3 and §4.

### 2.2 Acceptance clause (single combined criterion)

`ai-status.json` records one combined acceptance string:

> Route group + scopes enforced; export request and approve require different
> actors; ROC scope cannot release hold; deep-link is backend-provided;
> compliance/investigations APIs live; unit+integration green

§4 decomposes this into six checkable sub-claims and maps each to evidence.

### 2.3 Parent lifecycle chain

The parent's authoritative lifecycle in `ai-activity-log.jsonl` is:

| Event             | Timestamp UTC          | Agent    | Note                                                                                                                          |
| ----------------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `start`           | `2026-06-26T17:38:38Z` | `Codex`  | Began compliance/investigation route group, scopes, and backend deep-links.                                                 |
| `handoff`         | `2026-06-26T18:14:06Z` | `Codex`  | First handoff to `Codex2` at commit `fe150898b`; tsc/vitest/eslint cited.                                                   |
| `reopen`          | `2026-06-26T18:17:32Z` | `Codex2` | Two findings: (1) new pages built without a canvas source screen; (2) frontend still rebuilt deep-links from query params.  |
| `progress`        | `2026-06-26T18:17:54Z` | `Codex`  | Reviewing implementation against design-canvas requirements and the backend deep-link contract.                            |
| `handoff`         | `2026-06-26T18:29:07Z` | `Codex`  | Second handoff at commit `71a784abd`: screen-requirements note + pending-design placeholders + backend-provided links.      |
| `review_approved` | `2026-06-26T18:32:14Z` | `Codex2` | Approved against `71a784abd`; six acceptance sub-claims confirmed; integration+unit+platform-admin-web typecheck PASS.       |
| `progress`        | `2026-06-26T18:49:10Z` | `Codex`  | Owner closeout reached PR/CI stage; pushed `ad5caf3dd` after fixing platform-admin i18n guard + route-context unit regressions. |
| `progress`        | `2026-06-26T18:49:59Z` | `Codex`  | Resumed owner closeout: verifying branch/PR/CI state, commit-trailers failure, and whether task can reach review/done without history rewrite. |

The task was approved at `18:32:14Z`, then the owner took the
`owned_finalize_dispatch` and the two `progress` events above demoted the row
from `review_approved` back to **`in_progress`**. The **approved** commit is the
second handoff `71a784abd`, not the first handoff `fe150898b`; the **current
branch tip** is the post-approval closeout fix `ad5caf3dd` (§3.1). The approval
introduced no new commit, but the two owner commits that followed it did.

### 2.4 Sidecar lifecycle

This sidecar's own authoritative lifecycle in `ai-activity-log.jsonl` (kept
current through this refresh so the artifact reflects every completed transition,
including its own latest handoff and the reopen that followed it):

| Event              | Timestamp UTC          | Agent          | Note                                                                            |
| ------------------ | ---------------------- | -------------- | ------------------------------------------------------------------------------- |
| `assign`           | `2026-06-26T18:29:17Z` | `Codex`        | Auto-created review-packet sidecar; owner `Claude`, reviewer `Codex`.           |
| `sidecar_created`  | `2026-06-26T18:29:17Z` | `Orchestrator` | Auto-created while utilization remained below threshold.                        |
| `start`            | `2026-06-26T18:30:07Z` | `Claude`       | Began building this packet against deliverable `71a784abd`.                     |
| `handoff`          | `2026-06-26T18:33:27Z` | `Claude`       | First sidecar handoff to `Codex` at packet commit `2b4e7b29b`.                  |
| `reopen`           | `2026-06-26T18:35:32Z` | `Codex`        | Stale: parent reached `review_approved` `18:32:14Z` before this `18:33:27Z` handoff; packet still showed `review`. |
| `progress`         | `2026-06-26T18:36:35Z` | `Claude`       | Refreshed packet after parent reached `review_approved`; dev advanced to `99836f121` (branch then 3 behind).      |
| `handoff`          | `2026-06-26T18:39:29Z` | `Claude`       | Second sidecar handoff to `Codex` at packet commit `2937404ad` (refreshed to parent `review_approved`).           |
| `reopen`           | `2026-06-26T18:41:46Z` | `Codex`        | §2.4 stopped at the `18:36:35Z` progress and omitted the `18:39:29Z` handoff; §9 cited `rg`, unavailable in some worker envs. |
| `handoff`          | `2026-06-26T18:47:37Z` | `Claude`       | Third sidecar handoff to `Codex` at packet commit `783a3c78c` (pushed `origin/claude/p2-dp-c1-001-sidecar-review`); added the `18:39:29Z` handoff/`18:41:46Z` reopen rows, switched §9 to portable `grep`, folded in integration merge `94e6721c7`. |
| `reopen`           | `2026-06-26T18:49:25Z` | `Codex`        | §2.4 still omitted the `18:47:37Z` handoff; parent branch advanced past the snapshot to `ad5caf3dd` (`0 4`, 47 files / +3404 / -352). |
| `progress`         | `2026-06-26T18:52:34Z` | `Claude`       | This refresh: added the `18:47:37Z` handoff + `18:49:25Z` reopen rows; reframed parent to `in_progress` (post-approval closeout); updated §3.1–§3.4/§6 to tip `ad5caf3dd`. |

The next sidecar `handoff` will return the packet to reviewer `Codex` and is the
transition that follows this `18:52:34Z progress` row. Every completed transition
up to and including the `18:49:25Z` reopen is now recorded above; the only row a
handoff can never pre-contain is the handoff that performs it.

---

## 3. Deliverable Commits & Branch Position

### 3.1 Commits on the deliverable branch

`git log --oneline origin/dev..origin/codex/p2-dp-c1-001` (four commits):

| Commit      | Subject                                                              | Role                        |
| ----------- | ------------------------------------------------------------------- | --------------------------- |
| `fe150898b` | `feat(P2-DP-C1-001): add platform-admin compliance routes`          | first handoff (superseded)  |
| `71a784abd` | `P2-DP-C1-001: align sandbox compliance routes with design handoff` | **approved deliverable** (reopen fix; `Codex2` approved this tip at `18:32:14Z`) |
| `94e6721c7` | `P2-DP-C1-001: integrate origin/dev for closeout`                   | integration merge commit (parents `71a784abd` + dev tip `99836f121`), added by owner `Codex` after approval |
| `ad5caf3dd` | `P2-DP-C1-001: fix platform-admin i18n placeholders and route-context test` | **current branch tip** — post-approval closeout fix (single parent `94e6721c7`; repaired i18n guard + route-context unit regressions) |

The approval at `2026-06-26T18:32:14Z` was recorded against `71a784abd`. The owner
has since added the integration merge `94e6721c7` and the closeout fix `ad5caf3dd`
on top for closeout, so the **branch tip** (`ad5caf3dd`) and the **approved
commit** (`71a784abd`) now differ by **two commits**: review acceptance (§4–§6)
stands on `71a784abd`; the integration shape (§3.3) and the post-approval fix
(§3.2, §6) are `94e6721c7`/`ad5caf3dd`.

### 3.2 Trailers

`git show --no-patch ad5caf3dd` (current branch tip, closeout fix) carries:

- `LLM-Agent: Codex`
- `Task-ID: P2-DP-C1-001`
- `Reviewer: Codex2`
- `Verification: pnpm i18n:guard`
- `Verification: pnpm exec vitest run tests/unit/platform-admin-assistant-route-context.test.ts --config vitest.config.ts`
- `Verification: pnpm --filter @drts/platform-admin-web typecheck`

`git show --no-patch 94e6721c7` (integration merge) carries:

- `LLM-Agent: Codex`
- `Task-ID: P2-DP-C1-001`
- `Reviewer: Codex2`
- `Verification: CI=true pnpm install --frozen-lockfile`
- `Verification: pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts tests/unit/auth-bootstrap.test.ts tests/unit/regulatory-reporting.service.test.ts tests/integration/int-reg-001-regulatory-notification-lifecycle.test.ts --config ../../vitest.config.ts`
- `Verification: pnpm --filter @drts/platform-admin-web typecheck`

The integration merge's verification set exercises the regulatory unit
(`regulatory-reporting.service.test.ts`) and integration
(`int-reg-001-regulatory-notification-lifecycle.test.ts`) suites that arrived with
dev's P2-REG-001 (#960), which is what the merge folds in.

`git show --no-patch 71a784abd` (approved deliverable) carries:

- `LLM-Agent: codex`
- `Task-ID: P2-DP-C1-001`
- `Reviewer: Codex2`
- `Verification: pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts --config ../../vitest.config.ts`
- `Verification: pnpm --dir apps/api exec vitest run tests/unit/auth-bootstrap.test.ts --config ../../vitest.config.ts`
- `Verification: pnpm --filter @drts/platform-admin-web typecheck`

`git show --no-patch fe150898b` (first handoff) carries `LLM-Agent: Codex`,
`Task-ID: P2-DP-C1-001`, `Reviewer: Codex2`. **All four commits** carry the
required `Task-ID` and `Reviewer` trailers. One observable trailer inconsistency:
the `LLM-Agent` value is lowercase `codex` on `71a784abd` but `Codex` on
`fe150898b`, `94e6721c7`, and `ad5caf3dd` (case differs on one of four commits).
The owner's current `next` flags a **"commit-trailers failure"** during closeout
and asks whether the task can reach `review`/`done` **without a history rewrite**.
This packet records the trailer facts but does not diagnose the exact CI rule that
failed; the case-mismatch above is the visible candidate. Note that a **squash
land collapses all four commits into one subject**, so a squash PR is the path
that avoids a history rewrite while normalizing the trailer set (see §3.3).

### 3.3 Branch position vs `dev`

The branch was **3 behind / 2 ahead** at the original snapshot; the owner's
integration merge `94e6721c7` re-based the comparison onto the current dev tip,
and the closeout fix `ad5caf3dd` added one more commit, so the position is now:

- `git rev-list --left-right --count origin/dev...origin/codex/p2-dp-c1-001` =
  `0  4` (was `3  2`, then `0  3`) — the branch is now **0 commits behind / 4
  ahead** of `dev`.
- `git merge-base origin/dev origin/codex/p2-dp-c1-001` = `99836f121`, i.e. the
  current `origin/dev` tip itself (P2-REG-001 #960, P2-UI-ROC-001 #958,
  P2-UI-SAFE-001 #957). The old branch base `8f95cde3a` is no longer the
  merge-base because dev's tip is now reachable through the integration merge.
- so the earlier "needs a rebase before PR/merge" caveat is **resolved** — the
  branch already contains current dev. But it still carries a **merge commit**
  (`94e6721c7`, two parents), and `dev` branch protection forbids merge commits on
  a direct/merge-preserving land, so the land path is a **squash PR** (the squash
  collapses the merge and the four commits into one trailer-clean subject — which
  also normalizes the §3.2 `LLM-Agent` case mismatch without a history rewrite).
  This is a **finalize/integration** concern for parent owner `Codex`, not a
  review blocker.
- `git branch -r --contains 71a784abd` (and `94e6721c7`, `ad5caf3dd`) resolves
  only to `origin/codex/p2-dp-c1-001`; none of the four commits is yet on
  `origin/dev`. The `review_approved` decision did not change this — approval is a
  status transition, not a merge — and neither did the post-approval closeout
  pushes.

### 3.4 Diff size

`git diff --stat origin/dev...origin/codex/p2-dp-c1-001` (from merge-base
`99836f121`, identical to the two-dot `origin/dev..` delta since the branch
contains dev):
**47 files changed, 3404 insertions(+), 352 deletions(-)**, spanning
`apps/api` (compliance/investigation/evidence/regulatory modules + tests),
`apps/platform-admin-web` (route group, shell, route-context, pending-design
screen + its unit test, client, translations), `packages/contracts`,
`packages/api-client`, and one `docs/05-ui` screen-requirements note. The count
grew from the prior 46 files / +3268 / -279 because the post-approval closeout fix
`ad5caf3dd` touched 13 files (+164 / -101): the nine route `page.tsx` bodies,
`route-context.ts` and its unit test
(`platform-admin-assistant-route-context.test.ts`),
`sandbox-design-pending-screen.tsx`, and a large `lib/translations.ts` update
(+189-ish) that resolved the i18n-guard placeholders.

---

## 4. Acceptance-to-Evidence Map

The single combined acceptance clause is decomposed into six sub-claims. These map
to the **approved deliverable `71a784abd`**; where the post-approval fix
`ad5caf3dd` refined the same surface, it is noted.

### 4.1 Route group enforced

`apps/platform-admin-web/app/platform-admin/` adds the nine sandbox routes:

- `compliance/page.tsx`
- `compliance/trips/[tripId]/page.tsx`
- `investigations/page.tsx`
- `investigations/[caseId]/page.tsx`
- `investigations/[caseId]/timeline/page.tsx`
- `evidence/exports/page.tsx`
- `evidence/legal-holds/page.tsx`
- `evidence/manifests/[manifestId]/page.tsx`
- `regulatory-reports/page.tsx`

API side, `apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts`
(+327) registers the matching `@Get`/`@Post` handlers under the route group.
(The closeout fix `ad5caf3dd` later adjusted the i18n placeholder text inside
these nine page bodies; the route structure itself is unchanged from `71a784abd`.)

### 4.2 Scopes enforced (12 sandbox scopes per §3.4)

`apps/api/src/common/auth/auth.constants.ts` (+20) defines exactly the twelve
sandbox scopes, each enforced on a controller route via `@RequireScopes(...)`:

| # | Scope                                    | Guards (controller)                              |
| - | ---------------------------------------- | ------------------------------------------------ |
| 1 | `sandbox.compliance.read`                | `GET compliance/takeover-reviews`, `…/evidence-discrepancies` |
| 2 | `sandbox.compliance.manage`              | compliance write surface                         |
| 3 | `sandbox.investigation.read`             | `GET investigations`, `…/:caseId`, `…/timeline`  |
| 4 | `sandbox.investigation.manage`           | investigation write surface                      |
| 5 | `sandbox.evidence.preview`               | `GET evidence/manifests/:id`, `…/exports`, `…/legal-holds` |
| 6 | `sandbox.evidence.export.request`        | `POST evidence/exports/request`                  |
| 7 | `sandbox.evidence.export.approve`        | `POST evidence/exports/:id/approve`              |
| 8 | `sandbox.legal_hold.place`               | `POST evidence/legal-holds`                      |
| 9 | `sandbox.legal_hold.release.request`     | `POST evidence/legal-holds/:id/release-request`  |
| 10| `sandbox.legal_hold.release.approve`     | `POST evidence/legal-holds/:id/release-approve`  |
| 11| `sandbox.regulatory_report.review`       | regulatory report review route                   |
| 12| `sandbox.regulatory_report.submit`       | regulatory report submit route                   |

The split scopes (`*.request` vs `*.approve`) are the scope-level half of the
four-eyes control; §4.3 covers the runtime actor-level half.

### 4.3 Export request and approve require different actors (four-eyes)

`apps/api/src/modules/platform-admin/platform-admin-compliance.service.ts`
(+600) enforces actor separation at runtime, not only via scopes:

- export request stores `requestedByActorId` and leaves `approvedByActorId: null`
  (around lines 156–158)
- export approve rejects the same actor:
  `if (record.requestedByActorId === actorId) throw … "The same actor who
  requested the export cannot approve it."` (lines 198–202)
- legal-hold release mirrors this: release-request stores
  `releaseRequestedByActorId` (line 352); release-approve rejects the same actor:
  `if (record.releaseRequestedByActorId === actorId) throw … "The same actor who
  requested the release cannot approve it."` (lines 403–407)

So both controlled flows (evidence export and legal-hold release) enforce
two-actor separation in the service layer.

### 4.4 ROC scope cannot release hold

`apps/api/src/modules/roc-operations/roc-operations.service.ts` (+427) only
emits a **read-only deep-link** into the platform-admin investigations queue and
never exposes a hold-release path:

- it builds a `CrossAppResourceLink` (imported line 9) with
  `targetApp: "platform-admin"`, `route: "/platform-admin/investigations"`,
  `label: "Open investigations queue"` (around lines 2338–2345)
- the ROC service contains no `release` / `legal_hold` mutation; legal-hold
  release lives exclusively on the platform-admin compliance controller/service
  behind `sandbox.legal_hold.release.*` scopes (§4.2 rows 9–10)

This matches the parent constraint: ROC gets event summary + freeze status +
deep-link only, and cannot release a hold or pull raw evidence.

### 4.5 Deep-link is backend-provided (and consumed, not reconstructed)

This is the second reopen finding (§5.2). The contract type
`CrossAppResourceLink` lives in `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
(+102) and `packages/contracts/src/ui-runtime.ts` (+1); the backend ROC service
populates it (§4.4). On the frontend,
`apps/platform-admin-web/components/assistant/route-context.ts` (+95) maps the
sandbox route keys to canonical hrefs
(`sandbox-investigations → /platform-admin/investigations`, etc., lines 83–87),
and the takeover/discrepancy links route through these backend-provided
platform-admin routes rather than rebuilding URLs from query params. The
post-approval fix `ad5caf3dd` adjusted `route-context.ts` (+4) and its unit test
`apps/platform-admin-web/.../platform-admin-assistant-route-context.test.ts` (+12)
to repair a route-context regression (§6); the backend-provided contract and the
consume-not-reconstruct behavior are unchanged.

### 4.6 Compliance/investigations APIs live; unit+integration green

- live APIs: the compliance controller/service plus
  `accident-investigation.controller.ts` (+13),
  `regulatory-reporting.controller.ts` (+102) / `…service.ts` (+92),
  `vehicle-evidence.controller.ts` (+11) / `…service.ts` (+57), and matching
  `packages/api-client/src/index.ts` (+185) methods.
- tests (parent-recorded as PASS, see §6):
  - integration `apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts` (+304)
  - unit `apps/api/tests/unit/auth-bootstrap.test.ts` (+54)
  - unit `apps/platform-admin-web/.../platform-admin-assistant-route-context.test.ts`
    (route-context; the regression repaired in `ad5caf3dd`, §6)

---

## 5. Reopen Findings & How Each Was Closed

The reviewer reopened at `2026-06-26T18:17:32Z` with two findings. Both were
addressed in the approved tip `71a784abd`.

### 5.1 Finding 1 — pages built without a canvas source screen

> "new platform-admin compliance/investigation/evidence/regulatory pages were
> implemented without a matching design-canvas source screen; task brief says if
> canvas lacks a screen, stop and write a screen-requirements note."

Fix in `71a784abd`:

- the nine route bodies now render a shared pending-design placeholder
  (`apps/platform-admin-web/components/sandbox-design-pending-screen.tsx`, +58)
  built on `buildCanvasTheme({ surface: "platform" })` + `CanvasEmptyState`
  (no invented visuals, no raw hex)
- a screen-requirements hand-off note was added:
  `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
  (+154), which explicitly states the Platform Admin canvas does not define
  these sandbox screens and that engineering must not invent them.

Reviewer judgement needed: confirm the placeholder + requirements-note approach
satisfies the "stop and write a note" rule for this task's `review`. (The
placeholder copy was later normalized by the i18n closeout fix `ad5caf3dd`, §6.)

### 5.2 Finding 2 — frontend reconstructed deep-links from query params

> "backend-provided CrossAppResourceLink exists in contracts/ROC service, but
> frontend still reconstructs /platform-admin/investigations links from query
> params and local lookup instead of consuming the backend deep-link."

Fix in `71a784abd`: takeover/discrepancy investigation links now resolve through
the backend-provided platform-admin detail/queue routes via
`components/assistant/route-context.ts` (§4.5) rather than rebuilding URLs from
query params and local lookup. The post-approval fix `ad5caf3dd` repaired a unit
regression in this same route-context surface (§6) without changing the
consume-not-reconstruct behavior.

---

## 6. Verification Evidence Recorded By The Parent

The parent's recorded approval verification set (commit trailers + `handoff`
note on the approved tip `71a784abd`):

- `pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts --config ../../vitest.config.ts` → **PASS**
- `pnpm --dir apps/api exec vitest run tests/unit/auth-bootstrap.test.ts --config ../../vitest.config.ts` → **PASS**
- `pnpm --filter @drts/platform-admin-web typecheck` → **PASS**
- targeted `eslint` on touched files (first handoff)

Post-approval closeout fix (`ad5caf3dd`, current tip). During owner closeout the
approved tip turned out to have two regressions the approval verification set did
**not** cover, and the closeout commit fixed both, recording in its trailers:

- `pnpm i18n:guard` → fixed: the nine sandbox page bodies + the pending-design
  screen carried placeholder i18n keys that the i18n guard rejected; the closeout
  commit reworked `lib/translations.ts` (+~189) so the guard passes.
- `pnpm exec vitest run tests/unit/platform-admin-assistant-route-context.test.ts --config vitest.config.ts` → fixed: a route-context unit regression.
- `pnpm --filter @drts/platform-admin-web typecheck` → re-confirmed PASS.

So the approval at `18:32:14Z` was recorded against a tip that did **not** pass
`i18n:guard` or the route-context unit test (the approval cited only the scoped
integration/unit suites and platform-admin-web typecheck); the owner caught and
fixed those during finalize. The reviewer should weigh whether the approval
should be re-confirmed against the current tip `ad5caf3dd` or whether the squash
PR's CI run is the sufficient gate.

Open caveat the parent itself flagged (at approval time, on `71a784abd`):

- `pnpm --filter @drts/api typecheck` **failed** on a pre-existing
  `regulatory-reporting.controller` `actorType` mismatch that the parent states
  is **unrelated to this diff**. Parent reviewer `Codex2` approved without
  treating this as a blocker.
- Update since approval: the owner's integration merge `94e6721c7` folds in dev's
  P2-REG-001 (#960), which owns `regulatory-reporting`, and its verification
  trailers now include the regulatory unit/integration suites as PASS (§3.2). The
  pre-existing `actorType` mismatch plausibly belongs to that REG-001 surface and
  may now be reconciled on the merged tree — but this sidecar has **not** re-run
  `pnpm --filter @drts/api typecheck` on `ad5caf3dd`, so the caveat is **not**
  verified-closed here. It remains an open **finalize/integration** item: parent
  owner `Codex` should re-run the full `@drts/api` typecheck on the merged tip
  before the squash PR, since CI may run it and the pre-merge result was red.

This sidecar did **not** rerun any of these commands; it records the parent's
existing evidence, the trailers carried by each commit, and the regressions the
closeout commit's trailers state it fixed.

---

## 7. Reviewer Checklist

Reviewer `Codex` (sidecar reviewer) should verify this **packet** is faithful:

- `scripts/ai-status.sh show P2-DP-C1-001` now reports `status=in_progress`,
  owner `Codex`, reviewer `Codex2`, last_update `2026-06-26T18:49:59Z` (the row
  was `review_approved` at `18:32:14Z`, then owner closeout `progress` demoted it)
- `ai-activity-log.jsonl` records the parent `review_approved` event at
  `2026-06-26T18:32:14Z` by `Codex2` against `71a784abd`, followed by owner
  `progress` events at `18:49:10Z` and `18:49:59Z`
- the **approved** deliverable is `71a784abd`; the current **branch tip** is the
  post-approval closeout fix `ad5caf3dd` (single parent `94e6721c7`, which is the
  integration merge of `71a784abd` + dev tip `99836f121`); the tip is **two
  commits past** the approved commit
- the branch is **0 behind / 4 ahead** of `origin/dev` (`rev-list --left-right` =
  `0  4`, merge-base = dev tip `99836f121`); none of the four commits is on
  `origin/dev`; landing needs a **squash PR** because the branch carries a merge
  commit `dev` forbids
- the diff is **47 files / +3404 / -352** (the post-approval `ad5caf3dd` added 13
  files / +164 / -101 over the prior 46/+3268/-279)
- all four commits carry `Task-ID`/`Reviewer`; `LLM-Agent` is lowercase `codex`
  on `71a784abd` and `Codex` on the other three (the §3.2 trailer note the owner's
  "commit-trailers failure" likely refers to; a squash land normalizes it)
- the 12 sandbox scopes in §4.2 match `auth.constants.ts`
- the four-eyes rejections in §4.3 exist in `platform-admin-compliance.service.ts`
- ROC only emits a `CrossAppResourceLink` and has no hold-release path (§4.4)
- both reopen findings (§5) map to real changes in `71a784abd`
- §6 records that `ad5caf3dd` fixed `i18n:guard` + route-context unit regressions
  present at the approved tip, and that the `@drts/api` typecheck caveat is open
- this sidecar remains support-only and edits no canonical truth

Suggested audit commands:

```bash
scripts/ai-status.sh show P2-DP-C1-001
git log --oneline origin/dev..origin/codex/p2-dp-c1-001   # fe150898b, 71a784abd, 94e6721c7, ad5caf3dd
git show --no-patch 71a784abd                              # approved deliverable
git show --no-patch ad5caf3dd                              # current tip (closeout fix)
git rev-list --parents -n 1 ad5caf3dd                      # single parent 94e6721c7 (not a merge)
git rev-list --parents -n 1 94e6721c7                      # merge: parents 71a784abd + 99836f121
git rev-list --left-right --count origin/dev...origin/codex/p2-dp-c1-001   # 0  4
git merge-base origin/dev origin/codex/p2-dp-c1-001        # 99836f121 (= dev tip)
git show 71a784abd:apps/api/src/common/auth/auth.constants.ts | grep -nE 'sandbox\.'
git show 71a784abd:apps/api/src/modules/platform-admin/platform-admin-compliance.service.ts | grep -nE 'cannot approve'
git show 71a784abd:apps/api/src/modules/roc-operations/roc-operations.service.ts | grep -nE 'CrossAppResourceLink|platform-admin/investigations'
git diff --stat origin/dev...origin/codex/p2-dp-c1-001     # 47 files, +3404, -352
```

---

## 8. Handoff Notes

This packet is ready for sidecar review by `Codex`.

Reviewer actions:

- pass:
  `AI_NAME=Codex scripts/ai-status.sh approve P2-DP-C1-001-SIDECAR-REVIEW "<review conclusion>"`
- fail:
  `AI_NAME=Codex scripts/ai-status.sh reopen P2-DP-C1-001-SIDECAR-REVIEW "<what is stale or incorrect>"`
- blocked:
  `AI_NAME=Codex scripts/ai-status.sh blocker P2-DP-C1-001-SIDECAR-REVIEW "<external blocker>"`

Sidecar closeout is support-only. This packet **is** a committed support
artifact under `support/sidecars/P2-DP-C1-001/`, so closeout carries
`COMMIT_HASH`/`COMMIT_SUBJECT`/`PUSH_REMOTE`/`PUSH_BRANCH` with
`INTEGRATION_STATUS=not_applicable` (no canonical truth, no PR/CI/merge).
The sidecar reviewer should judge whether this packet matches machine truth for
the parent's current **`in_progress`** state, and whether the reopen-fix mapping,
the integration shape (branch now 0 behind / 4 ahead via merge commit `94e6721c7`
plus closeout fix `ad5caf3dd`, squash-PR land required), the trailer note, and
the `@drts/api` typecheck caveat are sufficiently explicit for parent owner
`Codex` to act on during finalize. This packet does not itself approve, block, or
finalize the parent task `P2-DP-C1-001`; the historical approval decision was made
by parent reviewer `Codex2` against `71a784abd`, and the `done`/integration steps
stay with parent owner `Codex`.

---

## 9. Evidence Commands For This Packet

Commands used to build this packet. These use only `git`, `grep`, `python3`, and
`scripts/ai-status.sh` so they reproduce in any worker environment; an earlier
refresh cited `rg`, which is not installed in every worker (`rg: command not
found` in at least one), so the recipe below uses portable `grep` instead.

- `scripts/ai-status.sh show P2-DP-C1-001` (now `in_progress`, last_update `2026-06-26T18:49:59Z`)
- `grep '"task_id": "P2-DP-C1-001"' ai-activity-log.jsonl` filtered to `review_approved`/`progress` (confirms the `18:32:14Z` `Codex2` approval against `71a784abd` and the `18:49:10Z`/`18:49:59Z` owner closeout progress events)
- `grep '"task_id": "P2-DP-C1-001-SIDECAR-REVIEW"' ai-activity-log.jsonl` filtered by `type` (sidecar lifecycle for §2.4, including the `18:47:37Z` handoff and `18:49:25Z` reopen)
- `git fetch origin` then `git log --oneline -1 origin/dev` (dev tip `99836f121`, #960)
- `git merge-base origin/dev origin/codex/p2-dp-c1-001` (now `99836f121` = dev tip, because the owner's integration merge `94e6721c7` pulled dev in; the §3.4 diff stat is now 47 files / +3404 / -352)
- `git log --oneline origin/dev..origin/codex/p2-dp-c1-001` (four commits: `fe150898b`, `71a784abd`, `94e6721c7`, `ad5caf3dd`)
- `git rev-list --parents -n 1 ad5caf3dd` (single parent `94e6721c7` — the tip is **not** a merge) and `… 94e6721c7` (merge: parents `71a784abd` + `99836f121`)
- `git show --no-patch ad5caf3dd` / `94e6721c7` / `71a784abd` / `fe150898b` (trailers in §3.2)
- `git show --stat ad5caf3dd` (the 13-file / +164 / -101 closeout fix in §3.4)
- `git branch -r --contains 71a784abd` and `… ad5caf3dd` (all four only on `origin/codex/p2-dp-c1-001`, not `origin/dev`)
- `git rev-list --left-right --count origin/dev...origin/codex/p2-dp-c1-001` (`0  4`)
- `git diff --stat origin/dev...origin/codex/p2-dp-c1-001` (47 files / +3404 / -352)
- targeted `git show 71a784abd:<path> | grep -nE …` lookups on
  `auth.constants.ts`, `platform-admin-compliance.controller.ts`,
  `platform-admin-compliance.service.ts`, `roc-operations.service.ts`,
  `route-context.ts`, `sandbox-design-pending-screen.tsx`, and the
  `docs/05-ui` screen-requirements note

No canonical truth files were edited to create this packet. Only this support
artifact under `support/sidecars/P2-DP-C1-001/` is in scope.
