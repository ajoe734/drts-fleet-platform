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
has **already reached `review_approved`** (parent reviewer `Codex2` approved at
`2026-06-26T18:32:14Z` against deliverable tip `71a784abd`); the parent owner
`Codex` now holds an `owned_finalize_dispatch` to record `done`. This packet
therefore serves two audiences: parent reviewer `Codex2` for the approval that
just landed, and parent owner `Codex` for the finalize/integration steps that
remain. It gives one place to audit:

- the parent's recorded lifecycle, including the `review → reopen → review →
  review_approved` cycle that produced the current closeout commit
- the deliverable commit, its trailers, and its branch position relative to `dev`
- a per-criterion acceptance-to-evidence map with concrete files and anchors
- the two reopen findings and exactly how each was addressed in the fix commit
- the one open verification caveat the parent itself recorded

The most important reviewer caveat is that the deliverable is **two commits** on
`origin/codex/p2-dp-c1-001` (`fe150898b` then `71a784abd`), the branch is now
**3 commits behind `origin/dev`** (branched at `8f95cde3a`, dev now at
`99836f121`), and the parent recorded that `pnpm --filter @drts/api typecheck`
still fails on a **pre-existing** `regulatory-reporting.controller` `actorType`
mismatch that is unrelated to this diff. The `review_approved` decision did not
land this commit on `dev`, so the rebase and the `@drts/api` typecheck caveat
remain open as **finalize/integration** concerns. All are explained in §5 and §6.

---

## 1. Scope Boundary

In scope:

- snapshot the parent row and lifecycle exactly as machine truth records them
- summarize the deliverable commits, trailers, and branch position vs `dev`
- map each acceptance clause to concrete files, scopes, and code anchors
- record the reopen findings and their fixes so the reviewer can confirm closure
- record the parent's own verification evidence and its one open caveat
- hand the packet to the assigned reviewer without changing the parent task

Out of scope:

- editing L1/L2 product truth or the parent implementation files
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through official status commands
- rerunning the parent's full verification suite (this packet records the
  parent-recorded evidence; it does not re-execute it)
- deciding whether the pending-design placeholder screens are acceptable for
  parent `done`; this packet only records that they exist and why

---

## 2. Machine-Truth Snapshot

### 2.1 Parent row

`scripts/ai-status.sh show P2-DP-C1-001` currently records:

- id=`P2-DP-C1-001`
- title=`platform-admin Compliance/Investigation route group + scopes + deep-links`
- owner=`Codex`
- reviewer=`Codex2`
- status=`review_approved`
- phase=`phase2-tesla-fsd-sandbox-202606`
- depends_on=`P2-WP0`, `P2-ACC-002`, `P2-EVD-002`
- last_update=`2026-06-26T18:32:14Z`
- artifacts=`apps/api/src/modules/accident-investigation/`,
  `apps/api/src/modules/platform-admin/`, `apps/platform-admin-web/`

Recorded `next` field (parent reviewer `Codex2`, on approval):

> Reviewed origin/codex/p2-dp-c1-001 at 71a784abd. Acceptance checks passed:
> sandbox compliance/investigation route group added with pending-design
> placeholders per handoff, sandbox scopes enforced with platform-only
> release/approval actions, four-eyes separation enforced for export approval and
> legal-hold release approval, ROC/correlation deep-links backend-provided via
> CrossAppResourceLink, and compliance/regulatory APIs exposed. Verification:
> pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts --config ../../vitest.config.ts PASS;
> pnpm --dir apps/api exec vitest run tests/unit/auth-bootstrap.test.ts --config ../../vitest.config.ts PASS;
> pnpm --filter @drts/platform-admin-web typecheck PASS.

The deliverable tip the reviewer approved (`71a784abd`) is unchanged from the
second handoff, so the acceptance-to-evidence map (§4), reopen-fix map (§5), and
verification evidence (§6) below remain current. The second-handoff `next`
(pending-design placeholders + backend-provided links + `@drts/api` typecheck
caveat) is preserved in §5 and §6.

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
| `review_approved` | `2026-06-26T18:32:14Z` | `Codex2` | Approved against `71a784abd`; all six acceptance sub-claims confirmed; integration+unit+platform-admin-web typecheck PASS.  |

The task is now at `review_approved`; parent owner `Codex` holds an
`owned_finalize_dispatch` (queued `2026-06-26T18:32:15Z`) to record `done`. The
current deliverable is the **second** handoff commit `71a784abd`, not the first
handoff `fe150898b`. The approval was recorded against `71a784abd`, the same tip
documented throughout this packet — the approval introduced no new commit.

### 2.4 Sidecar lifecycle

| Event              | Timestamp UTC          | Agent          | Note                                                                            |
| ------------------ | ---------------------- | -------------- | ------------------------------------------------------------------------------- |
| `assign`           | `2026-06-26T18:29:17Z` | `Codex`        | Auto-created review-packet sidecar; owner `Claude`, reviewer `Codex`.           |
| `sidecar_created`  | `2026-06-26T18:29:17Z` | `Orchestrator` | Auto-created while utilization remained below threshold.                        |
| `start`            | `2026-06-26T18:30:07Z` | `Claude`       | Began building this packet against deliverable `71a784abd`.                     |
| `progress`         | `2026-06-26T18:36:35Z` | `Claude`       | Refreshed packet after parent reached `review_approved`; dev advanced to `99836f121` (branch now 3 behind). |

---

## 3. Deliverable Commits & Branch Position

### 3.1 Commits on the deliverable branch

`git log --oneline origin/dev..origin/codex/p2-dp-c1-001`:

| Commit      | Subject                                                              | Role                        |
| ----------- | ------------------------------------------------------------------- | --------------------------- |
| `fe150898b` | `feat(P2-DP-C1-001): add platform-admin compliance routes`          | first handoff (superseded)  |
| `71a784abd` | `P2-DP-C1-001: align sandbox compliance routes with design handoff` | **current tip / reopen fix** |

### 3.2 Trailers

`git show --no-patch 71a784abd` (current tip) carries:

- `LLM-Agent: codex`
- `Task-ID: P2-DP-C1-001`
- `Reviewer: Codex2`
- `Verification: pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts --config ../../vitest.config.ts`
- `Verification: pnpm --dir apps/api exec vitest run tests/unit/auth-bootstrap.test.ts --config ../../vitest.config.ts`
- `Verification: pnpm --filter @drts/platform-admin-web typecheck`

`git show --no-patch fe150898b` (first handoff) carries `LLM-Agent: Codex`,
`Task-ID: P2-DP-C1-001`, `Reviewer: Codex2`. Both commits carry the required
`Task-ID` and `Reviewer` trailers; the `LLM-Agent` value is `codex`/`Codex`
(case differs between the two commits — note for any case-sensitive trailer
linting at integration time).

### 3.3 Branch position vs `dev`

- `git rev-list --left-right --count origin/dev...origin/codex/p2-dp-c1-001` = `3  2`
- the branch base is `8f95cde3a`; `origin/dev` has since advanced to `99836f121`
  (P2-REG-001 #960, P2-UI-ROC-001 #958, P2-UI-SAFE-001 #957)
- therefore the branch is now **3 commits behind `dev`** (one more than at the
  prior packet snapshot, when dev was at `1892c1c38`) and will need a rebase
  before any PR/merge. The parent already cleared `review`, so this is now a
  **finalize/integration** concern for parent owner `Codex`, not a review
  blocker — but nobody should assume the branch merges cleanly without a rebase.
- `git branch -r --contains 71a784abd` resolves only to `origin/codex/p2-dp-c1-001`;
  the commit is **not** yet on `origin/dev`. The `review_approved` decision did
  not change this — approval is a status transition, not a merge.

### 3.4 Diff size

`git diff --stat origin/dev...origin/codex/p2-dp-c1-001`:
**33 files changed, 3076 insertions(+), 142 deletions(-)**, spanning
`apps/api` (compliance/investigation/evidence/regulatory modules + tests),
`apps/platform-admin-web` (route group, shell, route-context, pending-design
screen, client, translations), `packages/contracts`, `packages/api-client`, and
one `docs/05-ui` screen-requirements note.

---

## 4. Acceptance-to-Evidence Map

The single combined acceptance clause is decomposed into six sub-claims.

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
`apps/platform-admin-web/components/assistant/route-context.ts` (+95) now maps
the sandbox route keys to canonical hrefs
(`sandbox-investigations → /platform-admin/investigations`, etc., lines 83–87),
and the takeover/discrepancy links route through these backend-provided
platform-admin routes rather than rebuilding URLs from query params.

### 4.6 Compliance/investigations APIs live; unit+integration green

- live APIs: the compliance controller/service plus
  `accident-investigation.controller.ts` (+13),
  `regulatory-reporting.controller.ts` (+102) / `…service.ts` (+92),
  `vehicle-evidence.controller.ts` (+11) / `…service.ts` (+57), and matching
  `packages/api-client/src/index.ts` (+185) methods.
- tests (parent-recorded as PASS, see §6):
  - integration `apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts` (+304)
  - unit `apps/api/tests/unit/auth-bootstrap.test.ts` (+54)

---

## 5. Reopen Findings & How Each Was Closed

The reviewer reopened at `2026-06-26T18:17:32Z` with two findings. Both were
addressed in the current tip `71a784abd`.

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
satisfies the "stop and write a note" rule for this task's `review`.

### 5.2 Finding 2 — frontend reconstructed deep-links from query params

> "backend-provided CrossAppResourceLink exists in contracts/ROC service, but
> frontend still reconstructs /platform-admin/investigations links from query
> params and local lookup instead of consuming the backend deep-link."

Fix in `71a784abd`: takeover/discrepancy investigation links now resolve through
the backend-provided platform-admin detail/queue routes via
`components/assistant/route-context.ts` (§4.5) rather than rebuilding URLs from
query params and local lookup.

---

## 6. Verification Evidence Recorded By The Parent

The parent's recorded verification set (commit trailers + `handoff` note):

- `pnpm --dir apps/api exec vitest run tests/integration/e2e-p2-sandbox-compliance-controls.test.ts --config ../../vitest.config.ts` → **PASS**
- `pnpm --dir apps/api exec vitest run tests/unit/auth-bootstrap.test.ts --config ../../vitest.config.ts` → **PASS**
- `pnpm --filter @drts/platform-admin-web typecheck` → **PASS**
- targeted `eslint` on touched files (first handoff)

Open caveat the parent itself flagged:

- `pnpm --filter @drts/api typecheck` **still fails** on a pre-existing
  `regulatory-reporting.controller` `actorType` mismatch that the parent states
  is **unrelated to this diff**. Parent reviewer `Codex2` approved without
  treating this as a blocker (the approval cited the scoped integration/unit and
  platform-admin-web typecheck PASS only). It therefore remains an open
  **finalize/integration** item: parent owner `Codex` and the integrator should
  confirm whether this pre-existing failure is in-scope here or tracked
  elsewhere before any PR/merge to `dev`, since a full `@drts/api` typecheck is
  red on this branch and CI may run it.

This sidecar did **not** rerun these commands; it records the parent's existing
evidence and commit metadata.

---

## 7. Reviewer Checklist

Reviewer `Codex` (sidecar reviewer) should verify this **packet** is faithful:

- `scripts/ai-status.sh show P2-DP-C1-001` now reports `status=review_approved`,
  owner `Codex`, reviewer `Codex2`, last_update `2026-06-26T18:32:14Z`
- `ai-activity-log.jsonl` records the parent `review_approved` event at
  `2026-06-26T18:32:14Z` by `Codex2` against `71a784abd`
- the deliverable tip is `71a784abd` on `origin/codex/p2-dp-c1-001`, with
  `fe150898b` as the superseded first handoff
- the branch is 3 behind `origin/dev` (dev tip `99836f121`) and `71a784abd` is
  not on `origin/dev`
- the 12 sandbox scopes in §4.2 match `auth.constants.ts`
- the four-eyes rejections in §4.3 exist in `platform-admin-compliance.service.ts`
- ROC only emits a `CrossAppResourceLink` and has no hold-release path (§4.4)
- both reopen findings (§5) map to real changes in `71a784abd`
- the `@drts/api` typecheck caveat (§6) is recorded, not hidden
- this sidecar remains support-only and edits no canonical truth

Suggested audit commands:

```bash
scripts/ai-status.sh show P2-DP-C1-001
git log --oneline origin/dev..origin/codex/p2-dp-c1-001
git show --no-patch 71a784abd
git rev-list --left-right --count origin/dev...origin/codex/p2-dp-c1-001
git show 71a784abd:apps/api/src/common/auth/auth.constants.ts | grep -nE 'sandbox\.'
git show 71a784abd:apps/api/src/modules/platform-admin/platform-admin-compliance.service.ts | grep -nE 'cannot approve'
git show 71a784abd:apps/api/src/modules/roc-operations/roc-operations.service.ts | grep -nE 'CrossAppResourceLink|platform-admin/investigations'
git diff --stat origin/dev...origin/codex/p2-dp-c1-001
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
the parent's current `review_approved` state, and whether the reopen-fix
mapping, the remaining rebase (branch 3 behind `dev`), and the `@drts/api`
typecheck caveat are sufficiently explicit for parent owner `Codex` to act on
during finalize. This packet does not itself approve, block, or finalize the
parent task `P2-DP-C1-001`; the approval decision was made by parent reviewer
`Codex2`, and the `done`/integration steps stay with parent owner `Codex`.

---

## 9. Evidence Commands For This Packet

Commands used to build this packet:

- `scripts/ai-status.sh show P2-DP-C1-001` (now `review_approved`, last_update `2026-06-26T18:32:14Z`)
- `rg -n '"task_id": "P2-DP-C1-001"' ai-activity-log.jsonl | tail -25` (confirms the `2026-06-26T18:32:14Z` `Codex2` `review_approved` event against `71a784abd`)
- `git log --oneline -3 origin/dev` (dev tip `99836f121`, #960)
- `git merge-base origin/dev origin/codex/p2-dp-c1-001` (still `8f95cde3a`, so the §3.4/§4 diff stat is unchanged at 33 files / +3076 / -142)
- `rg -n '"task_id": "P2-DP-C1-001-SIDECAR-REVIEW"' ai-activity-log.jsonl | tail -10`
- `git log --oneline origin/codex/p2-dp-c1-001 -5`
- `git show --format='%H%n%s%n%n%b' --no-patch 71a784abd`
- `git show --format='%H%n%s%n%n%b' --no-patch fe150898b`
- `git branch -r --contains 71a784abd`
- `git rev-list --left-right --count origin/dev...origin/codex/p2-dp-c1-001`
- `git diff --stat origin/dev...origin/codex/p2-dp-c1-001`
- targeted `git show 71a784abd:<path> | grep -nE …` lookups on
  `auth.constants.ts`, `platform-admin-compliance.controller.ts`,
  `platform-admin-compliance.service.ts`, `roc-operations.service.ts`,
  `route-context.ts`, `sandbox-design-pending-screen.tsx`, and the
  `docs/05-ui` screen-requirements note

No canonical truth files were edited to create this packet. Only this support
artifact under `support/sidecars/P2-DP-C1-001/` is in scope.
