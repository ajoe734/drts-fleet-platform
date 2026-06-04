# I18N-WP0 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `I18N-WP0` - i18n foundation: guard lint + ops default zh + dict gap fill + key-block skeletons
**Parent Owner:** `Claude`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Claude`
**Generated:** `2026-06-04` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent implementation branch.

This packet exists only to support reviewer handoff for `I18N-WP0-SIDECAR-REVIEW`. The parent implementation task `I18N-WP0` is already `review_approved` in machine truth. This sidecar records the stable anchors, the approved evidence surface, and the exact checks the sidecar reviewer should repeat before approving this support slice.

---

## 1. Scope Boundary

In scope:

- restate the sidecar task's machine-truth contract and parent linkage
- summarize the parent task's approved evidence surface from machine truth and the approved owner handoff note
- point the reviewer at the exact parent commit and artifact set that were already accepted for implementation review
- confirm that this sidecar creates support material only

Out of scope:

- editing `phase1_*`, contracts, app runtime code, CI wiring, or any other canonical truth
- re-implementing or amending parent task `I18N-WP0`
- treating this isolated sidecar worktree as the authoritative source for the parent branch contents

---

## 2. Machine-Truth Anchors

### Sidecar task - `I18N-WP0-SIDECAR-REVIEW`

Stable fields from `ai-status.json`:

- owner=`Codex`
- reviewer=`Claude`
- status=`in_progress` at packet creation time
- task_class=`sidecar`
- helper_parent=`I18N-WP0`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/I18N-WP0/I18N-WP0-SIDECAR-REVIEW.md`
- acceptance:
  - create support artifacts only
  - do not edit canonical truth
  - hand off the packet to the assigned reviewer

### Parent task - `I18N-WP0`

Current machine-truth state:

- owner=`Claude`
- reviewer=`Codex2`
- status=`review_approved`
- phase=`i18n-bilingual-remediation-202606`
- artifacts:
  - `scripts/i18n-guard.mjs`
  - `apps/ops-console-web/lib/i18n.tsx`
  - `apps/ops-console-web/lib/translations.ts`
  - `apps/platform-admin-web/lib/translations.ts`

Approved review note recorded in `next`:

- approved owner handoff commit: `31b6550fa68439dafff6ee7afee57e503499ec0a`
- subject: `I18N-WP0: signature-based i18n-guard baseline (catch same-count swaps)`
- accepted verification claims:
  - `node scripts/i18n-guard.mjs` passes on a clean tree
  - same-count violation swap in `apps/platform-admin-web/components/admin-shell.tsx` now fails instead of slipping through
  - `--staged` mode also fails on the swapped violation
  - `pnpm --filter @drts/platform-admin-web typecheck` passes
  - `pnpm --filter @drts/platform-admin-web build` passes
  - `pnpm --filter @drts/ops-console-web build` passes
  - `pnpm --filter @drts/ops-console-web typecheck` passes

Reviewer implication:

- the parent implementation review is already complete
- this sidecar should not restage the parent as `review`
- this packet exists only to preserve reviewer-facing evidence and handoff context outside the volatile `next` field

---

## 3. Evidence Summary

### A. Guard-ratchet correction accepted on parent branch

The approved parent commit `31b6550fa68439dafff6ee7afee57e503499ec0a` changes:

- `scripts/i18n-guard.mjs`
- `scripts/i18n-guard-baseline.json`

Commit summary evidence:

- replaces the old per-file error-count baseline with a per-file multiset of violation signatures
- closes the review gap where "fix one violation, add a different violation" could preserve the same count and incorrectly pass
- preserves ratchet behavior for known debt while failing genuinely new signatures

This is the highest-signal implementation evidence because it is the delta that moved the parent from review findings to `review_approved`.

### B. Ops default locale alignment is part of the approved parent scope

The parent task acceptance explicitly includes changing ops i18n defaults from `en` to `zh`.

The approved parent branch version of `apps/ops-console-web/lib/i18n.tsx` sets:

- `createContext(... locale: "zh" ...)`
- `LanguageProvider({ defaultLocale = "zh" })`

The parent code comment also documents why: client defaults must align with `getServerLocale()` to avoid an `en -> zh` hydration flash.

### C. Translation gap fill and key-block skeletons remain part of parent acceptance

Machine truth records both translation files as parent artifacts:

- `apps/ops-console-web/lib/translations.ts`
- `apps/platform-admin-web/lib/translations.ts`

The task summary states the accepted parent scope included:

- filling listed `zh == en` gaps such as `Accept pending`, `Manual fallback`, `Sync failed`, `Channel mix`, `Settlement matrix`, `Mismatch review`, `Insight`, `Forwarded reconciliation`, and `Legal Hold`
- pre-seeding per-domain key-block headers to reduce later WP merge conflicts
- keeping `formatOpsCodeLabel` / `formatPlatformCodeLabel` explicitly caveated as dictionary-follow-up work

This sidecar does not duplicate a full dictionary diff; it relies on the parent task's `review_approved` state and recorded artifact list.

---

## 4. Reviewer Handoff

Recommended review path for `Claude`:

1. Confirm `I18N-WP0-SIDECAR-REVIEW` still points only to this support artifact and does not expand into canonical files.
2. Reconfirm parent `I18N-WP0` remains `review_approved` in machine truth.
3. Inspect parent commit `31b6550fa68439dafff6ee7afee57e503499ec0a` for the approved guard-baseline fix and its file list.
4. Verify this packet does not claim ownership of parent closeout, push, PR, CI, or deployment state.
5. Approve the sidecar if the packet accurately preserves the parent evidence surface and handoff context.

Important boundary:

- this isolated sidecar worktree may not contain the parent branch's implementation files at the approved revision
- for implementation evidence, inspect the recorded parent commit directly rather than assuming the current filesystem view equals the approved parent branch

---

## 5. Sidecar Verification

Checks performed for this support slice:

- confirmed the task branch is `codex/i18n-wp0-sidecar-review`
- confirmed sidecar task machine truth was moved from `backlog` to `in_progress`
- confirmed parent task `I18N-WP0` is already `review_approved`
- confirmed this slice adds only `support/sidecars/I18N-WP0/I18N-WP0-SIDECAR-REVIEW.md`
- confirmed the packet cites machine truth and approved parent commit evidence instead of editing canonical truth

Pending lifecycle action after writing this packet:

- hand off `I18N-WP0-SIDECAR-REVIEW` to reviewer `Claude` via `scripts/ai-status.sh handoff ...`
