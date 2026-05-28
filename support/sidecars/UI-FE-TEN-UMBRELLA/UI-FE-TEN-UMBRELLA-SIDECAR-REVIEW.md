# UI-FE-TEN-UMBRELLA Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `UI-FE-TEN-UMBRELLA` — Tenant Console rebuild umbrella status / closeout
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-28` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, the parent review verdict, or the parent
closeout evidence.

This packet exists only to support sidecar reviewer handoff for
`UI-FE-TEN-UMBRELLA`. It does not approve, reopen, or alter the parent review
outcome. It records the stable machine-truth anchors, the sub-task dependency
closure, the source anchors that justify the umbrella integration, and the
exact checks the sidecar reviewer (`Codex2`) should repeat before approving
this support slice.

Transient sidecar lifecycle truth (`status`, `next`, `last_update`) remains
authoritative only in `ai-status.json`. This packet intentionally avoids
hard-coding those volatile fields.

---

## 1. Scope Boundary

In scope:

- summarize the stable machine-truth fields of parent `UI-FE-TEN-UMBRELLA` and
  this sidecar task
- record the dependency closure across the 20 declared sub-tasks
- pin the parent's lifecycle chain through the chairman reassignment, the
  umbrella integration commit, the pending review handoff, and the closeout
  doc
- capture the concrete source anchors that back the umbrella claim: the
  integration commit, the closeout doc, navigation IA, contract additions
  (Q-X16), api-client additions, and the 9 NEW build-route receipts
- restate the Q-TEN01 cutover posture so the reviewer can confirm the parent
  did not silently claim live production cutover
- provide reviewer-facing handoff notes for this docs-only support artifact

Out of scope:

- editing runtime, contract, or design files under
  `apps/tenant-console-web/**`, `packages/contracts/**`,
  `packages/api-client/**`, `docs/05-ui/**`, or
  `docs/01-decisions/**`
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through the normal lifecycle commands for this sidecar task
- approving, reopening, or finalizing parent `UI-FE-TEN-UMBRELLA`; that
  parent review remains owned by `Codex2` and `Codex`
- treating this packet as a substitute for the parent commit, push,
  closeout doc, or sub-task closeout evidence

---

## 2. Machine-Truth Anchors

### Sidecar task — `UI-FE-TEN-UMBRELLA-SIDECAR-REVIEW`

Stable fields in `ai-status.json`:

- owner=`Claude2`
- reviewer=`Codex2`
- phase=`phase1-ui-implementation-wave-202605`
- task_class=`sidecar`
- helper_parent=`UI-FE-TEN-UMBRELLA`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on=`UI-FE-TEN-HOME`, `UI-FE-TEN-BKG`, `UI-FE-TEN-BKGNEW`,
  `UI-FE-TEN-BKGID`, `UI-FE-TEN-PSG`, `UI-FE-TEN-ADR`, `UI-FE-TEN-USR`,
  `UI-FE-TEN-NTF`, `UI-FE-TEN-SLA`, `UI-FE-TEN-WH`, `UI-FE-TEN-APIK`,
  `UI-FE-TEN-BILL`, `UI-FE-TEN-INV`, `UI-FE-TEN-CC`, `UI-FE-TEN-RUL`,
  `UI-FE-TEN-IG`, `UI-FE-TEN-RPT`, `UI-FE-TEN-AUD`, `UI-FE-TEN-FF`,
  `UI-FE-TEN-SET`
- artifact=`support/sidecars/UI-FE-TEN-UMBRELLA/UI-FE-TEN-UMBRELLA-SIDECAR-REVIEW.md`

Live sidecar lifecycle state:

- read `status`, `next`, `last_update`, and the latest handoff/approve events
  directly from `ai-status.json`
- this packet is intentionally written against stable parent evidence, not the
  sidecar's transient lifecycle fields

### Parent task — `UI-FE-TEN-UMBRELLA`

Stable fields in `ai-status.json`:

- title=`Tenant Console rebuild — umbrella status / closeout`
- summary_zh=
  `Tenant Console 重做 umbrella（含 9 個 NEW route）：所有 sub-task 完成後做 closeout + Q-TEN01 cutover 規劃確認。`
- phase=`phase1-ui-implementation-wave-202605`
- owner=`Codex2`
- reviewer=`Codex`
- status=`review` (review handoff is pending — see §3 lifecycle)
- artifacts=`docs/05-ui/tenant-console-rebuild-closeout-*.md`
- acceptance:
  - `All 20 sub-tasks done; closeout doc; 9 NEW routes ship; smoke test clean; Q-TEN01 cutover plan referenced`

Umbrella integration commit (anchor):

- hash=`b7c6a8fe515f0c9037a483aa63b47e0353a12b34`
- subject=`UI-FE-TEN-UMBRELLA: integrate tenant-console rebuild umbrella`
- author=`Codex`
- author_timestamp=`2026-05-28T13:57:37Z`
- trailers=`LLM-Agent: codex2`, `Task-ID: UI-FE-TEN-UMBRELLA`, `Reviewer: Codex`
- diff shape: `53 files changed, 25,573 insertions(+), 3,456 deletions(-)`

Branch reachability checks at packet generation:

- `git branch -r --contains b7c6a8fe` resolves only to
  `origin/codex2/ui-fe-ten-umbrella`
- `git log b7c6a8fe ^origin/dev` confirms the umbrella branch is one
  integration commit ahead of `dev` — the umbrella has not been merged into
  `dev` yet, which is consistent with `status=review`

### Dependency baseline — 20 tenant sub-tasks

All 20 declared dependencies are `done` in `ai-status.json` with closeout
commit evidence:

| Task              | Status | Owner   | Reviewer | Commit       |
| ----------------- | ------ | ------- | -------- | ------------ |
| `UI-FE-TEN-HOME`  | `done` | `Codex` | `Codex2` | `546c28410f` |
| `UI-FE-TEN-BKG`   | `done` | `Codex2`| `Codex`  | `834ced64cb` |
| `UI-FE-TEN-BKGNEW`| `done` | `Codex` | `Claude2`| `7141faa322` |
| `UI-FE-TEN-BKGID` | `done` | `Codex2`| `Claude` | `7ee6b9e20a` |
| `UI-FE-TEN-PSG`   | `done` | `Codex` | `Claude` | `dc60e4f2a7` |
| `UI-FE-TEN-ADR`   | `done` | `Codex` | `Codex2` | `1012aa6092` |
| `UI-FE-TEN-USR`   | `done` | `Codex2`| `Claude2`| `5f6d66e61c` |
| `UI-FE-TEN-NTF`   | `done` | `Codex2`| `Claude` | `cd1a1d9430` |
| `UI-FE-TEN-SLA`   | `done` | `Codex` | `Claude2`| `1cbec616ca` |
| `UI-FE-TEN-WH`    | `done` | `Codex2`| `Claude` | `449e290b`   |
| `UI-FE-TEN-APIK`  | `done` | `Codex` | `Claude` | `19993e8e7c` |
| `UI-FE-TEN-BILL`  | `done` | `Codex2`| `Codex`  | `58ce0405cb` |
| `UI-FE-TEN-INV`   | `done` | `Codex2`| `Claude` | `08380ce2b3` |
| `UI-FE-TEN-CC`    | `done` | `Codex` | `Codex2` | `a6bb27c2`   |
| `UI-FE-TEN-RUL`   | `done` | `Codex` | `Claude2`| `f300fdbff6` |
| `UI-FE-TEN-IG`    | `done` | `Codex` | `Claude` | `62d397fb0f` |
| `UI-FE-TEN-RPT`   | `done` | `Codex` | `Claude2`| `2340bcf00a` |
| `UI-FE-TEN-AUD`   | `done` | `Codex2`| `Claude` | `b6df5df91f` |
| `UI-FE-TEN-FF`    | `done` | `Codex` | `Claude` | `8dbeade7aa` |
| `UI-FE-TEN-SET`   | `done` | `Codex` | `Claude` | `40075680c3` |

Dependency role:

- the 20 sub-tasks delivered the individual tenant surfaces; the umbrella
  branch then re-integrated them into a single canonical
  `apps/tenant-console-web` snapshot rather than reimplementing them

---

## 3. Parent Lifecycle Summary

Final lifecycle events recorded in `ai-status.json::handoffs`:

| Timestamp UTC          | Event                       | Meaning                                                                                                                                                                                                       |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-05-28T09:39:54Z` | chairman reassignment       | Owner reassigned from `Claude` to `Codex2` because Claude lane was paused for auth failure; backlog status permitted owner reassignment, and `Codex2` preserves reviewer separation from `Codex`.             |
| `2026-05-28T13:45:56Z` | reassignment resolved       | Chairman reassignment marked `done`; `Codex2` now formally owns the umbrella slice.                                                                                                                           |
| `2026-05-28T13:57:37Z` | integration commit          | `Codex2` committed `b7c6a8fe` consolidating the 20 sub-task surfaces into `apps/tenant-console-web` plus the closeout doc and shared client/contract additions.                                               |
| `2026-05-28T13:58:17Z` | review handoff (pending)    | `Codex2` handed off to `Codex` with verification PASS receipts (`pnpm` contracts build, ui-tokens build, tenant-console build/typecheck/test) and confirmed push to `origin/codex2/ui-fe-ten-umbrella`.       |
| `2026-05-28T13:58:43Z` | sidecar created             | Supervisor auto-created `UI-FE-TEN-UMBRELLA-SIDECAR-REVIEW` against `Claude2` / `Codex2` as a parallel review packet helper.                                                                                  |

Reviewer interpretation:

- the load-bearing review work belongs to the parent track between `Codex2`
  and `Codex`
- this sidecar review is about whether this packet accurately describes the
  current parent state, not whether the parent should be approved or
  rejected
- at packet generation, the parent is still `status=review`; the sidecar
  should not assert parent `done` or claim commit closure on the parent's
  behalf

---

## 4. Source and Evidence Anchors

### Closeout document

- `docs/05-ui/tenant-console-rebuild-closeout-20260528.md` (added in
  commit `b7c6a8fe`)
  - records umbrella owner=`Codex2`, reviewer=`Codex`, branch
    `codex2/ui-fe-ten-umbrella`
  - lists shipped existing core routes and the NEW routes
  - lists shared client/contract alignment touched on the umbrella branch
  - records the verification commands and PASS results
  - reiterates Q-TEN01 cutover posture: canonical repo-local productization
    checkpoint, not a live production-topology switch

### Shipped surface anchors (commit `b7c6a8fe`)

Existing core routes touched on the umbrella branch:

- `apps/tenant-console-web/app/page.tsx` (home)
- `apps/tenant-console-web/app/bookings/page.tsx`,
  `apps/tenant-console-web/app/bookings/refresh-tier-control.tsx`
- `apps/tenant-console-web/app/bookings/new/page.tsx`,
  `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx`,
  `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils.ts`
- `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx`,
  `apps/tenant-console-web/app/bookings/[bookingId]/loading.tsx`
- `apps/tenant-console-web/app/passengers/page.tsx`
- `apps/tenant-console-web/app/users/page.tsx`
- `apps/tenant-console-web/app/webhooks/page.tsx`
- `apps/tenant-console-web/app/api-keys/page.tsx`,
  `apps/tenant-console-web/app/api-keys/api-key-manager.tsx`
- `apps/tenant-console-web/app/invoices/page.tsx`,
  `apps/tenant-console-web/app/invoices/refresh-tier.tsx`
- `apps/tenant-console-web/app/cost-centers/page.tsx`,
  `apps/tenant-console-web/app/cost-centers/cost-centers-manager.tsx`,
  `apps/tenant-console-web/app/cost-centers/actions.ts`,
  `apps/tenant-console-web/app/cost-centers/constants.ts`
- `apps/tenant-console-web/app/rules/page.tsx`,
  `apps/tenant-console-web/app/rules/rules-manager.tsx`,
  `apps/tenant-console-web/app/rules/actions.ts`
- `apps/tenant-console-web/app/audit/page.tsx`

NEW route surfaces shipped on this branch:

- `apps/tenant-console-web/app/addresses/page.tsx`
- `apps/tenant-console-web/app/notifications/page.tsx`,
  `apps/tenant-console-web/app/notifications/actions.ts`,
  `apps/tenant-console-web/app/notifications/constants.ts`,
  `apps/tenant-console-web/app/notifications/notification-matrix-form.tsx`
- `apps/tenant-console-web/app/sla/page.tsx`,
  `apps/tenant-console-web/app/sla/sla-profile-manager.tsx`,
  `apps/tenant-console-web/app/sla/actions.ts`
- `apps/tenant-console-web/app/billing/page.tsx`
- `apps/tenant-console-web/app/integration-governance/page.tsx`,
  `apps/tenant-console-web/app/integration-governance/refresh-control.tsx`
- `apps/tenant-console-web/app/reports/page.tsx`,
  `apps/tenant-console-web/app/reports/actions.ts`
- `apps/tenant-console-web/app/feature-flags/page.tsx`

Navigation IA anchor:

- `apps/tenant-console-web/lib/navigation.ts` declares the umbrella nav set
  including `home`, `bookings`, `bookings/new`, `passengers`, `addresses`,
  `cost-centers`, `rules`, `users`, `notifications`, `sla`, `billing`,
  `invoices`, `reports`, `api-keys`, `webhooks`,
  `integration-governance`, `feature-flags`, `settings`, `audit`
- this matches the IA called out by the closeout doc

### Shared client and contract anchors (commit `b7c6a8fe`)

- `packages/contracts/src/ui-runtime.ts` adds the Q-X16 tenant-feature
  visibility shapes:
  - `TenantFeatureFlagScope`
  - `TenantFeatureFlagVisibilityRecord`
  - `TenantFeatureFlagVisibilityList`
- `packages/api-client/src/index.ts` adds two read-side helpers consumed by
  the new tenant surfaces:
  - `getTenantFeatureFlags()` -> `/api/tenant/feature-flags`
  - `getTenantIntegrationReadiness()` ->
    `/api/tenant/integration-governance/readiness`
- shared supporting alignment also touched (per closeout doc and commit
  stat): `apps/tenant-console-web/next.config.ts`,
  `apps/tenant-console-web/tsconfig.json`,
  `apps/tenant-console-web/package.json`,
  `apps/tenant-console-web/lib/booking-list.ts`,
  `apps/tenant-console-web/lib/formatters.ts`,
  `apps/tenant-console-web/components/booking-command-panel.tsx`,
  `apps/tenant-console-web/components/page-primitives.tsx`,
  `apps/tenant-console-web/app/globals.css`,
  `apps/tenant-console-web/tests/unit/tenant-booking-create-form-utils.test.ts`

### Q-TEN01 cutover posture

The closeout doc explicitly avoids claiming live production cutover and
cites three governance anchors that keep the topology decision intact:

- `docs/05-ui/system-design-answers-all-apps-20260524.md` §
  `Q-TEN01. Canonical migration plan`
- `docs/05-ui/tenant-console-design-handoff-packet-20260525.md` §
  `Topology context (Q-TEN01 resolution)`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`

Confirmed posture as recorded in the closeout doc:

- `apps/tenant-console-web` is the canonical repo-local tenant admin
  console
- external `tenant-commute-hub` remains the live production owner until a
  separate cutover task records rollout / rollback evidence
- the umbrella is a ship-ready productization checkpoint, not a live
  production-topology switch

---

## 5. Verification Summary

Verification the parent recorded at the review handoff
(`2026-05-28T13:58:17Z`), copied from machine truth:

- `pnpm --filter @drts/contracts build` — PASS
- `pnpm --filter @drts/ui-tokens build` — PASS
- `pnpm --filter @drts/tenant-console-web build` — PASS
- `pnpm --filter @drts/tenant-console-web typecheck` — PASS
- `pnpm --filter @drts/tenant-console-web test` — PASS (`1` file, `5` tests)

Build receipts in the closeout doc confirm the following NEW routes are
present in the build output:

- `/addresses`
- `/notifications`
- `/sla`
- `/billing`
- `/integration-governance`
- `/reports`
- `/feature-flags`
- `/bookings/new`
- `/bookings/[bookingId]`

That set matches the umbrella acceptance's `9 NEW routes` count when the
two redesigned booking-flow routes are counted alongside the seven brand-new
tenant surfaces, as documented in the closeout doc's build-output section.

Packet-refresh verification performed for this sidecar:

- read back `ai-status.json` for parent `UI-FE-TEN-UMBRELLA`, sidecar
  `UI-FE-TEN-UMBRELLA-SIDECAR-REVIEW`, and the 20 declared sub-tasks
- read `ai-status.json::handoffs` for the chairman reassignment, the
  reassignment resolution, and the parent review handoff
- inspected commit `b7c6a8fe` via `git show --stat --summary`
- verified `git branch -r --contains b7c6a8fe` resolves only to
  `origin/codex2/ui-fe-ten-umbrella`
- verified `git log b7c6a8fe ^origin/dev` returns exactly the one umbrella
  integration commit (no other unmerged commits on the umbrella branch)
- read the closeout doc content out of `b7c6a8fe:docs/05-ui/...20260528.md`
- spot-checked the contract additions in
  `b7c6a8fe:packages/contracts/src/ui-runtime.ts`, the api-client additions
  in `b7c6a8fe:packages/api-client/src/index.ts`, and the navigation IA in
  `b7c6a8fe:apps/tenant-console-web/lib/navigation.ts`

No runtime tests were rerun during this sidecar packet creation because
this task only adds a support artifact and `mutates_canonical=false`.

---

## 6. Reviewer Checklist For This Sidecar

1. Confirm machine truth still matches the packet.
   - Sidecar row still identifies `owner=Claude2`, `reviewer=Codex2`,
     `helper_parent=UI-FE-TEN-UMBRELLA`, `helper_kind=review_packet`, and
     `mutates_canonical=false`.
   - Parent row still shows `status=review` with `owner=Codex2`,
     `reviewer=Codex`, and the pending review handoff at
     `2026-05-28T13:58:17Z`.
   - The 20 sub-task dependency rows remain `done` with the commit hashes
     listed above.

2. Confirm the packet does not overclaim the parent.
   - It must not say parent `UI-FE-TEN-UMBRELLA` is already `done`.
   - It must not assert reviewer approval or owner closeout for the umbrella.
   - It must not invent live production-cutover claims; the Q-TEN01 posture
     must remain "canonical repo-local productization checkpoint".

3. Confirm the source anchors are accurate.
   - Commit `b7c6a8fe` still resolves locally and still carries trailers
     `LLM-Agent: codex2`, `Task-ID: UI-FE-TEN-UMBRELLA`, `Reviewer: Codex`.
   - The 53-file diff shape (per `git show --stat`) still matches the route
     and shared-package surface listed above.
   - `packages/contracts/src/ui-runtime.ts` still exposes the
     `TenantFeatureFlagVisibilityRecord` / `TenantFeatureFlagVisibilityList`
     additions.
   - `packages/api-client/src/index.ts` still exposes `getTenantFeatureFlags`
     and `getTenantIntegrationReadiness`.

4. Confirm the dependency baseline is honest.
   - Every row in the 20-row dependency table remains `done` in
     `ai-status.json`.
   - No row has silently regressed to `review`, `reopen`, or `blocker`.

5. Confirm sidecar scope discipline.
   - This sidecar adds only
     `support/sidecars/UI-FE-TEN-UMBRELLA/UI-FE-TEN-UMBRELLA-SIDECAR-REVIEW.md`
     plus the normal lifecycle state transitions recorded through
     `scripts/ai-status.sh`.
   - No canonical L1 truth, runtime code, design doc, or contract is
     touched by this sidecar.

---

## 7. Reviewer Handoff Summary

Expected sidecar reviewer conclusion if this packet passes:

- the packet reflects the current parent state at `2026-05-28T13:58:17Z`
  (pending review handoff) without overclaiming approval or closeout
- the chairman reassignment, integration commit, push, closeout doc, and
  verification PASS receipts are represented accurately
- the file/line anchors match the live umbrella commit and the new tenant
  console contract/api-client additions
- the 20 sub-task dependency closure is correct against `ai-status.json`
- the packet remains support-only and does not mutate canonical truth

If the sidecar review fails, the failure should point to one of these
classes:

- parent lifecycle chronology is wrong or incomplete
- commit/push/branch evidence is misstated (hash, trailers, or branch
  reachability)
- a source anchor (route file, contract addition, api-client method,
  navigation entry) no longer matches the live file in commit `b7c6a8fe`
- Q-TEN01 cutover posture is overclaimed as live production switch
- the 20-sub-task dependency baseline has silently changed
- the packet still carries stale pre-handoff language or asserts parent
  closeout
