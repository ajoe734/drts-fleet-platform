# BANK-UI-AUDIT-20260610 Acceptance Packet & Dependency Map

This packet is a support-only sidecar for `BANK-UI-AUDIT-20260610`. It does not edit canonical truth, runtime behavior, or the parent task record. Its job is to give the assigned sidecar reviewer (`Codex2`) a stable acceptance checklist, dependency map, and evidence index before the parent owner finishes closeout.

Anchors used here come from:

- `scripts/ai-status.sh show BANK-UI-AUDIT-20260610-SIDECAR-ACCEPTANCE`
- `scripts/ai-status.sh show BANK-UI-AUDIT-20260610`
- `scripts/dispatch-bank-console-screens-20260610.sh`
- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
- `packages/ui-tokens/src/realms.ts`
- `apps/bank-console-web/**`
- `git show cd2115b5`
- `git show 10fb7403`

## 1. Scope & Boundary

- **Sidecar Task:** `BANK-UI-AUDIT-20260610-SIDECAR-ACCEPTANCE`
- **Parent Task:** `BANK-UI-AUDIT-20260610`
- **Helper Kind:** `acceptance_packet`
- **Sidecar Owner:** `Codex`
- **Sidecar Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/BANK-UI-AUDIT-20260610/BANK-UI-AUDIT-20260610-SIDECAR-ACCEPTANCE.md`

Guardrails:

- Only support artifacts are in scope.
- Do not rewrite `ai-status.json` by hand; use `scripts/ai-status.sh`.
- Do not repair or substitute missing canvas files in this sidecar.
- Do not reinterpret the UI design contract beyond the cited token and handoff sources.

## 2. Machine-Truth Anchors

### Sidecar task - `BANK-UI-AUDIT-20260610-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Status | `in_progress` |
| Owner | `Codex` |
| Reviewer | `Codex2` |
| Depends on | `CCAT-APP-SCAFFOLD-20260610` |
| Task class | `sidecar` |
| Helper parent | `BANK-UI-AUDIT-20260610` |
| Helper kind | `acceptance_packet` |
| Mutates canonical | `false` |
| Last update at start | `2026-06-11T11:28:41Z` |

### Parent task - `BANK-UI-AUDIT-20260610`

| Field | Value |
| --- | --- |
| Title | `BANK-UI-AUDIT: bank-console audit (BK_Audit)` |
| Status | `review` |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Depends on | `CCAT-APP-SCAFFOLD-20260610` |
| Branch closeout target | `INTEGRATION_STATUS=branch_pushed` |
| Remote branch in `next` note | `origin/codex/bank-ui-audit-20260610` |
| Review evidence hash | `cd2115b535dfc81e2304b42cab88c1b859900056` |
| Owner closeout metadata hash | `10fb7403a0628dcbea6f2ab4aaba5aff29c8af26` |

The parent task's `next` field is important:

- the implementation was already approved once
- a later owner progress update regressed machine truth away from `review_approved`
- reviewer re-approval is needed before owner can mark the parent task `done`

## 3. Dependency Map

### Direct dependency - `CCAT-APP-SCAFFOLD-20260610`

This task is the only formal prerequisite recorded for both the parent and this sidecar. In this worktree, its concrete evidence is:

- `scripts/dispatch-bank-console-screens-20260610.sh` hard-gates every bank screen task on `SCAFFOLD="CCAT-APP-SCAFFOLD-20260610"`
- git history records scaffold landing at commit `91423a69`
- commit subject: `CCAT-APP-SCAFFOLD-20260610: scaffold apps/bank-console-web shell + Dockerfile + deploy workflow (#633)`
- the current tree contains the scaffolded app surface under `apps/bank-console-web/`

Scaffold outputs visible in the current tree:

- app shell: `apps/bank-console-web/app/layout.tsx`
- shared chrome/components: `apps/bank-console-web/components/bank-shell.tsx`, `components/pending-screen.tsx`
- seeded route slots: `/`, `/bookings`, `/contracts`, `/statements`, `/programs`, `/users`, `/audit`
- packaging/deploy primitives: `apps/bank-console-web/Dockerfile`, `package.json`, `next.config.ts`

### Design and token authority tied to the dependency

The dispatch script and screen-requirements packet jointly define what the parent task had to inherit:

- visual authority is supposed to be `docs/05-ui/drts-design-canvas/bank-screens-{1,2,3}.jsx` plus `Bank Console.html`
- behavior authority is `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §5
- chrome must respect `@drts/ui-tokens` realm tokens

Relevant token anchor:

- `packages/ui-tokens/src/realms.ts` defines `tenant` realm colors as teal:
  - light fg `#0F766E`
  - dark fg `#5EEAD4`

Behavior anchor for `BK_Audit` from the handoff packet:

- route: `/audit`
- purpose: eligibility / dispatch / settlement / access audit trail
- must show event time, actor, masked subject, reason code, and links to booking or statement
- filters: type, actor, period, subject
- read-only only
- all cardholder and card references stay masked

## 4. Current Worktree Baseline Versus Parent Review Evidence

This sidecar branch is based on `origin/dev` at `51456a05`. It does not contain the parent implementation branch content.

### Current worktree baseline

- `apps/bank-console-web/app/audit/page.tsx` is still the scaffold placeholder:
  - imports `PendingScreen`
  - renders `t("audit.title")` and `t("audit.purpose")`
- no `bank-screens-1.jsx`, `bank-screens-2.jsx`, `bank-screens-3.jsx`, or `Bank Console.html` files are present under `docs/05-ui/drts-design-canvas/` in this worktree

This means the reviewer must not use this sidecar branch as proof that the parent implementation is absent or unapproved. The parent review evidence lives on a different pushed branch.

### Parent review evidence recorded in git and machine truth

- `cd2115b5` implements the bank audit screen and touches:
  - `apps/bank-console-web/app/audit/page.tsx`
  - `apps/bank-console-web/app/globals.css`
  - `apps/bank-console-web/lib/translations.ts`
- `10fb7403` is an owner closeout metadata commit with verification trailer:
  - `pnpm --filter @drts/bank-console-web build`
  - `pnpm --filter @drts/bank-console-web typecheck`
  - `python3 scripts/check_ui_realm_tokens.py` with note that `bank-console-web` had no findings, while other apps still had pre-existing findings outside scope
- both commits are contained in `origin/codex/bank-ui-audit-20260610`
- the parent task `review_notes_zh` says the approved implementation is anchored at `cd2115b5`

## 5. Acceptance Checklist For The Parent Task

These are the reviewer-facing gates for `BANK-UI-AUDIT-20260610`, normalized from machine truth, the dispatch script, and the screen-requirements handoff.

### A. Behavior and content gates

- [ ] `/audit` shows event type, actor, masked subject, reason code, and a link to the related booking or statement
- [ ] filters exist for type, actor, period, and subject
- [ ] the screen is read-only; no audit-surface mutation is introduced
- [ ] all cardholder and card references are masked everywhere on the page
- [ ] masked-reference self-audit logic avoids `[0]` indexing and uses `find` / `some` style checks as the task summary requires

### B. UI contract gates

- [ ] zh-TW is primary and routed through central `t()` translation helpers; no inline locale ternaries
- [ ] issuer navy/gold branding is sourced from a `@drts/ui-tokens` token set, not raw app-local hex
- [ ] tenant-plane chrome still honors the realm-token contract from `packages/ui-tokens/src/realms.ts`
- [ ] reviewer confirms the parent implementation matched the intended `BK_Audit` function from the bank-screen canvas set, rather than inventing a new layout

### C. Verification gates

- [ ] `pnpm --filter @drts/bank-console-web typecheck`
- [ ] `pnpm --filter @drts/bank-console-web build`
- [ ] `python3 scripts/check_ui_realm_tokens.py` shows no `bank-console-web` findings
- [ ] reviewer re-approval is recorded so the parent owner can safely transition from `review` to `done`

## 6. Evidence Gaps And Review Risks

These are not reasons to widen scope in this sidecar. They are facts the reviewer should keep visible.

### A. Canvas artifacts referenced by machine truth are missing in this worktree

The parent task artifact list and dispatch script both cite:

- `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`

Those files are not present in this sidecar worktree. This packet does not attempt to recreate them. Reviewer action is to verify parent visual parity against the actual approved branch evidence or any canonical location used during the parent review, not against placeholder absence here.

### B. Sidecar worktree and parent review branch diverge by design

- this branch tracks `origin/dev`
- the approved parent implementation lives on `origin/codex/bank-ui-audit-20260610`

Therefore:

- this packet is a review aid, not execution evidence
- current placeholder code in this worktree is expected and should not reopen the parent task by itself

### C. Reviewer/owner metadata drift already happened once

The parent task `next` field explicitly says a closeout attempt regressed machine truth from `review_approved` back to a non-final state. Reviewer should confirm any new approval is followed by owner closeout with:

- pushed branch reference
- commit hash / subject
- `INTEGRATION_STATUS=branch_pushed`

## 7. Packet Completeness Check

- [x] The packet stays inside `support/sidecars/BANK-UI-AUDIT-20260610/`
- [x] The packet records the sidecar task's machine-truth envelope
- [x] The packet records the parent task's current `review` state and re-approval requirement
- [x] The direct dependency `CCAT-APP-SCAFFOLD-20260610` is anchored to repo evidence and commit `91423a69`
- [x] The packet distinguishes current worktree placeholder state from approved parent-branch evidence
- [x] The packet names the missing bank-screen canvas files as an evidence gap instead of silently inventing replacements

## 8. Reviewer Handoff Notes For `Codex2`

1. Reconfirm the sidecar task is still support-only and still owned by `Codex` with reviewer `Codex2`.
2. Reconfirm the parent task still shows `status=review` and the `next` field still requests re-approval before owner closeout.
3. Use `origin/codex/bank-ui-audit-20260610` plus commits `cd2115b5` and `10fb7403` as the parent evidence spine; do not treat this sidecar worktree's placeholder `/audit` page as parent implementation truth.
4. Keep the dependency story narrow: the only formal prerequisite is the scaffold task, evidenced by commit `91423a69` and the current `apps/bank-console-web` shell.
5. Approval of this sidecar should verify that the only task-scoped file addition is this packet plus the status transitions recorded through `scripts/ai-status.sh`.
