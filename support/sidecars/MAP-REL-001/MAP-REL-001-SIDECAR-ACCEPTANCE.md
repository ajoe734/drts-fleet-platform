# MAP-REL-001 Acceptance Packet And Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `MAP-REL-001` - Map/geofence production release gates
**Sidecar Task:** `MAP-REL-001-SIDECAR-ACCEPTANCE`
**Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer Snapshot:** `Codex2` / `Gemini`
**Generated:** `2026-07-01T15:33:00Z`
**Snapshot Status:** support-only; this packet does not close the parent release,
does not claim production readiness, and does not mutate canonical truth.

## 1. Scope Boundary

This sidecar gives `MAP-REL-001` a reviewable acceptance frame and a dependency
map so its owner (`Codex2`) and reviewer (`Gemini`) can drive the release
closeout against machine truth rather than prose. It is a companion to the
existing gate-audit sidecar (`MAP-REL-001-GATE-EVIDENCE-TRACKER.md`, owned by
`Codex`); it does not duplicate that tracker's gate matrix, it maps the parent's
15 acceptance bullets to their live blocking tasks and required evidence.

In scope:

- Parent acceptance checklist expansion (15 bullets), each with required proof
  and current-state assessment.
- Formal + practical dependency map for the release gate.
- Downstream blocker map: which open task blocks which acceptance bullet / gate.
- Evidence anchors that already exist under `support/sidecars/MAP-REL-001/`.
- Honest visibility / risk notes where artifacts are not yet tracked on `dev`.

Out of scope:

- Marking any Gate A-E as `pass` on behalf of `MAP-REL-001`.
- Generating or editing the parent's `MAP-REL-001-FINAL-EVIDENCE.md`.
- Running the readiness / dispatch-integrity verifiers as release evidence.
- Editing canonical docs, runtime code, contracts, migrations, UI, or the
  parent-owned scripts (`verify-*`, `report-*`, `note-*`).
- Claiming production readiness, dev deploy, or E2E completion.

## 2. Current Machine Truth Snapshot

### 2.1 Sidecar task

`scripts/ai-status.sh show MAP-REL-001-SIDECAR-ACCEPTANCE` records:

- `status=in_progress` (owner working; will move to `review` on handoff)
- `owner=Claude`
- `reviewer=Codex2`
- `depends_on=[]`
- `artifacts=["support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md"]`
- `task_class=sidecar`, `helper_parent=MAP-REL-001`,
  `helper_kind=acceptance_packet`, `mutates_canonical=false`

Assessment: the sidecar is correctly support-only. The review should focus on
whether this packet accurately frames the parent acceptance checks and
dependencies, not on release closeout itself.

### 2.2 Parent task

`scripts/ai-status.sh show MAP-REL-001` records:

- `status=in_progress`
- `owner=Codex2`, `reviewer=Gemini`
- `depends_on=[MAP-QA-002, MAP-OBS-001]`
- `mutates_canonical=true`
- Key artifacts: `MAP-REL-001-FINAL-EVIDENCE.md` (target, not yet created),
  `MAP-FLEETS-EXECUTION-MANIFEST-20260701.json`,
  `scripts/verify-map-geofence-dispatch-integrity.mjs`,
  `scripts/report-map-geofence-readiness-blockers.mjs`,
  `scripts/note-map-geofence-blocker-handoffs.mjs`.
- 15 acceptance bullets (see Section 3).
- Integrity rules on the task record:
  - `final_evidence_integrity`: QA/OBS/REL final evidence must contain no
    template markers or placeholder tokens and must include concrete `branch@sha`
    plus artifact path/link evidence.
  - `manifest_evidence_closeout`: final evidence must close every FLEETS-MAP
    `productionEvidence` item with PASS and artifact path/link evidence.
  - `row_artifact_closeout`: every PASS row must include row-level artifact
    path/link evidence.

Assessment: the parent remains active and is not closable. Its own `next` field
(2026-07-01T10:41Z) records readiness `FAIL` and instructs: do not claim
production ready until QA/OBS/REL final evidence exists, Gate A-E tasks are
`done`, and the readiness verifier passes.

### 2.3 Latest verifier / blocker state (as recorded in support artifacts)

From `MAP-READINESS-BLOCKER-REPORT.md` (generated 2026-07-01T10:42:25Z):

- Readiness: **FAIL** (14 ok / 0 warnings / 34 failures).
- Dispatch integrity: **PASS** (43 ok / 15 warnings / 0 failures).
- Manifest: 10 tasks, 49 `productionEvidence` items; REL final evidence required
  before manifest closeout can be verified.
- 3 missing final-evidence files: `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`.
- 16 open owner tasks still block Gates A-E (9 `in_progress` + `review`; see
  Section 5.3).

This packet treats those numbers as the parent's own reported state, not as an
independent re-run. The reviewer should re-run the verifiers (Section 7 rerun
commands) before accepting parent closeout.

### 2.4 Artifact visibility note

The sibling release-support artifacts exist in the canonical working tree under
`support/sidecars/MAP-REL-001/` but are **not yet on `origin/dev`**
(`git ls-tree origin/dev support/sidecars/MAP-REL-001/` is empty). Some are
tracked-and-modified on the parent working branch, some are still untracked:

- Tracked+modified: `MAP-GAP-TO-TASK-COVERAGE-MATRIX.md`,
  `MAP-PRODUCTION-READINESS-VERIFIER.md`,
  `MAP-REL-001-FINAL-EVIDENCE-TEMPLATE.md`,
  `MAP-REL-001-GATE-EVIDENCE-TRACKER.md`.
- Untracked: `MAP-FINAL-EVIDENCE-READINESS-CHECKLIST-20260701.md`,
  `MAP-FLEETS-EXECUTION-MANIFEST-20260701.json`,
  `MAP-READINESS-BLOCKER-REPORT.md`.

Assessment: the parent has strong local support material, but release closeout
must land these (and the still-absent `MAP-REL-001-FINAL-EVIDENCE.md`) with
commit/push visibility before any `merged_to_dev` / `dev_deployed` claim.

## 3. Parent Acceptance Checklist

Each parent acceptance bullet is expanded to required proof + current sidecar
assessment. None are marked complete by this packet.

### AC-1 - `MAP-REL-001-FINAL-EVIDENCE.md populated with real artifacts`

- Proof: the final evidence file exists at
  `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`, populated from the
  template, with real command output and artifact links.
- Assessment: **not met** - file does not yet exist (blocker report lists it as
  missing). A template exists (`MAP-REL-001-FINAL-EVIDENCE-TEMPLATE.md`) but a
  template is not evidence.

### AC-2 - `Gate A through Gate E PASS`

- Proof: each gate marked `pass` (or explicit `external-gated` / `simulator-only`
  for Gate D mobile) with linked evidence.
- Assessment: **not met** - all five gates have open blocking tasks (Section 5.3
  and the gate-audit tracker). Do-not-claim rules forbid an "all gates pass"
  statement without final evidence.

### AC-3 - `rollout and rollback documented`

- Proof: flag rollout order + rollback path (provider fallback, PostGIS /
  service-area migration rollback, operator comms) documented and reviewed.
- Assessment: **partially staged** - a rollout/rollback checklist already exists
  in `MAP-REL-001-GATE-EVIDENCE-TRACKER.md` §7; the final evidence must reference
  it and confirm current flag values.

### AC-4 - `PostGIS/provider prerequisites confirmed`

- Proof: PostGIS availability, provider keys / allowed origins / CSP / mobile
  config, quota alerting, and mock-provider CI mode confirmed per environment.
- Assessment: **partially supported** - `MAP-INFRA-001` (done) and `MAP-PROD-000`
  (done) supply provider/config posture; final evidence must confirm target-env
  availability, not just design.

### AC-5 - `manifest productionEvidence items linked`

- Proof: every `productionEvidence` item across manifest tasks FLEETS-MAP-001..010
  is linked to final evidence or an explicit external-gated owner.
- Assessment: **not met** - manifest has 49 items; blocker report states REL
  evidence is required before closeout can be verified.

### AC-6 - `each FLEETS-MAP productionEvidence item closed with PASS and artifact path/link evidence`

- Proof: no `productionEvidence` item is left open, ambiguous, or link-less.
- Assessment: **not met** - depends on AC-5 and on the underlying QA/OBS closeout.

### AC-7 - `readiness blocker report generated and linked`

- Proof: latest `MAP-READINESS-BLOCKER-REPORT.md` regenerated and linked from
  final evidence.
- Assessment: **generated, not yet linked** - report exists (2026-07-01T10:42Z);
  must be refreshed at closeout time and linked from the final evidence file.

### AC-8 - `blocker handoff notes posted or skipped as duplicates`

- Proof: `scripts/note-map-geofence-blocker-handoffs.mjs` run results recorded
  (posted or skipped-duplicate) for open owner tasks.
- Assessment: **partially met** - parent `next` records last notifier run posted
  3 notes / skipped 13 duplicates; parent warns not to rerun until after the next
  status/report refresh to avoid overwriting review-gated states.

### AC-9 - `gap inventory closeout updated`

- Proof: every `MAP-GAP-*` in the gap inventory is closed by a task/evidence link
  or marked external-gated with owner.
- Assessment: **in progress** - `MAP-GAP-TO-TASK-COVERAGE-MATRIX.md` tracks this;
  closeout status must reach terminal for all gaps.

### AC-10 - `no template markers or placeholder tokens remain`

- Proof: final evidence contains no `TODO`, `TBD`, `<...>`, `FILL`, or template
  scaffolding tokens.
- Assessment: **pending** - cannot be satisfied until AC-1 file is authored; this
  is a common failure mode for evidence copied from a template.

### AC-11 - `concrete branch@sha and artifact path/link evidence included`

- Proof: final evidence names the exact tested `branch@sha` and every claim has a
  path or link.
- Assessment: **pending** - depends on AC-1.

### AC-12 - `each PASS row includes row-level artifact path/link evidence`

- Proof: no PASS row asserts a result without a row-level artifact reference.
- Assessment: **pending** - depends on AC-1; mirrors the parent `row_artifact_closeout` rule.

### AC-13 - `dispatch integrity verifier PASS`

- Proof: `node scripts/verify-map-geofence-dispatch-integrity.mjs --json` returns
  zero failures against the tested root.
- Assessment: **currently PASS** per blocker report (43 ok / 15 warnings / 0
  failures); warnings reflect open implementation closeout. Must be re-run at
  closeout time and the JSON snapshot embedded.

### AC-14 - `readiness verifier PASS`

- Proof: `node scripts/verify-map-geofence-production-readiness.mjs --json`
  returns pass against the tested root.
- Assessment: **currently FAIL** (14 ok / 34 failures). This is the single
  hardest gate; it cannot pass until AC-1/AC-2 and all open owner tasks resolve.

### AC-15 - `no unsupported production claim`

- Proof: no "production ready / all gates pass / deployed / E2E complete / driver
  navigation validated / provider outage safe" statement without backing evidence
  (see gate-audit tracker §8 do-not-claim list).
- Assessment: **enforced by this packet** - reviewer should reject any parent
  closeout language that outruns the verifier state.

## 4. Existing Release-Support Artifacts To Reuse

The parent already has a rich support set; the final evidence should reference,
not rebuild, these:

| Artifact | Role |
| --- | --- |
| `MAP-REL-001-GATE-EVIDENCE-TRACKER.md` | Gate A-E required-proof matrix, rollout/rollback checklist, do-not-claim rules. |
| `MAP-REL-001-FINAL-EVIDENCE-TEMPLATE.md` | Scaffold for the (still-absent) final evidence file. |
| `MAP-FINAL-EVIDENCE-READINESS-CHECKLIST-20260701.md` | Pre-closeout checklist consumed by QA/OBS/REL owners. |
| `MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` | Machine-readable task + `productionEvidence` manifest (10 tasks / 49 items). |
| `MAP-READINESS-BLOCKER-REPORT.md` | Latest blocker handoff snapshot; regenerate + link at closeout. |
| `MAP-GAP-TO-TASK-COVERAGE-MATRIX.md` | `MAP-GAP-*` -> task/evidence coverage for AC-9. |
| `MAP-PRODUCTION-READINESS-VERIFIER.md` | Human doc for the readiness verifier semantics. |

Reviewer note: none of these substitute for `MAP-REL-001-FINAL-EVIDENCE.md`, the
QA/OBS final-evidence files, or the verifier PASS.

## 5. Dependency Map

### 5.1 Formal dependencies

`MAP-REL-001.depends_on = [MAP-QA-002, MAP-OBS-001]`

| Dep | Status | Owner / Rev | Why it blocks REL |
| --- | --- | --- | --- |
| `MAP-QA-002` | `in_progress` | Codex2 / Gemini | Owns E2E-MAP-001..007 final evidence; blocks Gates A-E + E2E coverage. `MAP-QA-002-FINAL-EVIDENCE.md` missing. |
| `MAP-OBS-001` | `in_progress` | Gemini / Codex2 | Owns metrics/audit/alert observability evidence; blocks Gates A/B/E + Observability coverage. `MAP-OBS-001-FINAL-EVIDENCE.md` missing. |

### 5.2 Transitive upstream (feeders of the two formal deps)

- `MAP-QA-002` depends on: `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`,
  `MAP-FE-OPS-001` (done), `MAP-FE-ADM-001`, `MAP-MOB-DRV-001`, `MAP-QA-001`.
- `MAP-OBS-001` depends on: `MAP-BE-002`, `MAP-BE-005`, `MAP-BE-006` (done).
- Backend spine feeding most surfaces: `MAP-BE-001` (review) -> `MAP-BE-002`
  (in_progress) -> `MAP-BE-003` (in_progress); `MAP-BE-004`/`MAP-BE-006` done;
  `MAP-BE-005` (in_progress) feeds persistence/audit.

### 5.3 Live blocking-task -> gate map (from blocker report 2026-07-01T10:42Z)

| Task | Status | Owner / Rev | Blocks |
| --- | --- | --- | --- |
| `MAP-BE-002` | in_progress | Claude2 / Codex2 | Gate A |
| `MAP-BE-003` | in_progress | Codex2 / Gemini | Gate A, C, D |
| `MAP-BE-005` | in_progress | Claude2 / Codex2 | Gate A, C, D |
| `MAP-FE-ADM-001` | in_progress | Codex2 / Gemini | Gate B |
| `MAP-FE-TEN-001` | in_progress | Claude2 / Codex2 | Gate E |
| `MAP-OBS-001` | in_progress | Gemini / Codex2 | Gate A, B, E, Obs coverage |
| `MAP-QA-001` | in_progress | Gemini / Codex2 | Gate A, E |
| `MAP-QA-002` | in_progress | Codex2 / Gemini | E2E, Gate A-E |
| `MAP-UI-001` | in_progress | Claude2 / Codex2 | Gate A |
| `MAP-BE-001` | review | Codex / Claude2 | Gate A |
| `MAP-FE-CALL-001` | review | Codex / Claude2 | Gate A, E |
| `MAP-FE-CON-001` | review | Codex2 / Codex | Gate E |
| `MAP-MOB-DRV-001` | review | Codex2 / Claude2 | Gate D |
| `MAP-UI-002` | review | Codex2 / Claude2 | Gate B |
| `MAP-UI-002-HARDEN-001` | review | Codex2 / Claude2 | Gate B |
| `MAP-UI-002-INTEGRATE-001` | review | Codex / Claude2 | Gate B |

Note: this table is a point-in-time snapshot (blocker report 10:42Z). Several
sibling sidecars have since closed (`MAP-BE-003-SIDECAR-ACCEPTANCE`,
`MAP-FE-CON-001-SIDECAR-ACCEPTANCE`, `MAP-QA-001-SIDECAR-ACCEPTANCE`,
`MAP-OBS-001-SIDECAR-ACCEPTANCE` are `done`), but the parent owner tasks above
remain open. The reviewer should regenerate the report for the authoritative
closeout snapshot.

### 5.4 Release-plane practical dependencies

| Dep ID | Anchor | Why it matters |
| --- | --- | --- |
| D-R-1 | `scripts/ai-status.sh show MAP-REL-001` | Parent owner/reviewer/acceptance/gate source of truth. |
| D-R-2 | `scripts/ai-status.sh show MAP-QA-002` / `MAP-OBS-001` | Formal upstream evidence producers. |
| D-R-3 | `scripts/verify-map-geofence-production-readiness.mjs` | AC-14 gate; must return pass. |
| D-R-4 | `scripts/verify-map-geofence-dispatch-integrity.mjs` | AC-13 gate; currently pass with warnings. |
| D-R-5 | `scripts/report-map-geofence-readiness-blockers.mjs` | AC-7 report generator. |
| D-R-6 | `scripts/note-map-geofence-blocker-handoffs.mjs` | AC-8 handoff notifier; do not rerun blindly. |
| D-R-7 | `MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` | AC-5/AC-6 manifest closeout source. |
| D-R-8 | `MAP-REL-001-FINAL-EVIDENCE-TEMPLATE.md` | Scaffold for AC-1 (fill without leaving markers, AC-10). |

## 6. Downstream / Integration Map

`MAP-REL-001` is the terminal release gate for the
`map-geofence-production-20260630` phase. Nothing downstream should claim
map/geofence production readiness until this parent is `done` with
`INTEGRATION_STATUS` at least `merged_to_dev` and, for a live claim,
`dev_deployed` evidence.

| Consumer | Gate needed before it can claim ready |
| --- | --- |
| Callcenter dispatch | Gate A final evidence + readiness verifier pass. |
| Platform governance publish | Gate B integrated GeometryEditor + admin publish/audit evidence. |
| Ops console live map | Gate C ops map E2E + provider fallback. |
| Driver navigation | Gate D unit/simulator or documented external-gated verdict. |
| Any degraded/outage claim | Gate E cross-surface outage E2E + observability distinction. |

## 7. Reviewer Checklist (for Codex2)

Reviewer should verify:

- This packet changes only its own support artifact path
  (`support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md`).
- It does not mark any gate PASS, author final evidence, or edit canonical truth.
- It accurately reflects parent `MAP-REL-001` as `in_progress` and readiness as
  `FAIL` per the latest blocker report.
- It preserves all 15 parent acceptance bullets without narrowing them.
- The dependency map (Section 5) matches machine truth for the two formal deps
  and the open blocking tasks.
- It distinguishes existing support artifacts from the still-absent
  `MAP-REL-001-FINAL-EVIDENCE.md`.
- It does not rerun the blocker-handoff notifier or the parent-owned verifiers as
  a side effect.

Recommended parent-owner note (for `MAP-REL-001` owner `Codex2`):

```text
Use MAP-REL-001-SIDECAR-ACCEPTANCE.md as the acceptance-to-blocker map and
MAP-REL-001-GATE-EVIDENCE-TRACKER.md as the gate proof checklist. Do not close
MAP-REL-001 until: (1) MAP-QA-002 + MAP-OBS-001 final evidence exist, (2) all
Gate A-E owner tasks are done, (3) MAP-REL-001-FINAL-EVIDENCE.md is authored with
concrete branch@sha + row-level artifact links and no template markers, and
(4) verify-map-geofence-production-readiness.mjs returns pass. Regenerate the
readiness blocker report at closeout time and link it from the final evidence.
```

Rerun commands the reviewer / parent owner should use at closeout (parent-owned;
this sidecar does not run them as release evidence):

```bash
AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform node scripts/verify-map-geofence-dispatch-integrity.mjs --root /home/edna/workspace/drts-fleet-platform --json
AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform node scripts/verify-map-geofence-production-readiness.mjs --root /home/edna/workspace/drts-fleet-platform --json
AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform node scripts/report-map-geofence-readiness-blockers.mjs --root /home/edna/workspace/drts-fleet-platform
```

## 8. Sidecar Acceptance Checklist

### AC-S1 - `Create support artifacts only`

- [x] Output limited to
      `support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md`.
- [x] Content is acceptance framing, dependency mapping, evidence anchors, and
      reviewer guidance - no canonical implementation.

### AC-S2 - `Do not edit canonical truth`

- [x] This sidecar does not modify runtime, contracts, migrations, UI, canonical
      `docs/`, the parent-owned scripts, or the parent's final-evidence artifacts.
- [x] It treats current task state, verifier output, and support artifacts as
      evidence rather than rewriting them.

### AC-S3 - `Hand off the packet to the assigned reviewer`

- [x] On completion, machine truth will show `status=review`, `owner=Claude`,
      `reviewer=Codex2`.
- [x] The reviewer can evaluate this packet independently of parent
      `MAP-REL-001` closeout.
