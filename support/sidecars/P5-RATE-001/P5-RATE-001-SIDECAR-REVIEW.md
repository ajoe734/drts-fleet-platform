# P5-RATE-001 Review Packet & Evidence Summary

**Sidecar task:** `P5-RATE-001-SIDECAR-REVIEW` (helper_kind `review_packet`, `mutates_canonical: false`)
**Parent task:** `P5-RATE-001` — Fleet D rating+gate+atomic assignment
**Packet author:** Claude2 (sidecar owner) · **Packet reviewer:** Copilot
**Prepared:** 2026-07-25
**Parent owner:** Gemini · **Parent reviewer:** Codex2 · **Parent status at packet time:** `in_progress` (review failed, R1)

This is a support artifact. It does not change canonical truth, does not modify
parent implementation files, and does not decide the parent verdict. It exists so
the parent owner and parent reviewer can act on executed evidence instead of
re-deriving it.

---

## 1. Reviewed Head

| Item | Value |
| --- | --- |
| Parent branch | `origin/gemini/p5-rate-001` |
| Reviewed tip | `6f6e9827a5e2e0ebc47153df2009cffb3047152d` |
| Tip subject | `P5-RATE-001: implement Fleet D rating+gate+atomic assignment and rating governance UI` |
| Tip authored | 2026-07-24T05:11:05Z |
| `origin/dev` at packet time | `3be8309e22876bba62a5d14fd4748ff3f0141400` (2026-07-24T12:48:17Z) |
| Base freshness | **Stale.** `origin/dev` is *not* an ancestor of the branch tip. |
| Landed on `origin/dev`? | **No.** `git log origin/dev --grep=P5-RATE-001` returns no commit. |

A second branch `origin/codex/p5-rate-001` exists (tip `b0c429bf9`, two `wip(...)`
anchor commits, 2026-07-23). It carries preflight/coverage anchors only and is
**not** the implementation head. All findings below are against `6f6e9827a`.

### Change surface at the reviewed tip

```
 apps/api/src/modules/multi-taxi/multi-taxi.controller.ts        |  62 ++
 apps/api/src/modules/multi-taxi/multi-taxi.repository.ts        |  75 ++
 apps/api/src/modules/multi-taxi/multi-taxi.service.ts           | 180 +++-
 apps/api/src/modules/owned-mobility/owned-mobility.service.ts   |  30 ++
 apps/api/tests/unit/p5-rate-governance.test.ts                  | 323 ++++
 apps/platform-admin-web/app/p5-ratings/[ratingId]/page.tsx      | 385 ++++
 apps/platform-admin-web/app/p5-ratings/driver-authority/page.tsx| 206 ++
 apps/platform-admin-web/app/p5-ratings/page.tsx                 | 350 +++
 apps/platform-admin-web/components/admin-shell.tsx              |   6 +
 packages/contracts/src/index.ts                                 |   1 +
 packages/contracts/src/phase1-p5-s3-multi-taxi.ts               |  26 +-
 support/sidecars/P5-RATE-001/CURRENT-HEAD-PREFLIGHT.md          |  43 +
 vitest.config.ts                                                |   1 +
 13 files changed, 1681 insertions(+), 7 deletions(-)
```

---

## 2. Executed Evidence

The parent reviewer (Codex2) recorded *"Could not run eslint/vitest in this
worktree because pnpm tools are unavailable locally."* That blocker was a
worktree-wiring problem, not a missing toolchain. It is resolved here, so the
gate results below are **executed**, not asserted.

### 2.1 How the evidence worktree was wired (reproducible)

A plain `git worktree add` outside the canonical root has no `node_modules`, and
naively symlinking the canonical root's `node_modules` **silently mis-resolves
`@drts/*`**: `apps/api/node_modules/@drts/contracts` is a relative symlink
(`../../../../packages/contracts`) that resolves through its *real* path back to
the canonical root checkout — which currently sits on
`phase2-tesla-sandbox-docs-20260625`, not `dev`. That produced 264 phantom API
errors on the first attempt.

Correct wiring, used for every number below:

```bash
git worktree add --detach /tmp/<wt> <sha>
# real node_modules dirs that mirror the root's entries, EXCEPT @drts/*
# @drts/{contracts,ui-web,ui-tokens} -> the worktree's own packages/*
turbo run build --filter=@drts/contracts --filter=@drts/ui-tokens --filter=@drts/ui-web
```

Both the branch tip and the `origin/dev` baseline were wired identically, so the
A/B delta is attributable to the branch.

> **Reusable gotcha for future reviewers:** an unqualified `node_modules` symlink
> into the canonical root makes `@drts/*` resolve to whatever branch the canonical
> root happens to be on. Always override `@drts/*` to the worktree's own packages
> and build them, or every contract-typed error you report will be noise.

### 2.2 Gate results

| Gate | `origin/dev` baseline `3be8309e2` | Branch tip `6f6e9827a` | Branch-attributable |
| --- | --- | --- | --- |
| `vitest run apps/api/tests/unit/p5-rate-governance.test.ts` | n/a (file does not exist on dev) | **PASS — 6/6, 1 file** | — |
| `tsc --noEmit -p apps/api/tsconfig.json` | 2 errors (both `TS2307` missing optional `@aws-sdk/*` deps — environment) | **3 errors** | **3** |
| `tsc --noEmit -p apps/platform-admin-web/tsconfig.json` | 3 errors (`TS2307` missing `@drts/control-plane-auth` link + 1 downstream — environment) | **42 errors** | **39** |

The dev baseline has zero *code* errors on either project; every baseline entry is
a missing-optional-package artifact of the local link setup and appears on both
sides. Nothing in the branch column is inherited.

Not run, and therefore not claimed: eslint, `next build`, integration tests,
Playwright E2E, and any DB-backed persistence test. See §5.

---

## 3. Findings

Severity key — **BLOCKER**: acceptance criterion is not met at this head.
**MAJOR**: ships broken behaviour that acceptance does not directly name.

### F1 — BLOCKER — `platform-admin-web` does not compile (39 errors)

Confirms and **substantially widens** parent-reviewer finding 2. The reviewer
reported one missing icon import; the app has 39 type errors across four files.

```
26  app/p5-ratings/page.tsx
 8  app/p5-ratings/[ratingId]/page.tsx
 3  app/p5-ratings/driver-authority/page.tsx
 2  components/admin-shell.tsx
```

`components/admin-shell.tsx` — both errors, verbatim:

```
admin-shell.tsx(155,5): error TS2322: Type '"p5-ratings"' is not assignable to type
  '"health" | "sandbox" | "tenants" | "home" | ... 18 more ... | "sandbox-suspend"'.
admin-shell.tsx(156,11): error TS2304: Cannot find name 'Star'.
```

- **TS2304** is the reviewer's finding, confirmed: `Star` is used at line 156 but
  the `lucide-react` import block (lines 11–31) never imports it.
- **TS2322 is a second, separate defect the reviewer did not report.** The nav key
  `"p5-ratings"` is not a member of the `PLATFORM_ADMIN_ROUTE_REGISTRY` key union.
  `git diff --name-only` confirms
  `apps/platform-admin-web/components/assistant/route-context.ts` **was not
  touched** by this branch. This is the known registry-coupling failure mode: the
  route must be registered in the registry, or the nav entry is not merely
  untyped — it is not a valid route for the assistant/route-context layer.

Representative errors in the three new pages (full list in §7):

- `error TS2341: Property 'request' is private and only accessible within class
  'ApiClient'` — all three pages call `apiClient.request(...)`, a private member.
  This is not a cosmetic typing issue; the pages are built on an API surface they
  are not allowed to use.
- `error TS2554: Expected 2-3 arguments, but got 1` — same call sites.
- `error TS2353: Object literal may only specify known properties, and 'key' does
  not exist in type 'TableColumn<RatingRow>'` (×5) with `TS7006` implicit-`any`
  row/tag params (×7) — the table column contract is misused.
- `error TS2322: Property 'children' does not exist on type
  'IntrinsicAttributes & BannerProps'` (×5) and the same for `title` on
  `BtnProps` — `Banner`/`Button` are being used with props they do not accept.
- `error TS2339: Property 'primary' does not exist on type 'CanvasTheme'`.

**Consequence:** the rating governance UI (acceptance item *"moderation UI per
doc08 §8"*) cannot build. No `next build` was run; it does not need to be — the
project's own `tsc` fails.

### F2 — BLOCKER — moderation read/mutate APIs never hydrate persisted ratings

Confirms parent-reviewer finding 1, with the call graph pinned down.

`MultiTaxiService.onModuleInit` (`multi-taxi.service.ts:75-86`) assigns only
`state.authorizations` and `state.vehicles`. `MultiTaxiRepository.loadState`
(`multi-taxi.repository.ts:98-122`) returns exactly
`{ authorizations, vehicles }` — it issues no query against
`ops.passenger_trip_ratings` or `ops.driver_rating_summaries`, and no such
repository list method exists (the only rating reads are
`findPassengerRating(orderId, passengerSubjectRef)` at line 263 and the write
paths at 281/377).

Every moderation entry point reads the in-memory
`ratingsByPassengerOrder` map exclusively, with no repository fallback:

| Entry point | Line | Read source |
| --- | --- | --- |
| `listRatingsForModeration` | 493 | `Array.from(this.ratingsByPassengerOrder.values())` |
| `getRatingForModeration` | 529 | `Array.from(...).find(...)` → 404 `P5_RATING_NOT_FOUND` |
| `invalidatePassengerRating` | 561 | `Array.from(...).find(...)` → 404 `P5_RATING_NOT_FOUND` |
| `getDriverRatingAuthority` | 601 | `Array.from(...).filter(...)` |

**Consequence after an API restart, with rating rows present in the DB:**

1. `GET /platform-admin/p5-ratings` returns an empty list.
2. `GET /platform-admin/p5-ratings/:ratingId` returns 404.
3. `POST .../invalidate` returns 404 — persisted ratings become **permanently
   un-moderatable**, because a rating only re-enters the map via
   `findPassengerRating`, which is reachable only from the passenger *submit*
   path, and submitting again is idempotently rejected.
4. **`getDriverRatingAuthority` returns `displayState: "new_driver"` with
   `averageRating: null, ratingCount: 0` for a driver who has N persisted
   ratings** — it recomputes the aggregate from the empty map and never reads the
   persisted `ops.driver_rating_summaries` row that `persistPassengerRating` and
   `invalidatePassengerRating` correctly maintain in-transaction.

Point 4 is worth calling out to the parent owner separately: it does not merely
degrade a list view, it **inverts the first acceptance criterion**. *"0 ratings
renders `new_driver`"* is satisfied by the unit test, while the real system
renders `new_driver` for a *rated* driver after any restart. The persistence
layer is right; only the read path is wrong.

*Not affected:* rating submission idempotency survives restart —
`findPassengerRating` (line 1075-1090) does fall back to
`this.repository.findPassengerRating(...)` and back-fills the map.

### F3 — BLOCKER (new) — version-safe redispatch guard is dead code at runtime

**Not reported by the parent reviewer.** Surfaced by the API typecheck.

```
owned-mobility.service.ts(2330,24): error TS2339: Property 'assignmentVersion'
  does not exist on type 'DispatchAssignmentRecord'.
owned-mobility.service.ts(2338,54): error TS2339: (same)
```

The new stale-redispatch guard (`owned-mobility.service.ts:2326-2342`) compares
`latestAssignment.assignmentVersion > command.expectedAssignmentVersion`, where
`latestAssignment` is a `DispatchAssignmentRecord`. That interface
(`packages/contracts/src/index.ts:3250-3265`) has **no `assignmentVersion`
field**, and `grep` over `apps/api/src` confirms nothing ever assigns one to a
dispatch assignment. The only `assignmentVersion` in the multi-taxi contracts
(`phase1-p5-s3-multi-taxi.ts:364`) belongs to
`PassengerDispatchDisclosureSnapshot`, and it is derived at
`owned-mobility.service.ts:6011-6014` as the per-order snapshot count + 1.

**Consequence:** at runtime `latestAssignment.assignmentVersion` is `undefined`,
so `undefined > 1` is `false` and the guard **never throws**. A stale redispatch
silently replaces a newer assignment — the exact condition acceptance item
*"stale redispatch cannot replace newer assignment"* forbids.

**Why the test does not catch it:** the Criterion 6 case
(`p5-rate-governance.test.ts:234-263`) hand-pushes a literal
`{ assignmentId: "assign-v2", ..., assignmentVersion: 2 }` directly into the
private `dispatchAssignments` array. Vitest transpiles without typechecking, so
the fabricated field exists in that test and nowhere else. The test passes
against a shape production never produces.

**Suggested direction for the parent owner** (not applied here): derive the
current version from the same source the snapshot uses —
`this.passengerDisclosureSnapshots.filter(s => s.orderId === orderId).length` —
or add `assignmentVersion` to `DispatchAssignmentRecord` and populate it at
assignment creation. The former needs no contract change.

### F4 — MAJOR — nullable actor identity passed to a non-nullable parameter

```
multi-taxi.controller.ts(347,9): error TS2345: Argument of type
  'string | null | undefined' is not assignable to parameter of type 'string | undefined'.
```

`invalidatePassengerRating` is called with `identity?.actorId` (line 347), which
is `string | null | undefined`. The service signature accepts
`operatorId?: string`. The service then resolves
`command.operatorId ?? operatorId ?? "system"` (line 588), so a `null` actor is
attributed to `"system"` in the moderation audit rather than being rejected.
Low blast radius, but it is an audit-attribution path and it is the only API
error not already covered by F3.

### F5 — Coverage gap — no test for the atomic-assignment acceptance criterion

`apps/api/tests/unit/p5-rate-governance.test.ts` (6 cases, all passing) maps to
acceptance as follows:

| # | Acceptance item | Test | Status |
| --- | --- | --- | --- |
| 1 | 0 ratings renders `new_driver` | `renders new_driver for 0 ratings` | covered (in-memory only — see F2.4) |
| 2 | duplicate rating idempotent | `replays duplicate ratings idempotently...` | covered |
| 3 | incomplete disclosure cannot assign | `denies assignment when vehicle passenger disclosure is incomplete` | covered |
| 4 | scarcity cannot bypass legal gate | `ensures P-5 hard legal gates are non-bypassable by scarcity fallback` | covered |
| 5 | **assignment rollback leaves no partial snapshot/token/outbox** | — | **NO TEST** |
| 6 | stale redispatch cannot replace newer assignment | `rejects stale redispatch requests...` | **vacuous — see F3** |
| 7 | moderation UI per doc08 §8, no aggregate editing | `supports rating invalidation with mandatory reason and aggregate rebuild` | partial (service-level; UI does not compile — F1) |
| 8 | unit+integration+e2e green + reviewer PASS | — | unit only; see §5 |

Criterion 5 is the atomicity core of the task title and has no test at any level
in this branch. A repository-level rollback assertion is the natural home for it.

### F6 — Process — branch base is stale

`origin/dev` is not an ancestor of `6f6e9827a`; `dev` has advanced through at
least `#1149`, `#1150`, `#1151` since the branch base. The §2 numbers are the
branch's *own* consistency, which is the right thing to measure for a review
verdict, but they do not predict post-rebase state. Re-run both `tsc` gates after
`git rebase origin/dev` before any closeout — `packages/contracts` was modified on
both sides of the fork.

---

## 4. Recommended Verdict

**REOPEN** (parent reviewer Codex2's R1 conclusion stands, and should be widened).

The parent reviewer's two findings are both **CONFIRMED**, and one of them (the
missing `Star` import) turns out to be 1 of 39 compile errors rather than an
isolated slip. F3 is a new blocker of equal weight to the reported ones: an
acceptance criterion that the test suite reports as green is non-functional in
production.

Ordered fix list for the parent owner:

1. **F3** — repair the redispatch version source; replace the fabricated-object
   test with one that drives a real assignment through the production path.
2. **F2** — hydrate ratings + driver summaries in `loadState`/`onModuleInit`, or
   (preferable) make the four moderation entry points repository-backed and read
   the persisted aggregate instead of recomputing from memory.
3. **F1** — register `p5-ratings` in `PLATFORM_ADMIN_ROUTE_REGISTRY`, import
   `Star`, and rework the three pages onto the public `ApiClient`/`TableColumn`/
   `Banner`/`Button`/`CanvasTheme` APIs until `tsc` is clean.
4. **F5** — add the criterion-5 rollback test.
5. **F4** — narrow or guard the actor identity.
6. **F6** — rebase onto `origin/dev`, re-run both gates, then re-hand off.

---

## 5. Evidence Boundaries

Stated explicitly so nothing in this packet is read as broader than it is.

- **Executed:** `vitest` on the one new unit file; `tsc --noEmit` on `apps/api`
  and `apps/platform-admin-web`, at both the branch tip and the `origin/dev`
  baseline, under identical `@drts/*` resolution.
- **Not executed:** eslint, `next build`, integration tests, Playwright E2E,
  DB-backed persistence tests. F2's restart behaviour is established by call-graph
  reading, not by a running Postgres. Acceptance item 8 (*"unit+integration+e2e
  green"*) is therefore **unverified**, not failed.
- **Integration state:** `INTEGRATION_STATUS` for the parent is `branch_pushed`.
  Nothing from `P5-RATE-001` is on `origin/dev`; no PR, CI, or dev deployment is
  claimed here.
- This packet's own worktrees under `/tmp` are scratch. They are not commit
  evidence.

---

## 6. Related Artifacts

- `support/sidecars/P5-RATE-001/CURRENT-HEAD-PREFLIGHT.md` — exists **only on
  `origin/gemini/p5-rate-001`**, not on `dev`, and not in this sidecar branch.
- `support/sidecars/P5-RATE-003/CURRENT-HEAD-PREFLIGHT.md` — sibling task. Its
  acceptance matrix claims in-transaction moderation audit + aggregate rebuild
  for the `P5-RATE-003` line of work. Do not read that table as evidence for
  `P5-RATE-001`; the branches are independent.
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
  — parent requirement source.

---

## 7. Appendix — Full `platform-admin-web` error list at `6f6e9827a`

Branch-attributable errors only; the 3 shared `@drts/control-plane-auth`
baseline entries are omitted.

```
app/p5-ratings/page.tsx(72,37): error TS2341: Property 'request' is private and only accessible within class 'ApiClient'.
app/p5-ratings/page.tsx(72,37): error TS2554: Expected 2-3 arguments, but got 1.
app/p5-ratings/page.tsx(90,7):  error TS2353: Object literal may only specify known properties, and 'key' does not exist in type 'TableColumn<RatingRow>'.
app/p5-ratings/page.tsx(92,16): error TS7006: Parameter 'row' implicitly has an 'any' type.
app/p5-ratings/page.tsx(96,26): error TS2339: Property 'primary' does not exist on type 'CanvasTheme'.
app/p5-ratings/page.tsx(106,7): error TS2353: ... 'key' does not exist in type 'TableColumn<RatingRow>'.
app/p5-ratings/page.tsx(108,16): error TS7006: Parameter 'row' implicitly has an 'any' type.
app/p5-ratings/page.tsx(115,7): error TS2353: ... 'key' does not exist in type 'TableColumn<RatingRow>'.
app/p5-ratings/page.tsx(117,16): error TS7006: Parameter 'row' implicitly has an 'any' type.
app/p5-ratings/page.tsx(120,7): error TS2353: ... 'key' does not exist in type 'TableColumn<RatingRow>'.
app/p5-ratings/page.tsx(122,16): error TS7006: Parameter 'row' implicitly has an 'any' type.
app/p5-ratings/page.tsx(131,7): error TS2353: ... 'key' does not exist in type 'TableColumn<RatingRow>'.
app/p5-ratings/page.tsx(133,16): error TS7006: Parameter 'row' implicitly has an 'any' type.
app/p5-ratings/page.tsx(136,27): error TS7006: Parameter 'tag' implicitly has an 'any' type.
... (26 total in this file; remaining entries are further TS2353/TS7006/TS2322
    occurrences of the same four defect classes)
app/p5-ratings/[ratingId]/page.tsx(81,37):  error TS2341: Property 'request' is private ...
app/p5-ratings/[ratingId]/page.tsx(81,37):  error TS2554: Expected 2-3 arguments, but got 1.
app/p5-ratings/[ratingId]/page.tsx(112,37): error TS2341: Property 'request' is private ...
app/p5-ratings/[ratingId]/page.tsx(114,9):  error TS2345: Argument of type '{ method: string; body: string; }' is not assignable to parameter of type 'string'.
app/p5-ratings/[ratingId]/page.tsx(160,10): error TS2322: Type '{ children: string; tone: "danger"; title: string; }' is not assignable to type 'IntrinsicAttributes & BannerProps'.
app/p5-ratings/[ratingId]/page.tsx(299,15): error TS2322: Type '{ children: string; variant: "secondary"; disabled: true; title: string; }' is not assignable to type 'IntrinsicAttributes & BtnProps'.
app/p5-ratings/[ratingId]/page.tsx(308,10): error TS2322: ... BannerProps.
app/p5-ratings/[ratingId]/page.tsx(314,10): error TS2322: ... BannerProps.
app/p5-ratings/driver-authority/page.tsx(52,39):  error TS2341: Property 'request' is private ...
app/p5-ratings/driver-authority/page.tsx(52,39):  error TS2554: Expected 2-3 arguments, but got 1.
app/p5-ratings/driver-authority/page.tsx(131,10): error TS2322: ... BannerProps.
components/admin-shell.tsx(155,5):  error TS2322: Type '"p5-ratings"' is not assignable to type '"health" | ... | "sandbox-suspend"'.
components/admin-shell.tsx(156,11): error TS2304: Cannot find name 'Star'.
```

### Appendix — full `apps/api` error list at `6f6e9827a`

```
src/modules/multi-taxi/multi-taxi.controller.ts(347,9):    error TS2345: Argument of type 'string | null | undefined' is not assignable to parameter of type 'string | undefined'.
src/modules/owned-mobility/owned-mobility.service.ts(2330,24): error TS2339: Property 'assignmentVersion' does not exist on type 'DispatchAssignmentRecord'.
src/modules/owned-mobility/owned-mobility.service.ts(2338,54): error TS2339: Property 'assignmentVersion' does not exist on type 'DispatchAssignmentRecord'.
```
