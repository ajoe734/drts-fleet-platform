# I18N-ADM-08-REINTEG-20260608 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `I18N-ADM-08-REINTEG-20260608` - Reintegrate ADM-08 admin-shell/assistant i18n into dev
**Parent Owner:** `Codex`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-06-11` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime
behavior, or the parent implementation. Live sidecar lifecycle fields (`status`, `next`,
`last_update`) remain authoritative only in `ai-status.json`.

This packet is the reviewer-facing acceptance companion for the completed platform-admin i18n
reintegration slice. It preserves the stable machine-truth anchors, dependency map, acceptance
checklist, and parent closeout evidence. It is built **after** the parent already reached `done` /
`merged_to_dev`, so its role is to memorialize the accepted outcome, not to re-open or re-decide it.

---

## 1. Scope Boundary

In scope:

- pin the machine-truth anchors for parent `I18N-ADM-08-REINTEG-20260608` and this sidecar
- map the (empty) dependency chain and the upstream branch/source lineage the reintegration drew from
- summarize the centralization delta that landed on `dev` (inline copy → centralized `t(key, locale)`)
- record the parent's recorded closeout + integration evidence (commit, push, PR, merge commit)
- give the assigned reviewer a focused acceptance checklist mapped to parent acceptance criteria

Out of scope:

- editing L1/L2 product truth, the parent task record, or `ai-status.json` task truth
- changing the parent implementation, its reviewer conclusion, or the merged `dev` state
- re-running or re-deciding the integration gate; this packet only cites the recorded evidence
- adding or mutating any dependency edges in machine truth

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> I18N-ADM-08-REINTEG-20260608-SIDECAR-ACCEPTANCE`

- owner=`Claude`
- reviewer=`Codex`
- depends_on=`(none)`
- task_class=`sidecar`
- helper_parent=`I18N-ADM-08-REINTEG-20260608`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_created_by=`supervisor-underutilization`
- artifacts=`support/sidecars/I18N-ADM-08-REINTEG-20260608/I18N-ADM-08-REINTEG-20260608-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> I18N-ADM-08-REINTEG-20260608`

- owner=`Codex`
- reviewer=`Codex2`
- status=`done`
- phase=`I18N reintegration`
- depends_on=`(none)`
- acceptance=`ci-integ green on the branch (build+typecheck+i18n-guard); PR merged to origin/dev;
  deployed/verified on dev ops-console; close with INTEGRATION_STATUS=merged_to_dev (gate enforces)`
- source artifact (upstream lineage)=`codex2/i18n-adm-08@cd1840ca`
- recorded closeout evidence:
  - commit_hash=`44c3c1ea54c19765a39c17d85bc22bacd351a517`
  - commit_subject=`I18N-ADM-08-REINTEG-20260608: finalize owner closeout`
  - commit_agent=`Codex`
  - commit_reviewer=`Codex2`
  - push_remote=`origin`
  - push_branch=`codex/i18n-adm-08-reinteg-20260608-r2`
  - push_ref=`origin/codex/i18n-adm-08-reinteg-20260608-r2`
- recorded integration evidence:
  - integration_status=`merged_to_dev`
  - merged_ref=`origin/dev`
  - merge_commit=`f1b065a93c96885bae52a87b4c153bbdbf449f39` (PR #584)

### Authoritative supporting anchors

- `git -> origin/dev -> f1b065a9` (PR #584 merge of the reintegration)
- `git -> f1b065a9^2 = 6bb68ca0` (pre-merge dev tip the delta was diffed against)
- upstream stranded branch `codex2/i18n-adm-08 @ cd1840ca` (original centralization work)

---

## 3. Dependency Map

Parent `depends_on` is **empty** in machine truth — this was a reintegration of already-authored,
stranded i18n work rather than a net-new feature with prerequisites. The relevant lineage is a
**source/integration chain**, not a task-dependency chain:

| Lineage anchor                          | Kind                | Why it matters to `I18N-ADM-08-REINTEG-20260608`                                                                                  |
| --------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `codex2/i18n-adm-08 @ cd1840ca`         | source branch       | Original platform-admin shell + assistant centralization delta that had stranded off `dev`; this task re-landed its intent.       |
| dev `#529`-aligned inline copy          | conflicting base    | `dev` had since adopted the inline `h:"STATUS",k:"status"` / `copy(locale,...)` form; whole-branch merge would clobber alignment. |
| OPS i18n reintegration (`#580`, 06-08)  | sibling reintegration | Sibling stranded-delta reintegration in the same 06-08 i18n cleanup wave; establishes the cherry-pick-and-resolve-per-hunk pattern. |
| Integration gate (enforce, `#578/#579`) | merge gate          | Active enforce gate that blocks branch-only `done`; required this task to genuinely merge to `dev`, not stop at branch push.       |

Assertions:

- No dependency reopen is implied. The parent closed with reviewer approval and recorded
  commit/push/merge evidence.
- This packet adds **no** dependency edges to machine truth; the table above is documentation of
  observed lineage only.

---

## 4. Centralization Delta Summary

The reintegration replaced inline/per-call-site copy in `apps/platform-admin-web` with a single
centralized dictionary + lookup helper, while **preserving non-copy structural fields** (e.g.
column keys `k:`) as required by the parent brief.

Files changed (`6bb68ca0 → f1b065a9`, 5 files, +596 / -399):

| File                                                                  | Net   | Role in the delta                                                                              |
| --------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `apps/platform-admin-web/lib/translations.ts`                         | +348  | **New** central dictionary: `en` + `zh` maps + `t(key, locale, params?)` lookup with `{param}` interpolation. |
| `apps/platform-admin-web/app/page.tsx`                                | ~     | Home/dashboard copy moved from inline literals to `t("home.page.*")` lookups.                   |
| `apps/platform-admin-web/components/admin-shell.tsx`                  | ~     | Shell chrome / nav labels moved to `t("nav.*", ...)` / `t("app.*", ...)`.                       |
| `apps/platform-admin-web/components/assistant/platform-assistant-overlay.tsx` | ~     | Assistant overlay copy centralized.                                                            |
| `apps/platform-admin-web/components/assistant/route-context.ts`      | ~     | Imports `t as translate` from `lib/translations`; route-context labels centralized (no DOM scraping). |

Central helper shape (anchor: `lib/translations.ts`):

- `export type Locale = "en" | "zh"`
- `const en = { ... }` / `const zh: typeof en = { ... }` — both keyed identically (≈1282 keys each;
  `zh` is typed `typeof en` so a missing/extra key fails typecheck).
- `export const translations: Record<Locale, typeof en> = { en, zh }`
- `export function t(key, locale, params?)` — falls back `locale → en → key`, and substitutes
  `{param}` tokens from `params`.

---

## 5. Acceptance Checklist

Legend: `[REQUIRED]` = direct parent acceptance / reviewer evidence. `[DERIVED]` = reviewer support
gate for this sidecar packet.

### A. Centralization landed `[REQUIRED]`

- [x] A single central dictionary module `apps/platform-admin-web/lib/translations.ts` exists with
      `en` + `zh` maps and a `t(key, locale, params?)` helper.
- [x] `zh` is typed `typeof en`, so locale key parity is enforced by typecheck rather than by hand.
- [x] Inline copy call sites in `page.tsx`, `admin-shell.tsx`, `platform-assistant-overlay.tsx`, and
      `route-context.ts` consume `t(...)` instead of literal strings / `copy(locale,...)`.
- [x] Non-copy structural fields (column keys `k:`, etc.) were preserved, not rewritten into copy.

### B. Integration gate satisfied `[REQUIRED]`

- [x] Work genuinely merged to `dev` (not branch-only `done`), as required by the enforce gate.
- [x] `INTEGRATION_STATUS=merged_to_dev` recorded with `merged_ref=origin/dev`.
- [x] Merge landed as PR #584, merge commit `f1b065a9`.

### C. Recorded verification evidence `[REQUIRED]`

- [x] Parent closeout recorded commit `44c3c1ea` on `origin/codex/i18n-adm-08-reinteg-20260608-r2`.
- [x] Reviewer of record = `Codex2`; owner of record = `Codex`.
- [x] Closeout note records CI lineage: relied on approved PR #582 green CI, then re-cherry-picked
      approved task commits onto a clean branch to avoid a trailer-gate failure before the #584 merge.

### D. Sidecar handoff readiness `[DERIVED]`

- [x] This packet reflects the parent's current `done` / `merged_to_dev` state, not a stale
      pre-closeout snapshot.
- [x] This packet defers live sidecar lifecycle fields to `ai-status.json`.
- [x] This packet is support-only and edits no L1 product truth, runtime code, or the parent record.
- [x] The artifact lives only under `support/sidecars/I18N-ADM-08-REINTEG-20260608/`.

---

## 6. Evidence Snapshot

Implementation evidence anchors (in `origin/dev` at/after `f1b065a9`):

- `apps/platform-admin-web/lib/translations.ts`
- `apps/platform-admin-web/app/page.tsx`
- `apps/platform-admin-web/components/admin-shell.tsx`
- `apps/platform-admin-web/components/assistant/platform-assistant-overlay.tsx`
- `apps/platform-admin-web/components/assistant/route-context.ts`

Machine-truth closeout / integration evidence anchors:

- `ai-status.json -> I18N-ADM-08-REINTEG-20260608 -> status=done`
- `ai-status.json -> I18N-ADM-08-REINTEG-20260608 -> commit_hash=44c3c1ea54c19765a39c17d85bc22bacd351a517`
- `ai-status.json -> I18N-ADM-08-REINTEG-20260608 -> push_ref=origin/codex/i18n-adm-08-reinteg-20260608-r2`
- `ai-status.json -> I18N-ADM-08-REINTEG-20260608 -> integration_status=merged_to_dev`
- `ai-status.json -> I18N-ADM-08-REINTEG-20260608 -> merge_commit=f1b065a93c96885bae52a87b4c153bbdbf449f39`
- `git -> origin/dev -> f1b065a9` (PR #584)

---

## 7. Reviewer Focus

For `Codex` reviewing this sidecar:

- confirm the sidecar anchor section keeps only stable assignment/scope fields and defers live
  workflow state to `ai-status.json`
- confirm the parent section reflects `I18N-ADM-08-REINTEG-20260608` as `done` / `merged_to_dev`
  with the recorded commit / push / merge evidence
- confirm the dependency map correctly frames the parent's empty `depends_on` and documents the
  source/integration lineage without inventing machine-truth edges
- confirm the centralization delta summary and acceptance checklist match the merged `dev` outcome
- confirm the packet stays support-only and rewrites no canonical truth

---

## 8. Handoff Summary

This packet is a narrow acceptance reference for a parent task that is already closed and merged to
`dev` in machine truth. Its purpose is limited to preserving the dependency/lineage map, finalized
acceptance checklist, and closeout + integration evidence in a reviewer-friendly form, while leaving
transient sidecar lifecycle truth to `ai-status.json`. No canonical truth, runtime behavior, or
parent record is modified by this artifact.
