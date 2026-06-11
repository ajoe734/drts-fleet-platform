# BANK-UI-HOME-20260610 — Unblock Planning Decision

**Task ID:** `BANK-UI-HOME-20260610-UNBLOCK-PLANNING-DECISION`
**Parent task:** `BANK-UI-HOME-20260610`
**Owner:** `Codex`
**Reviewer:** `Claude2`
**Decision date:** `2026-06-11`
**Decision type:** Routing decision (no new product/contract change)

---

## 1. Decision

`BANK-UI-HOME-20260610` is **not** blocked on an unresolved product, API, or
design-artifact decision.

The canonical planning stack already decides the relevant semantics:

- the bank back-office is a **separate new app**: `apps/bank-console-web`
- it is **not** a reuse of `tenant-console-web`
- the whole app uses a **bank-specific design canvas**
- implementation must validate against the bank canvas already present in
  `docs/05-ui/drts-design-canvas/`

This unblock task therefore resolves to:

- **No new L1/L2 product decision**
- **No new API/schema contract decision**
- **No scope cut**
- **Explicit confirmation that the parent task should continue on current
  `origin/dev` machine truth**

The prior blocker report was based on a stale owner branch that predated the
bank-canvas ingest. On current `origin/dev`, all required visual-source files
exist and `BK_Home` is defined in `bank-screens-1.jsx`.

## 2. Canonical Evidence

| Source | Finding |
| --- | --- |
| `docs/01-product/credit-card-airport-transfer-requirements-20260610.md` §S3, `OPQ-1` | S3 is a new `apps/bank-console-web` app; the bank back-office is separate from `tenant-console-web`. |
| `docs/02-architecture/credit-card-airport-transfer-sd-20260610.md` §1 D1, §6.4 | The bank console is a dedicated new app and depends on its own design canvas. |
| `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §1, §4.1 | `bank-console-web` must match the bank canvas; tenant console references do not replace the bank screen IA. |
| `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md` §0 | The 2026-06-10 bank-console bundle is "accepted and ingested" to `docs/05-ui/drts-design-canvas/` via PR `#619`. |
| Git history on current repo | Commit `ac9bf44a` is `CCAT-CANVAS-20260610: ingest bank-console design canvas (design-team reply) (#619)`. |
| Repo file inventory on current `origin/dev` | `docs/05-ui/drts-design-canvas/Bank Console.html` plus `bank-screens-{1,2,3}.jsx` all exist. |
| `docs/05-ui/drts-design-canvas/bank-screens-1.jsx:59` | `BK_Home` is defined in the canonical bank canvas. |
| `scripts/ai-status.sh show BANK-UI-HOME-20260610` on 2026-06-11 | Parent task is `in_progress`, not blocked, and already records the concrete next step: replay commit `78da80b5` onto current `origin/dev`, then validate against `BK_Home` and `Bank Console.html`. |

## 3. What Was Wrong In The Prior Artifact

The prior version of this helper reached the correct high-level conclusion that
no new product/contract decision was needed, but its routing rationale was
wrong.

- It claimed the repo lacked `Bank Console.html` and `bank-screens-{1,2,3}.jsx`.
- That claim was taken from a stale worktree that did not include PR `#619`.
- After rebasing onto current `origin/dev`, the files are present in canonical
  machine truth and the parent task's existing execution path is valid.

This is therefore a stale-base correction, not a new planning decision.

## 4. Parent Task Next Step

The concrete next step for `BANK-UI-HOME-20260610` is:

> Resume the parent task on current `origin/dev` by replaying commit `78da80b5`
> from `claude2/bank-ui-home-20260610`, then validate
> `apps/bank-console-web/app/page.tsx` against `BK_Home` in
> `docs/05-ui/drts-design-canvas/bank-screens-1.jsx` and `Bank Console.html`,
> rerun the required typecheck/build/UI-token guard, and hand back to Codex for
> review.

The parent should **not** be re-blocked for missing bank canvas artifacts,
because those artifacts are already in machine truth on `dev`.

## 5. Scope Cut And Routing

- No scope cut is needed for `BANK-UI-HOME-20260610`.
- Do not spawn a design-artifact recovery task for the bank canvas; the
  canonical files already exist.
- Do not spawn another planning-decision helper unless a higher-precedence
  product or architecture source changes the bank app boundary or semantics.
- The only remaining work is execution and validation of the existing
  implementation against the already-ingested bank canvas.

## 6. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved: there is no missing product/contract decision, and no missing design artifact on current `dev`. |
| Record the decision | Recorded here: no new product/contract change is required. |
| scope cut | Not needed. |
| or explicit follow-up needed by the parent task | Recorded in §4: replay `78da80b5`, validate against `BK_Home`, rerun checks, and continue normal review flow. |
| Produce task-scoped commit/push/PR evidence for any canonical change | Recorded in §7. |
| Update the parent task with the concrete unblocked next step | Parent machine truth already records the correct next step; this helper now aligns with it instead of contradicting it. |

## 7. Review And Verification Evidence

- stale-base correction commit:
  `TBD`
- pushed branch:
  `origin/codex/bank-ui-home-20260610-unblock-planning-decision`
- owner PR:
  [#646](https://github.com/ajoe734/drts-fleet-platform/pull/646)
- verification basis:
  - `AI_COLLABORATION_GUIDE.md`
  - `docs/01-product/credit-card-airport-transfer-requirements-20260610.md`
  - `docs/02-architecture/credit-card-airport-transfer-sd-20260610.md`
  - `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
  - `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md`
  - `docs/05-ui/drts-design-canvas/Bank Console.html`
  - `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
  - `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
  - `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`
  - `scripts/ai-status.sh show BANK-UI-HOME-20260610`
  - `git log --all` showing canvas-ingest commit `ac9bf44a`
