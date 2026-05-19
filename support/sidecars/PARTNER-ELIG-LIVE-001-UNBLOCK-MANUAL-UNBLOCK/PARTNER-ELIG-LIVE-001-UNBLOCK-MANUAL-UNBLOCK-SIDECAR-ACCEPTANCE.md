# PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK Acceptance Packet

This packet is the support-only acceptance companion for
`PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`. It does not change canonical
truth, runtime behavior, or the parent helper diagnosis. Live lifecycle truth
remains authoritative in `AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform`
via `ai-status.json`; this document only assembles the reviewer-facing checklist
and dependency map.

## 1. Scope Boundary

In scope:

- summarize the acceptance bar for
  `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
- map the dependency chain from `PRT-SPEC-001` through the unblock helper to
  the still-blocked grandparent `PARTNER-ELIG-LIVE-001`
- inventory the exact commits, artifacts, and blocker records the reviewer
  should inspect

Out of scope:

- editing `ai-status.json`, `current-work.md`, or any canonical L1/L2 file
- changing the parent helper artifact at
  `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`
- claiming live issuer activation, live sandbox proof, or that
  `manual_review` equals issuer approval
- modifying `EXT-001`, the release-gate matrix, or the master closeout
  checklist

## 2. Machine-Truth Anchors

The canonical source for these anchors is
`/home/edna/workspace/drts-fleet-platform/ai-status.json`, not the local
worktree copy.

### 2.1 Sidecar task row

At authoring time, canonical machine truth records:

- id = `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE`
- owner = `Codex`
- reviewer = `Codex2`
- status = `in_progress`
- task_class = `sidecar`
- helper_parent = `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
- helper_kind = `acceptance_packet`
- mutates_canonical = `false`
- depends_on = `PRT-SPEC-001`
- artifact =
  `support/sidecars/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE.md`

### 2.2 Parent helper row

Canonical machine truth records the parent helper as complete:

- id = `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
- owner = `Codex2`
- reviewer = `Codex`
- status = `done`
- artifact =
  `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`
- closeout commit = `8d5c47c`
- closeout subject =
  `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK: finalize closeout evidence`
- push ref = `origin/codex2/partner-elig-live-001-unblock-manual-unblock`
- resolved parent status = `blocked`
- resolved parent next = remain blocked on `EXT-001-BLK-001..006` after
  `PRT-SPEC-001` completion

The reviewed-content anchor for the parent helper remains:

- anchor commit = `052de19`
- anchor subject =
  `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK: document remaining live issuer blocker`

### 2.3 Upstream dependency row

`PRT-SPEC-001` is already satisfied in canonical machine truth:

- owner = `Codex2`
- reviewer = `Claude2`
- status = `done`
- artifact =
  `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
- reviewed-content anchor = `0b4edb4`
- closeout commit = `bea9ffe`
- push ref = `origin/codex2/prt-spec-001`

### 2.4 Grandparent row

`PARTNER-ELIG-LIVE-001` remains blocked for external reasons only:

- owner = `Codex`
- reviewer = `Claude2`
- status = `blocked`
- depends_on = `PRT-SPEC-001`
- artifact = `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
- evidence anchor = `2628fc7`
- push ref = `origin/codex/partner-elig-live-001`
- current next = wait for `EXT-001-BLK-001..006`, then attach redacted issuer
  evidence under the sidecar path and rerun live issuer proof

### 2.5 External gate row

`EXT-001` itself is closed as a gate-definition packet, but its blocker records
still govern live issuer activation:

- artifact = `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
- open external inputs =
  `EXT-001-BLK-001` through `EXT-001-BLK-006`

### 2.6 History-repair note

Canonical machine truth also carries
`PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR` in `review_approved`. Its `next`
field records that earlier isolated worktrees preserved stale
`ai-status.json/current-work.md` snapshots and cites the additive repair chain
`052de19`, `61b7960`, `bea9ffe`, `8d5c47c`, `2628fc7`, and `e4dcbb1`.

Reviewer implication:

- prefer `AI_STATUS_ROOT` machine truth plus commit-anchored `git show`
  evidence
- do not re-derive acceptance from the stale local worktree copies of
  `ai-status.json` or `current-work.md`

## 3. Acceptance Mapping For The Parent Helper

The parent helper has four acceptance items in canonical machine truth.

### AC-1. Diagnose why the dependency-ready parent remains blocked

- [x] The parent helper artifact diagnoses the two-stage blocker sequence:
  `PRT-SPEC-001` was still open when the helper was first written, and after
  that closeout the remaining hold is `EXT-001-BLK-001..006`.
- [x] Evidence anchor: `git show 052de19:support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`
  sections `Diagnosis` and `Concrete Next Step For Parent`.
- [x] Cross-check: canonical `ai-status.json` now shows `PRT-SPEC-001=done`, so
  the diagnosis has aged correctly from "dependency still open" to
  "external-only hold remains."

### AC-2. Make only the task-scoped change needed to document the remaining blocker

- [x] The reviewed-content anchor `052de19` changes only the unblock helper
  note.
- [x] Evidence anchor: `git show --stat 052de19` reports one file changed,
  `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`.
- [x] No runtime file, canonical truth file, or contract file was changed by
  the parent helper anchor.

### AC-3. Produce task-scoped commit/push evidence

- [x] The parent helper has both a reviewed-content anchor and a closeout
  commit.

| Role | Commit | Subject | Push ref |
| --- | --- | --- | --- |
| reviewed-content anchor | `052de19` | `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK: document remaining live issuer blocker` | `origin/codex2/partner-elig-live-001-unblock-manual-unblock` |
| owner closeout | `8d5c47c` | `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK: finalize closeout evidence` | `origin/codex2/partner-elig-live-001-unblock-manual-unblock` |

- [x] Canonical machine truth records the push evidence and the resolved parent
  status/next fields against the closeout commit.

### AC-4. Update the parent task with the concrete unblocked next step

- [x] Canonical `PARTNER-ELIG-LIVE-001.next` now explicitly says the task
  remains on hold until `EXT-001-BLK-001..006` are satisfied.
- [x] Canonical `PARTNER-ELIG-LIVE-001.next` also points to the reserved grandparent
  evidence sidecar at commit `2628fc7`.
- [x] The helper's diagnosis and the grandparent's current `next` field now
  agree: repo/spec work is complete; only external issuer inputs remain.

## 4. Dependency Map

```text
PRT-SPEC-001
  status: done
  commits: 0b4edb4 (reviewed content), bea9ffe (closeout)
  artifact: docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md
    |
    v
PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK
  status: done
  commits: 052de19 (reviewed content), 8d5c47c (closeout)
  artifact: support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md
    |
    v
PARTNER-ELIG-LIVE-001
  status: blocked
  commit: 2628fc7 (hold-state evidence anchor)
  artifact: support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md
    |
    v
EXT-001 external gate
  blocker family: EXT-001-BLK-001..006
  artifact: support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md
```

The six remaining external blockers are:

1. `EXT-001-BLK-001` issuer / bank API contract authority
2. `EXT-001-BLK-002` sandbox credentials and network allowlist
3. `EXT-001-BLK-003` allowed eligible / ineligible / timeout fixture matrix
4. `EXT-001-BLK-004` timeout and retry behavior confirmation
5. `EXT-001-BLK-005` manual-review fallback business sign-off
6. `EXT-001-BLK-006` sensitive-data handling and retention approval

## 5. Evidence Inventory

Reviewer-ready anchors:

- canonical machine truth:
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- parent helper artifact:
  `git show 052de19:support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`
- parent helper closeout record:
  `git show --stat 8d5c47c`
- dependency spec:
  `git show bea9ffe:docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
- grandparent hold-state evidence:
  `git show 2628fc7:support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
- external gate:
  `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
- process rules:
  `AI_COLLABORATION_GUIDE.md`

Practical note:

- some dependency artifacts above may not exist in this isolated worktree
  snapshot even though canonical machine truth already references them
- when that happens, inspect the recorded commit objects with `git show`
  instead of treating the local worktree absence as a blocker

## 6. Reviewer Checklist For `Codex2`

- [ ] Confirm this packet remains support-only and only edits
  `support/sidecars/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK/`.
- [ ] Re-read canonical `ai-status.json` from `AI_STATUS_ROOT`, not the local
  worktree copy.
- [ ] Verify AC-1 through AC-4 against `052de19`, `8d5c47c`, `bea9ffe`, and
  `2628fc7`.
- [ ] Verify the dependency map still ends in `EXT-001-BLK-001..006` and does
  not overclaim live issuer readiness.
- [ ] Reject the packet if it attempts to reopen the parent helper diagnosis or
  rewrite canonical task rows inside this support artifact.

Suggested approval language:

`support-only acceptance packet is aligned to canonical machine truth; parent helper acceptance maps cleanly to 052de19 + 8d5c47c, upstream dependency PRT-SPEC-001 is done at bea9ffe, and the grandparent remains correctly external-gated on EXT-001-BLK-001..006 with hold-state evidence anchored at 2628fc7.`

## 7. Verification Performed For This Packet

This sidecar used source-anchor verification only:

- read `AI_COLLABORATION_GUIDE.md`
- read canonical `ai-status.json` from `AI_STATUS_ROOT`
- read the parent helper anchor content at `052de19`
- confirmed commit/stat existence for `052de19`, `8d5c47c`, `0b4edb4`,
  `bea9ffe`, `2628fc7`, and `6917284`
- read `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`

No runtime test, live issuer probe, or canonical-truth edit was performed for
this packet.

## 8. Handoff Notes

Owner handoff message should mention:

- this packet now exists at the canonical artifact path
- the acceptance map is based on canonical machine truth, not stale worktree
  snapshots
- reviewer should inspect `052de19`, `8d5c47c`, `bea9ffe`, `2628fc7`, and
  `EXT-001-BLK-001..006`

If review passes, the sidecar should be closed as support-only work. It must
not be used to silently mutate the completed parent helper or the blocked
grandparent row.
