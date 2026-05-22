# PH1GC-FIN-GOV-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `PH1GC-FIN-GOV-001` - governance-aware billing/reporting spec + UAT
**Parent Owner / Reviewer:** `Codex2` / `Codex`
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`
**Generated:** `2026-05-22` (UTC)
**Status:** support-only packet refreshed from the canonical machine-truth
snapshot at `2026-05-22T03:24:43Z`; authoritative lifecycle state remains in
`ai-status.json`, and the parent remains `pending`

This packet is a support artifact only. It does not modify canonical truth,
runtime behavior, or the parent task record. Its job is to make the current
acceptance bar reviewable without overstating what is already visible on
`origin/dev`.

This file is intentionally a static reviewer packet, not a live task-status
mirror. If a later handoff, reopen, or approval changes lifecycle state,
`ai-status.json` wins.

---

## 1. Scope Boundary

In scope:

- restate the parent task's acceptance bar as a reviewer checklist
- map the upstream truth anchors and downstream task dependencies
- record which governance-finance artifacts already exist on feature branches
  versus which ones are still absent from the current `origin/dev` snapshot
- provide a conservative 13-field working checklist for the parent UAT/spec

Out of scope:

- editing L1/L2 canonical truth, `ai-status.json`, or any runtime / contract /
  governance implementation
- declaring the parent task complete
- upgrading `WF-FIN-GOV-001` from static evidence to live evidence
- rewriting the existing `WF-FIN-001` baseline semantics

---

## 2. Machine Truth Snapshot

Snapshot source: canonical
`/home/edna/workspace/drts-fleet-platform/ai-status.json` at
`2026-05-22T03:24:43Z`. This section records the state seen while refreshing
the packet; later lifecycle transitions may advance independently in machine
truth.

### Sidecar task

`ai-status.json -> PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status_at_snapshot=`in_progress`
- last_update=`2026-05-22T03:24:43Z`
- helper_parent=`PH1GC-FIN-GOV-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE.md`
- recent_lifecycle_note=`owner handoff moved the task to review at 2026-05-22T03:20:42Z; reviewer reopen returned it to in_progress at 2026-05-22T03:23:02Z so this packet could be refreshed`

### Parent task

`ai-status.json -> PH1GC-FIN-GOV-001`

- owner=`Codex2`
- reviewer=`Codex`
- status_at_snapshot=`pending`
- artifacts expected on `origin/dev`:
  - `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  - `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- acceptance recorded in machine truth:
  - spec visible on `origin/dev`
  - UAT visible on `origin/dev`
  - UAT covers all 13 directive-`§H` verification-body fields
  - `PH1GC-E2E-010` asserts every field
  - `PH1GC-MATRIX-002` carries the gate-read update
  - closeout report follows directive `§7` format

### Current worktree snapshot

This isolated worker tree is on
`codex/ph1gc-fin-gov-001-sidecar-acceptance` from `dev`. In this snapshot:

- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  is **absent**
- `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
  is **absent**
- `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
  is **absent**
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
  is present and still records a **static/provisional** evidence posture with a
  2026-05-19 live-staging blocker

Implication:

- earlier v3 governance-finance work exists in machine truth and on feature
  branches, but the `PH1GC-FIN-GOV-001` parent acceptance items tied to
  `origin/dev` visibility are not yet satisfied in this worktree snapshot

---

## 3. Dependency Map

### A. Canonical decision and acceptance anchors

| Anchor | Why it matters |
| --- | --- |
| `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` `§3.7` | Defines the governance-aware billing/reporting flow, required docs, and the finance-output acceptance surface. |
| `docs/00-context/phase1-v3-resolution-20260519.md` `Q1` | Remaps the new governance billing shell to `E2E-010`. Parent acceptance must align to that numbering, not the directive's older `E2E-009` text. |
| `docs/00-context/phase1-v3-resolution-20260519.md` `Q3` | Keeps `WF-FIN-001` as the baseline row and `WF-FIN-GOV-001` as the additive governance-enrichment row, with dependencies on `WF-TGV-001` and `WF-FIN-001`. |
| `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` | Provides the conservative evidence read: finance-governance seams exist, but reviewer-readable live staging proof is still blocked. |

### B. Reusable earlier-wave artifacts (done in machine truth, not present on `origin/dev` here)

| Task | Status | Branch / Commit | What can be reused |
| --- | --- | --- | --- |
| `FIN-GOV-SPEC-001` | `done` | `origin/codex2/fin-gov-spec-001` @ `8b0e8fd` | Spec draft with explicit `approvalState` and quota-impact output requirements aligned to directive `§3.7.3`. |
| `FIN-GOV-UAT-001` | `done` | `origin/codex2/fin-gov-uat-001` @ `67df6f2` | UAT draft that already preserves the conservative static/provisional evidence posture and blocked-for-live wording. |
| `WF-FIN-GOV-001-E2E` | `done` | `origin/claude2/wf-fin-gov-001-e2e` @ `ddc02c4` | `E2E-010` shell semantics: governed booking -> invoice line binding, audited invoice generation, cross-tenant denial probe. |
| `WF-FIN-GOV-001-MATRIX` | `done` | `origin/codex2/wf-fin-gov-001-matrix` @ `24c24a7` | Additive matrix-row framing that keeps `WF-FIN-001` unchanged and names `WF-TGV-001 + WF-FIN-001` as dependencies. |

Important boundary:

- this packet treats those branches as **reusable source material**, not as
  proof that the `PH1GC-FIN-GOV-001` parent acceptance is already met on
  `origin/dev`

### C. Formal downstream consumers in the current PH1GC wave

| Task | Machine-truth status | Relationship |
| --- | --- | --- |
| `PH1GC-E2E-010` | `pending` | Hard downstream consumer. It formally depends on `PH1GC-FIN-GOV-001`, so parent delivery blocks the new gap-closure `E2E-010` script. |
| `PH1GC-MATRIX-002` | `pending` | Depends on `PH1GC-MATRIX-001`, `PH1GC-E2E-010`, and `PH1GC-E2E-011`; therefore the governance-finance parent indirectly blocks the E2E matrix reconciliation. |
| `PH1GC-MATRIX-001` | `pending` | Carries the release-gate matrix reconciliation that must remain consistent with the same `WF-FIN-001` vs `WF-FIN-GOV-001` split from `Q3=B`. |

### D. No formal upstream machine dependency, but real semantic prerequisites still exist

The parent task records `depends_on=[]`, but reviewer-safe implementation still
needs these truths preserved:

- `WF-FIN-001` remains the baseline billing/reporting row
- `WF-FIN-GOV-001` is additive governance enrichment only
- live claims must remain blocked until new reviewer-readable staging evidence
  exists
- `E2E-010` numbering must follow the accepted `Q1` remap

---

## 4. Parent Acceptance Checklist

### A. Acceptance items recorded in `ai-status.json`

- [ ] `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
      is visible on `origin/dev`
  Current snapshot: file absent from this `dev`-based worktree.
- [ ] `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
      is visible on `origin/dev`
  Current snapshot: file absent from this `dev`-based worktree.
- [ ] UAT covers all 13 directive-`§H` verification-body fields
  Current snapshot: not reviewable on `origin/dev` because the UAT doc is
  absent here.
- [ ] `PH1GC-E2E-010` asserts every required field
  Current snapshot: `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
  is absent here; older reusable semantics exist at `ddc02c4`.
- [ ] `PH1GC-MATRIX-002` records the gate-read update
  Current snapshot: task is still `pending` and depends on `PH1GC-E2E-010`.
- [ ] closeout report follows directive `§7` format
  Current snapshot: pending parent closeout work.

### B. Derived 13-field working checklist for the parent spec/UAT

No repo-local file available in this worktree spells out the phrase
`13 verification-body fields` verbatim. To keep the parent reviewable anyway,
this packet uses the following conservative derived checklist based on:

- directive `§3.7.3`
- `Q3` resolution text
- `PH1GC-FIN-GOV-001.acceptance`
- prior `FIN-GOV-SPEC-001` / `FIN-GOV-UAT-001` review notes

Reviewer should expect the parent spec/UAT/E2E chain to cover all 13 items:

- [ ] `costCenterCode`
- [ ] `costCenterName`
- [ ] `owner` / `ownerUserId`
- [ ] `approvalState`
- [ ] quota period / period key
- [ ] quota usage impact / summary
- [ ] approval evaluation snapshot
- [ ] approval request reference / ID
- [ ] partner `programId`
- [ ] `benefitReference`
- [ ] `issuerAuthorizationRef`
- [ ] `platformCode` / platform-earnings dimension
- [ ] `legacy_unmapped` marker

### C. Non-field guards that still must survive

- [ ] keep `WF-FIN-001` baseline separate from `WF-FIN-GOV-001`
- [ ] do not claim live staging evidence while
      `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
      still records a blocker
- [ ] keep sensitive download / export audit as an explicit acceptance guard,
      not just an implied side effect
- [ ] preserve the conservative read that some enrichment fields may still be
      `NOT_POPULATED` until new runtime evidence proves otherwise

---

## 5. Reviewer Hotspots

For `Codex2` reviewing this sidecar packet:

1. Confirm the packet treats `§2` as a timestamped machine-truth snapshot, not
   as a live status mirror that must still match after later handoff events.
2. Confirm the packet does **not** treat feature-branch artifacts as equivalent
   to `origin/dev` visibility for the parent acceptance.
3. Confirm the downstream dependency map does not overstate formal blockers:
   `PH1GC-E2E-010` is the hard child; `PH1GC-MATRIX-002` is the indirect
   consumer.
4. Confirm the derived 13-field checklist is conservative and useful, rather
   than pretending to be a new canonical spec.
5. Confirm the packet keeps the `WF-FIN-001` vs `WF-FIN-GOV-001` split from
   `Q3=B` intact.
6. Confirm the live-evidence boundary remains honest: static/provisional evidence
   exists, but live staging proof is still blocked.

---

## 6. Parent Owner Adoption Notes

For `Codex2` when landing `PH1GC-FIN-GOV-001`:

1. Reusing prior branch content is acceptable, but the parent cannot be handed
   off until the target spec/UAT artifacts are actually visible from the new
   `PH1GC` delivery branch and reviewable against current machine truth.
2. The prior `WF-FIN-GOV-001-E2E` branch is the best seed for the new
   `PH1GC-E2E-010` task, but the parent should not claim that downstream work
   as already complete.
3. The blocked-for-live posture from `FIN-GOV-001-EVIDENCE-PACK.md` should be
   preserved unless a fresh reviewer-readable staging rerun lands.
4. If the parent UAT chooses stronger field wording than the earlier v3 UAT,
   it must still remain consistent with the conservative evidence notes around
   `costCenterName`, owner enrichment, `legacy_unmapped`, and partner/platform
   finance dimensions.

---

## 7. Suggested Handoff Commands

**Owner (`Codex`) -> Reviewer (`Codex2`)**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE Codex2 "PH1GC-FIN-GOV-001 acceptance packet refreshed at support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE.md. Section 2 now treats the sidecar-task details as a timestamped machine-truth snapshot captured at 2026-05-22T03:24:43Z, keeps ai-status.json as the only live lifecycle authority, preserves the parent pending truth, records that the spec/UAT/E2E files are still absent from the current origin/dev snapshot, maps reusable earlier-wave FIN-GOV branches versus current PH1GC downstream dependencies, and provides a conservative derived 13-field reviewer checklist without changing canonical truth."
```

**Reviewer (`Codex2`) -> `review_approved`**

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE "PH1GC-FIN-GOV-001 acceptance packet is support-only and correctly frames Section 2 as a timestamped machine-truth snapshot rather than a live status mirror. The parent remains pending, the current dev snapshot still lacks the target spec/UAT/E2E files, reusable FIN-GOV branch evidence is mapped without over-claiming origin/dev visibility, and the derived 13-field checklist plus downstream dependency map are coherent."
```

**Reviewer (`Codex2`) -> reopen**

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE "Packet drifted from current PH1GC machine truth, stopped treating Section 2 as a timestamped snapshot, or over-claimed dev-visible governance-finance evidence; refresh the baseline and dependency map."
```

---

## 8. Summary

This packet keeps one distinction explicit for review:

- earlier governance-finance artifacts are real and reusable
- `PH1GC-FIN-GOV-001` is still pending because the new gap-closure acceptance
  requires those artifacts to become visible and reviewable in the current
  `origin/dev` delivery path, alongside the new `PH1GC-E2E-010` and
  `PH1GC-MATRIX-002` chain
