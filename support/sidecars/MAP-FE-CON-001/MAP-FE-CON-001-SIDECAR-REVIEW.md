# MAP-FE-CON-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `MAP-FE-CON-001` - Concierge and partner map alignment
**Parent Owner:** `Claude2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Claude2`
**Generated:** `2026-07-03` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, parent acceptance, or parent review authority.

This packet exists only to support reviewer handoff for `MAP-FE-CON-001-SIDECAR-REVIEW`. The canonical reviewed implementation remains on the parent review branch `origin/claude2/map-fe-con-001`. This sidecar packet captures the stable machine-truth anchors, dependency baseline, reviewed branch evidence, and the exact checks the sidecar reviewer should repeat before approving this support slice.

---

## 1. Scope Boundary

In scope:

- summarize the live machine-truth state of parent `MAP-FE-CON-001` and this sidecar task
- record the dependency baseline that the parent task explicitly names
- capture the parent review branch, commit sequence, reviewed file surfaces, and owner-reported verification
- provide reviewer-facing handoff notes for a docs-only support slice

Out of scope:

- editing `apps/concierge-portal-web/**`, `apps/partner-booking-web/**`, `tests/e2e/**`, `package.json`, or any parent runtime file
- editing `phase1_*`, runbooks, gap inventory, contracts, product truth, or any other canonical source
- editing the parent task's `artifacts`, `acceptance`, `next`, `status`, `commit`, `push`, or other machine-truth fields
- approving or rejecting parent `MAP-FE-CON-001` itself; that authority remains with parent reviewer `Codex`
- substituting this packet for the parent's own review verdict, parent approval note, or parent closeout evidence

---

## 2. Machine-Truth Anchors

### Sidecar task - `MAP-FE-CON-001-SIDECAR-REVIEW`

Stable fields in `ai-status.json`:

- owner=`Codex`
- reviewer=`Claude2`
- task_class=`sidecar`
- helper_parent=`MAP-FE-CON-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005`
- artifact=`support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-REVIEW.md`

Live sidecar lifecycle state:

- read `status`, `last_update`, and event history directly from `ai-status.json` / `ai-activity-log.jsonl` at review time
- this packet intentionally avoids hard-coding volatile sidecar lifecycle fields beyond the sidecar-start snapshot

### Parent task - `MAP-FE-CON-001`

`ai-status.json` at sidecar-start time recorded:

- owner=`Claude2`
- reviewer=`Codex`
- status=`review`
- depends_on=`MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005`
- acceptance:
  - concierge booking submits coordinates when dispatchable
  - partner/assisted entry reason codes consistent
  - provider outage cannot create silent normal order
  - package checks pass
- last_update=`2026-07-03T20:32:59Z`

Parent `next` text at sidecar-start time already records concrete review-round evidence:

1. review reopen round 4 fixed a wrong-program outage fallback in the partner assisted-entry funnel by switching to a program-neutral `referenceFallback` mode instead of fabricating `credit_card_airport_transfer`
2. review reopen round 4 fixed an unreachable `previewStatus=error` path so healthy-provider serviceability failures block as `serviceability_preview_unavailable`
3. owner-reported verification for the latest reopen fix:
   - partner vitest `64/64`
   - partner `tsc` exit 0
   - partner eslint exit 0
   - `playwright test:e2e:partner-map-booking` `5/5`
   - concierge vitest `22/22`
   - concierge e2e `4/4`
4. parent integration status is `branch_pushed` with:
   - `COMMIT_HASH=76e3c99a453cea28c04540ae4cdceb8de98a1881`
   - `COMMIT_SUBJECT='MAP-FE-CON-001: program-neutral partner outage funnel + reachable healthy-provider serviceability-error block'`
   - `PUSH_REMOTE=origin`
   - `PUSH_BRANCH=claude2/map-fe-con-001`

Implications for this sidecar:

- the parent is reviewable, but not finalized
- this sidecar can document the parent branch evidence already recorded in machine truth
- this sidecar cannot claim parent approval, parent `done`, or parent merge/deploy evidence

---

## 3. Dependency Baseline

The parent and sidecar both declare three dependencies:

| Dependency | Source used in this packet | Recorded role for `MAP-FE-CON-001` |
| --- | --- | --- |
| `MAP-UI-001` | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`, `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | shared `AddressMapPicker` / `AddressMapPairPicker` primitive foundation |
| `MAP-BE-004` | same docs | backend service-area evaluation gate during booking creation |
| `MAP-BE-005` | same docs | spatial audit snapshot and immutable booking/order evidence |

Important machine-truth note:

- direct single-task lookup with `scripts/ai-status.sh show MAP-UI-001`, `MAP-BE-004`, and `MAP-BE-005` returned `Task not found` in the current machine-truth board
- this packet therefore treats those dependency ids as execution-packet / gap-inventory anchors rather than live standalone task records
- that discrepancy is recorded only for reviewer context; this sidecar must not mutate the parent dependency list or canonical planning docs

What the docs still establish clearly:

- `MAP-UI-001` delivered the shared provider-neutral picker primitives and helper payload utilities
- `MAP-BE-004` is the backend authority that blocks or reroutes booking creation based on service-area evaluation
- `MAP-BE-005` is the backend authority that persists the spatial audit snapshot and coordinate provenance evidence

Why this matters for sidecar review:

- the parent branch is supposed to consume shared map-entry and backend gate behavior, not invent new canonical authority
- reviewer spot-checks should confirm the parent branch stays on that boundary: frontend preview and submit gating only, backend still authoritative

---

## 4. Reviewed Branch And Artifact Surface

Parent review branch:

- remote branch: `origin/claude2/map-fe-con-001`
- latest pushed commit: `76e3c99a453cea28c04540ae4cdceb8de98a1881`
- local branches containing that commit at sidecar-start:
  - `claude2/map-fe-con-001`
  - `codex/map-fe-con-001`

Branch history relevant to review:

1. `119301453` - `wip(MAP-FE-CON-001): anchor concierge map picker booking gate`
2. `ca89357fc` - `wip(MAP-FE-CON-001): anchor partner funnel map picker + serviceability reason codes`
3. `7428dd8ab` - healthy-provider preview failures block instead of silently degrading
4. `574223d5e` - partner text-only outage path restored so provider-outage manual review remains reachable
5. `8e262c8d1` - partner outage flow renders picker and e2e covers provider-outage manual review
6. `b61956546` - concierge map-booking e2e repaired so the form actually renders and drives mocked geo/provider stubs
7. `76e3c99a4` - latest reopen fix for program-neutral outage funnel plus reachable healthy-provider serviceability-error block

Net branch diff versus `origin/dev`:

- 25 files changed
- 2538 insertions
- 109 deletions

Primary reviewed surfaces in that diff:

### Concierge surface

- `apps/concierge-portal-web/app/bookings/new/page.tsx`
  - embeds shared `AddressMapPicker` for pickup and dropoff
  - calls backend `evaluateServiceArea(...)` once both stops have coordinates
  - blocks healthy-provider preview failures as `serviceability_preview_unavailable`
  - routes provider outage to explicit `provider_outage_manual_review`
  - keeps raw lat/lng inputs out of the form
- `apps/concierge-portal-web/lib/map-booking.ts`
  - defines the gate/banner vocabulary for `serviceable`, `manual_review`, `provider_outage_manual_review`, `serviceability_blocked`, and `serviceability_preview_unavailable`
- `apps/concierge-portal-web/tests/unit/map-booking.test.ts`
  - covers manual-review, provider-outage, and preview-unavailable gate semantics
- `tests/e2e/concierge-map-booking-ui.spec.ts`
  - covers serviceable, not-serviceable blocked, healthy-provider preview failure blocked, and provider-outage manual review

### Partner surface

- `apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx`
  - passes `referenceFallback={!entry}` so authority outage renders a program-neutral funnel instead of fabricating a specific partner program
- `apps/partner-booking-web/components/partner-booking-form.tsx`
  - embeds shared `AddressMapPicker` for pickup and dropoff
  - evaluates serviceability in-form with explicit `previewStatus="error"` handling
  - keeps healthy-provider evaluation failure distinct from provider outage
  - shows the same customer-safe gate/banner vocabulary as concierge
- `apps/partner-booking-web/lib/partner-booking-form.ts`
  - short-circuits subtype-specific intake and readiness checks when `referenceFallback` is active
- `apps/partner-booking-web/lib/partner-map-provider.ts`
  - exposes deterministic provider modes including serviceability failure coverage
- `apps/partner-booking-web/tests/integration/*.test.ts`
  - covers program-neutral fallback and map-provider behavior
- `tests/e2e/partner-map-booking-ui.spec.ts`
  - covers serviceable path, healthy-provider text-only block, provider-outage manual review, and healthy-provider `serviceability_preview_unavailable`

### Supporting test/runtime wiring

- repo-root `package.json`
  - adds `test:e2e:concierge-map-booking`
  - adds `test:e2e:partner-map-booking`
- `playwright.concierge-map-booking.config.ts`
- `playwright.partner-map-booking.config.ts`

Discrepancy note (record-only, not a sidecar finding to fix here):

- parent `artifacts` in machine truth still list `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
- that file is absent in the current sidecar worktree and absent in `origin/claude2/map-fe-con-001`
- this sidecar packet fills the missing reviewer-support gap at the sidecar-declared path without editing the parent's artifact field

---

## 5. Evidence Summary

Evidence that the parent task is in a real review state:

1. parent machine truth is `status=review`, `owner=Claude2`, `reviewer=Codex`, not just a local branch claim
2. the parent `next` text records concrete reopen fixes and concrete verification counts, not generic "addressed feedback" language
3. the review branch contains a visible reopen sequence, showing that review feedback materially changed the implementation rather than being ignored
4. the latest pushed commit `76e3c99a4` is present locally and on `origin/claude2/map-fe-con-001`
5. `git show --check --stat` succeeded for key parent commits inspected during sidecar assembly:
   - `119301453`
   - `ca89357fc`
   - `b61956546`
   - `76e3c99a4`

Semantic evidence anchored to the reviewed branch:

- concierge map-entry is real, not a docs-only claim:
  - `app/bookings/new/page.tsx` imports and renders `AddressMapPicker`
  - same file calls `evaluateServiceArea(...)` and treats `.catch(...)` as `previewStatus="error"`
  - same file maps outage and preview-error states to explicit gate codes instead of silently dispatching
- partner outage handling is program-neutral, not fabricated:
  - `app/[tenantSlug]/(authenticated)/book/page.tsx` documents and passes `referenceFallback={!entry}`
  - `components/partner-booking-form.tsx` hides program-specific intake when `referenceFallback` is true
  - `lib/partner-booking-form.ts` short-circuits subtype-specific readiness/gating under fallback
- partner healthy-provider preview failures are reachable and blocked:
  - `components/partner-booking-form.tsx` evaluates serviceability in-form and sets `previewStatus="error"` on failure
  - `lib/partner-map-provider.ts` supports a deterministic serviceability-failure mode
  - `tests/e2e/partner-map-booking-ui.spec.ts` asserts the gate becomes `serviceability_preview_unavailable`, not `serviceable` and not `provider_outage_manual_review`
- both surfaces preserve the required product boundary:
  - frontend previews and customer-safe guidance exist
  - backend serviceability and manual-review authority remain authoritative
  - raw coordinate inputs are not reintroduced

Owner-reported verification already attached to the parent review branch:

| Scope | Owner-reported verification |
| --- | --- |
| concierge anchor | typecheck, lint, test(21) PASS |
| partner anchor | typecheck, lint, test(55) PASS |
| concierge e2e repair | `playwright test:e2e:concierge-map-booking` 4/4 PASS; `test:e2e:partner-map-booking` 3/3 PASS at that stage |
| latest reopen fix | partner vitest 64/64 PASS; partner `tsc` exit 0; partner eslint exit 0; `test:e2e:partner-map-booking` 5/5 PASS; concierge vitest 22/22 PASS; concierge e2e 4/4 PASS |

Evidence about this sidecar itself:

- write scope is limited to `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-REVIEW.md`
- no runtime files, canonical truth, or parent machine-truth fields are changed
- the packet gives the reviewer a stable handoff even though the parent artifact list points at a missing review-evidence file

What this packet intentionally does not claim:

- it does not claim parent `MAP-FE-CON-001` is approved or `done`
- it does not claim any merge to `dev` or deployment
- it does not rewrite the parent artifact list to hide the missing `MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
- it does not substitute for parent reviewer `Codex`'s final decision

---

## 6. Reviewer Handoff Notes

Sidecar reviewer: `Claude2`

What to verify on this sidecar:

- the artifact exists at `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-REVIEW.md`
- sidecar stable fields in `ai-status.json` still match:
  - owner=`Codex`
  - reviewer=`Claude2`
  - helper_parent=`MAP-FE-CON-001`
  - helper_kind=`review_packet`
  - mutates_canonical=`false`
- parent snapshot in `ai-status.json` still matches the sidecar-start anchor:
  - owner=`Claude2`
  - reviewer=`Codex`
  - parent is still in `review`, or has advanced via the parent reviewer after this packet was written
- the dependency note in Section 3 accurately reflects current machine truth:
  - parent declares `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005`
  - direct task lookup for those ids is absent on the current board
  - docs still anchor their intended role
- the branch evidence in Sections 4-5 is reproducible from the repo without switching the canonical root

Suggested reviewer commands:

```bash
AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CON-001-SIDECAR-REVIEW
AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CON-001
git log --oneline -n 7 origin/claude2/map-fe-con-001
git diff --stat origin/dev...origin/claude2/map-fe-con-001
git diff --check origin/dev...origin/claude2/map-fe-con-001
git diff --check origin/dev...origin/codex/map-fe-con-001-sidecar-review -- support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-REVIEW.md
```

Suggested reviewer spot-checks on the parent branch evidence:

- `git show origin/claude2/map-fe-con-001:apps/concierge-portal-web/app/bookings/new/page.tsx`
- `git show origin/claude2/map-fe-con-001:apps/concierge-portal-web/lib/map-booking.ts`
- `git show origin/claude2/map-fe-con-001:apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx`
- `git show origin/claude2/map-fe-con-001:apps/partner-booking-web/components/partner-booking-form.tsx`
- `git show origin/claude2/map-fe-con-001:apps/partner-booking-web/lib/partner-booking-form.ts`
- `git show origin/claude2/map-fe-con-001:tests/e2e/concierge-map-booking-ui.spec.ts`
- `git show origin/claude2/map-fe-con-001:tests/e2e/partner-map-booking-ui.spec.ts`

If approved:

```bash
AI_NAME=Claude2 scripts/ai-status.sh approve MAP-FE-CON-001-SIDECAR-REVIEW "<review conclusion>"
```

If not approved:

- reopen this sidecar with the exact mismatch
- keep the scope narrow: no canonical-truth edits, no parent-task edits, no runtime edits

Reminder for later closeout (sidecar owner step, after sidecar review approval):

- this sidecar is `helper_kind=review_packet` and `mutates_canonical=false`
- this support packet does not require a task-scoped runtime commit to close the parent
- sidecar completion still must be recorded through `scripts/ai-status.sh done`; it is not implicit

---

## 7. Owner Verification

Verification performed while assembling this sidecar:

- read `AI_COLLABORATION_GUIDE.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- read sidecar task snapshot via `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CON-001-SIDECAR-REVIEW`
- read parent task snapshot via `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CON-001`
- confirmed direct task lookup for `MAP-UI-001`, `MAP-BE-004`, and `MAP-BE-005` is absent on the current board
- read the `MAP-FE-CON-001` section of `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- read dependency context from `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- inspected parent branch history with `git log --oneline origin/claude2/map-fe-con-001`
- inspected parent branch diff with:
  - `git diff --name-status origin/dev...origin/claude2/map-fe-con-001`
  - `git diff --stat origin/dev...origin/claude2/map-fe-con-001`
- spot-checked reviewed branch files with `git grep` / `git show` against `origin/claude2/map-fe-con-001`
- ran `git show --check --stat` on key parent commits:
  - `119301453`
  - `ca89357fc`
  - `b61956546`
  - `76e3c99a4`

Whitespace check required before handoff:

- `git diff --check -- support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-REVIEW.md`

Not performed here:

- rerunning parent runtime tests, typecheck, lint, or Playwright
- modifying or re-verifying parent branch push evidence

Reason:

- this is a docs-only support artifact
- parent runtime verification is already recorded on the parent review task and branch
- the sidecar must not widen scope into parent implementation or canonical truth
