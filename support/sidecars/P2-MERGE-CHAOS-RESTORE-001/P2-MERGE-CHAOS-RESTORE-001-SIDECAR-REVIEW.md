# P2-MERGE-CHAOS-RESTORE-001-SIDECAR-REVIEW — Review Packet & Evidence Summary

**Sidecar owner:** Claude · **Reviewer:** Codex2 · **Parent task:** `P2-MERGE-CHAOS-RESTORE-001` (owner Codex2 / reviewer Codex)
**Helper kind:** `review_packet` · **mutates_canonical:** `false` · **Generated:** 2026-06-27 (post parent review-fail @ 13:51:23Z)

> This is a **read-only support artifact**. It does not edit canonical truth, does not adjudicate the
> parent, and creates no commit on canonical files. It assembles the merge-history evidence so the
> parent reviewer (Codex) and parent owner (Codex2) can decide what to land. All claims below are
> backed by `git` commands a reviewer can re-run from the canonical root.

---

## 1. Parent task in one line

Parent `P2-MERGE-CHAOS-RESTORE-001` aims to restore **3 Phase-2 deliverables** it asserts were *silently
reverted* by stale-branch squash-merge chaos, and re-land them on `dev`:

1. **S1 disclosure migration** — `infra/migrations/V0042__passenger_disclosure_policy_catalog_acknowledgements.sql` (added #926).
2. **S2 regulator-cases** — `platform-admin-regulator-cases.{controller,service}.ts`, `regulatory-reporting.module.ts`, `lib/sandbox-compliance.ts`, **+ `components/sandbox-compliance-console.tsx`** (added #975).
3. **UI-TEN av-fallback** — `lib/tenant-av-fallback.tsx`, `app/bookings/[bookingId]/av-fallback/page.tsx`, `app/bookings/page.tsx` (added #927).

The owner produced a single restore commit and handed off; reviewer Codex **failed the review**. This
packet exists to ground that review-fail in verifiable merge history and to propose a split that
separates the genuine silent reverts from the parts that conflict with canonical decisions.

---

## 2. Current state of the parent restore branch

| Fact | Value | How to verify |
|---|---|---|
| Restore commit | `cc275c36bfe7f533e00db98f07a766ae710d51d1` | `git log -1 cc275c36` |
| Commit subject | `P2-MERGE-CHAOS-RESTORE-001: restore reverted phase2 deliverables` | — |
| Trailers | `LLM-Agent: Codex2` · `Task-ID: P2-MERGE-CHAOS-RESTORE-001` · `Reviewer: Codex` | `git log -1 --format=%B cc275c36` |
| Branch tip now | `origin/codex2/p2-merge-chaos-restore-001` == `cc275c36` | `git rev-parse origin/codex2/p2-merge-chaos-restore-001` |
| On `dev`? | **No** — `cc275c36` is **not** an ancestor of `origin/dev` (`51139262e`) | `git merge-base --is-ancestor cc275c36 origin/dev` → false |
| Diff scope | 20 files, **+7882 / −15** | `git diff --stat origin/dev...cc275c36` |
| **INTEGRATION_STATUS** | **`branch_pushed`** (committed + pushed; not merged) | — |

**Reviewer concern #3 (push discrepancy) — status: SINCE-RESOLVED.** At review time (13:51:23Z) the
reviewer noted `origin/codex2/p2-merge-chaos-restore-001` was still `51139262e` and did **not** contain
`cc275c36`. As of this packet's `git fetch`, that branch tip **is** `cc275c36` (commit authored
13:45:08Z). The push has since landed on the branch. The branch is **not** merged to `dev` — so the
correct integration level remains `branch_pushed`, and the original "handoff claimed branch_pushed but
ref didn't contain it" objection no longer reproduces. Reviewer should re-fetch to confirm.

**Build/test status — NOT the failure cause.** The reviewer's own note states *"verification passed on
cc275c36 (api typecheck/build, platform-admin-web typecheck + next build --webpack, tenant-console-web
typecheck/build, sandbox-compliance e2e)"*. The review-fail is **design-contract**, not red CI.

---

## 3. The central finding: the restore bundles heterogeneous provenance

The parent treats all 3 groups as one class ("silent revert"). The merge history shows they were
removed by **three different commits with three different intents**. Two-and-a-half are genuine
stale-branch collateral; one is a **deliberate, recorded design decision** that the restore reverses.

| # | Restored files | Deleted from `dev` by | Intent of the deleting commit | Silent revert? |
|---|---|---|---|---|
| 1 | `V0042__…disclosure…sql` | **#930** `5727eef1f` P2-SAFE-001 (safety-operator takeover) | Unrelated feature commit; its own parent **had** V0042 → collateral drop | **Yes ✓** |
| 2a | regulator-cases `controller/service`, `regulatory-reporting.module.ts`, `lib/sandbox-compliance.ts` | **#959** `6c53e1072` P2-DP-S3-001 (sandbox fallback-cost resolver) | Unrelated backend commit; collateral drop | **Yes ✓** |
| 2b | **`components/sandbox-compliance-console.tsx`** (4632 lines) + `app/platform-admin/compliance/page.tsx` | **#974** `6ac346ab8` P2-UI-ROC-002-UNBLOCK-**PLANNING-DECISION** | **Deliberate** — removed invented console, installed `SandboxDesignPendingScreen` placeholder | **No ✗ — intentional** |
| 3 | `tenant-av-fallback.tsx`, `av-fallback/page.tsx`, `bookings/page.tsx` | **#930** `5727eef1f` P2-SAFE-001 | Collateral drop **— but also deleted the canvas source** `drts-design-canvas/tenant-av-fallback.jsx` + `ops-av-fallback.jsx`, which the restore does **not** bring back | **Yes ✓ (app), but canvas source gap** |

Verification commands:
```bash
# What commit DELETED each file from dev history:
git log --full-history --diff-filter=D --oneline origin/dev -- \
  apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.service.ts   # → 6c53e1072 (#959)
git log --full-history --diff-filter=D --oneline origin/dev -- \
  apps/platform-admin-web/components/sandbox-compliance-console.tsx                       # → 6ac346ab8 (#974)
# #930 deleted V0042 + av-fallback that ITS OWN parent contained (= collateral, not intent):
git cat-file -e 5727eef1f^:infra/migrations/V0042__passenger_disclosure_policy_catalog_acknowledgements.sql   # exists
git cat-file -e '5727eef1f^:apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx'            # exists
# Restore does NOT re-add the av-fallback canvas .jsx source:
git diff --stat origin/dev...cc275c36 | grep -i 'drts-design-canvas'   # → no matches
```

---

## 4. Reviewer objection #1 — compliance console restore reverses a deliberate decision

**Reviewer note:** *"Platform Admin compliance replaced the placeholder page with invented UI even though
`docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md` says the canvas lacks
these screens and engineering must not invent visuals (lines 10-27, 169-173)."*

**Evidence — citation confirmed accurate.** The screen-requirements doc (on `origin/dev`) states verbatim:

- L10: *"`Platform Admin.html` and `platform-screens-*.jsx` do **not** contain source screens for the new
  sandbox compliance route group. **Engineering must not invent those visuals.**"*
- L27: *"Review requirement for `P2-DP-C1-001`: if the canvas lacks the screen, stop visual implementation
  and write a screen-requirements note instead of inventing UI."*
- L169-173: *"The unresolved blocker that still requires follow-up is canonical visual publication:
  `Platform Admin.html` and `platform-screens-*.jsx` still need first-class sandbox compliance /
  investigation / evidence / regulatory-report screens before engineering can implement the parent task
  without inventing UI."*

**Evidence — current dev page is the canonical placeholder (by deliberate decision #974).** On `dev`,
`app/platform-admin/compliance/page.tsx` renders `SandboxDesignPendingScreen` (route
`/platform-admin/compliance`, `purposeKey: sandbox.pending.compliance.purpose`). Commit **#974**
`6ac346ab8` (`P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION`) is the commit that swapped the page from
`export { SandboxComplianceDashboardPage } from "@/components/sandbox-compliance-console"` to the
design-pending placeholder and **deleted the 4038-line console**. The commit id literally carries
`PLANNING-DECISION`. Memory cross-check: parent `P2-UI-CMP-001` was blocked **CANVAS-PUBLICATION ONLY**
because `compliance-screens.jsx` is absent from `origin/dev`.

**Implication:** restoring `sandbox-compliance-console.tsx` (4632 lines) + reverting `page.tsx` back to
the console export **undoes a recorded planning decision** and re-introduces exactly the invented UI the
requirements doc forbids. This is **not** a silent-revert recovery; it is a regression of a deliberate
correction. The reviewer is correct to block this group.

---

## 5. Reviewer objection #2 — tenant av-fallback adds surfaces without canvas source

**Reviewer note:** *"Tenant AV fallback also adds new `/bookings?fulfillment=av` and
`/bookings/[bookingId]/av-fallback` surfaces without a matching Tenant canvas screen source (Tenant
Console.html lines 68-74 only define bookings list/detail/new)."*

**Evidence — citation confirmed.** `docs/05-ui/drts-design-canvas/Tenant Console.html` §02 預約流程
(lines ~68-74) defines artboards `bookings`, `bk-completed`, `bk-reserve`, `bk-pending`, `newbooking`
only — **no `av-fallback` artboard**.

**Nuance the packet must surface:** av-fallback **did** once have canvas source. #927 added
`drts-design-canvas/tenant-av-fallback.jsx` and `ops-av-fallback.jsx`; **#930 deleted them together with
the app code** (collateral). So unlike the compliance console (which was *deliberately* removed), the
av-fallback canvas was *collaterally* removed. **However**, the restore commit `cc275c36` re-adds only
the **app/lib code**, not the canvas `.jsx` source (`git diff --stat … | grep drts-design-canvas` → 0
matches). So the restore leaves the app surfaces **inconsistent with the canvas** either way — and
`Tenant Console.html` itself never referenced the av-fallback artboards. This group needs a parent/canvas
decision: restore the canvas source too (so app+canvas are consistent), or hold the app surfaces.

---

## 6. Recommended adjudication split (RECOMMENDATION, not a decision)

The sidecar does not decide; this is input for Codex (reviewer) / Codex2 (owner). Because the restore is
one commit spanning heterogeneous provenance, the cleanest path is to **split it**:

- **LAND (genuine silent reverts, no contract conflict):**
  - **Group 1 — V0042 disclosure migration.** Pure persistence layer. Gate already enforces
    `PASSENGER_DISCLOSURE` but the table-creating migration is absent from `dev`; this is a real
    persistence gap with no UI/design-contract dimension. Lowest-risk restore.
  - **Group 2a — regulator-cases backend** (controller/service/module + `lib/sandbox-compliance.ts` +
    `packages/contracts` + `packages/api-client`). Backend/contract surfaces dropped as #959 collateral;
    no canvas dependency. (Reviewer should confirm the contract deltas still compile against current
    `dev` — owner's verification log says they do.)

- **HOLD (conflicts with canonical decisions):**
  - **Group 2b — `sandbox-compliance-console.tsx` + `compliance/page.tsx` revert.** Reverses deliberate
    planning decision #974 and violates the screen-requirements doc. Keep `SandboxDesignPendingScreen`.
    The console may only return after canonical canvas publication (the `P2-UI-CMP-001` blocker).
  - **Group 3 — tenant av-fallback app surfaces.** Either also restore the canvas source
    (`tenant-av-fallback.jsx` / `ops-av-fallback.jsx`, deleted by #930) so app+canvas are consistent, or
    hold the app surfaces pending a canvas decision. Needs parent-owner/canvas call.

**Process note for re-occurrence prevention (from the parent brief):** before squash-merging a
stale-based branch, diff line-count history (`git log --oneline -- <signature-file>`) to detect that the
branch would delete deliverables landed after its branch point. #930 and #959 each silently dropped
unrelated landed work this way.

---

## 7. Evidence index (re-runnable from canonical root)

```bash
git fetch origin
git rev-parse origin/codex2/p2-merge-chaos-restore-001 origin/dev          # branch tip vs dev
git merge-base --is-ancestor cc275c36 origin/dev && echo merged || echo not-merged
git log -1 --format=%B cc275c36                                            # trailers + verification line
git diff --stat origin/dev...cc275c36                                      # 20 files / +7882 -15
git show origin/dev:apps/platform-admin-web/app/platform-admin/compliance/page.tsx   # placeholder on dev
git show origin/dev:docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md | sed -n '10,27p;165,173p'
sed -n '66,74p' "docs/05-ui/drts-design-canvas/Tenant Console.html"
git log --full-history --diff-filter=D --oneline origin/dev -- apps/platform-admin-web/components/sandbox-compliance-console.tsx   # #974
git log --full-history --diff-filter=D --oneline origin/dev -- apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.service.ts   # #959
git show 6ac346ab8 -- apps/platform-admin-web/app/platform-admin/compliance/page.tsx   # planning-decision page swap
```

---

## 8. Reviewer handoff (→ Codex2)

This packet is prepared for sidecar reviewer **Codex2**. It is support-only:

- **Scope:** read-only evidence assembly. No canonical truth edited. Single artifact:
  `support/sidecars/P2-MERGE-CHAOS-RESTORE-001/P2-MERGE-CHAOS-RESTORE-001-SIDECAR-REVIEW.md`.
- **task_class:** `sidecar`, **mutates_canonical:** `false` → `task_requires_commit()` is `False`;
  closeout uses `INTEGRATION_STATUS=not_applicable` (the artifact itself is committed for traceability).
- **What to verify:** the §7 commands reproduce; the three deletion provenances (§3) hold; the two
  citation confirmations (§4, §5) are accurate; the §6 split is a fair reading of the evidence.
- **What this packet does NOT do:** it does not approve/reject the parent, does not merge, does not edit
  parent files. The land/hold decision belongs to parent reviewer Codex + owner Codex2.

**Bottom line for the parent:** the parent's premise is **partly** correct — V0042, the regulator-cases
backend, and the av-fallback *app code* were genuine stale-branch silent reverts (#930, #959). But the
single restore commit also reverses a **deliberate planning decision** (#974, the compliance console →
design-pending placeholder) and re-adds av-fallback app surfaces without canvas source. Both are valid
review-fail grounds. Recommend splitting: land the persistence/backend reverts, hold the two UI groups
pending canvas publication / a parent-owner decision.
