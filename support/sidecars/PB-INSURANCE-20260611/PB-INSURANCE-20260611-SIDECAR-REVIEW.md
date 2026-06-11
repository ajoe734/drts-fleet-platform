# PB-INSURANCE-20260611 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `PB-INSURANCE-20260611` — 保險理賠代步 (富邦) program flow
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-06-11` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth, runtime behavior, or the parent task implementation.

This packet is a reviewer-facing companion for the parent task
`PB-INSURANCE-20260611`. It snapshots the current machine-truth state, the
owner's shipped commit evidence, the file-level shape of the insurance funnel
changes, and the acceptance audit anchors already reflected in the parent
task's review handoff. It does not replace `ai-status.json`, and it does not
perform parent closeout.

This revision also corrects the earlier sidecar delivery failure: the assigned
reviewer branch/worktree previously pointed at unrelated HEAD `6a9d4299`,
which did not contain this artifact or sidecar commit `c4b41f99`. Reviewer
handoff must therefore use this branch tip, not the stale reviewer branch.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete review checklist
- pin the parent task's current machine-truth snapshot for reviewer convenience
- enumerate the code anchors for the insurance theme, eligibility flow, blocked
  states, form fields, and validation coverage
- summarize the commit evidence and verification commands already attached to
  the parent branch
- hand off a concise reviewer packet to `Codex2`

Out of scope:

- editing canonical truth or the parent task entry in `ai-status.json`
- editing implementation files under `apps/partner-booking-web/*`
- changing product semantics beyond what the parent task already shipped
- performing the parent task's final `done` closeout

---

## 2. Machine-Truth Anchors

### Sidecar — `PB-INSURANCE-20260611-SIDECAR-REVIEW`

- owner=`Codex`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`PB-INSURANCE-20260611`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/PB-INSURANCE-20260611/PB-INSURANCE-20260611-SIDECAR-REVIEW.md`

### Parent snapshot — `PB-INSURANCE-20260611`

- status=`review`
- owner=`Codex2`
- reviewer=`Claude2`
- phase=`partner-booking-programs-202606`
- last_update=`2026-06-11T02:12:11Z`
- branch=`codex2/pb-insurance-20260611`
- pushed branch=`origin/codex2/pb-insurance-20260611`
- latest closeout commit=`8ee8ebbe7d23d38c44aae822bde05c6954041101`
- prior anchor commit=`e6af0c8a800a2e59dbf4a1f31fe232a8a1185ebd`

Parent `next` field snapshot:

> Owner closeout commit `8ee8ebbe` pushed to
> `origin/codex2/pb-insurance-20260611` after rerunning `pnpm install
> --frozen-lockfile`, `pnpm --filter @drts/partner-booking-web typecheck`,
> 16 integration tests, and `build`. Re-review requested only because an owner
> progress note regressed task status from `review_approved` to `in_progress`
> during closeout; implementation scope is unchanged from prior approval.

Parent `review_notes_zh` snapshot:

> 審查通過：實作對齊 pb-states canvas（PB_InsEligibility + 7 個
> insurance_* 封鎖狀態），富邦主題色已修正為與 canvas PROGRAMS.insurance
> 完全一致（#0E6E50/#063D2C/#2FA37A/#E6F5EE，舊值 #007A53 偏離 canvas）；
> 權益語意=理賠額度（非趟次），沿用 7-screen funnel 未重建 card；表單欄位改為
> claimReference/claimantName/replacementVehicleClass/caseHandler；zh-TW 經
> t()；partner-booking-web realm-token guard 零 finding（其他 app 既有
> finding 與本任務無關）。已於 owner commit e6af0c8a 重跑 typecheck/build/16
> tests 全綠。回 owner 收尾（commit 仍未 push）。

`ai-status.json` remains authoritative for any later lifecycle changes.

---

## 3. Commit Evidence

### Shipped parent commit

- commit=`8ee8ebbe7d23d38c44aae822bde05c6954041101`
- subject=`PB-INSURANCE-20260611: finalize insurance funnel closeout`
- trailers:
  - `LLM-Agent: Codex2`
  - `Task-ID: PB-INSURANCE-20260611`
  - `Reviewer: Claude2`
  - `Verification: pnpm install --frozen-lockfile; pnpm --filter @drts/partner-booking-web typecheck; pnpm --filter @drts/partner-booking-web test -- tests/integration/program-form-utils.test.ts; pnpm --filter @drts/partner-booking-web build`

### File shape from `8ee8ebbe`

- `apps/partner-booking-web/app/[tenantSlug]/program/[screen]/page.tsx`
- `apps/partner-booking-web/components/partner-booking-form.tsx`
- `apps/partner-booking-web/lib/partner-booking-form.ts`
- `apps/partner-booking-web/lib/program-screens.tsx`
- `apps/partner-booking-web/lib/program-theme.ts`
- `apps/partner-booking-web/lib/translations.ts`
- `apps/partner-booking-web/tests/integration/program-form-utils.test.ts`

Diff summary from the closeout commit:

- 7 files changed
- 877 insertions
- 67 deletions

---

## 4. Acceptance Audit

### AC-1 — Insurance funnel renders 富邦 theme + `PB_InsEligibility` + 7 `insurance_*` states

Evidence:

- `apps/partner-booking-web/lib/program-theme.ts` sets the insurance theme to:
  - `primary: #0E6E50`
  - `primaryDark: #063D2C`
  - `accent: #2FA37A`
  - `surface.bg: #E6F5EE`
- the same file resolves insurance branding through `program-theme` rather than
  raw per-screen hex usage
- `apps/partner-booking-web/lib/program-screens.tsx` includes:
  - `PB_InsEligibility`-style eligibility content under the insurance
    `screen === "eligibility"` path
  - 7 blocked state ids:
    `insurance_policy`, `insurance_replacement_vehicle`,
    `insurance_roster`, `insurance_pending`, `insurance_missing`,
    `insurance_expired`, `insurance_cancelled`
- blocked states are implemented as dedicated UI definitions with title,
  subtitle, badge, reason, rows, and CTA pairs

Verdict: `PASS`

### AC-2 — Entitlement is shown as 理賠額度, not 趟次

Evidence:

- `apps/partner-booking-web/lib/program-theme.ts` sets
  `benefitNoun: "理賠額度"` for the insurance program
- `apps/partner-booking-web/lib/program-screens.tsx` eligibility screen labels
  the benefit band as `理賠額度` and renders a claim allowance meter
  (`NT$ 12,800 / 22,400`)
- the insurance copy describes usage inside a claim window rather than
  card-trip entitlement language

Verdict: `PASS`

### AC-3 — Existing funnel is reused; card funnel is not rebuilt

Evidence:

- the parent change stays inside the existing partner-booking route and shared
  theme/screen/form modules
- the core screen switching continues to live in
  `apps/partner-booking-web/lib/program-screens.tsx`
- no new parallel insurance-only route tree or alternate card shell was added

Verdict: `PASS`

### AC-4 — Form fields match the insurance program requirements

Evidence:

- `apps/partner-booking-web/lib/partner-booking-form.ts` adds and validates:
  - `claimReference`
  - `claimantName`
  - `replacementVehicleClass`
  - `caseHandler`
- the insurance gate in `getPartnerProgramGate()` blocks readiness until
  `claimNumber`, `policyNumber`, and `replacementVehicleClass` are present
- `apps/partner-booking-web/lib/translations.ts` includes zh-TW labels for:
  - `field.claimReference` → `理賠參照`
  - `field.replacementVehicleClass` → `代步車輛資格`
  - `field.caseHandler` → `承辦人`

Verdict: `PASS`

### AC-5 — zh-TW primary copy goes through `t()`

Evidence:

- `apps/partner-booking-web/lib/partner-booking-form.ts` uses `t()` for
  program labels, coverage strings, required-field errors, and gate messages
- `apps/partner-booking-web/lib/translations.ts` carries the new insurance
  labels and eligibility message entries

Verdict: `PASS`

### AC-6 — Verification commands were rerun on the parent branch

Evidence:

- commit `8ee8ebbe` includes a `Verification:` trailer covering install,
  typecheck, targeted integration test, and build
- the parent `next` field explicitly records the same rerun after push to
  `origin/codex2/pb-insurance-20260611`

Verdict: `PASS`

---

## 5. Targeted Code Anchors For Reviewer

Use these anchors if `Codex2` wants a quick, focused audit instead of walking
the full diff:

- `apps/partner-booking-web/lib/program-theme.ts`
  - insurance brand tokens and `benefitNoun`
- `apps/partner-booking-web/lib/program-screens.tsx`
  - insurance eligibility band and claim allowance meter
  - the 7 `insurance_*` blocked-state cards and CTA wiring
- `apps/partner-booking-web/lib/partner-booking-form.ts`
  - insurance draft fields, gate rules, and required-field validation
- `apps/partner-booking-web/lib/translations.ts`
  - zh-TW field labels and insurance gate copy
- `apps/partner-booking-web/tests/integration/program-form-utils.test.ts`
  - insurance validation assertions for claim/policy/reference/claimant/
    replacement-vehicle coverage fields

---

## 6. Reviewer Handoff Notes For `Codex2`

Review from this sidecar branch and commit:

- branch=`codex/pb-insurance-20260611-sidecar-review`
- head commit=`c4b41f99`
- artifact=`support/sidecars/PB-INSURANCE-20260611/PB-INSURANCE-20260611-SIDECAR-REVIEW.md`

If the reviewer local branch still points at `6a9d4299`, refresh from origin
and inspect the sidecar owner branch instead of the stale local reviewer
branch.

Suggested review focus:

1. Confirm the closeout commit `8ee8ebbe` is the same implementation scope
   already described in the parent `review_notes_zh`.
2. Spot-check that insurance branding is sourced from `program-theme.ts`,
   especially the corrected Fubon token set.
3. Verify the insurance entitlement language stays on `理賠額度` semantics
   through eligibility and blocked-state surfaces.
4. Verify the added fields and translated labels align with the acceptance note
   and do not regress the existing card/travel funnels.

No blocking discrepancies were found while assembling this packet. This is a
support-only artifact for reviewer efficiency; parent disposition stays with
the parent owner/reviewer lane.

---

## 7. Sidecar Closeout

Prepared by `Codex` on `2026-06-11` as a non-canonical support artifact.

- Canonical truth modified: `no`
- Runtime files modified: `no`
- Parent task absorbed: `no`

Ready for `Codex2` review.
