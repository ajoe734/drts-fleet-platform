# PH1GC-PBK-001 Acceptance Packet & Dependency Map

Last revised: `2026-05-22`
Sidecar kind: `acceptance_packet`
Parent task: `PH1GC-PBK-001`
Sidecar owner: `Codex`
Sidecar reviewer: `Codex2`

This packet is support-only. It translates the current machine-truth row for
`PH1GC-PBK-001` into a reviewer-facing acceptance checklist, dependency map,
and repo-baseline note set. It does not modify canonical truth, does not close
the parent task, and does not claim that missing parent artifacts already exist
on `origin/dev`.

## 1. Scope Boundary

In scope:

- map the parent task's recorded acceptance bullets into concrete review gates
- identify the formal blocker and the practical peer dependencies
- record what is already present on `HEAD` / `origin/dev`
- record what exists only on accepted owner branches and therefore is not yet
  dev-visible evidence
- hand the packet back to `Codex2` without changing canonical truth

Out of scope:

- creating `support/sidecars/PBK-PILOT-001/`
- authoring `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
- authoring `docs/04-uat/partner-booking-pilot-uat-20260519.md`
- changing release-gate rows, workflow IDs, or any L1/L2/L1.5 source of truth
- claiming `WF-PBK-001` is already `PASS (pilot evidence)`

## 2. Machine-Truth Snapshot

### 2.1 Parent row - `PH1GC-PBK-001`

From canonical `ai-status.json`:

- title=`Phase 1 gap closure — partner booking pilot cutover proof`
- owner=`Codex2`
- reviewer=`Codex`
- status=`pending`
- depends_on=`PH1GC-PARTNER-001`
- artifacts=
  - `support/sidecars/PBK-PILOT-001/`
  - `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
- acceptance=
  - `support/sidecars/PBK-PILOT-001/ on origin/dev contains all 12 directive section F fields and the 8-step workflow proof.`
  - `Cutover runbook landed at canonical path declared by PH1GC-BPL-002.`
  - `Rollback retention >= 14 calendar days documented and demonstrably tested.`
  - `Gate-read update for WF-PBK-001 = PASS (pilot evidence).`
  - `Closeout report follows directive section 7 format.`
- planning_ref=
  `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`

### 2.2 Sidecar row - `PH1GC-PBK-001-SIDECAR-ACCEPTANCE`

From canonical `ai-status.json`:

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- task_class=`sidecar`
- helper_parent=`PH1GC-PBK-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=
  `support/sidecars/PH1GC-PBK-001/PH1GC-PBK-001-SIDECAR-ACCEPTANCE.md`

### 2.3 Recorded path drift in machine truth

The parent row points at two planning/status-truth docs that are not present on
the current `HEAD` / `origin/dev` snapshot:

- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
- `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`

Reviewer implication:

- treat those paths as machine-truth intent only, not as already-landed proof
- anchor the parent review to the available directive and runbook artifacts
  listed below until the missing canonical docs actually land

## 3. Current Repo Baseline

At packet refresh time, this worktree matches `origin/dev` at `bf176edd`.

### 3.1 Present on `origin/dev`

- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
  exists from `PBK-CUTOVER-001` and is the current normative pilot procedure
  for `WF-PBK-001`.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` currently
  references `WF-PBK-001` through the pilot cutover runbook and keeps the gate
  conservative.
- `tests/e2e/E2E-008-partner-booking-cutover.sh` exists from
  `TST-E2E-008-PBK-CUTOVER` and defines five explicit pass criteria:
  inactive bootstrap rejection, reactivation + eligibility success,
  booking persistence, finance evidence, and final active restoration.
- `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`
  records the current `WF-PBK-001` read as `HOLD` and names the next unlock as
  a named pilot partner entry plus named `cutoverOwner` / `rollbackOwner` and
  rollback-ready evidence.
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
  section `3.4` names the required partner-booking cutover deliverables,
  workflow chain, and the rule that live cutover granularity is per
  `entrySlug`, not the Wave 5 `[tenantSlug]` demo route.
- `docs/00-context/phase1-v3-resolution-20260519.md` formalizes that shipped
  numbering stays in place: `E2E-008` remains the partner-booking cutover
  script, and `WF-PRT-001` must be renamed to `WF-PARTNER-001`.

### 3.2 Missing on `origin/dev`

These paths are not present on the current `HEAD` snapshot:

- `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
- `docs/04-uat/partner-booking-pilot-uat-20260519.md`
- `support/sidecars/PBK-PILOT-001/`
- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`

Reviewer implication:

- parent acceptance bullet 1 is not yet satisfiable on the current dev
  baseline because `support/sidecars/PBK-PILOT-001/` does not exist
- parent acceptance bullet 2 is not yet satisfiable on the current dev
  baseline because the named live-cutover-plan path is absent
- the formal blocker `PH1GC-PARTNER-001` is still materially open because its
  spec path is absent

### 3.3 Accepted owner-branch artifacts that are not yet dev-visible

These pushed branches contain artifacts that are useful review context but do
not yet satisfy a parent requirement that explicitly says `on origin/dev`:

| Artifact | Branch / commit | Current value to the parent task |
| --- | --- | --- |
| `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md` | `origin/codex/pbk-runbook-001` @ `41f74331` | Expands the partner-entry cutover record into 14 concrete fields and formalizes the pilot-to-live wrapper for `WF-PBK-001`. |
| `docs/04-uat/partner-booking-pilot-uat-20260519.md` | `origin/codex2/pbk-uat-001` @ `b148c726` | Supplies a concrete UAT matrix keyed to the five `PBK-UI-004` negative paths and the `E2E-008` proof. |

Reviewer rule:

- owner-branch artifacts may be cited as current implementation context
- they must not be treated as merged canonical proof until the paths are
  visible on `origin/dev`

## 4. Dependency Map

### 4.1 Formal blocker - `PH1GC-PARTNER-001`

From canonical `ai-status.json`:

- status=`pending`
- depends_on=`PH1GC-MATRIX-001`
- artifact=
  `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`

Why it matters:

- `PH1GC-PBK-001` cannot claim partner-booking pilot proof without the partner
  eligibility / airport-transfer spec that formalizes `entrySlug`, eligibility
  mode, sandbox evidence expectations, booking linkage, and negative paths.
- `docs/00-context/phase1-v3-resolution-20260519.md` says `WF-PRT-001` must be
  renamed to `WF-PARTNER-001` with no alias, so the parent proof should use the
  resolved workflow-family ID, not the legacy `WF-PRT-001` label.

### 4.2 Practical peer dependency - `PH1GC-BPL-002`

From canonical `ai-status.json`:

- status=`pending`
- artifact=`docs/03-runbooks/phase1-release-truth-sync-20260519.md`
- acceptance includes the source-of-truth rule for E2E numbering, workflow IDs,
  matrix mapping, and sidecar mapping

Why it matters:

- the parent acceptance bullet explicitly says the cutover runbook must land at
  the canonical path declared by `PH1GC-BPL-002`
- until that release-truth-sync runbook lands on `origin/dev`, the parent
  should not silently claim that the missing live-cutover-plan path is already
  canonically settled

### 4.3 Existing upstream evidence already available

| Upstream task | Status | Evidence currently available on `origin/dev` |
| --- | --- | --- |
| `PBK-CUTOVER-001` | `done` | `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` plus the `WF-PBK-001` matrix anchor |
| `TST-E2E-008-PBK-CUTOVER` | `done` | `tests/e2e/E2E-008-partner-booking-cutover.sh`, `tests/e2e/run-e2e.sh`, `tests/e2e/README.md`, `docs/04-uat/fbp-014a-e2e-matrix.md` |
| `PBK-RUNBOOK-001` | accepted owner branch only | live-cutover-plan wrapper exists on `origin/codex/pbk-runbook-001`, not on current dev |
| `PBK-UAT-001` | accepted owner branch only | partner-booking pilot UAT exists on `origin/codex2/pbk-uat-001`, not on current dev |

### 4.4 Practical downstream consumers

- `support/sidecars/PBK-PILOT-001/` will be the concrete evidence pack that
  consumes the parent task once implemented.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` consumes the
  parent outcome when `WF-PBK-001` eventually moves from `HOLD` to
  `PASS (pilot evidence)`.
- `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`
  consumes the same gate read and must remain aligned with the parent closeout.

## 5. Parent Acceptance Checklist (`PH1GC-PBK-001`)

Reviewer should use the following gates when the parent task is later handed
off for review.

### A. `PBK-PILOT-001` evidence pack exists on `origin/dev`

- [ ] `support/sidecars/PBK-PILOT-001/` exists on `origin/dev`.
- [ ] The pack names at least one concrete `entrySlug` and does not treat the
  Wave 5 `[tenantSlug]` demo route as the production cutover contract.
- [ ] The pack includes the partner-entry cutover record fields that are
  currently expanded in the accepted live-cutover-plan branch artifact:
  `entrySlug`, `partnerCode`, `programId`, `current live owner`,
  `target surface`, `cutoverOwner`, `rollbackOwner`, `rollback route`,
  `support hotline`, `brand metadata`, `eligibility mode`,
  `billing/reporting owner`, `monitoring dashboard`, and
  `rollback retention window`.
- [ ] If the parent still describes the requirement as "12 directive section F
  fields", the closeout explicitly names which fields were merged together
  rather than silently dropping evidence categories.

### B. Workflow proof is concrete, not generic

- [ ] The parent evidence maps the directive section `3.4.4` workflow path:
  `landing -> eligibility verification -> eligible/ineligible/manual_review -> booking create -> confirmation -> trip tracking -> receipt/statement -> partner report -> rollback path verified`.
- [ ] `tests/e2e/E2E-008-partner-booking-cutover.sh` is used as the
  authoritative shipped proof path unless and until a later canonical doc says
  otherwise.
- [ ] The parent closeout does not rename shipped E2E files or claim a new
  numbering scheme that conflicts with
  `docs/00-context/phase1-v3-resolution-20260519.md`.

### C. Canonical live-cutover-plan path is actually landed

- [ ] `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md` is
  visible on `origin/dev`.
- [ ] The parent does not satisfy this bullet by citing only
  `origin/codex/pbk-runbook-001@41f74331`; the file must be merged or otherwise
  become dev-visible first.
- [ ] The runbook preserves the non-claim that repo-local UI completion does
  not by itself retire the external `tenant-commute-hub` live owner.

### D. Rollback retention is documented and demonstrated

- [ ] The parent evidence documents a rollback retention window of at least
  `14` calendar days.
- [ ] The parent evidence shows rollback-safe restoration, using the current
  `E2E-008` pass criteria as the minimum baseline.
- [ ] The parent evidence names both `cutoverOwner` and `rollbackOwner`, plus
  the concrete rollback route/host for the selected partner entry.

### E. `WF-PBK-001` gate uplift is justified

- [ ] The current `WF-PBK-001` baseline (`HOLD`) is replaced only after a real
  pilot window exists for a named partner entry.
- [ ] The parent evidence shows named pilot ownership, pilot timestamp/cohort,
  rollback-ready observation evidence, and the continued availability of the
  rollback target during retention.
- [ ] The parent does not over-claim closure of `WF-FWD-001`, `WF-COM-001`, or
  `WF-FIN-001`.

### F. Closeout wording is machine-truth-safe

- [ ] The closeout report follows directive section `7` format.
- [ ] Commit / push / reviewer handoff evidence is recorded through
  `scripts/ai-status.sh` or `python3 scripts/ai_status.py`.
- [ ] Any statement about "pilot evidence" is limited to the named partner
  entry and does not broaden into tenant-wide or production-wide closure.

## 6. Reviewer Hotspots

1. Do not approve the parent if `PH1GC-PARTNER-001` remains only implicit. The
   formal blocker is a real dependency, not a documentation nicety.
2. Do not accept owner-branch-only artifacts as if they were already on
   `origin/dev`. Both the live-cutover-plan doc and the partner-booking pilot
   UAT doc currently fall into that category.
3. Do not let the parent bypass the current `WF-PBK-001 = HOLD` baseline. The
   dashboard explicitly says the next unlock is a named pilot entry plus named
   owners and rollback evidence.
4. Do not let the parent cite the Wave 5 `[tenantSlug]` demo route as the live
   cutover contract. Directive section `3.4.5` forbids that.
5. Keep the numbering and workflow-ID resolutions explicit:
   `E2E-008` stays the shipped partner-booking cutover proof, and the resolved
   workflow-family name is `WF-PARTNER-001`, not `WF-PRT-001`.

## 7. Sidecar Handoff Template

Owner handoff:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff PH1GC-PBK-001-SIDECAR-ACCEPTANCE Codex2 "Acceptance packet ready at support/sidecars/PH1GC-PBK-001/PH1GC-PBK-001-SIDECAR-ACCEPTANCE.md. It captures the parent machine-truth row, formal blocker PH1GC-PARTNER-001, practical peer dependency PH1GC-BPL-002, current origin/dev baseline, the missing live-cutover-plan / pilot-UAT / PBK-PILOT-001 paths on dev, and reviewer gates for WF-PBK-001 pilot-evidence closeout."
```

Reviewer approve:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve PH1GC-PBK-001-SIDECAR-ACCEPTANCE "Packet is support-only, correctly maps PH1GC-PBK-001 acceptance into reviewer gates, preserves PH1GC-PARTNER-001 as the formal blocker, keeps owner-branch-only PBK runbook/UAT artifacts separate from origin/dev evidence, and documents the current WF-PBK-001 HOLD baseline plus the 14-day rollback-retention requirement."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen PH1GC-PBK-001-SIDECAR-ACCEPTANCE "Packet needs revision: [specify missing machine-truth anchor / dependency drift / dev-vs-owner-branch confusion / acceptance-gate mismatch]."
```
