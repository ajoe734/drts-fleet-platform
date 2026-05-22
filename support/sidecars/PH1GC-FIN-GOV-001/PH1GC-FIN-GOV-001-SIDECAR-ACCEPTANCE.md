# PH1GC-FIN-GOV-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `PH1GC-FIN-GOV-001` - governance-aware billing/reporting spec + UAT
**Parent Owner / Reviewer (at refresh):** `Codex` / `Claude2`
**Sidecar Owner / Reviewer:** `Claude2` / `Codex`
**Generated:** `2026-05-22` (UTC)
**Status:** support-only packet refreshed from the canonical machine-truth
snapshot at `2026-05-22T19:38:40Z`; authoritative lifecycle state remains in
`ai-status.json`, and the parent task is `todo` at this snapshot.

This packet is a support artifact only. It does not modify canonical truth,
runtime behavior, or the parent task record. It restates the parent's
acceptance bar, maps upstream truth anchors and downstream dependencies, and
records the current `origin/dev` visibility for each acceptance item so that
the parent owner and reviewer can resume the parent without re-deriving the
context.

This file is intentionally a static reviewer packet, not a live task-status
mirror. If a later handoff, reopen, or approval changes lifecycle state,
`ai-status.json` wins.

---

## 1. Scope Boundary

In scope:

- restate the parent task's acceptance bar as a reviewer checklist
- record current `origin/dev` visibility for each acceptance artifact
- map the upstream canonical anchors and downstream PH1GC dependencies
- enumerate the 13 verification-body fields directly from the now-`origin/dev`
  spec §3, so reviewers can use this packet as a field-by-field cross-check
- record the prior unblock-history-repair chain that brought the parent out of
  blocked status

Out of scope:

- editing L1/L2 canonical truth, `ai-status.json`, or any runtime / contract /
  governance implementation
- editing the parent spec, parent UAT, or any E2E script
- declaring the parent task complete on behalf of the parent owner
- upgrading `WF-FIN-GOV-001` from static evidence to live staging evidence
- rewriting the existing `WF-FIN-001` baseline semantics

---

## 2. Machine Truth Snapshot

Snapshot source: canonical
`/home/edna/workspace/drts-fleet-platform/ai-status.json` at
`2026-05-22T19:38:40Z`. This section records the state observed while writing
the packet; later lifecycle transitions may advance independently in machine
truth.

### Sidecar task

`ai-status.json -> PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE`

- owner = `Claude2`
- reviewer = `Codex`
- status_at_snapshot = `in_progress`
- helper_parent = `PH1GC-FIN-GOV-001`
- helper_kind = `acceptance_packet`
- mutates_canonical = `false`
- artifact = `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE.md`
- auto_generated = `true` (created by `supervisor-underutilization`)
- recent lifecycle note: an earlier sidecar packet was finalized at
  `2026-05-22T03:32:32Z` by `Codex` on `origin/codex/ph1gc-fin-gov-001-sidecar-acceptance`
  (commit `63fa3545`). That packet's parent-state assumptions are now stale; this
  refresh re-anchors against the current snapshot.

### Parent task

`ai-status.json -> PH1GC-FIN-GOV-001`

- owner = `Codex`
- reviewer = `Claude2`
- status_at_snapshot = `todo`
- last_update = `2026-05-22T12:40:24Z`
- artifacts (recorded in machine truth):
  - `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  - `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- machine-truth acceptance items:
  - spec visible on `origin/dev`
  - UAT visible on `origin/dev`
  - UAT covers all 13 directive-`§H` verification-body fields
  - `PH1GC-E2E-010` script asserts every field in the verification body
  - `PH1GC-MATRIX-002` carries gate-read update for `WF-FIN-GOV-001`
  - closeout report follows directive `§7` format
- recent `next` field references resumption after the
  `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR` helper closed and a documented
  cherry-pick path was published.

### Related unblock helper (already closed)

`PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR` — `done` per machine truth, with a
documented cherry-pick path onto the parent delivery branch. The helper is no
longer a live blocker; this packet only references it to explain how the parent
moved out of `blocked` into `todo`.

### Current worktree snapshot

This isolated worker tree is on
`claude2/ph1gc-fin-gov-001-sidecar-acceptance` from `dev`. In this snapshot
the parent artifact visibility is materially different from the prior packet:

- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  is **present** on `origin/dev` (blob `a977200d`); it formally defines the
  governance-aware verification body and §3.7 legacy-unmapped fallback.
- `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
  is **present** on `origin/dev` (blob `31999fc2`); it codifies
  `UAT-FIN-GOV-001` … `UAT-FIN-GOV-013` and the gate-read uplift conditions.
- `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
  is **absent** on `origin/dev`; the new `PH1GC-E2E-010` task is still
  `backlog` (owner `Codex`, reviewer `Codex2`).
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
  is **present** on `origin/dev` and still records a **static / provisional**
  evidence posture with a `2026-05-19` live-staging blocker. The new spec/UAT
  pair does not by itself upgrade that posture.
- `tests/e2e/E2E-005-tenant-governance.sh`
  is present on `origin/dev` and is the closest existing executable anchor for
  the tenant-governance prerequisite (`WF-TGV-001`), but it is **not** the
  governance-aware billing/reporting E2E required by the parent.

Implication: the first three parent acceptance items are now satisfied at
`origin/dev` (spec visible, UAT visible, UAT covers the verification body);
the remaining three depend on `PH1GC-E2E-010`, `PH1GC-MATRIX-002`, and the
closeout report.

---

## 3. Dependency Map

### A. Canonical decision and acceptance anchors

| Anchor | Why it matters |
| --- | --- |
| `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` `§3.7`, `§H` | Defines the governance-aware billing/reporting flow, the required artifacts, and the verification body the parent must satisfy. |
| `docs/00-context/phase1-v3-resolution-20260519.md` `Q1` | Remaps the new governance billing shell to `E2E-010` (not the directive's older `E2E-009` text). Parent acceptance must align to that numbering. |
| `docs/00-context/phase1-v3-resolution-20260519.md` `Q3` | Keeps `WF-FIN-001` baseline separate from `WF-FIN-GOV-001` enrichment; `WF-FIN-GOV-001` depends on `WF-TGV-001 + WF-FIN-001`. |
| `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` | Parent `planning_ref`; defines the gap-closure framing under which `PH1GC-FIN-GOV-001` was scheduled. |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` `§3`, `§3.7`, `§6` | Authoritative source for the 13 verification-body fields, the legacy fallback rule, and the E2E/UAT obligation. |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` `§2`–`§4` | Authoritative UAT scenarios mapped to the verification body and the gate-read uplift conditions. |
| `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` | Conservative evidence read; finance-governance seams exist, reviewer-readable live staging proof still blocked. |

### B. Reusable earlier-wave artifacts (parent dependencies that are `done` in machine truth)

| Task | Status | Branch / Commit | What can be reused |
| --- | --- | --- | --- |
| `FIN-GOV-SPEC-001` | `done` | `origin/codex2/fin-gov-spec-001` @ `8b0e8fd` | Earlier draft of the governance-aware spec; current `origin/dev` spec is the authoritative version. |
| `FIN-GOV-UAT-001` | `done` | `origin/codex2/fin-gov-uat-001` @ `67df6f2` | Earlier draft of the UAT with conservative live-evidence posture. |
| `WF-FIN-GOV-001-E2E` | `done` | `origin/claude2/wf-fin-gov-001-e2e` @ `ddc02c4` | Reusable `E2E-010` shell semantics: governed booking → invoice line binding, audited invoice generation, cross-tenant denial probe. Best seed for `PH1GC-E2E-010`. |
| `WF-FIN-GOV-001-MATRIX` | `done` | `origin/codex2/wf-fin-gov-001-matrix` @ `24c24a7` | Additive matrix-row framing that keeps `WF-FIN-001` unchanged. |
| `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR` | `done` | helper branch closed | Documented cherry-pick path that allowed the parent to move out of `blocked`. |

Important boundary:

- this packet treats those branches as **reusable source material**. The
  authoritative current text for the parent acceptance lives on `origin/dev`
  (spec + UAT) or is still to be authored (`E2E-010`).

### C. Formal downstream consumers in the current PH1GC wave

| Task | Machine-truth status | Owner / Reviewer | Relationship |
| --- | --- | --- | --- |
| `PH1GC-E2E-010` | `backlog` | `Codex` / `Codex2` | Hard downstream consumer. The parent acceptance requires the `E2E-010` script to assert every verification-body field. Parent cannot be `done` until this is delivered. |
| `PH1GC-MATRIX-002` | `done` | `Codex2` / `Codex` | Previously the indirect consumer through the matrix reconciliation; already closed in machine truth. The matrix row gate-read uplift to `PASS (live staging evidence)` still depends on a real `E2E-010` run plus a closeout report. |
| `PH1GC-MATRIX-001` | `done` | `Codex2` / `Codex` | Earlier release-gate matrix reconciliation that maintained the `WF-FIN-001` vs `WF-FIN-GOV-001` split. |
| `PH1GC-E2E-011` | `done` | `Codex2` / `Codex` | Sibling E2E task; not a direct dependency, but reviewers should not confuse `E2E-011` (closed) with `E2E-010` (open). |

### D. No formal upstream machine dependency, but real semantic prerequisites still exist

The parent task records `depends_on = []`, but reviewer-safe finalization
still requires these truths preserved:

- `WF-FIN-001` remains the baseline billing/reporting row and is not renamed
  or absorbed.
- `WF-FIN-GOV-001` is additive governance enrichment only; depends on
  `WF-TGV-001 + WF-FIN-001`.
- live-staging claims for `WF-FIN-GOV-001` must remain blocked until new
  reviewer-readable staging evidence exists; the `FIN-GOV-001-EVIDENCE-PACK`
  blocker is still load-bearing.
- `E2E-010` numbering must follow the accepted `Q1` remap (not the
  directive's older `E2E-009` text).

---

## 4. Parent Acceptance Checklist

### A. Acceptance items recorded in `ai-status.json`

- [x] `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
      is visible on `origin/dev`.
  Current snapshot: present on `origin/dev` (blob `a977200d`).
- [x] `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
      is visible on `origin/dev`.
  Current snapshot: present on `origin/dev` (blob `31999fc2`).
- [x] UAT covers all 13 directive-`§H` verification-body fields.
  Current snapshot: §B below cross-checks the UAT scenario set against the
  spec §3 field list and finds full coverage. Reviewer is the parent reviewer
  (`Claude2`); this sidecar packet does **not** substitute for that review.
- [ ] `PH1GC-E2E-010` script asserts every field listed in the verification
      body.
  Current snapshot: `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
  is absent on `origin/dev`; `PH1GC-E2E-010` is still `backlog`. Best seed is
  `origin/claude2/wf-fin-gov-001-e2e @ ddc02c4`.
- [ ] Gate-read update for `WF-FIN-GOV-001 = PASS (live staging evidence)`
      drives matrix change.
  Current snapshot: `PH1GC-MATRIX-002` is `done` as a structural row update,
  but the live-staging uplift requires (i) a successful `E2E-010` run on
  staging with deterministic seed, (ii) all 13 UAT scenarios passing on
  staging, and (iii) a closeout report per directive `§7`. The
  `FIN-GOV-001-EVIDENCE-PACK` blocker remains the binding gate.
- [ ] Closeout report follows directive `§7` format.
  Current snapshot: pending parent closeout work by the parent owner.

### B. Verification-body cross-check against `origin/dev` spec §3

Authoritative field set from
`docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
`§3`. The spec text states "all 13 verification-body fields below are
required" and groups them as follows:

| # | Field | Spec subsection | UAT scenario coverage (primary) |
| --- | --- | --- | --- |
| 1 | `costCenterCode` | §3.1 cost-center / ownership | UAT-FIN-GOV-001, 004, 005, 008 |
| 2 | `costCenterName` | §3.1 cost-center / ownership | UAT-FIN-GOV-001 |
| 3 | `ownerUserId` | §3.1 cost-center / ownership | UAT-FIN-GOV-001 |
| 4 | `ownerName` | §3.1 cost-center / ownership | UAT-FIN-GOV-001 |
| 5 | `approvalEvaluationId` | §3.2 approval evaluation | UAT-FIN-GOV-001, 002, 003 |
| 6 | `approvalRequestId` | §3.2 approval evaluation | UAT-FIN-GOV-001 |
| 7 | `approvalState` | §3.2 approval evaluation | UAT-FIN-GOV-001, 002, 003, 008 |
| 8 | `quotaPeriodKey` | §3.3 quota usage | UAT-FIN-GOV-001, 004, 006, 007 |
| 9 | `quotaUsageDelta` | §3.3 quota usage | UAT-FIN-GOV-001, 004, 007 |
| 10 | `partnerProgramCode` | §3.4 partner channel | UAT-FIN-GOV-005, 013 |
| 11 | `eligibilityVerificationId` | §3.4 partner channel | UAT-FIN-GOV-005 |
| 12 | `platformEarningsRef` | §3.5 forwarder | UAT-FIN-GOV-006 |
| 13 | `auditId` / `reportArtifactId` | §3.6 audit / report linkage | UAT-FIN-GOV-001, 008, 009, 010 |

Notes on the §3 grouping:

- `legacy_unmapped` (§3.1) is the monotonic fallback marker, not a separate
  verification-body field; it is exercised by UAT-FIN-GOV-011 and the §3.7
  fallback rule.
- `auditId` and `reportArtifactId` are the two fields under §3.6; the spec
  treats audit-and-report-linkage as the 13th verification anchor (audit row
  is always present; report-artifact is set lazily on export inclusion).
- Cross-cutting integrity guards (state-transition forbiddances in §5,
  reference-token masking in §4.2, RBAC and cross-tenant guards) are covered
  by UAT-FIN-GOV-009, 010, 011, 012, 013.

Reviewer takeaway: the UAT scenario set already touches every verification
field at least once; the open work is the executable `E2E-010` proof and the
live-staging closeout, not additional UAT authoring.

### C. Non-field guards that still must survive

- [ ] Keep `WF-FIN-001` baseline separate from `WF-FIN-GOV-001` (no rename, no
      absorption).
- [ ] Do not claim live staging evidence while
      `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` still
      records a blocker. The new spec/UAT pair does not by itself satisfy that
      blocker.
- [ ] Preserve `referenceToken` / `callId` / `recordingId` / `issuerAuthRef` /
      `benefitRef` masking on every export and audit line (spec §4.2,
      UAT-FIN-GOV-013).
- [ ] Treat post-export modification attempts as adjustment records, not
      in-place edits (spec §5, UAT-FIN-GOV-012).
- [ ] Treat `legacy_unmapped = true` on a fully-mapped tenant as an integrity
      error (spec §3.7, UAT-FIN-GOV-011).
- [ ] Keep cross-tenant access denials as `404 / not_found` rather than `403`
      to avoid existence leakage (UAT-FIN-GOV-010).

---

## 5. Reviewer Hotspots

For `Codex` reviewing this sidecar packet:

1. Confirm §2 reads as a timestamped machine-truth snapshot and does not
   pretend to be a live mirror after later handoff events.
2. Confirm §2 correctly records that spec + UAT are now on `origin/dev` while
   the `E2E-010` script and the live-staging closeout are still open. The
   prior packet treated all three as absent; this refresh corrects that.
3. Confirm §3 treats `PH1GC-MATRIX-001` / `PH1GC-MATRIX-002` as already
   `done` (structural row updates), while still flagging that the
   gate-read uplift to `PASS (live staging evidence)` is a separate, future
   action gated on `E2E-010` + closeout, not on the matrix rows alone.
4. Confirm §3 does **not** treat feature-branch artifacts as equivalent to
   `origin/dev` visibility for any remaining acceptance item.
5. Confirm the §4B field-by-UAT-scenario table reads as a derived
   cross-reference grounded in the current `origin/dev` spec/UAT, not as a
   new canonical mapping.
6. Confirm the live-evidence boundary is unchanged: static / provisional
   evidence exists, live staging proof is still blocked by the
   `FIN-GOV-001-EVIDENCE-PACK` IAP / Cloud-Run gate.
7. Confirm this packet does not edit canonical truth, runtime files, or the
   parent task record, and that the only artifact touched is this file.

---

## 6. Parent Owner Adoption Notes

For `Codex` when landing `PH1GC-FIN-GOV-001`:

1. The first two acceptance items are already satisfied on `origin/dev`; the
   parent's finalization work is now concentrated on `PH1GC-E2E-010`,
   `PH1GC-MATRIX-002` gate-read uplift, and the directive-`§7` closeout
   report.
2. Reuse `origin/claude2/wf-fin-gov-001-e2e @ ddc02c4` as the seed for
   `PH1GC-E2E-010`; do not start from scratch. The spec §3 field list and the
   UAT §2–§3 scenarios are the assertion targets.
3. Treat `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` as the
   binding live-evidence boundary. Until a fresh reviewer-readable staging
   rerun lands, do not upgrade `WF-FIN-GOV-001` matrix row beyond
   `PASS (static evidence)`.
4. The `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR` helper documented the
   cherry-pick path that moved the parent out of `blocked`. The parent owner
   should not re-derive that path; it is already closed in machine truth.
5. If the parent owner discovers new directive `§H` wording or new resolution
   text that changes the 13-field interpretation, regenerate this packet
   instead of treating it as canonical truth.

---

## 7. Suggested Handoff Commands

**Owner (`Claude2`) → Reviewer (`Codex`)**

```bash
AI_NAME=Claude2 scripts/ai-status.sh handoff PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE Codex "PH1GC-FIN-GOV-001 acceptance packet refreshed at support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE.md. Section 2 records a timestamped machine-truth snapshot at 2026-05-22T19:38:40Z, keeps ai-status.json as the only live lifecycle authority, captures that the parent is now todo (Codex owner / Claude2 reviewer), records that the target spec and UAT are now visible on origin/dev while E2E-010 is still backlog, maps reusable earlier-wave FIN-GOV branches versus PH1GC downstream dependencies (with PH1GC-MATRIX-001/002 already done and PH1GC-E2E-010 still open), and cross-references the 13 verification-body fields from spec §3 against the UAT-FIN-GOV scenarios."
```

**Reviewer (`Codex`) → `review_approved`**

```bash
AI_NAME=Codex scripts/ai-status.sh approve PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE "PH1GC-FIN-GOV-001 acceptance packet is support-only and correctly reframes Section 2 against the current machine-truth snapshot: parent moved to todo with Codex/Claude2 ownership, spec and UAT are now on origin/dev, downstream PH1GC-MATRIX-001/002 are done while PH1GC-E2E-010 remains the binding open child, and the live-staging gate-read uplift remains blocked by the FIN-GOV-001 evidence pack. The 13-field cross-check against UAT-FIN-GOV scenarios is coherent and does not over-claim canonical authority."
```

**Reviewer (`Codex`) → reopen**

```bash
AI_NAME=Codex scripts/ai-status.sh reopen PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE "Packet drifted from current PH1GC machine truth, stopped treating Section 2 as a timestamped snapshot, over-claimed origin/dev coverage of the verification body, or conflated PH1GC-MATRIX-002 closure with live-staging gate-read uplift; refresh the baseline and dependency map."
```

---

## 8. Summary

This packet keeps three distinctions explicit for review:

- the parent's first two acceptance items (spec + UAT visible on `origin/dev`)
  are now satisfied; the third (UAT covers the 13 verification-body fields)
  is supported by the §4B cross-reference but remains a parent-reviewer call.
- the parent's last three acceptance items (`PH1GC-E2E-010` script, gate-read
  uplift driving the matrix row, directive-`§7` closeout report) remain open
  and are concentrated on the still-`backlog` `PH1GC-E2E-010`.
- the gate-read uplift to `PASS (live staging evidence)` is **not** equivalent
  to `PH1GC-MATRIX-002` being marked `done`; it requires a real `E2E-010` run
  on staging plus the directive-`§7` closeout, with the
  `FIN-GOV-001-EVIDENCE-PACK` blocker resolved.

This packet does not advance the parent task; it only makes the current
acceptance bar reviewable without re-deriving the context.
