# P2-DP-C1-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `P2-DP-C1-001` (now **archived / merged to `dev`**)
**Parent Owner / Reviewer:** `Codex` / `Codex2`
**Sidecar Owner / Reviewer:** `Claude` / `Codex`
**Generated:** `2026-06-26` (UTC)
**Snapshot Basis:** `ai-status.json` (via `scripts/ai-status.sh show`), `ai-activity-log.jsonl`, `git show`, and `git log`
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet supports the review of `P2-DP-C1-001` (platform-admin
Compliance/Investigation route group + scopes + backend deep-links). It is
support-only and does not modify canonical truth. **As of this refresh the parent
has reached its final closeout: the slice was squash-merged to `origin/dev` and the
row is no longer on the live task board** (`scripts/ai-status.sh show P2-DP-C1-001`
returns `Task not found`; `P2-DP-C1-001` is in `archived_task_ids`).

The final closeout path was:

1. A **first** approval against `71a784abd` (parent reviewer `Codex2`,
   `2026-06-26T18:32:14Z`).
2. An owner closeout attempt on a **merge-commit branch** (`ad5caf3dd`, opened as
   **PR #961** with auto-squash) that hit a **commit-trailers failure** and a
   history-rewrite question — the merge commit `94e6721c7` is exactly what made the
   trailer set non-clean and the land path awkward.
3. The owner **abandoned that branch/PR** and produced a **clean linear replacement
   branch** `origin/codex/p2-dp-c1-001-clean @ 623808d7f` (a single squashed,
   trailer-clean commit) plus an actor-type audit fix, opened as **PR #962**.
4. Parent reviewer `Codex2` **re-approved** the slice against `623808d7f` at
   **`2026-06-26T18:58:32Z`** (the **second / final** `review_approved`).
5. PR #962 **squash-merged to `origin/dev`** as **`17650b25e`**
   (`P2-DP-C1-001: platform-admin compliance and investigation routes (#962)`); the
   parent then recorded `reconciled_from_git` from `origin/dev@17650b25e144` at
   `2026-06-26T18:59:18Z` and was archived.

**What this means for the packet:** the earlier `ad5caf3dd` / PR #961 /
"0 behind / 4 ahead merge-commit branch" material is now **historical** — that
branch did not land. What landed on `dev` is the content-identical clean squash
**`623808d7f` → `17650b25e`** (`git diff 623808d7f 17650b25e` is empty). The final
landed commit also carries a **single clean trailer set** (`LLM-Agent: Codex`,
correct case) and verification trailers that cover `@drts/api build`,
`@drts/api typecheck`, the sandbox-compliance integration suite, the regulatory
suites, `@drts/platform-admin-web typecheck`, `i18n:guard`, and the route-context
unit test — so the prior packet's open caveats (trailer case mismatch, the
`i18n:guard` and route-context regressions, and the pre-existing `@drts/api`
`actorType` typecheck failure) are all **closed on the commit that landed**. This
packet therefore reads as a **post-merge** record: the historical chain that got
there, and the final landed state on `dev`.

The packet gives one place to audit:

- the parent's recorded lifecycle, including the two-approval closeout
  (`71a784abd` → merge-branch closeout abandoned → clean replacement `623808d7f`
  re-approved → squash-merged to `dev`)
- the final landed commit on `dev`, its trailers, and its diff vs the prior dev tip
- a per-criterion acceptance-to-evidence map with concrete files and anchors
- the two reopen findings and exactly how each was addressed in the slice
- the verification evidence carried by the landed commit's trailers

---

## 1. Scope Boundary

In scope:

- snapshot the parent row and lifecycle exactly as machine truth records them
- summarize the final landed commit, its trailers, and its diff vs the prior dev tip
- map each acceptance clause to concrete files, scopes, and code anchors
- record the reopen findings and their fixes so the reviewer can confirm closure
- record the verification evidence carried by the landed commit
- hand the packet to the assigned reviewer without changing the parent task

Out of scope:

- editing L1/L2 product truth or the parent implementation files
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through official status commands
- rerunning the parent's full verification suite (this packet records the
  parent-recorded evidence and the landed commit's trailers; it does not
  re-execute them)
- re-litigating the parent's already-recorded final approval and merge; the parent
  task is closed and archived, and this sidecar only documents that machine truth

---

## 2. Machine-Truth Snapshot

### 2.1 Parent row

`scripts/ai-status.sh show P2-DP-C1-001` now returns **`Task not found`** — the row
has been archived (`P2-DP-C1-001` ∈ `archived_task_ids`) after reaching its final
`review_approved` and reconciling from the merged `dev` tip. The last recorded
machine-truth facts for the parent were:

- id=`P2-DP-C1-001`
- title=`platform-admin Compliance/Investigation route group + scopes + deep-links`
- owner=`Codex`
- reviewer=`Codex2`
- final status=`review_approved` (`2026-06-26T18:58:32Z`, against `623808d7f`),
  followed by `reconciled_from_git` from `origin/dev@17650b25e144`
  (`2026-06-26T18:59:18Z`), then archived
- phase=`phase2-tesla-fsd-sandbox-202606`
- depends_on=`P2-WP0`, `P2-ACC-002`, `P2-EVD-002`
- artifacts=`apps/api/src/modules/accident-investigation/`,
  `apps/api/src/modules/platform-admin/`, `apps/platform-admin-web/`

The **final approved deliverable** is the clean branch
`origin/codex/p2-dp-c1-001-clean @ 623808d7f`; the **landed** commit on `dev` is the
content-identical squash `17650b25e` (PR #962). The first approval's tip
`71a784abd` and the abandoned merge-commit branch tip `ad5caf3dd` (PR #961) are now
historical (§2.3, §3.5).

### 2.2 Acceptance clause (single combined criterion)

`ai-status.json` recorded one combined acceptance string:

> Route group + scopes enforced; export request and approve require different
> actors; ROC scope cannot release hold; deep-link is backend-provided;
> compliance/investigations APIs live; unit+integration green

§4 decomposes this into six checkable sub-claims and maps each to evidence in the
landed slice.

### 2.3 Parent lifecycle chain

The parent's authoritative lifecycle in `ai-activity-log.jsonl`, through final
closeout:

| Event                  | Timestamp UTC          | Agent    | Note                                                                                                                          |
| ---------------------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `start`                | `2026-06-26T17:38:38Z` | `Codex`  | Began compliance/investigation route group, scopes, and backend deep-links.                                                 |
| `handoff`              | `2026-06-26T18:14:06Z` | `Codex`  | First handoff to `Codex2` at commit `fe150898b`; tsc/vitest/eslint cited.                                                   |
| `reopen`               | `2026-06-26T18:17:32Z` | `Codex2` | Two findings: (1) new pages built without a canvas source screen; (2) frontend still rebuilt deep-links from query params.  |
| `progress`             | `2026-06-26T18:17:54Z` | `Codex`  | Reviewing implementation against design-canvas requirements and the backend deep-link contract.                            |
| `handoff`              | `2026-06-26T18:29:07Z` | `Codex`  | Second handoff at commit `71a784abd`: screen-requirements note + pending-design placeholders + backend-provided links.      |
| `review_approved` (1st)| `2026-06-26T18:32:14Z` | `Codex2` | **First** approval against `71a784abd`; six acceptance sub-claims confirmed; integration+unit+platform-admin-web typecheck PASS. |
| `progress`             | `2026-06-26T18:49:10Z` | `Codex`  | Owner closeout: pushed `ad5caf3dd` (i18n + route-context fixes), opened **PR #961** against `dev` with auto-squash.         |
| `progress`             | `2026-06-26T18:49:59Z` | `Codex`  | Resumed closeout: **commit-trailers failure**, and whether the task can reach review/done without a history rewrite.        |
| `handoff`              | `2026-06-26T18:55:24Z` | `Codex`  | Trailer-history repair: pushed `codex/p2-dp-c1-001` at `a3c3de4ba` (API audit actor-type fix) **and a clean replacement branch `codex/p2-dp-c1-001-clean` at `623808d7f`**; opened **PR #962**. |
| `review_approved` (2nd)| `2026-06-26T18:58:32Z` | `Codex2` | **Final** approval against `origin/codex/p2-dp-c1-001-clean @ 623808d7f`; acceptance re-confirmed on inspection.            |
| `progress`             | `2026-06-26T18:59:18Z` | `Codex`  | Owner closeout: verifying approved branch commit and preparing `done` finalization.                                        |
| `reconciled_from_git`  | `2026-06-26T18:59:18Z` | `Codex`  | Reconciled from `origin/dev@17650b25e144` (PR #962 squash-merged to `dev`). Row subsequently archived.                      |

The slice was approved **twice**: first against `71a784abd` (18:32:14Z), then —
after the merge-commit closeout branch hit a trailer/history problem and was
replaced by a clean linear branch — finally against `623808d7f` (18:58:32Z). PR
#962 squash-merged that clean branch into `dev` as `17650b25e`, and the parent
reconciled and archived. PR #961 / `ad5caf3dd` did **not** land.

### 2.4 Sidecar lifecycle

This sidecar's own authoritative lifecycle in `ai-activity-log.jsonl` (kept current
through this refresh so the artifact reflects every completed transition, including
its own latest handoff and the reopen that followed it):

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
| `progress`         | `2026-06-26T18:52:34Z` | `Claude`       | Refresh: added the `18:47:37Z` handoff + `18:49:25Z` reopen rows; reframed parent to `in_progress` (post-approval closeout); updated §3/§6 to tip `ad5caf3dd`. |
| `handoff`          | `2026-06-26T18:58:20Z` | `Claude`       | Fourth sidecar handoff to `Codex` at packet commit `1c29eb033` (pushed `origin/claude/p2-dp-c1-001-sidecar-review`); reframed parent to `in_progress`, tip `ad5caf3dd`. |
| `reopen`           | `2026-06-26T19:00:52Z` | `Codex`        | Stale: since the `18:58:20Z` handoff the parent reached a **second** `review_approved` `18:58:32Z` on clean branch `623808d7f`, reconciled from `origin/dev@17650b25e144`, and was archived; §2/3/7/8/9 still showed the parent as current `in_progress` on `ad5caf3dd` / PR #961, `0 behind / 4 ahead`. |
| `progress`         | `2026-06-26T19:01:28Z` | `Claude`       | This refresh: parent is now **archived / merged to `dev`** via PR #962 (`17650b25e`); reframed the whole packet to the final landed state (clean deliverable `623808d7f`), demoted `ad5caf3dd` / `71a784abd` / PR #961 to historical. |
| `handoff`          | `2026-06-26T19:06:59Z` | `Claude`       | Fifth sidecar handoff to `Codex` at packet commit `93c545100` (pushed `origin/claude/p2-dp-c1-001-sidecar-review`); packet reframed to the final merged-to-`dev` closeout. |
| `reopen`           | `2026-06-26T19:09:37Z` | `Codex`        | Narrative accepted as matching machine truth, but the **evidence recipe was not reproducible from the isolated worker worktree**: §9 still ran a whole-file `json.load(open('ai-status.json'))` archived-task check (forbidden for a single-task review) and cited bare `ai-status.json` / `ai-activity-log.jsonl` paths that do not exist in the worktree cwd. Asked to refresh §7/§9 to reproduce without whole-file reads, preferring `scripts/ai-status.sh show` + targeted `ai_status.py` queries + canonical-root log paths. |
| `progress`         | `2026-06-26T19:12:18Z` | `Claude`       | This refresh: removed the whole-file `ai-status.json` check (replaced by `scripts/ai-status.sh show P2-DP-C1-001` → `Task not found` as the archived signal) and anchored all raw log/status greps in §7/§9 to the canonical status root (`ORCH_STATUS_ROOT`), so the audit recipe reproduces from the isolated worker worktree. |

The next sidecar `handoff` will return the packet to reviewer `Codex` and is the
transition that follows this `19:12:18Z` progress row. Every completed transition up
to and including the `19:09:37Z` reopen is recorded above; the only row a handoff can
never pre-contain is the handoff that performs it.

---

## 3. Final Landed State & Closeout History

### 3.1 What landed on `dev`

The slice is now on `origin/dev` as a single squash commit:

| Commit      | Subject                                                                 | Role                          |
| ----------- | ----------------------------------------------------------------------- | ----------------------------- |
| `17650b25e` | `P2-DP-C1-001: platform-admin compliance and investigation routes (#962)` | **landed on `dev`** (squash merge of PR #962; single parent `99836f121`) |

`git rev-list --parents -n1 17650b25e` → `17650b25e … 99836f121` (single parent —
an ordinary squash-merge commit, **not** a merge commit). Its diff vs the prior dev
tip `99836f121` is **47 files changed, +3423 / -352** (§3.4). The earlier dev tip
`99836f121` is P2-REG-001 (#960). `17650b25e` **remains reachable from `origin/dev`**
(`git merge-base --is-ancestor 17650b25e origin/dev` succeeds); the slice is landed
for good. `dev` has since advanced past it (e.g. P2-REG-002 #963), so the durable
claim is that `17650b25e` is **an ancestor of `dev`**, not that it is the live tip —
the diff stats above are anchored to its own parent `99836f121`, so they stay stable
as `dev` moves.

### 3.2 The approved deliverable (clean replacement branch)

`origin/codex/p2-dp-c1-001-clean @ 623808d7f` is the branch parent reviewer `Codex2`
approved at `18:58:32Z`. It is a **single linear commit** on top of the dev tip
`99836f121` (`git log --oneline 99836f121..623808d7f` → just `623808d7f`), i.e. a
clean squashed re-write that carries no merge commit. Its tree is **byte-identical**
to what landed: `git diff 623808d7f 17650b25e` is empty. `623808d7f` itself is not
an ancestor of `dev` (a squash merge produces a new commit `17650b25e`), which is
expected and not a discrepancy.

### 3.3 Trailers on the landed slice

`git show --no-patch 623808d7f` (identical content landed as `17650b25e`) carries a
**single clean trailer set**:

- `LLM-Agent: Codex` (correct case — the earlier lowercase `codex` on `71a784abd`
  is gone; the squash normalized it)
- `Task-ID: P2-DP-C1-001`
- `Reviewer: Codex2`
- `Verification: pnpm --filter @drts/api build`
- `Verification: pnpm --filter @drts/api run typecheck`
- `Verification: pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts tests/unit/auth-bootstrap.test.ts tests/unit/regulatory-reporting.service.test.ts tests/integration/int-reg-001-regulatory-notification-lifecycle.test.ts --config ../../vitest.config.ts`
- `Verification: pnpm --filter @drts/platform-admin-web typecheck`
- `Verification: pnpm i18n:guard`
- `Verification: pnpm exec vitest run tests/unit/platform-admin-assistant-route-context.test.ts --config vitest.config.ts`

This single trailer set supersedes the multi-commit trailer story of the prior
packet: the §3.2/§3.3-era trailer **case mismatch** (lowercase `codex` on one of
four commits), the **`i18n:guard`** and **route-context** regressions, and the
pre-existing **`@drts/api` typecheck** `actorType` caveat are **all now covered by
explicit `Verification:` trailers on the commit that landed**, including
`@drts/api build` + `@drts/api run typecheck` and the regulatory unit/integration
suites. The owner's separate `a3c3de4ba` "API audit actor-type fix" is folded into
the squash.

### 3.4 Diff size

`git diff --stat 99836f121 17650b25e` (landed squash vs prior dev tip; identical to
`git diff --stat 99836f121 623808d7f` since the trees match):
**47 files changed, 3423 insertions(+), 352 deletions(-)**, spanning
`apps/api` (compliance/investigation/evidence/regulatory modules + tests),
`apps/platform-admin-web` (route group, shell, route-context, pending-design
screen + its unit test, client, translations), `packages/contracts`,
`packages/api-client`, and one `docs/05-ui` screen-requirements note. (The prior
packet's `ad5caf3dd` merge branch reported 47 files / +3404 / -352; the clean squash
that actually landed is 47 files / +3423 / -352.)

### 3.5 Historical closeout path (did NOT land)

For audit completeness, the route that was abandoned:

- First approval `18:32:14Z` was against `71a784abd` (second handoff tip).
- The owner then pushed a **merge-commit branch**: integration merge `94e6721c7`
  (parents `71a784abd` + dev tip `99836f121`) and closeout fix `ad5caf3dd` (i18n +
  route-context repairs), opened as **PR #961** with auto-squash. That branch was
  `0 behind / 4 ahead` of `dev` but carried a merge commit `dev` branch protection
  forbids, and the closeout hit a **commit-trailers failure**.
- Rather than rewrite history on that branch, the owner produced the **clean linear
  replacement** `623808d7f` (§3.2) + PR #962, which is what was re-approved and
  landed. **`ad5caf3dd`, `94e6721c7`, and PR #961 are historical and never reached
  `dev`.** Any reference to "current tip `ad5caf3dd`" or "0 behind / 4 ahead
  merge-commit branch" in earlier packet revisions is superseded by §3.1–§3.4.

---

## 4. Acceptance-to-Evidence Map

The single combined acceptance clause is decomposed into six sub-claims, mapped to
the slice **as it landed** (`623808d7f` / `17650b25e`; the squash is content-equal
to the approved `71a784abd` body plus the i18n/route-context/actor-type closeout
fixes). Line anchors below are from the landed tree.

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
(+327) registers the matching `@Get`/`@Post` handlers under the route group. The
nine page bodies render a shared pending-design placeholder (§5.1) with i18n copy
normalized so `pnpm i18n:guard` passes on the landed commit.

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
platform-admin routes rather than rebuilding URLs from query params. The closeout
fix repaired a route-context unit regression in this same surface (its trailer
`pnpm exec vitest run … platform-admin-assistant-route-context.test.ts`, §3.3)
without changing the consume-not-reconstruct behavior.

### 4.6 Compliance/investigations APIs live; unit+integration green

- live APIs: the compliance controller/service plus
  `accident-investigation.controller.ts` (+13),
  `regulatory-reporting.controller.ts` (+102) / `…service.ts` (+92),
  `vehicle-evidence.controller.ts` (+11) / `…service.ts` (+57), and matching
  `packages/api-client/src/index.ts` (+185) methods.
- tests (covered by the landed commit's `Verification:` trailers, §3.3):
  - integration `apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts` (+304)
  - unit `apps/api/tests/unit/auth-bootstrap.test.ts` (+54)
  - regulatory unit `tests/unit/regulatory-reporting.service.test.ts` +
    integration `tests/integration/int-reg-001-regulatory-notification-lifecycle.test.ts`
    (REG-001 #960 surface folded in)
  - unit `apps/platform-admin-web/.../platform-admin-assistant-route-context.test.ts`
    (route-context)

---

## 5. Reopen Findings & How Each Was Closed

The parent reviewer reopened at `2026-06-26T18:17:32Z` with two findings. Both were
addressed in `71a784abd` and carried through into the landed slice.

### 5.1 Finding 1 — pages built without a canvas source screen

> "new platform-admin compliance/investigation/evidence/regulatory pages were
> implemented without a matching design-canvas source screen; task brief says if
> canvas lacks a screen, stop and write a screen-requirements note."

Fix:

- the nine route bodies render a shared pending-design placeholder
  (`apps/platform-admin-web/components/sandbox-design-pending-screen.tsx`, +58)
  built on `buildCanvasTheme({ surface: "platform" })` + `CanvasEmptyState`
  (no invented visuals, no raw hex)
- a screen-requirements hand-off note was added:
  `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
  (+154), which explicitly states the Platform Admin canvas does not define these
  sandbox screens and that engineering must not invent them.

The placeholder copy was later normalized so `pnpm i18n:guard` passes on the landed
commit (§3.3). The parent reviewer accepted the placeholder + requirements-note
approach as satisfying the "stop and write a note" rule (final approval, 18:58:32Z).

### 5.2 Finding 2 — frontend reconstructed deep-links from query params

> "backend-provided CrossAppResourceLink exists in contracts/ROC service, but
> frontend still reconstructs /platform-admin/investigations links from query
> params and local lookup instead of consuming the backend deep-link."

Fix: takeover/discrepancy investigation links now resolve through the
backend-provided platform-admin detail/queue routes via
`components/assistant/route-context.ts` (§4.5) rather than rebuilding URLs from
query params and local lookup. The closeout repaired a route-context unit
regression in this surface (§3.3) without changing the consume-not-reconstruct
behavior.

---

## 6. Verification Evidence

The verification set the **landed** commit carries (trailers on `623808d7f` /
`17650b25e`, §3.3):

- `pnpm --filter @drts/api build`
- `pnpm --filter @drts/api run typecheck` — this is the **full `@drts/api`
  typecheck** that was the prior packet's open caveat: at the first approval
  (`71a784abd`) it failed on a pre-existing `regulatory-reporting.controller`
  `actorType` mismatch; the owner's `a3c3de4ba` "API audit actor-type fix" plus the
  REG-001 (#960) merge resolve it, and the landed commit lists it as a verification.
- `pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts tests/unit/auth-bootstrap.test.ts tests/unit/regulatory-reporting.service.test.ts tests/integration/int-reg-001-regulatory-notification-lifecycle.test.ts --config ../../vitest.config.ts`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm i18n:guard` — the i18n-guard caveat (placeholder copy that the guard
  rejected at the merge-branch stage) is now covered as a passing verification.
- `pnpm exec vitest run tests/unit/platform-admin-assistant-route-context.test.ts --config vitest.config.ts` — the route-context unit regression.

So every caveat the prior packet carried as **open** against `ad5caf3dd` (trailer
case mismatch, `i18n:guard`, route-context unit, and `@drts/api` typecheck) is
listed as a **passing verification trailer on the commit that landed**, and PR
#962's CI is the integration gate that ran on merge. This sidecar did **not** re-run
any of these commands; it records the trailers the landed commit carries and the
parent's recorded approval. No further open finalize/integration item remains for
the parent — it is merged to `dev` and archived.

---

## 7. Reviewer Checklist

Reviewer `Codex` (sidecar reviewer) should verify this **packet** is faithful to the
final machine truth:

- `scripts/ai-status.sh show P2-DP-C1-001` returns **`Task not found`** (the row is
  archived; `P2-DP-C1-001` ∈ `archived_task_ids`)
- `ai-activity-log.jsonl` records **two** parent `review_approved` events: the first
  at `2026-06-26T18:32:14Z` (`Codex2`, against `71a784abd`) and the **final** at
  `2026-06-26T18:58:32Z` (`Codex2`, against `origin/codex/p2-dp-c1-001-clean @
  623808d7f`), followed by `reconciled_from_git` from `origin/dev@17650b25e144` at
  `2026-06-26T18:59:18Z`
- the slice **landed on `dev`** as `17650b25e`
  (`P2-DP-C1-001: … routes (#962)`); `git rev-list --parents -n1 17650b25e` shows a
  **single parent `99836f121`** (an ordinary squash merge, not a merge commit), and
  `17650b25e` **remains reachable from `origin/dev`**
  (`git merge-base --is-ancestor 17650b25e origin/dev` succeeds). `dev` may have
  advanced past it (e.g. P2-REG-002 #963) — verify ancestry, not tip identity
- the **approved deliverable** `623808d7f` is a single linear commit on `99836f121`
  and is **content-identical** to what landed (`git diff 623808d7f 17650b25e` empty)
- the diff vs the prior dev tip is **47 files / +3423 / -352**
  (`git diff --stat 99836f121 17650b25e`)
- the landed commit carries a **single clean trailer set** (`LLM-Agent: Codex`,
  `Task-ID`, `Reviewer: Codex2`) plus `Verification:` trailers for `@drts/api`
  build + typecheck, the compliance/regulatory vitest suites,
  `@drts/platform-admin-web typecheck`, `i18n:guard`, and the route-context test —
  i.e. the prior packet's open caveats are all covered (§3.3, §6)
- the `ad5caf3dd` / `94e6721c7` merge-commit branch and **PR #961 are historical**
  and never reached `dev` (§3.5)
- the 12 sandbox scopes in §4.2 match `auth.constants.ts`
- the four-eyes rejections in §4.3 exist in `platform-admin-compliance.service.ts`
- ROC only emits a `CrossAppResourceLink` and has no hold-release path (§4.4)
- both reopen findings (§5) map to real changes in the landed slice
- this sidecar remains support-only and edits no canonical truth

Suggested audit commands (use only `git`, `grep`, `python3`, `scripts/ai-status.sh`
so they reproduce **from the assigned isolated worker worktree** — no whole-file
`ai-status.json` reads, and the status/log files are read from the canonical status
root the worker inherits as `ORCH_STATUS_ROOT`, since the worktree cwd does not
contain them):

```bash
STATUS_ROOT="${ORCH_STATUS_ROOT:-/home/edna/workspace/drts-fleet-platform}"
scripts/ai-status.sh show P2-DP-C1-001                     # Task not found (archived signal; no full-file read)
grep '"task_id": "P2-DP-C1-001"' "$STATUS_ROOT/ai-activity-log.jsonl" \
  | grep '"type": "review_approved"'                       # two events: 18:32:14Z and 18:58:32Z
git fetch origin
git log --oneline -1 origin/dev                            # 17650b25e … (#962)
git rev-list --parents -n 1 17650b25e                      # single parent 99836f121 (squash)
git show --no-patch 623808d7f                              # final approved deliverable + clean trailers
git diff 623808d7f 17650b25e                               # empty (content-identical)
git log --oneline 99836f121..623808d7f                     # single commit (linear)
git diff --stat 99836f121 17650b25e                        # 47 files, +3423, -352
git show 17650b25e:apps/api/src/common/auth/auth.constants.ts | grep -nE 'sandbox\.'
git show 17650b25e:apps/api/src/modules/platform-admin/platform-admin-compliance.service.ts | grep -nE 'cannot approve'
git show 17650b25e:apps/api/src/modules/roc-operations/roc-operations.service.ts | grep -nE 'CrossAppResourceLink|platform-admin/investigations'
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

Sidecar closeout is support-only. This packet **is** a committed support artifact
under `support/sidecars/P2-DP-C1-001/`, so closeout carries
`COMMIT_HASH`/`COMMIT_SUBJECT`/`PUSH_REMOTE`/`PUSH_BRANCH` with
`INTEGRATION_STATUS=not_applicable` (no canonical truth, no PR/CI/merge for the
sidecar itself).

The parent task `P2-DP-C1-001` is **closed**: it was approved a second/final time
against `623808d7f`, squash-merged to `origin/dev` as `17650b25e` (PR #962), and
archived. The parent's own integration level is therefore **`merged_to_dev`**. This
packet does not itself approve, block, or finalize the parent; it records that the
parent owner `Codex` and reviewer `Codex2` already completed that lifecycle, and the
sidecar reviewer should judge only whether this packet matches that final machine
truth (final landed commit, clean trailers, resolved caveats, historical merge
branch).

---

## 9. Evidence Commands For This Packet

Commands used to build this packet. These use only `git`, `grep`, `python3`, and
`scripts/ai-status.sh` so they reproduce **from the assigned isolated worker
worktree**. Two portability rules apply (both came out of reopen findings):

1. **No whole-file `ai-status.json` reads.** A single-task check uses the
   sanctioned slice command `scripts/ai-status.sh show <id>` (or
   `python3 scripts/ai_status.py show <id>`), never `Read ai-status.json` or a
   `python3 -c "json.load(open('ai-status.json'))"` one-liner. An earlier refresh
   used such a one-liner to test `archived_task_ids` membership; it is removed.
2. **Status/log files live in the canonical status root, not this worktree.** The
   isolated task worktree does **not** contain `ai-status.json` or
   `ai-activity-log.jsonl`; they live in the canonical status root the worker
   process inherits as `ORCH_STATUS_ROOT`. Bare relative paths fail here, so the
   raw-log greps below anchor to that root:

   ```bash
   STATUS_ROOT="${ORCH_STATUS_ROOT:-/home/edna/workspace/drts-fleet-platform}"
   ```

Parent-state checks (no whole-file read):

- `scripts/ai-status.sh show P2-DP-C1-001` → `Task not found: P2-DP-C1-001`. The
  row is off the live board because it was archived; "Task not found" is the
  archived signal and needs no full-file read. (Equivalent:
  `python3 scripts/ai_status.py show P2-DP-C1-001`.)
- Optional explicit `archived_task_ids` confirmation **without** loading the file
  into context — a bounded `grep` on the canonical-root status file prints only the
  matching lines, never the whole document:
  `grep -n '"P2-DP-C1-001"' "$STATUS_ROOT/ai-status.json"`. The id appears on a few
  lines (other tasks' `depends_on`, this sidecar's `helper_parent`, and mirrored log
  entries); the archived membership is the bare-string entry
  (`"P2-DP-C1-001"` with no trailing key) inside the `archived_task_ids` array near
  the end of the file. The `scripts/ai-status.sh show` → `Task not found` signal
  above is sufficient on its own; this grep is only for reviewers who want to see the
  array entry directly.

Lifecycle reconstruction (raw log greps — needed because the archived parent is no
longer queryable via `ai_status.py`, and anchored to the canonical root):

- `grep '"task_id": "P2-DP-C1-001"' "$STATUS_ROOT/ai-activity-log.jsonl"` filtered
  by `type` (confirms the two `review_approved` events `18:32:14Z`/`18:58:32Z`, the
  `18:55:24Z` clean-branch handoff, and the `18:59:18Z` `reconciled_from_git` from
  `origin/dev@17650b25e144`)
- `grep '"task_id": "P2-DP-C1-001-SIDECAR-REVIEW"' "$STATUS_ROOT/ai-activity-log.jsonl"`
  filtered by `type` (sidecar lifecycle for §2.4, including the `18:58:20Z` handoff
  and the `19:00:52Z` reopen)

Git checks (reproduce directly in the worker worktree):

- `git fetch origin` then
  `git merge-base --is-ancestor 17650b25e origin/dev && echo landed` (the slice
  `17650b25e` / #962 remains reachable from `origin/dev`; `dev` may have advanced
  past it — e.g. P2-REG-002 #963 — so check ancestry, not the live tip)
- `git rev-list --parents -n 1 17650b25e` (single parent `99836f121` → squash merge)
- `git show --no-patch 623808d7f` (final approved deliverable; clean trailer set in §3.3)
- `git diff 623808d7f 17650b25e` (empty — content-identical) and
  `git log --oneline 99836f121..623808d7f` (single linear commit)
- `git diff --stat 99836f121 17650b25e` (47 files / +3423 / -352, §3.4)
- targeted `git show 17650b25e:<path> | grep -nE …` lookups on
  `auth.constants.ts`, `platform-admin-compliance.controller.ts`,
  `platform-admin-compliance.service.ts`, `roc-operations.service.ts`,
  `route-context.ts`, `sandbox-design-pending-screen.tsx`, and the
  `docs/05-ui` screen-requirements note
- historical-path verification (§3.5): `git log --oneline origin/dev..origin/codex/p2-dp-c1-001`
  (the abandoned merge branch `fe150898b`/`71a784abd`/`94e6721c7`/`ad5caf3dd`/`a3c3de4ba`
  + PR #961) and `git merge-base --is-ancestor ad5caf3dd origin/dev` (→ not an
  ancestor; the merge branch never landed)

No canonical truth files were edited to create this packet. Only this support
artifact under `support/sidecars/P2-DP-C1-001/` is in scope.
