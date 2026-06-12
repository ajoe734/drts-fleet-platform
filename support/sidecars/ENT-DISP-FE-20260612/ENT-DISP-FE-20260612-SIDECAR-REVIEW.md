# ENT-DISP-FE-20260612 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `ENT-DISP-FE-20260612` — Enterprise Dispatch frontend rebuild umbrella
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-06-12` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical
truth, runtime behavior, L1/L2 product truth, the parent task acceptance, or the
parent-side review outcome.

This packet exists only to support sidecar reviewer handoff for the
`ENT-DISP-FE-20260612` umbrella. The canonical reviewed artifacts remain inside
each parent slice's own write scope (`apps/enterprise-dispatch-web/**`, the
design-canvas files under `docs/05-ui/**`, and the parent sidecar evidence under
`support/sidecars/ENT-DISP-FE-20260612/`). This sidecar captures the stable
machine-truth anchors, the umbrella slice map, the dependency baseline, the
evidence anchors, and the exact checks the sidecar reviewer should repeat before
approving this support slice.

---

## 1. Scope Boundary

In scope:

- summarize the current machine-truth state of the `ENT-DISP-FE-20260612`
  umbrella, its A–F development slices, and this sidecar task
- record the umbrella slice map and the dependency baseline that gates the
  remaining open slices
- name the reviewed artifacts and the verification commands the slice owners
  already report as passing
- provide reviewer-facing handoff notes for a docs-only sidecar slice

Out of scope:

- editing parent runtime code under `apps/enterprise-dispatch-web/**` or any
  other `apps/**` / `packages/**` target
- editing the design-canvas authority files
  (`docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`,
  `ent-kit.jsx`, `ent-shell.jsx`) or the screen-requirements doc
- editing `phase1_*`, the product spec, contracts, or any other canonical truth
- substituting this packet for any parent slice's own review verdict, approval
  note, commit, or push evidence
- approving or rejecting the umbrella or any A–F slice — that authority sits with
  parent reviewer `Claude2`, not with this sidecar's reviewer

---

## 2. Machine-Truth Anchors

### Sidecar task — `ENT-DISP-FE-20260612-SIDECAR-REVIEW`

Stable fields in `ai-status.json` (read at sidecar-start time):

- owner=`Claude`
- reviewer=`Codex`
- task_class=`sidecar`
- helper_parent=`ENT-DISP-FE-20260612`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`(none)`
- artifact=`support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`
- auto_created_by=`supervisor-underutilization`

Live sidecar lifecycle state:

- do not treat this packet as the source of truth for `status`, `last_update`,
  or the latest reopen / handoff event
- read those transient fields directly from `ai-status.json` at review time
- this packet intentionally avoids hard-coding volatile lifecycle values, so the
  sidecar can move through normal handoff / review / reopen transitions without
  forcing a packet rewrite

### Parent umbrella — `ENT-DISP-FE-20260612`

`ai-status.json` records (read at sidecar-start time):

- owner=`Codex`
- reviewer=`Claude2`
- status=`in_progress`
- depends_on=`(none)`
- artifacts=`support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
  `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`,
  `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- acceptance=`完成 A-F 開發切片並通過各 slice 驗收; 保持 enterprise_dispatch 與
  credit_card_airport_transfer 產品邊界; supervisor board 有完整 task trail`
- last_update=`2026-06-12T17:22:05Z`
- parent `next` (umbrella owner) is re-checking reopened blockers on the umbrella
  branch — verifying the tenant-console revert and the enterprise theme surface
  before fixing and re-handing off

Implication for this sidecar:

- the umbrella is NOT `done`; it is `in_progress`, with the owner actively
  reconciling reopened blockers
- no umbrella-level commit / push / integration evidence is recorded yet, so this
  sidecar cannot claim umbrella finalize evidence
- approving this sidecar does not approve or close the umbrella or any A–F slice

---

## 3. Umbrella Slice Map

Live A–F slice states from `ai-status.json` (read at sidecar-start time). This
sidecar records the snapshot only; the slices keep moving through their own
lifecycles and the reviewer should re-read live state at review time.

| Slice | Title | Owner | Reviewer | Status | depends_on |
|---|---|---|---|---|---|
| `ENT-DISP-FE-20260612-A` | Enterprise Dispatch app scaffold | `Codex` | `Claude2` | `done` | (none) |
| `ENT-DISP-FE-20260612-B` | Enterprise Dispatch shell and primitives | `Codex` | `Claude2` | `review_approved` | `A` |
| `ENT-DISP-FE-20260612-C` | (open slice) | `Claude2` | `Codex` | `backlog` | — |
| `ENT-DISP-FE-20260612-D` | (open slice) | `Codex` | `Claude2` | `backlog` | — |
| `ENT-DISP-FE-20260612-E` | (open slice) | `Claude2` | `Codex` | `backlog` | — |
| `ENT-DISP-FE-20260612-F` | Enterprise Dispatch API tests and rollout | `Codex` | `Claude2` | `done` | `A` |

Recorded finalize evidence for the closed slices:

- `A` — commit `19ecc7c1`
  (`ENT-DISP-FE-20260612-A: finalize owner closeout`), pushed
  `origin/codex/ent-disp-fe-20260612-a`, `integration_status=merged_to_dev`
  (`merged_ref=origin/dev`).
- `B` — `review_approved` at branch tip `2429ecc4`
  (`ENT-DISP-FE-20260612-B: isolate embedded shell preview`),
  `integration_status=branch_pushed`; owner closeout (merge to dev) still
  pending per the parent reviewer's approval note.
- `F` — commit `0cb53c20`
  (`ENT-DISP-FE-20260612-F: finalize tenant api tests and rollout evidence`),
  `integration_status=merged_to_dev` (`merge_commit=0cb53c20`,
  `merged_ref=origin/dev`).

Open slices `C`, `D`, `E` remain in `backlog` and are outside the evidence this
packet can summarize; they have no finalize evidence yet.

---

## 4. Dependency Baseline

The umbrella itself records `depends_on=(none)`. The internal slice dependency
graph is the relevant baseline:

| Slice | Depends on | Status of dependency | Role |
|---|---|---|---|
| `B` | `A` | `A` `done`, commit `19ecc7c1`, `merged_to_dev` | scaffold app + product-boundary README are upstream truth for the shell/primitives slice |
| `F` | `A` | `A` `done`, commit `19ecc7c1`, `merged_to_dev` | scaffold app is upstream truth for the `/api/tenant/*` wiring + test slice |

Why this matters for the sidecar review:

- slices `B` and `F` can safely assume the `apps/enterprise-dispatch-web`
  scaffold and its product-boundary README are accepted upstream truth — slice
  `A` is `done` and reachable from `origin/dev`
- no upstream dependency needs to be re-reviewed for this sidecar
- the product boundary established by `A` (enterprise dispatch must NOT inherit
  `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web` as its
  baseline) is the constraint the umbrella owner's reopened-blocker recheck in §2
  is currently reconciling against the tenant-console revert

---

## 5. Reviewed Artifacts

The umbrella's reviewed write scope, read from the slice `next` text, the slice
artifact fields, and the live working tree:

- `apps/enterprise-dispatch-web/**` — standalone Next.js workspace app
  (`@drts/enterprise-dispatch-web`):
  - renderable shell with the enterprise realm theme surface
    (`surface='enterprise'`); per slice `B` approval, the enterprise accent
    tokens (light `#2457D6` / lightHi `#1A45AD` / lightBg `#EBF1FE`) match the
    design canvas exactly and are NOT platform indigo
  - shell IA matches the canvas `ent-shell.jsx` (首頁 / 我的預約 / 行程 / 說明),
    with NO admin / ops nav; the A-scaffold ops pages were correctly removed when
    `B` landed the real shell
  - `/embedded-preview` routed to a standalone embed shell (no outer chrome) per
    the canvas WebShell / EmbedShell split
  - app-local `/api/tenant/*` fixture wiring, gap map, and vitest coverage for
    booking, gate, and embed-fallback behavior (slice `F`)
- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`,
  `docs/05-ui/drts-design-canvas/ent-kit.jsx`,
  `docs/05-ui/drts-design-canvas/ent-shell.jsx` — design-canvas authority for the
  enterprise realm (referenced by slices `A` and `B`)
- `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md` —
  screen-requirements note recorded because a production screen layout is gated
  on the design canvas
- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
  `tenant-api-gap-map.md`, `rollout-evidence.md` — parent-side sidecar evidence
  authored by the slice owners (NOT by this review-packet sidecar)

Record-only notes (not sidecar findings to act on):

- the umbrella's `artifacts` field lists the design-canvas
  `Enterprise Dispatch.html`, the screen-requirements doc, and the
  development-work-package; the actual delivered runtime scope is
  `apps/enterprise-dispatch-web/**`, surfaced through the individual A/B/F
  slices. The reviewer should treat the per-slice runtime write scope as the
  authoritative reviewed surface and leave any umbrella `artifacts`-field cleanup
  to the umbrella owner / reviewer. This sidecar must not edit that field.
- slice `B`'s approval note records a non-blocking residual (dark-mode darkHi
  `#7A9DF0` invented but dormant — no dark render) and a residual that the
  umbrella owner is reconciling now: the tenant-console revert + enterprise theme
  surface recheck in §2. Both are parent-side concerns; this sidecar only records
  them.

---

## 6. Evidence Summary

Evidence the umbrella slices are in a genuinely reviewable / closed state (not
just labeled):

1. Slice `A` is `done` with full finalize evidence: commit `19ecc7c1`, pushed
   `origin/codex/ent-disp-fe-20260612-a`, `integration_status=merged_to_dev`,
   `merged_ref=origin/dev`. The parent reviewer's recorded `review_notes_zh`
   confirm lint / typecheck / build green at `c3366e95` and product-boundary
   README enforcement (no inheritance of tenant-portal / tenant-console /
   partner-booking).
2. Slice `B` is `review_approved` at branch tip `2429ecc4` with a detailed,
   file-anchored approval note (16-file delta `19ecc7c1..2429ecc4`): realm/theme
   correctness, shell IA match to canvas, embed isolation, additive
   backward-compatible shared-primitive change, and app typecheck / lint
   (max-warnings=0) / build (9 routes) PASS. `integration_status=branch_pushed`;
   owner closeout (merge to dev) is the remaining step.
3. Slice `F` is `done` with finalize evidence: commit `0cb53c20`,
   `integration_status=merged_to_dev` (`merge_commit=0cb53c20`,
   `merged_ref=origin/dev`). Owner reports passing
   `pnpm --filter @drts/enterprise-dispatch-web test && … lint && … typecheck`.
4. The `apps/enterprise-dispatch-web` app exists in the working tree with the
   scaffold, shell, lib, and `tests/` (unit
   `tests/unit/dispatch-fixture-adapter.test.ts`, smoke
   `tests/smoke/tenant-contract-wiring.test.ts`) — consistent with the A/B/F
   slice descriptions.
5. The umbrella branch base for this sidecar (`origin/dev`, tip `0cb53c20`) is
   the same commit as slice `F`'s merge commit, so the delivered A and F content
   is reachable from the trunk this sidecar branches from.

Evidence about this sidecar itself:

- write scope is limited to
  `support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`
- no canonical truth, no runtime files, and no parent ai-status fields are
  touched
- this packet replaces the absent / placeholder-only sidecar review packet with
  a reviewer-usable summary anchored on machine truth
- the packet does not duplicate volatile lifecycle state; live status,
  last_update, and event log stay in `ai-status.json` and
  `ai-activity-log.jsonl`

What this packet intentionally does NOT claim:

- it does not claim the umbrella `ENT-DISP-FE-20260612` is approved or `done`
  (it is `in_progress` with an active reopened-blocker recheck)
- it does not record an umbrella-level commit hash, push remote, or push branch
  (none exist yet)
- it does not claim any slice is `dev_deployed`; the closed slices are at most
  `merged_to_dev`, never deploy-verified, per their own machine truth
- it does not pre-judge the parent reviewer `Claude2`'s remaining decisions on
  the umbrella, on slice `B` closeout, or on the open C/D/E slices

---

## 7. Reviewer Handoff Notes

Sidecar Reviewer: `Codex`

What to verify on this sidecar (not on the parent / umbrella):

- the sidecar artifact lives at the declared path:
  `support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`
- the stable sidecar fields in §2 still match `ai-status.json`:
  - owner=`Claude`, reviewer=`Codex`, helper_parent=`ENT-DISP-FE-20260612`,
    helper_kind=`review_packet`, mutates_canonical=`false`
- the umbrella + slice snapshot in §2/§3 still matches `ai-status.json` at review
  time (re-read live state; the snapshot does not need a refresh just because a
  slice moved forward):
  - umbrella status is `in_progress`, reviewer `Claude2`
  - `A` and `F` `done`, `B` `review_approved`, `C`/`D`/`E` `backlog`
- the finalize evidence in §3/§6 still matches the live slice records
  (`A`=`19ecc7c1` merged_to_dev, `B`=`2429ecc4` branch_pushed, `F`=`0cb53c20`
  merged_to_dev)
- §5 names the per-slice runtime write scope and explicitly does not edit the
  umbrella's `artifacts` field
- §6 evidence claims are anchored to slice `next` / `review_notes_zh` text and to
  files that exist in the working tree
- the packet stays support-only and does not mutate canonical truth, runtime
  behavior, any parent task field, or any L1 / L2 product truth

Suggested reviewer checks:

- re-read this file against `ai-status.json` to confirm the stable anchors above
  (`scripts/ai-status.sh show <id>` for each slice; do not read the full
  `ai-status.json`)
- `git diff --no-index --check /dev/null support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`
  (no whitespace diagnostics)
- spot-check the cited surfaces exist:
  - `apps/enterprise-dispatch-web/` (app, lib, tests)
  - `apps/enterprise-dispatch-web/tests/unit/dispatch-fixture-adapter.test.ts`
  - `apps/enterprise-dispatch-web/tests/smoke/tenant-contract-wiring.test.ts`
  - `docs/05-ui/drts-design-canvas/ent-shell.jsx` and `ent-kit.jsx`
  - `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
    `tenant-api-gap-map.md`, `rollout-evidence.md`

If approved:

```
AI_NAME=Codex scripts/ai-status.sh approve ENT-DISP-FE-20260612-SIDECAR-REVIEW "<review conclusion>"
```

If not approved, reopen with a concrete mismatch summary so the sidecar owner can
refresh this packet without widening scope (no canonical-truth edits, no
parent-task edits, no runtime edits).

Reminder for later closeout (sidecar owner step, after sidecar review approval):

- this sidecar is a `helper_kind=review_packet` slice with
  `mutates_canonical=false`
- per `AI_COLLABORATION_GUIDE.md` §5 commit-evidence rule, sidecar review packets
  may close with `NO_COMMIT_REQUIRED=1`
- closeout still requires the sidecar owner to call `done` via
  `scripts/ai-status.sh`; it does not happen implicitly

---

## 8. Owner Verification

Verification run while assembling this sidecar:

- read the umbrella and sidecar task snapshots from `ai-status.json` via
  `scripts/ai-status.sh show` (single-task slices, not the full file)
- read the A–F slice snapshots from `ai-status.json`, including the recorded
  finalize evidence (commits, push refs, integration status) for `A`, `B`, `F`
- spot-checked the cited surfaces in the working tree:
  - `apps/enterprise-dispatch-web/` (app, lib, `tests/unit`, `tests/smoke`)
  - `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
    `tenant-api-gap-map.md`, `rollout-evidence.md`
- confirmed this branch's base (`origin/dev`, tip `0cb53c20`) equals slice `F`'s
  merge commit, so delivered A/F content is reachable from the trunk

Whitespace check on this packet:

- `git diff --no-index --check /dev/null support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`

Not applicable here:

- runtime tests
- typecheck
- lint
- app execution
- umbrella / parent finalize evidence (commit / push) — that belongs to the
  umbrella owner `Codex` and the slice owners after parent reviewer `Claude2`
  closes the remaining slices

Reason: this is a docs-only support artifact with no code or canonical-truth
mutation, and it must not stand in for any parent slice's own finalize evidence.
