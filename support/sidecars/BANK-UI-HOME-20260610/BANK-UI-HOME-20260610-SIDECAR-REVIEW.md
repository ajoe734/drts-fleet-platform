# BANK-UI-HOME-20260610 Sidecar Review Packet

> **Parent Task:** BANK-UI-HOME-20260610 — Re-build bank-console home (BK_Home) — canvas now on dev
> **Parent Owner:** Claude2 | **Parent Reviewer:** Codex
> **Sidecar Owner:** Codex | **Sidecar Reviewer:** Claude2
> **Helper Kind:** review_packet
> **Mutates Canonical:** false
> **Created:** 2026-06-11T13:53:00Z

This packet is a support artifact only. It does not modify L1 canonical truth, runtime code, or the parent lane implementation. Its purpose is to hand Claude2 a reviewer-ready evidence summary for the current BK_Home slice.

---

## 1. Parent Task Snapshot

**Parent task ID:** `BANK-UI-HOME-20260610`

**Current machine-truth status:** `in_progress`

**Owner / reviewer:** `Claude2` / `Codex`

**Acceptance summary from machine truth:**

- Home shows quota + SLA + settlement posture cards with role gating.
- Figures reconcile with detail pages.
- Screen matches `BK_Home` in `docs/05-ui/drts-design-canvas/bank-screens-*.jsx`.
- Cardholder and card refs are masked.
- zh-TW primary via central `t()` usage; no inline locale ternaries.
- Issuer brand comes from `@drts/ui-tokens`, not raw hex.
- `pnpm --filter @drts/bank-console-web typecheck` and `build` pass.

**Important control-plane note:** the parent task `next` field currently records two review findings, but the cited path `apps/bank-console-web/lib/dashboard.ts` does not exist in the submitted implementation commit. The evidence below indicates the machine-truth note is stale relative to the current parent branch tip.

---

## 2. Evidence Base Reviewed

Primary evidence used for this packet:

- Parent branch commit `78da80b5edd98b28128a03e9a54bd1e129da287b`
  - Subject: `BANK-UI-HOME-20260610: build bank-console home/overview (BK_Home) role-cut posture dashboard`
- Parent branch tip `0b548a6f` (`claude2/bank-ui-home-20260610`) exists and follows that implementation commit with a merge-from-dev update.
- Canvas authority:
  - `docs/05-ui/drts-design-canvas/bank-screens-1.jsx:62-65`
  - `docs/05-ui/drts-design-canvas/bank-screens-1.jsx:98-120`
- Implemented files inside `78da80b5`:
  - `apps/bank-console-web/app/page.tsx`
  - `apps/bank-console-web/lib/home-data.ts`
  - `apps/bank-console-web/lib/translations.ts`
  - `apps/bank-console-web/app/globals.css`

This sidecar worktree itself is still at `origin/dev`, so local `apps/bank-console-web/app/page.tsx` remains the placeholder shell. Review of the parent implementation must therefore use the parent commit/branch evidence above, not the sidecar worktree file contents.

---

## 3. Acceptance Audit Against Submitted Parent Commit

### AC-1 Role-cut layout matches BK_Home canvas

Canvas authority:

- `bank-screens-1.jsx:62-65` sets `seeOrders` for `admin|ops`, `seeFinance` for `admin|finance`, and leaves `seeQuota` / `seeSla` visible to all roles.
- `bank-screens-1.jsx:98-120` shows bookings for order-visible roles, finance-only statement replacement for finance-without-orders, and finance-only exception filtering to SLA items.

Implementation evidence in `78da80b5`:

- `apps/bank-console-web/lib/home-data.ts:51-58` mirrors the same role gating:
  - `seeOrders: role === "admin" || role === "ops"`
  - `seeFinance: role === "admin" || role === "finance"`
  - `seeQuota: true`
  - `seeSla: true`
- `apps/bank-console-web/app/page.tsx:160-164` filters finance-only viewers to `sla_breach` exceptions.
- `apps/bank-console-web/app/page.tsx:242-349` renders bookings only for `seeOrders`, and renders the finance-only statement card when `!view.seeOrders && view.seeFinance`.
- `apps/bank-console-web/app/page.tsx:385-409` keeps quota and SLA visible to all roles.

**Verdict:** pass. The current submitted implementation matches the cited canvas role-cut logic.

### AC-2 Upcoming bookings evidence

Machine truth currently says the review failure came from `getBookingSummary()` in `lib/dashboard.ts` sorting ascending and slicing the oldest rides.

Observed evidence:

- `apps/bank-console-web/lib/dashboard.ts` does not exist in `78da80b5`.
- The actual read model is `apps/bank-console-web/lib/home-data.ts`.
- `apps/bank-console-web/lib/home-data.ts:138-146` defines `UPCOMING_ORDERS` by filtering `ORDERS` to `reserved|assigned|live`.
- `apps/bank-console-web/app/page.tsx:267-292` renders `UPCOMING_ORDERS` directly; there is no sort-and-slice path matching the stale review note.

**Verdict:** the recorded review finding is stale or references a pre-rename/pre-rebase version that is not the submitted parent commit.

### AC-3 Masking and localization

Implementation evidence:

- `apps/bank-console-web/lib/home-data.ts:74-136` uses masked refs only, e.g. `**** 4821`, `BNF-••••-7A2`.
- `apps/bank-console-web/app/page.tsx` resolves display copy through `t(...)` across headings, KPI labels, CTA labels, exceptions, quota, SLA, and settlement strings.
- Commit message for `78da80b5` explicitly claims zh-TW primary via central `t()` and no inline locale ternaries.

**Verdict:** pass on the submitted evidence.

### AC-4 Token sourcing and styling discipline

Implementation evidence:

- `apps/bank-console-web/app/page.tsx:2` imports `BRAND_TEMPLATES` from `@drts/ui-tokens`.
- `apps/bank-console-web/app/page.tsx:25-29` and `166-173` state and apply issuer token vars via CTBC token data, not hand-picked raw issuer hex.
- Commit message for `78da80b5` records `scripts/check_ui_realm_tokens.py` green for `bank-console-web`.

**Verdict:** pass on submitted evidence.

### AC-5 Verification evidence

Recorded evidence available:

- Commit message for `78da80b5` states `typecheck + build pass`.
- Parent task `next` field also says "Typecheck/build pass; check_ui_realm_tokens has no bank-console findings but repo still has pre-existing findings in other apps."

What this sidecar did not do:

- Did not re-run `pnpm --filter @drts/bank-console-web typecheck`.
- Did not re-run `pnpm --filter @drts/bank-console-web build`.

**Verdict:** inherited evidence only; no fresh rerun performed in this sidecar.

---

## 4. Findings For Reviewer Handoff

### F-1 Stale review note in machine truth

The current `BANK-UI-HOME-20260610.next` field is not aligned with the submitted parent commit:

- It cites `apps/bank-console-web/lib/dashboard.ts`, which does not exist in `78da80b5`.
- It claims quota/SLA visibility and finance filtering diverge from the canvas, but `lib/home-data.ts` and `app/page.tsx` in `78da80b5` implement the same role-cut as the canvas.

**Severity:** medium process issue

**Impact:** reviewer could review the wrong revision or reopen already-fixed findings.

**Recommended action:** Codex should review against `claude2/bank-ui-home-20260610` / commit `78da80b5` (or tip `0b548a6f`), then update parent machine truth to reflect actual current findings.

### F-2 Sidecar worktree is intentionally not the parent implementation branch

This sidecar branch `codex/bank-ui-home-20260610-sidecar-review` tracks `origin/dev`, so local file reads for `apps/bank-console-web/app/page.tsx` show the placeholder shell rather than the parent implementation.

**Severity:** info

**Impact:** local file inspection without `git show <parent-commit>:...` will produce false negatives.

**Recommended action:** use the parent branch or commit-qualified file reads during review.

### F-3 No new blocking product defect confirmed from current parent commit

Based on the evidence reviewed here, the two machine-truth review findings currently recorded for the parent task are not reproducible against the submitted implementation commit.

**Severity:** info pending Codex parent review

**Impact:** likely next step is reviewer reconciliation, not implementation rewrite.

---

## 5. Recommended Reviewer Workflow

1. Review parent branch `claude2/bank-ui-home-20260610` or commit `0b548a6f`.
2. Ignore the sidecar worktree placeholder `apps/bank-console-web/app/page.tsx` for product review purposes.
3. Reconcile the parent task `next` field with actual current evidence.
4. If Codex confirms no blocking issues remain, parent owner Claude2 should refresh machine truth and continue toward review closure.

---

## 6. Sidecar Closeout

Prepared by Codex on 2026-06-11 for sidecar review handoff to Claude2.

- No canonical truth changed.
- No parent implementation files changed.
- Output limited to the requested support artifact.

**Recommendation:** approve this sidecar as an evidence packet and use it to realign the parent task review against the correct parent branch revision.
