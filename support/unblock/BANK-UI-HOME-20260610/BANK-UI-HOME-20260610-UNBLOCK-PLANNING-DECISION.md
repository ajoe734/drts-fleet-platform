# BANK-UI-HOME-20260610 — Unblock Planning Decision

**Task ID:** `BANK-UI-HOME-20260610-UNBLOCK-PLANNING-DECISION`
**Parent task:** `BANK-UI-HOME-20260610`
**Owner:** `Codex`
**Reviewer:** `Gemini2`
**Decision date:** `2026-06-11`
**Decision type:** Routing decision (no new product/contract change)

---

## 1. Decision

`BANK-UI-HOME-20260610` is **not** blocked on an unresolved product or API
contract choice.

The canonical planning stack already decides the relevant semantics:

- the bank back-office is a **separate new app**: `apps/bank-console-web`
- it is **not** a reuse of `tenant-console-web`
- the whole app needs a **fresh bank-specific design canvas**
- the corporate tenant canvas may inform shell/chrome only, never the bank
  screen IA

This unblock task therefore resolves to:

- **No new L1/L2 product decision**
- **No new API/schema contract decision**
- **No scope cut**
- **Explicit routing to a missing canonical design-artifact intake**

The actual blocker is that the repo does not contain the visual-source files
that the parent task acceptance and dispatch packet cite:

- `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`
- `docs/05-ui/drts-design-canvas/Bank Console.html`

Without those files in machine truth, `BANK-UI-HOME-20260610` cannot validate
the implemented page against its required `BK_Home` canvas and must not invent
or substitute a design.

## 2. Canonical Evidence

| Source | Finding |
| --- | --- |
| `docs/01-product/credit-card-airport-transfer-requirements-20260610.md` §S3, `OPQ-1` | S3 is a new `apps/bank-console-web` app; the bank back-office is separate from `tenant-console-web`. |
| `docs/02-architecture/credit-card-airport-transfer-sd-20260610.md` §1 D1, §6.4 | The bank console is a dedicated new app. UI screens wait on the design-team canvas; even the bookings list needs new canvas because there is no existing tenant-console canvas to extend. |
| `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §1, §4.1 | The whole `bank-console-web` app needs fresh design canvas; `Tenant Console.html` is chrome-only reference and cannot supply the data IA. |
| `scripts/dispatch-bank-console-screens-20260610.sh` header + `COMMON_ACC` | The dispatch packet hardcodes `bank-screens-{1,2,3}.jsx` and `Bank Console.html` as the visual authority for all 8 bank-console tasks. |
| `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md` §0 | The follow-up request says the 2026-06-10 bank-console bundle was accepted and ingested, but current repo machine truth does not contain the named bank canvas files. |
| Repo file inventory on 2026-06-11 | `docs/05-ui/drts-design-canvas/` contains tenant/platform/ops/driver/partner canvas files, but no `bank-screens-*.jsx` and no `Bank Console.html`. |

## 3. Why This Is Not A Product/Contract Blocker

There is no unresolved bank-home semantic question left to answer:

- the app boundary is settled
- the issuer-tenant data-plane model is settled
- the bank-home surface is read-only
- the required posture cards and role cuts are already described in the parent
  summary and screen requirements

The only missing authority is the **visual-source artifact itself** at the
canonical design-canvas path. That is a design-ingestion / artifact-recovery
gap, not a product or contract-definition gap.

The follow-up request's new 2026-06-11 repository-ingestion note now makes the
execution gate explicit: until the bank canvas bundle is present at the
canonical path, bank-console UI tasks stay blocked.

## 4. Parent Task Next Step

The concrete next step for `BANK-UI-HOME-20260610` is:

> Keep the task blocked until the accepted bank-console design bundle is
> restored or recommitted to the canonical repo paths
> `docs/05-ui/drts-design-canvas/Bank Console.html` and
> `docs/05-ui/drts-design-canvas/bank-screens-{1,2,3}.jsx`. If the accepted
> bundle cannot be recovered, route a design-intake follow-up to re-materialize
> those exact files from the accepted 2026-06-10 design response. Only after
> those files exist should the parent reopen to validate
> `apps/bank-console-web/app/page.tsx` against `BK_Home`.

This means the parent is no longer blocked on missing product/contract truth.
Its remaining blocker is a missing canonical visual-source artifact.

## 5. Scope Cut And Routing

- No scope cut is needed for `BANK-UI-HOME-20260610`.
- Do not reinterpret the existing implementation against `Tenant Console.html`
  or any other canvas; that would violate the bank screen-requirements packet.
- Do not spawn another planning-decision helper for bank-home semantics unless a
  higher-precedence product or architecture document changes the app boundary.
- If recovery of the accepted design bundle is impossible, the correct follow-up
  is a design-delivery task, not a product/contract decision task.

## 6. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: the planning stack already decided separate app + fresh bank canvas; the blocker is missing canonical design-source files. |
| Record the decision | Recorded here: no new product/contract decision is required. |
| scope cut | Not needed. Parent scope remains valid once the bank canvas files exist. |
| or explicit follow-up needed by the parent task | Recorded in §4: restore/recommit the accepted bank canvas bundle or reopen design intake to materialize the missing canonical files. |
| Produce task-scoped commit/push/PR evidence for any canonical change | Recorded in §7: canonical decision commit `f5bd435af8184dae23d4cfa4fc5d14ad84b4932e`, closeout-evidence commit `29738727eaab09fc3cfb61d482b20dfa272ee020`, pushed branch `origin/codex/bank-ui-home-20260610-unblock-planning-decision`, PR [#646](https://github.com/ajoe734/drts-fleet-platform/pull/646). |
| Update the parent task with the concrete unblocked next step | Parent should remain blocked on bank canvas restoration, then resume validation against `BK_Home`. |

## 7. Review And Verification Evidence

- canonical decision commit:
  `f5bd435af8184dae23d4cfa4fc5d14ad84b4932e`
  (`BANK-UI-HOME-20260610-UNBLOCK-PLANNING-DECISION: route blocker to bank canvas recovery`)
- closeout-evidence commit:
  `29738727eaab09fc3cfb61d482b20dfa272ee020`
  (`BANK-UI-HOME-20260610-UNBLOCK-PLANNING-DECISION: record push and PR evidence`)
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
  - `scripts/dispatch-bank-console-screens-20260610.sh`
  - repo file inventory confirming `docs/05-ui/drts-design-canvas/` has no
    `bank-screens-*.jsx` and no `Bank Console.html`
