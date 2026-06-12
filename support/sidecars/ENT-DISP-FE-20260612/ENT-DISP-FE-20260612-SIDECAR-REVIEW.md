# ENT-DISP-FE-20260612 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `ENT-DISP-FE-20260612` — Enterprise Dispatch frontend rebuild umbrella
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-06-12` (UTC)
**Machine-truth snapshot as of:** `2026-06-12T17:27Z` (refreshed after reviewer
reopen; volatile lifecycle fields must still be re-read live at review time)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical
truth, runtime behavior, L1/L2 product truth, the parent task acceptance, or the
parent-side review outcome.

This packet exists only to support sidecar reviewer handoff for the
`ENT-DISP-FE-20260612` umbrella. The canonical reviewed artifacts remain inside
each parent slice's own write scope (`apps/enterprise-dispatch-web/**` and the
parent sidecar evidence under `support/sidecars/ENT-DISP-FE-20260612/`). This
sidecar captures the stable machine-truth anchors, the umbrella slice map, the
dependency baseline, the evidence anchors, and the exact checks the sidecar
reviewer should repeat before approving this support slice.

> **Refresh note (this revision).** A prior revision of this packet was reopened
> by the sidecar reviewer because its hard-coded snapshot had drifted from live
> machine truth and it cited design-canvas files that are not present in the
> branch tree. This revision re-anchors every snapshot value to the
> `2026-06-12T17:27Z` machine-truth read, removes the non-verifiable
> design-canvas references (`Enterprise Dispatch.html`, `ent-kit.jsx`,
> `ent-shell.jsx`) and the absent screen-requirements doc from this packet's own
> claims, and demotes the umbrella's still-listed-but-absent `artifacts` paths to
> a record-only parent-side note. Volatile fields (`status`, `last_update`, and
> the in-flight C/D/E slices) are expected to keep moving; re-read them live.

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
- editing any design-canvas authority files under
  `docs/05-ui/drts-design-canvas/**` or any screen-requirements doc
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

`ai-status.json` records (machine-truth snapshot `2026-06-12T17:27Z`):

- owner=`Codex`
- reviewer=`Claude2`
- status=`in owner-closeout` — observed oscillating between `review_approved`
  and `in_progress` across reads at ~17:27Z; the umbrella was parent-reviewer
  approved and the owner is now running owner closeout (finalize commit +
  verification + push) before `done`. This is a volatile field; re-read it live.
- integration_status=`null` (no umbrella-level finalize evidence recorded yet)
- depends_on=`(none)`
- artifacts (as recorded on the umbrella, **record-only — see note below**)=
  `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
  `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`,
  `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- acceptance=`完成 A-F 開發切片並通過各 slice 驗收; 保持 enterprise_dispatch 與
  credit_card_airport_transfer 產品邊界; supervisor board 有完整 task trail`
- parent `next`=`owner closeout: preparing task-scoped finalize commit with
  verification, then normal push and done status`

> **Record-only note on the umbrella `artifacts` field.** Two of the three paths
> the umbrella lists —
> `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md` and
> `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` — are **not present**
> in this sidecar branch's working tree or in this packet's commit. The
> design-canvas directory contains the other realm canvases (Bank / Driver / Ops
> / Tenant / Platform / Partner-Booking, plus `README.md`) but **no**
> `Enterprise Dispatch.html`, `ent-kit.jsx`, or `ent-shell.jsx`. This packet
> therefore does **not** cite those paths as reviewed/verifiable surfaces.
> Reconciling the umbrella's `artifacts` field against what actually shipped is a
> parent-side concern for the umbrella owner/reviewer; this sidecar must not edit
> that field and cannot verify those paths in-tree.

Implication for this sidecar:

- the umbrella is NOT `done`; it is in owner-closeout, with no umbrella-level
  commit / push / integration evidence recorded yet, so this sidecar cannot claim
  umbrella finalize evidence
- approving this sidecar does not approve or close the umbrella or any A–F slice

---

## 3. Umbrella Slice Map

Live A–F slice states from `ai-status.json` (machine-truth snapshot
`2026-06-12T17:27Z`). This sidecar records the snapshot only; the in-flight
slices (`C`/`D`/`E`) keep moving through their own lifecycles and the reviewer
should re-read live state at review time.

| Slice | Title | Owner | Reviewer | Status | depends_on |
|---|---|---|---|---|---|
| `ENT-DISP-FE-20260612-A` | Enterprise Dispatch app scaffold | `Codex` | `Claude2` | `done` | (none) |
| `ENT-DISP-FE-20260612-B` | Enterprise Dispatch shell and primitives | `Codex` | `Claude2` | `done` | `A` |
| `ENT-DISP-FE-20260612-C` | Enterprise Dispatch website booking flow | `Claude2` | `Codex` | `in_progress` | `B` |
| `ENT-DISP-FE-20260612-D` | Enterprise Dispatch status and outcome pages | `Codex` | `Claude2` | `in_progress` | `B` |
| `ENT-DISP-FE-20260612-E` | Enterprise Dispatch gates and embed states | `Codex` | `Claude2` | `in_progress` | `B` |
| `ENT-DISP-FE-20260612-F` | Enterprise Dispatch API tests and rollout | `Codex` | `Claude2` | `done` | `A` |

Recorded finalize evidence for the closed slices (`done`):

- `A` — `integration_status=merged_to_dev`, `merged_ref=origin/dev` (the
  status record carries no `commit`/`merge_commit` hash; the matching finalize
  commit visible in this branch's history is `19ecc7c1`
  `ENT-DISP-FE-20260612-A: finalize owner closeout`).
- `B` — `status=done`, `integration_status=merged_to_dev`,
  `merge_commit=f640b3d3`, `push_remote=origin`, `push_branch=dev`. Owner
  closeout note: "merged approved enterprise dispatch shell branch into dev at
  `f640b3d3` and pushed to origin/dev". (This supersedes the prior revision's
  `review_approved`/`2429ecc4`/`branch_pushed` reading — B has since been merged
  and closed.)
- `F` — `status=done`, `integration_status=merged_to_dev`,
  `merge_commit=0cb53c20`, `merged_ref=origin/dev`
  (`ENT-DISP-FE-20260612-F: finalize tenant api tests and rollout evidence`).

Open slices `C`, `D`, `E` are `in_progress` (each `depends_on B`, now `done`)
and are outside the closed-slice evidence this packet summarizes; they have no
finalize evidence yet, and their status will keep moving — re-read live.

---

## 4. Dependency Baseline

The umbrella itself records `depends_on=(none)`. The internal slice dependency
graph is the relevant baseline:

| Slice | Depends on | Status of dependency | Role |
|---|---|---|---|
| `B` | `A` | `A` `done`, `merged_to_dev` (`origin/dev`) | scaffold app + product-boundary README are upstream truth for the shell/primitives slice |
| `F` | `A` | `A` `done`, `merged_to_dev` (`origin/dev`) | scaffold app is upstream truth for the `/api/tenant/*` wiring + test slice |
| `C` | `B` | `B` `done`, `merged_to_dev` `f640b3d3` | shell + primitives are upstream truth for the website booking flow |
| `D` | `B` | `B` `done`, `merged_to_dev` `f640b3d3` | shell + primitives are upstream truth for the status / outcome pages |
| `E` | `B` | `B` `done`, `merged_to_dev` `f640b3d3` | shell + primitives are upstream truth for the gates / embed states |

Why this matters for the sidecar review:

- the closed slices `A`, `B`, `F` and the gating dependency for the open slices
  are all `done` and reachable from `origin/dev`; the `apps/enterprise-dispatch-web`
  scaffold, its product-boundary README, and the merged shell/primitives are
  accepted upstream truth
- the three open slices `C`/`D`/`E` all depend on `B`, which is now `done` and
  merged — their dependency gate is satisfied, so they are unblocked and
  in-flight, not waiting on this sidecar
- no upstream dependency needs to be re-reviewed for this sidecar
- the product boundary established by `A` (enterprise dispatch must NOT inherit
  `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web` as its
  baseline) is recorded here as the umbrella-level constraint; its enforcement
  lives in the per-slice machine truth, not in this sidecar

---

## 5. Reviewed Artifacts

The umbrella's reviewed write scope, restricted to surfaces that actually exist
in this branch's working tree (paths that cannot be verified in-tree are NOT
cited here):

- `apps/enterprise-dispatch-web/**` — standalone Next.js workspace app
  (`@drts/enterprise-dispatch-web`), the delivered runtime scope surfaced through
  the A/B/F slices. Verified present: `app/`, `lib/`, `public/`, `tests/`,
  `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`,
  `README.md`. Behavioral claims about the enterprise realm theme, shell IA, and
  embed isolation are owned by the per-slice machine truth (slice `B`'s closeout
  note), not re-asserted here against any specific in-tree file.
  - app-local `/api/tenant/*` fixture wiring, gap map, and test coverage for
    booking, gate, and embed-fallback behavior (slice `F`); verified test files:
    `tests/unit/dispatch-fixture-adapter.test.ts`,
    `tests/smoke/tenant-contract-wiring.test.ts`
- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
  `tenant-api-gap-map.md`, `rollout-evidence.md` — parent-side sidecar evidence
  authored by the slice owners (NOT by this review-packet sidecar); all three are
  verified present in-tree

Record-only notes (not sidecar findings to act on):

- the umbrella's `artifacts` field lists
  `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` and
  `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`, but
  **neither path exists in this sidecar branch's tree** (the design-canvas dir
  has the other realm canvases but no `Enterprise Dispatch.html` / `ent-kit.jsx`
  / `ent-shell.jsx`). The actual delivered runtime scope is
  `apps/enterprise-dispatch-web/**`. The reviewer should treat the per-slice
  runtime write scope as the authoritative reviewed surface; reconciling the
  umbrella `artifacts` field against what shipped is a parent-side concern for
  the umbrella owner / reviewer. This sidecar must not edit that field and does
  not cite those absent paths as verifiable evidence.
- any per-slice theming residuals (e.g. dormant dark-mode tokens) and the
  enterprise-vs-tenant product-boundary reconciliation are parent-side concerns
  carried in the slice records; this sidecar only points to them and does not
  re-derive their values.

---

## 6. Evidence Summary

Evidence the umbrella slices are in a genuinely reviewable / closed state (not
just labeled):

1. Slice `A` is `done` with finalize evidence: `integration_status=merged_to_dev`,
   `merged_ref=origin/dev` (matching branch-history finalize commit `19ecc7c1`
   `ENT-DISP-FE-20260612-A: finalize owner closeout`). The status carries no
   discrete commit hash; the integration level is `merged_to_dev`.
2. Slice `B` is `done` (no longer `review_approved`): parent-reviewer approved,
   then owner-closed — `integration_status=merged_to_dev`,
   `merge_commit=f640b3d3`, pushed `origin/dev`. Owner closeout note: "merged
   approved enterprise dispatch shell branch into dev at `f640b3d3` and pushed to
   origin/dev". `f640b3d3` is the current `origin/dev` tip.
3. Slice `F` is `done` with finalize evidence: `integration_status=merged_to_dev`,
   `merge_commit=0cb53c20`, `merged_ref=origin/dev`
   (`ENT-DISP-FE-20260612-F: finalize tenant api tests and rollout evidence`).
4. The `apps/enterprise-dispatch-web` app exists in the working tree with the
   scaffold, app, lib, and `tests/` (unit
   `tests/unit/dispatch-fixture-adapter.test.ts`, smoke
   `tests/smoke/tenant-contract-wiring.test.ts`) — consistent with the A/B/F
   slice descriptions.
5. This sidecar branch is based at `0cb53c20` (= slice `F`'s merge commit);
   `origin/dev` has since advanced to `f640b3d3` (= slice `B`'s merge commit).
   The delivered A / B / F content is therefore reachable from `origin/dev`.
   (`f640b3d3` is confirmed an ancestor of `origin/dev`; the trunk is ahead of
   this docs-only sidecar branch, which is expected for a support slice.)

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

- it does not claim the umbrella `ENT-DISP-FE-20260612` is `done` (it is in
  owner-closeout, parent-reviewer approved but not yet finalized)
- it does not record an umbrella-level commit hash, push remote, or push branch
  (`integration_status` is still `null`)
- it does not claim any slice is `dev_deployed`; the closed slices are at most
  `merged_to_dev`, never deploy-verified, per their own machine truth
- it does not pre-judge the parent reviewer `Claude2`'s remaining decisions on
  the umbrella finalize or on the open in-progress C/D/E slices
- it does not cite the absent design-canvas `Enterprise Dispatch.html` /
  `ent-kit.jsx` / `ent-shell.jsx` or the absent screen-requirements doc as
  reviewed or verifiable surfaces

---

## 7. Reviewer Handoff Notes

Sidecar Reviewer: `Codex`

What to verify on this sidecar (not on the parent / umbrella):

- the sidecar artifact lives at the declared path:
  `support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`
- the stable sidecar fields in §2 still match `ai-status.json`:
  - owner=`Claude`, reviewer=`Codex`, helper_parent=`ENT-DISP-FE-20260612`,
    helper_kind=`review_packet`, mutates_canonical=`false`
- the umbrella + slice snapshot in §2/§3 matches `ai-status.json` at the
  `2026-06-12T17:27Z` anchor; re-read live state, since volatile fields move:
  - umbrella owner `Codex`, reviewer `Claude2`, in owner-closeout
    (parent-approved, finalizing — not yet `done`)
  - `A`/`B`/`F` `done`; `C`/`D`/`E` `in_progress` (each `depends_on B`).
    Minor C/D/E status drift does not invalidate this packet — they are
    explicitly out of the closed-slice evidence scope
- the finalize evidence in §3/§6 still matches the live slice records
  (`A` `merged_to_dev`/`origin/dev`; `B` `merged_to_dev` `f640b3d3`/`origin/dev`;
  `F` `merged_to_dev` `0cb53c20`/`origin/dev`)
- §2/§5 demote the umbrella's still-listed-but-absent design-canvas and
  screen-requirements `artifacts` paths to record-only and do not cite them as
  verifiable surfaces; this sidecar does not edit the umbrella `artifacts` field
- §6 evidence claims are anchored to slice machine-truth fields and to files that
  exist in the working tree
- the packet stays support-only and does not mutate canonical truth, runtime
  behavior, any parent task field, or any L1 / L2 product truth

Suggested reviewer checks:

- re-read this file against `ai-status.json` to confirm the stable anchors above
  (`scripts/ai-status.sh show <id>` for each slice; do not read the full
  `ai-status.json`)
- `git diff --no-index --check /dev/null support/sidecars/ENT-DISP-FE-20260612/ENT-DISP-FE-20260612-SIDECAR-REVIEW.md`
  (no whitespace diagnostics)
- spot-check the cited surfaces exist (every surface this packet cites is
  present in-tree; the packet deliberately cites no absent paths):
  - `apps/enterprise-dispatch-web/` (app, lib, tests)
  - `apps/enterprise-dispatch-web/tests/unit/dispatch-fixture-adapter.test.ts`
  - `apps/enterprise-dispatch-web/tests/smoke/tenant-contract-wiring.test.ts`
  - `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
    `tenant-api-gap-map.md`, `rollout-evidence.md`
  - (negative check) confirm `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`,
    `ent-kit.jsx`, `ent-shell.jsx`, and
    `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md` are
    absent in-tree and are referenced only as record-only umbrella-`artifacts`
    notes, never as this packet's verified evidence

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

Verification run while refreshing this sidecar (this revision, after reopen):

- re-read the umbrella, sidecar, and A–F slice snapshots from `ai-status.json`
  via `scripts/ai-status.sh show` (single-task slices, not the full file),
  capturing the recorded finalize evidence (integration status, merge commits,
  push refs) for `A`, `B`, `F` at the `2026-06-12T17:27Z` anchor
- reconciled the three reopen findings against live truth and corrected them:
  umbrella moved to parent-approved owner-closeout (not `in_progress`); `B` is
  `done`/`merged_to_dev` `f640b3d3` (not `review_approved`/`2429ecc4`); `C`/`D`/`E`
  are `in_progress` each `depends_on B` (not `backlog`)
- spot-checked the cited surfaces in the working tree (all present):
  - `apps/enterprise-dispatch-web/` (app, lib, `tests/unit`, `tests/smoke`)
  - `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`,
    `tenant-api-gap-map.md`, `rollout-evidence.md`
- confirmed the reopen's path complaint: `Enterprise Dispatch.html`,
  `ent-kit.jsx`, `ent-shell.jsx`, and the screen-requirements doc are **absent**
  in-tree (`ls docs/05-ui/drts-design-canvas/` + `git ls-tree be7bfd63`), and
  removed them from this packet's verified claims
- confirmed branch base `0cb53c20` (= slice `F`'s merge commit) and that
  `origin/dev` has advanced to `f640b3d3` (= slice `B`'s merge commit, confirmed
  ancestor of `origin/dev`), so delivered A/B/F content is reachable from the
  trunk

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
