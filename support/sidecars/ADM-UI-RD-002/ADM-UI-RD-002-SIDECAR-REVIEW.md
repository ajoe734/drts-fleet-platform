# ADM-UI-RD-002 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `ADM-UI-RD-002` — Strip ad-hoc CSS, adopt ui-web primitives
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical
truth, runtime behavior, L1/L2 product truth, the parent task acceptance, or the
parent-side review outcome.

This packet exists only to support sidecar reviewer handoff for `ADM-UI-RD-002`.
The parent task already reached `done` on its own track; this sidecar does
not re-litigate that closure. It pins the stable machine-truth anchors,
upstream dependency baseline, evidence anchors, and the exact checks the
sidecar reviewer should repeat before approving this support slice.

Transient parent lifecycle truth (`status`, `next`, `last_update`) stays
authoritative only in `ai-status.json`. This packet does not snapshot those
fields, by design.

---

## 1. Scope Boundary

In scope:

- summarize the stable machine-truth fields of parent `ADM-UI-RD-002` and this
  sidecar task
- record the dependency baseline that gated `ADM-UI-RD-002`
- name the parent's reviewed artifacts and the verification commands the
  parent owner recorded in the shipped commit body
- provide reviewer-facing handoff notes for a docs-only sidecar slice

Out of scope:

- editing parent runtime code under `apps/platform-admin-web/**`,
  `packages/ui-web/**`, or any other `apps/**` / `packages/**` target
- editing `docs/05-ui/drts-design-canvas/Platform Admin.html` (design source
  of truth) or `packages/ui-web/src/platform-shell.stories.tsx`
  (parity story)
- editing the planning ref
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- editing `phase1_*`, the execution packet, the product spec, contracts, or
  any other L1 / L2 canonical truth
- substituting this packet for the parent's own review verdict, approval
  note, commit, or push evidence
- mutating `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  for the parent task in any way
- approving, reopening, or re-finalizing parent `ADM-UI-RD-002` — its
  reviewer of record is `Codex`, not this sidecar's reviewer

---

## 2. Machine-Truth Anchors

### Sidecar task — `ADM-UI-RD-002-SIDECAR-REVIEW`

Stable fields in `ai-status.json`:

- owner=`Claude`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-002`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on=`ADM-UI-RD-001`
- artifact=`support/sidecars/ADM-UI-RD-002/ADM-UI-RD-002-SIDECAR-REVIEW.md`

Live sidecar lifecycle state:

- do not treat this packet as the source of truth for `status`,
  `last_update`, or the latest handoff / approve / reopen event
- read those transient fields directly from `ai-status.json` at review time
- this packet intentionally avoids hard-coding volatile lifecycle values, so
  the sidecar can move through normal handoff / review / reopen transitions
  without forcing a packet rewrite

### Parent task — `ADM-UI-RD-002`

Stable fields in `ai-status.json`:

- title=`Strip ad-hoc CSS, adopt ui-web primitives`
- summary_zh=`刪除 platform-admin-web/app/globals.css 內 .admin-* 規則。`
- phase=`Wave 3`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`ADM-UI-RD-001`
- artifacts=`apps/platform-admin-web/`
- acceptance:
  - `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - `Storybook 對照對應 PA_* artboard`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- commit_hash=`edcf7e048c5515631597e2beba7d9579a33fa849`
- commit_subject=`feat(ADM-UI-RD-002): strip admin css hooks from platform admin`
- commit_agent=`Codex2`
- commit_reviewer=`Codex`
- push_remote=`origin`
- push_branch=`feat/claude2-ui-redesign-foundation`
- push_ref=`origin/feat/claude2-ui-redesign-foundation`
- push_commit=`edcf7e048c5515631597e2beba7d9579a33fa849`

Live parent lifecycle state (volatile — read from `ai-status.json` at review
time; not pinned here):

- `status`
- `next`
- `last_update`
- `commit_recorded_at`
- `push_recorded_at`

Branch reachability assertion at packet generation:

- `git branch -r --contains edcf7e048c5515631597e2beba7d9579a33fa849`
  resolves to `origin/feat/claude2-ui-redesign-foundation` only, matching the
  recorded `push_ref`

---

## 3. Dependency Baseline

`ADM-UI-RD-002` has a single hard machine-truth dependency, with one
transitive layer worth recording for reviewer orientation:

| Dependency      | Status | Recorded commit                            | Role for `ADM-UI-RD-002`                                                                                                                                                                               |
| --------------- | ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADM-UI-RD-001` | `done` | `516321d7f8de3017ec98a9c09bcfc55eb5b75de1` | Platform Admin adopts `PlatformShell` (the Wave 3 shell baseline). `ADM-UI-RD-002` only makes sense after the shell is in place — it strips legacy CSS hooks beneath it.                               |
| `DSY-UI-003`    | `done` | `36a069c`                                  | (Transitive) supplies `DSY-UI-003`'s design-system primitives that `ADM-UI-RD-001` adopts and that `ADM-UI-RD-002` namespaces against; recorded here so the reviewer does not need to chase the chain. |

Why this matters for the sidecar review:

- the sidecar can safely assume the Platform Admin shell baseline
  (`ADM-UI-RD-001`) is already accepted upstream truth — no upstream gap is
  blocking parent finalize
- no upstream dependency needs to be re-reviewed for this sidecar
- the sidecar declares `depends_on=ADM-UI-RD-001` on its own row, matching
  the parent's dependency edge — no extra dependencies are asserted

---

## 4. Reviewed Artifacts

The parent task's actual write scope, taken from the shipped commit
`edcf7e0` (`git show --stat`) and confirmed against the working tree:

- `apps/platform-admin-web/app/globals.css` — `.admin-*` selectors removed
  and renamed under a `.platform-ui-*` namespace (`platform-ui-page-header`,
  `platform-ui-card`, `platform-ui-table`, `platform-ui-badge`,
  `platform-ui-btn`, etc.). `grep -c "admin-" apps/platform-admin-web/app/globals.css`
  reports `0` at packet time.
- `apps/platform-admin-web/components/platform-ui.tsx` — new local primitives
  module (`PageHeader`, `Card`, `Table`, `Badge`, `Button`, etc.) that
  consumes the renamed `.platform-ui-*` classes from `globals.css`
- `apps/platform-admin-web/app/**/page.tsx` and component files — 17 pages /
  components migrated to consume `PlatformUI.*` primitives instead of
  inline `<div className="admin-*">` markup, including:
  - `app/page.tsx`
  - `app/audit/page.tsx`
  - `app/feature-flags/page.tsx`
  - `app/fleet/page.tsx`
  - `app/health/page.tsx`
  - `app/notices/page.tsx`
  - `app/partners/page.tsx` and `app/partners/[entrySlug]/page.tsx`
  - `app/payments/page.tsx` and
    `app/payments/reconciliation/[issueId]/page.tsx`
  - `app/pricing/page.tsx`
  - `app/switchboard/page.tsx`
  - `app/tenants/page.tsx` and `app/tenants/[tenantId]/page.tsx`
  - `app/users/page.tsx`
  - `app/adapter-registry/components/AdapterList.tsx`

Interpretation note for the sidecar reviewer (record-only, not a sidecar
finding to act on):

- the parent `summary_zh` literally says "刪除 platform-admin-web/app/globals.css
  內 .admin-_ 規則" (delete .admin-_ rules), and the commit subject says
  "strip admin css hooks from platform admin"
- the shipped commit removes every `.admin-*` selector from `globals.css`
  and replaces them with `.platform-ui-*` selectors plus a local primitives
  module
- this is a namespacing-and-replacement interpretation rather than a literal
  full deletion; the parent reviewer `Codex` accepted that interpretation
  when ADM-UI-RD-002 reached `done`
- this sidecar packet records the interpretation explicitly so a downstream
  reader does not have to re-derive it, but it does not propose changing the
  parent's acceptance bar or summary text — that authority is upstream of
  this sidecar

Supporting documents that contextualize the reviewed artifacts (read-only
here):

- planning ref —
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  (lines around 429–430 list `ADM-UI-RD-001` / `ADM-UI-RD-002` in the Wave 3
  platform-admin redesign roster)
- design canvas —
  `docs/05-ui/drts-design-canvas/Platform Admin.html#home` (the `PA_Home`
  artboard the parent acceptance bar references)
- parity story —
  `packages/ui-web/src/platform-shell.stories.tsx` (the
  `PA_Home shell` story is the parent-side parity reference, originally
  introduced for `ADM-UI-RD-001`; `ADM-UI-RD-002` reuses it without adding a
  new story)

---

## 5. Evidence Summary

Evidence that parent `ADM-UI-RD-002` is closed against the recorded scope:

1. `ai-status.json → ADM-UI-RD-002` records:
   - `commit_hash=edcf7e048c5515631597e2beba7d9579a33fa849`
   - `commit_subject=feat(ADM-UI-RD-002): strip admin css hooks from platform admin`
   - `commit_agent=Codex2`, `commit_reviewer=Codex`
   - `push_remote=origin`,
     `push_branch=feat/claude2-ui-redesign-foundation`,
     `push_commit=edcf7e048c5515631597e2beba7d9579a33fa849`
2. The shipped commit body on `edcf7e0` carries the required trailers:
   - `LLM-Agent: Codex2`
   - `Task-ID: ADM-UI-RD-002`
   - `Reviewer: Codex`
3. The shipped commit body records the parent verification set:
   - `pnpm --filter @drts/platform-admin-web typecheck` (PASS)
   - `pnpm --filter @drts/platform-admin-web test --passWithNoTests` (PASS)
   - `pnpm --filter @drts/platform-admin-web build` (PASS)
   - `pnpm --filter @drts/ui-web build-storybook` — recorded against prior
     task evidence; the blocker-fix patch on top of that did not touch
     `packages/ui-web/src/*.stories.tsx`, so the storybook artifact for
     the PA_Home parity comparison remains valid
   - `git diff --check -- apps/platform-admin-web/app apps/platform-admin-web/components`
     (PASS)
4. Branch reachability: `git branch -r --contains edcf7e0` resolves to
   `origin/feat/claude2-ui-redesign-foundation` only, matching `push_ref`;
   the parent commit is reachable on the recorded remote branch.
5. The working tree at packet time contains no `.admin-*` selectors in
   `apps/platform-admin-web/app/globals.css` (verified by
   `grep -c "admin-" apps/platform-admin-web/app/globals.css → 0`) and no
   references to the legacy `admin-page-header` / `admin-card` /
   `admin-table` / `admin-badge` / `admin-btn` selectors anywhere under
   `apps/platform-admin-web/components/` (verified by `grep -rn`).
6. The parity story `packages/ui-web/src/platform-shell.stories.tsx`
   already cites the canvas anchor
   `docs/05-ui/drts-design-canvas/Platform Admin.html#home` (`PA_Home shell`
   story) and that canvas anchor exists (`id="home"` with a `<PA_Home …/>`
   artboard at line 61 of `Platform Admin.html`).
7. Upstream dependency `ADM-UI-RD-001` is `done` with commit
   `516321d7f8de3017ec98a9c09bcfc55eb5b75de1` recorded in `ai-status.json`,
   so no upstream gap blocked finalize.

Evidence about this sidecar itself:

- write scope is limited to
  `support/sidecars/ADM-UI-RD-002/ADM-UI-RD-002-SIDECAR-REVIEW.md`
- no canonical truth, no runtime files, no parent ai-status fields, and no
  L1/L2 documents are touched
- this packet replaces the absent sidecar review packet with a
  reviewer-usable summary anchored on machine truth
- this packet does not duplicate volatile sidecar lifecycle state; live
  `status`, `last_update`, and event log stay in `ai-status.json` and
  `ai-activity-log.jsonl`

What this packet intentionally does NOT claim:

- it does not re-approve or re-finalize parent `ADM-UI-RD-002` — the parent
  reviewer of record is `Codex`, not this sidecar's reviewer `Codex2`
- it does not add or modify parent acceptance bars beyond what
  `ai-status.json → ADM-UI-RD-002.acceptance` already records
- it does not claim that "delete" and "rename under a `.platform-ui-*`
  namespace" are identical operations; it records the interpretation that
  the parent reviewer accepted at closure
- it does not declare `done` for this sidecar; that step is the sidecar
  owner's responsibility after sidecar review approval

---

## 6. Reviewer Handoff Notes

Sidecar Reviewer: `Codex2`

What to verify on this sidecar (not on the parent task itself):

- the sidecar artifact lives at the declared path:
  `support/sidecars/ADM-UI-RD-002/ADM-UI-RD-002-SIDECAR-REVIEW.md`
- the stable sidecar fields in §2 still match `ai-status.json`:
  - owner=`Claude`, reviewer=`Codex2`, helper_parent=`ADM-UI-RD-002`,
    helper_kind=`review_packet`, mutates_canonical=`false`,
    depends_on=`ADM-UI-RD-001`
- the parent stable snapshot in §2 still matches `ai-status.json` at review
  time, in particular:
  - parent `commit_hash` and `push_commit` are both
    `edcf7e048c5515631597e2beba7d9579a33fa849`
  - parent `commit_subject` matches `edcf7e0`'s actual subject line
  - parent `commit_agent`=`Codex2`, `commit_reviewer`=`Codex`,
    `push_remote`=`origin`,
    `push_branch`=`feat/claude2-ui-redesign-foundation`
- §3 dependency baseline still matches the live `done` snapshot for
  `ADM-UI-RD-001` (commit `516321d`); `DSY-UI-003` reference is informational
  only and should not be promoted to a hard `depends_on` edge on the
  sidecar
- §4 names the parent's actual write scope and does not edit the parent's
  `artifacts` field
- §5 evidence claims are anchored to fields in `ai-status.json`, to the
  commit body of `edcf7e0`, and to files present in the working tree
- the packet stays support-only and does not mutate canonical truth,
  runtime behavior, the parent's task fields, the planning ref, the design
  canvas, or any L1 / L2 product truth

Suggested reviewer checks:

- re-read this file against `ai-status.json` to confirm the stable anchors
  above
- `git show --stat edcf7e048c5515631597e2beba7d9579a33fa849` and confirm the
  commit body trailers (`LLM-Agent`, `Task-ID`, `Reviewer`) and verification
  list match §5
- `git branch -r --contains edcf7e048c5515631597e2beba7d9579a33fa849` and
  confirm `origin/feat/claude2-ui-redesign-foundation` is in the list
- `grep -c "admin-" apps/platform-admin-web/app/globals.css` → expect `0`
- `git diff --no-index --check /dev/null support/sidecars/ADM-UI-RD-002/ADM-UI-RD-002-SIDECAR-REVIEW.md`
  (no whitespace diagnostics)
- spot-check the cited files exist:
  - `apps/platform-admin-web/app/globals.css`
  - `apps/platform-admin-web/components/platform-ui.tsx`
  - `packages/ui-web/src/platform-shell.stories.tsx`
  - `docs/05-ui/drts-design-canvas/Platform Admin.html` (with anchor
    `id="home"` → `PA_Home`)

If approved:

```
AI_NAME=Codex2 scripts/ai-status.sh approve ADM-UI-RD-002-SIDECAR-REVIEW "<review conclusion>"
```

If not approved, reopen with a concrete mismatch summary so the sidecar
owner can refresh this packet without widening scope (no canonical-truth
edits, no parent-task edits, no runtime edits).

Reminder for later closeout (sidecar owner step, after sidecar review
approval):

- this sidecar is a `helper_kind=review_packet` slice with
  `mutates_canonical=false`
- per `AI_COLLABORATION_GUIDE.md` §5 commit-evidence rule, sidecar review
  packets may close with `NO_COMMIT_REQUIRED=1`
- closeout still requires the sidecar owner to call `done` via
  `scripts/ai-status.sh`; it does not happen implicitly

---

## 7. Owner Verification

Verification run while assembling this sidecar:

- read parent and sidecar task snapshots from `ai-status.json`
- read upstream dependency snapshots for `ADM-UI-RD-001` and `DSY-UI-003`
  from `ai-status.json`
- `git show --stat edcf7e048c5515631597e2beba7d9579a33fa849` confirmed the
  subject, the `LLM-Agent` / `Task-ID` / `Reviewer` trailers, and the file
  list (18 paths under `apps/platform-admin-web/`)
- `git branch -r --contains edcf7e048c5515631597e2beba7d9579a33fa849`
  resolved to `origin/feat/claude2-ui-redesign-foundation`
- `grep -c "admin-" apps/platform-admin-web/app/globals.css` → `0`
- `grep -rn` confirmed no legacy `admin-page-header` / `admin-card` /
  `admin-table` / `admin-badge` / `admin-btn` selectors remain in
  `apps/platform-admin-web/components/`
- spot-checked the cited files in the working tree:
  - `apps/platform-admin-web/app/globals.css`
  - `apps/platform-admin-web/components/platform-ui.tsx`
  - `packages/ui-web/src/platform-shell.stories.tsx`
    (`PA_Home shell` story citing
    `docs/05-ui/drts-design-canvas/Platform Admin.html#home`)
  - `docs/05-ui/drts-design-canvas/Platform Admin.html` (line 61 declares
    `id="home"` with a `<PA_Home …/>` artboard)
- read the planning ref
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` rows for
  `ADM-UI-RD-001` / `ADM-UI-RD-002` (lines 429–430)

Whitespace check on this packet:

- `git diff --no-index --check /dev/null support/sidecars/ADM-UI-RD-002/ADM-UI-RD-002-SIDECAR-REVIEW.md`

Not applicable here:

- runtime tests
- typecheck
- lint
- app execution
- parent finalize evidence (commit / push) — already recorded by the parent
  owner on `ADM-UI-RD-002`; this sidecar must not stand in for it

Reason: this is a docs-only support artifact with no code or
canonical-truth mutation, and it must not stand in for the parent task's
own finalize evidence.
