# TEN-UI-002 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `TEN-UI-002` — Tenant Console Shell And Information Architecture Materialization
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-09` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical
truth, runtime behavior, L1/L2 product truth, the parent task acceptance, or the
parent-side review outcome.

This packet exists only to support sidecar reviewer handoff for `TEN-UI-002`.
The canonical reviewed artifacts remain inside the parent's own write scope
(`apps/tenant-console-web/**` plus the repo-root `package.json` `dev:tenant`
entrypoint). This sidecar captures the stable machine-truth anchors, dependency
baseline, evidence anchors, and the exact checks the sidecar reviewer should
repeat before approving this support slice.

---

## 1. Scope Boundary

In scope:

- summarize the current machine-truth state of parent `TEN-UI-002` and this
  sidecar task
- record the dependency baseline that gates `TEN-UI-002`
- name the parent's reviewed artifacts and the verification commands the parent
  owner already reports as passing
- provide reviewer-facing handoff notes for a docs-only sidecar slice

Out of scope:

- editing parent runtime code under `apps/tenant-console-web/**`,
  `apps/tenant-portal-web/**`, or any other `apps/**` / `packages/**` target
- editing the repo-root `package.json` `dev:tenant` entrypoint (that change
  belongs to parent `TEN-UI-002`, not to this sidecar)
- editing `phase1_*`, the execution packet, the design review file, the product
  spec, contracts, or any other canonical truth
- substituting this packet for the parent's own review verdict, approval note,
  commit, or push evidence
- approving or rejecting parent `TEN-UI-002` itself — that authority sits with
  parent reviewer `Claude2`, not with this sidecar's reviewer

---

## 2. Machine-Truth Anchors

### Sidecar task — `TEN-UI-002-SIDECAR-REVIEW`

Stable fields in `ai-status.json`:

- owner=`Claude`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`TEN-UI-002`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`TEN-UI-001`, `XS-UI-001`, `XS-UI-004`
- artifact=`support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-REVIEW.md`

Live sidecar lifecycle state:

- do not treat this packet as the source of truth for `status`, `last_update`,
  or the latest reopen / handoff event
- read those transient fields directly from `ai-status.json` at review time
- this packet intentionally avoids hard-coding volatile lifecycle values, so the
  sidecar can move through normal handoff / review / reopen transitions without
  forcing a packet rewrite

### Parent task — `TEN-UI-002`

`ai-status.json` currently records (read at sidecar-start time):

- owner=`Codex2`
- reviewer=`Claude2`
- status=`review`
- depends_on=`TEN-UI-001`, `XS-UI-001`, `XS-UI-004`
- artifacts=`apps/tenant-portal-web` (per the recorded artifact field;
  see §4 Reviewed Artifact for how this should be read against the actual write
  scope referenced in the parent's `next` text)
- acceptance=`pnpm --filter @drts/tenant-portal-web typecheck`
- execution_packet=`TEN-UI-20260508`
- packet_path=`docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- last_update=`2026-05-09T06:13:12Z`

Parent `next` text at the time this packet was written summarizes:

1. nav resolution fix — `/bookings/new` wins over `/bookings` by ranking longer
   `href` matches first inside
   `apps/tenant-console-web/lib/navigation.ts`, so the dedicated New Booking
   entry is the only active item on `/bookings/new`
2. sidebar active-state wiring — the shell follows the resolved active item in
   `apps/tenant-console-web/components/tenant-shell.tsx`
3. repo-root `dev:tenant` script in `package.json` flipped to
   `pnpm --filter @drts/tenant-console-web dev` so canonical local tenant dev
   opens the new console rather than the sunset portal shell
4. parent owner reports verifications passing:
   - `pnpm --filter @drts/tenant-console-web typecheck` — PASS
   - `pnpm --filter @drts/tenant-portal-web typecheck` — PASS
   - `git diff --check -- apps/tenant-console-web package.json` — PASS

Implication for this sidecar:

- the parent is NOT yet `done`; it is in `review`
- the parent owner has not yet recorded `commit_hash`, `commit_subject`,
  `push_remote`, or `push_branch`, because those finalize fields belong to the
  later `done` step after parent reviewer `Claude2` approves
- this sidecar therefore cannot claim parent commit / push evidence; it can only
  record the verification text the parent already reports and the reviewed
  artifacts the parent points at
- approving this sidecar does not approve or close parent `TEN-UI-002`

---

## 3. Dependency Baseline

`TEN-UI-002` depends on three items, all already finalized in machine truth:

| Dependency   | Status | Recorded commit | Role for `TEN-UI-002`                                                                                                                                                                   |
| ------------ | ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-001` | `done` | `e122e8b`       | fixed the tenant-console productization topology and named `apps/tenant-console-web` as the only allowed in-repo landing zone (FBP-007 sunset is enforced for `apps/tenant-portal-web`) |
| `XS-UI-001`  | `done` | `ac44883`       | filed the route-to-endpoint mapping packet for tenant-selected surfaces, so `TEN-UI-002` does not need to re-derive route → API ownership                                               |
| `XS-UI-004`  | `done` | `c480243`       | filed the shared query and filter normalization packet, including downstream guidance that `TEN-UI-002` must consume rather than re-invent                                              |

Why this matters for the sidecar review:

- the sidecar can safely assume the tenant-console landing zone, the route map,
  and the shared filter shape are already accepted upstream truth
- no upstream dependency needs to be re-reviewed for this sidecar
- the parent's primary write target (`apps/tenant-console-web`) is consistent
  with the `TEN-UI-001` topology decision rather than reviving the sunset
  `apps/tenant-portal-web` shell

---

## 4. Reviewed Artifacts

The parent task's actual write scope, read from the parent's own `next` text and
the live working tree:

- `apps/tenant-console-web/lib/navigation.ts` — nav model with longer-href
  ranking via a sorted `tenantNavItems` list, `isNavItemActive` prefix rule,
  and `findNavItem` lookup
- `apps/tenant-console-web/components/tenant-shell.tsx` — shell that consumes
  `findNavItem` / `isNavItemActive`, marks `is-active` only when both the
  resolved active item and the current href match, and renders the resolved
  label / note in the workspace heading
- `apps/tenant-console-web/app/**` — primary route groups for `home`,
  `bookings`, `bookings/new`, `api-keys`, `webhooks`, `audit`, `users`,
  `settings` (matches the IA list called out in the execution packet
  `TEN-UI-002` section)
- repo-root `package.json` — `dev:tenant` entrypoint flipped to
  `@drts/tenant-console-web`

Discrepancy note (record-only, not a sidecar finding to act on):

- the parent's `artifacts` field in `ai-status.json` lists
  `apps/tenant-portal-web`, but the parent's `next` text and the actual write
  scope point at `apps/tenant-console-web` plus the repo-root `package.json`
  entrypoint switch
- this is consistent with `TEN-UI-001`'s topology decision (canonical tenant
  console = `apps/tenant-console-web`; `apps/tenant-portal-web` stays sunset)
- the sidecar reviewer should treat the parent's runtime write scope as the
  authoritative reviewed surface and leave any artifact-field cleanup to the
  parent owner / parent reviewer; this sidecar must not edit that field
- the parent's recorded `acceptance` command also targets
  `@drts/tenant-portal-web typecheck`; the parent owner already reports running
  both that command and the new-target typecheck and both passing, so the
  acceptance check is satisfied without this sidecar touching the field

Supporting documents that contextualize the reviewed artifacts (read-only here):

- product spec — `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- execution packet — `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
  (`TEN-UI-002` section starts around line 288)
- design review — `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`

---

## 5. Evidence Summary

Evidence the parent task is actually in a reviewable state (not just labeled
`review`):

1. Parent `status=review` and `reviewer=Claude2` are recorded in
   `ai-status.json` with `last_update=2026-05-09T06:13:12Z`.
2. Parent `next` text records concrete, file-anchored fixes addressing two prior
   review blockers (nav resolution and `dev:tenant` entrypoint), not vague
   "addressed feedback" language.
3. Parent owner reports passing verifications for both the new-target typecheck
   (`pnpm --filter @drts/tenant-console-web typecheck`) and the recorded
   acceptance command (`pnpm --filter @drts/tenant-portal-web typecheck`).
4. Parent owner reports `git diff --check -- apps/tenant-console-web package.json`
   passing, so the reviewed surface is whitespace-clean for the parent reviewer.
5. The reviewed code present in the working tree matches the parent's
   description:
   - `apps/tenant-console-web/lib/navigation.ts` defines the eight-item IA
     listed in the execution packet, sorts items by descending href length, and
     uses a prefix rule with `/`-boundary safety
   - `apps/tenant-console-web/components/tenant-shell.tsx` derives `isActive`
     from both the resolved active item and the href equality, so siblings
     under `/bookings` cannot tie with `/bookings/new`
   - repo-root `package.json` has `"dev:tenant": "pnpm --filter @drts/tenant-console-web dev"`
6. Dependencies `TEN-UI-001`, `XS-UI-001`, and `XS-UI-004` are all `done` with
   recorded commits (`e122e8b`, `ac44883`, `c480243`), so no upstream gap is
   blocking parent finalize.

Evidence about this sidecar itself:

- write scope is limited to
  `support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-REVIEW.md`
- no canonical truth, no runtime files, and no parent ai-status fields are
  touched
- this packet replaces the absent / placeholder-only sidecar review packet with
  a reviewer-usable summary anchored on machine truth
- the packet does not duplicate volatile sidecar lifecycle state; live status,
  last_update, and event log stay in `ai-status.json` and
  `ai-activity-log.jsonl`

What this packet intentionally does NOT claim:

- it does not claim parent `TEN-UI-002` is already approved or `done`
- it does not record a parent commit hash, push remote, or push branch (none
  exist yet at sidecar-start time)
- it does not pre-judge the parent reviewer `Claude2`'s decision
- it does not alter the parent's `artifacts` or `acceptance` fields, even where
  the discrepancy in §4 was observed

---

## 6. Reviewer Handoff Notes

Sidecar Reviewer: `Codex2`

What to verify on this sidecar (not on the parent):

- the sidecar artifact lives at the declared path:
  `support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-REVIEW.md`
- the stable sidecar fields in §2 still match `ai-status.json`:
  - owner=`Claude`, reviewer=`Codex2`, helper_parent=`TEN-UI-002`,
    helper_kind=`review_packet`, mutates_canonical=`false`
- the parent snapshot in §2 still matches `ai-status.json` at review time:
  - parent status is still `review` (or has progressed via parent reviewer
    `Claude2`'s decision; the sidecar does not need a refresh just because the
    parent moved forward)
  - parent reviewer is still `Claude2`
- the dependency baseline in §3 still matches the live `done` snapshots for
  `TEN-UI-001`, `XS-UI-001`, `XS-UI-004` (commits `e122e8b`, `ac44883`,
  `c480243`)
- §4 names the parent's actual write scope and explicitly does not edit the
  parent's `artifacts` field
- §5 evidence claims are anchored to the parent's `next` text and to files that
  exist in the working tree
- the packet stays support-only and does not mutate canonical truth, runtime
  behavior, the parent's task fields, or any L1 / L2 product truth

Suggested reviewer checks:

- re-read this file against `ai-status.json` to confirm the stable anchors
  above
- `git diff --no-index --check /dev/null support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-REVIEW.md`
  (no whitespace diagnostics)
- spot-check the cited files exist:
  - `apps/tenant-console-web/lib/navigation.ts`
  - `apps/tenant-console-web/components/tenant-shell.tsx`
  - repo-root `package.json` `dev:tenant` line

If approved:

```
AI_NAME=Codex2 scripts/ai-status.sh approve TEN-UI-002-SIDECAR-REVIEW "<review conclusion>"
```

If not approved, reopen with a concrete mismatch summary so the sidecar owner
can refresh this packet without widening scope (no canonical-truth edits, no
parent-task edits, no runtime edits).

Reminder for later closeout (sidecar owner step, after sidecar review approval):

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
- read upstream dependency snapshots for `TEN-UI-001`, `XS-UI-001`, `XS-UI-004`
  from `ai-status.json`
- spot-checked the cited parent runtime files in the working tree:
  - `apps/tenant-console-web/lib/navigation.ts`
  - `apps/tenant-console-web/components/tenant-shell.tsx`
  - `apps/tenant-console-web/app/**` (route directories)
  - repo-root `package.json` `dev:tenant` line
- read the execution packet `TEN-UI-002` section to confirm the in-scope IA
  surfaces (`home`, `bookings`, `bookings/new`, `api-keys`, `webhooks`, `audit`,
  `users`, `settings`)

Whitespace check on this packet:

- `git diff --no-index --check /dev/null support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-REVIEW.md`

Not applicable here:

- runtime tests
- typecheck
- lint
- app execution
- parent finalize evidence (commit / push) — that belongs to parent
  `TEN-UI-002` after parent reviewer `Claude2` approves

Reason: this is a docs-only support artifact with no code or canonical-truth
mutation, and it must not stand in for the parent task's own finalize evidence.
