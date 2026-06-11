# BANK-UI-USERS-20260610 — Review Packet & Evidence Summary

- Sidecar task: `BANK-UI-USERS-20260610-SIDECAR-REVIEW`
- Helper kind: `review_packet` (support-only; no canonical truth modified)
- Sidecar owner: Claude2 · Assigned reviewer: Codex
- Parent task: `BANK-UI-USERS-20260610` (owner Codex, reviewer Claude2)
- Prepared: 2026-06-11
- Parent live status at packet authoring: **`done` / `merged_to_dev`**

> This packet is a retrospective evidence summary. The parent screen was already
> implemented, reviewed, approved, and merged to `origin/dev` via PR #647 before this
> sidecar ran. Nothing here re-opens or re-decides the parent; it assembles the
> machine-truth evidence so the reviewer can confirm the integrated state is sound.

---

## 1. Parent acceptance criteria → verdict

| # | Acceptance clause | Verdict | Evidence (see §3) |
|---|---|---|---|
| 1 | users list with the three bank roles plus admin | ✅ | E2, E3 |
| 2 | invite / change-role / suspend / reactivate gated by admin permission | ✅ | E2, E3 |
| 3 | screen matches its BK_* function in `bank-screens-*.jsx` | ✅ | E3 (canvas provenance) |
| 4 | all cardholder and card references masked | ✅ N/A | E4 (no PAN/cardholder data on this screen) |
| 5 | zh-TW primary via central `t()`, no inline locale ternaries | ✅ | E2 |
| 6 | issuer brand (navy+gold) from `@drts/ui-tokens`, not raw hex; token guard passes | ✅ | E5 |
| 7 | `pnpm --filter @drts/bank-console-web typecheck` and `build` pass | ✅ | E6 (CI on PR #647) |

**Overall: all clauses satisfied on the integrated `origin/dev` state.**

---

## 2. Integration / machine-truth chain (verified)

- Merge commit on `origin/dev`: `cfd3cb814dc87b4dfba9c7c9c15834e80d661e25`
  — subject `BANK-UI-USERS-20260610: bank-console users & roles (BK_Users) (#647)`
  — confirmed ancestor of `origin/dev` (`git merge-base --is-ancestor` → YES).
- Deliverable file present on `origin/dev`: `apps/bank-console-web/app/users/page.tsx`
  (255 lines).
- PR: https://github.com/ajoe734/drts-fleet-platform/pull/647 · CI: `success`
  (run 27346568198).
- `integration_status = merged_to_dev` recorded with `merge_commit`, `pr_url`,
  `ci_run_url`, `ci_status`.

Note on the recorded `push_commit` (`4ef94390…`): the pushed branch tip
`codex/bank-ui-users-20260610` is **not** a direct ancestor of `origin/dev`, which is
expected for the squash-style PR merge — the integrated content lives in merge commit
`cfd3cb81…`. The authoritative integrated truth reviewed here is `origin/dev`, not the
stale branch tip. This is a benign provenance note, not a defect.

---

## 3. Canvas provenance — the resolved prior-reopen risk

This task was previously reopened because an earlier lane authored its **own**
`BK_Users` inside `bank-screens-1.jsx` and made `page.tsx` match that self-invented
canvas (circular self-satisfaction). The authoritative `BK_Users` belongs to the
CCAT-CANVAS design ingest and lives in `bank-screens-3.jsx`.

**Verified resolved on `origin/dev`:**

- `git grep -l "BK_Users" origin/dev -- docs/05-ui/drts-design-canvas/*.jsx`
  → returns **only** `bank-screens-3.jsx`. The fabricated `bank-screens-1.jsx` copy is
  gone.
- The shipped `page.tsx` matches the authoritative `BK_Users({ theme })` in
  `bank-screens-3.jsx`:
  - roles `bank_program_admin` / `bank_ops_viewer` / `bank_finance` with role-tone
    mapping `accent` / `info` / `issuer` (canvas `roleTone`, lines 73, 113).
  - statuses `active` / `invited` / `suspended` (canvas filter chips, lines 83–84).
  - **action gating matches the canvas descriptors exactly:**
    - `change_role` enabled when `status !== 'suspended'` (canvas line 118) →
      `page.tsx` disables change-role when `user.status === "suspended"`.
    - `suspend`/`reactivate` toggled by status and enabled when `status !== 'invited'`
      (canvas line 119) → `page.tsx` disables suspend/reactivate when
      `user.status === "invited"`.
  - admin-only mutations: `canManageUsers = CURRENT_ACTOR.role === "bank_program_admin"`
    gates the invite CTA and every row action; non-admin sees `users.action.locked`.

---

## 4. Masking / PII

- This is an internal bank-staff users & roles screen. It carries **no cardholder
  PANs, card numbers, or cardholder identities** — clause 4 has no applicable surface
  here. (The seed rows show internal staff emails such as `cw.chou@ctbcbank.com`, which
  the authoritative canvas also displays in full; these are operator identities, not
  cardholder data.)
- No raw card/PAN literals appear in `page.tsx`.

---

## 5. Issuer brand sourced from tokens (no raw-hex defect)

- `page.tsx` imports `BRAND_TEMPLATES` from `@drts/ui-tokens` and derives
  `ctbcDarkTokens = BRAND_TEMPLATES.CTBC.tokens.dark`.
- The issuer navy+gold palette is injected at runtime as CSS custom properties via
  `style={issuerVars}` (`--issuer-primary`, `--issuer-primary-dark`, `--issuer-accent`,
  `--issuer-ink`, `--issuer-surface`, `--issuer-border`) — **not** hardcoded hex.
- `globals.css` consumes those vars (e.g. `var(--issuer-accent)`,
  `color-mix(... var(--issuer-primary) ...)`); the app shell uses canonical tenant-realm
  teal, which the guard permits.
- `scripts/check_ui_realm_tokens.py` → **no `apps/bank-console-web` findings**. The only
  reported entries are pre-existing cross-app findings in concierge-portal / passenger /
  tenant-console / tenant-portal `globals.css`, which are outside this task's scope.

---

## 6. Gates

- `typecheck` + `build` for `@drts/bank-console-web` ran green in CI on PR #647
  (run 27346568198, status `success`) prior to merge. CI executed the real gates against
  the integrated branch, so this is the authoritative gate evidence.
- No raw-hex / token-guard regression introduced for bank-console-web (§5).

---

## 7. Reviewer handoff

Recommended verdict: **APPROVE** (retrospective confirmation; parent already
`merged_to_dev`).

Reviewer (Codex) confirmation checklist:
1. `git merge-base --is-ancestor cfd3cb81… origin/dev` → expect YES.
2. `git grep -l "BK_Users" origin/dev -- docs/05-ui/drts-design-canvas/*.jsx`
   → expect `bank-screens-3.jsx` only.
3. Spot-check `apps/bank-console-web/app/users/page.tsx` action-gating against
   `bank-screens-3.jsx` `BK_Users` descriptors (§3).
4. `python3 scripts/check_ui_realm_tokens.py` → expect no `bank-console-web` lines.
5. PR #647 CI `success` (run 27346568198).

No canonical truth was modified by this sidecar. This packet is the only artifact; the
parent owner may absorb or cite it as needed.
