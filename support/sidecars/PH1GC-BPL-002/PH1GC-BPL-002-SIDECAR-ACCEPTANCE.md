# PH1GC-BPL-002 Sidecar Acceptance Packet

This document is the support-only acceptance packet for `PH1GC-BPL-002` ("Phase 1 gap closure — release truth sync runbook"). It does not change canonical truth. It packages the current machine-truth state, dependency map, repo baseline, acceptance checklist, and reviewer handoff that the assigned sidecar reviewer (`Codex2`) and the parent-task owner (`Codex2`) / parent-task reviewer (`Codex`) need before closing the parent runbook task.

Anchors used here come from:

- `ai-status.json`
- `current-work.md`
- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` (directive)
- `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` (status truth)
- `docs/ops/branch-strategy.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `.orchestrator/task-briefs/PH1GC-BPL-002.md`

## §1 Scope & Boundary

- **Task ID:** `PH1GC-BPL-002-SIDECAR-ACCEPTANCE`
- **Parent Task:** `PH1GC-BPL-002`
- **Helper Kind:** `acceptance_packet`
- **Sidecar Owner:** `Claude`
- **Sidecar Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** hand off a reviewer-facing acceptance checklist, dependency map, and repo-baseline packet for the parent release-truth-sync runbook task without editing L0/L1/L2 truth or any primary runtime/design artifact.

Guardrails for this packet:

- Only create support artifacts under `support/sidecars/PH1GC-BPL-002/`.
- Do not rewrite the parent runbook or any canonical doc from this sidecar slice.
- Do not broaden the parent task into gate-matrix editing, E2E matrix authoring, branch-strategy rewriting, or workflow-family semantics work — those are explicitly owned by sibling briefs (`PH1GC-MATRIX-001`, `PH1GC-MATRIX-002`, etc.), not by `PH1GC-BPL-002`.
- Do not freeze the sidecar's own `status`, `next`, or `last_update` fields inside this packet — those move during dispatch and review and must be re-read from canonical `ai-status.json` at review / closeout time.

## §2 Machine-Truth Anchors

### Parent Task: `PH1GC-BPL-002`

| Field | Value |
| --- | --- |
| Title | `Phase 1 gap closure — release truth sync runbook` |
| Phase | `Phase 1 v3 gap closure` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Status (at packet draft) | `pending` |
| Depends on | `["PH1GC-BPL-001"]` |
| Artifact | `docs/03-runbooks/phase1-release-truth-sync-20260519.md` |
| Planning ref | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` |
| Evidence refs | `.orchestrator/task-briefs/PH1GC-BPL-002.md` |
| Acceptance (canonical bullets) | (1) artifact visible on `origin/dev`; (2) declares canonical roles for `dev` / `publish/v*` / `release/v*` / `main` / `prod/v*` with no conflict against `docs/ops/branch-strategy.md`; (3) contains directive §3 ID-and-numbering decisions (E2E-007/008/009 retained; E2E-010/011 added; `WF-PRT-001 → WF-PARTNER-001`); (4) lists sidecar reference mapping for every workflow family in directive §2; (5) closeout report follows directive §7 format. |

Machine-truth notes:

- `ai-status.json` treats `PH1GC-BPL-002` as a fresh Phase 1 gap-closure task even though earlier waves already closed related release-truth slices (`REL-SYNC-001`, `WF-REL-001-MATRIX`, `WF-REL-001-AUDIT`). The new task is therefore a directive-aligned truth-refresh, not a net-new release semantics design task.
- The parent `next` field directs workers to read `.orchestrator/task-briefs/PH1GC-BPL-002.md` and the status-truth doc; the brief is authoritative when those files diverge from older planning artifacts.
- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` and `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` are present in the canonical repository root but are **not** yet on `origin/dev`. They must be treated as authoritative dispatch context, not as proof of `origin/dev` state.

### Sidecar Task: `PH1GC-BPL-002-SIDECAR-ACCEPTANCE`

Stable sidecar anchors only:

| Field | Value |
| --- | --- |
| Owner | `Claude` |
| Reviewer | `Codex2` |
| `task_class` | `sidecar` |
| `helper_kind` | `acceptance_packet` |
| `helper_parent` | `PH1GC-BPL-002` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/PH1GC-BPL-002/PH1GC-BPL-002-SIDECAR-ACCEPTANCE.md` |
| Auto-created by | `supervisor-underutilization` |

Lifecycle note:

- This packet is the only sidecar artifact. It does not edit parent canonical truth and does not stand in for the runbook itself. The runbook deliverable belongs to `PH1GC-BPL-002` and must be produced by the parent owner (`Codex2`).

## §3 Dependency Map

### A. Direct machine-truth dependency: `PH1GC-BPL-001`

| Field | Value |
| --- | --- |
| Title | `Phase 1 gap closure — origin/dev blueprint alignment audit` |
| Owner | `Codex` |
| Reviewer | `Codex2` |
| Status (snapshot at packet draft) | `pending` |
| Artifact | `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` |
| Why it matters | Shares closure terminology and §A directive context that the release-truth runbook must consume verbatim. `PH1GC-BPL-002`'s `depends_on` lists this task explicitly. |

Concrete predecessor evidence already on machine truth (older v3 wave, same artifact path `origin-dev-blueprint-alignment-audit-20260519.md`):

- `DEV-SYNC-001` closed on commit `073c39eda12c5d54ae6710fcbd7a7947c79eb305` against the same audit path, push `origin/codex2/dev-sync-001`. The new audit must refresh that baseline, not contradict it.

### B. Canonical release-governance peers (non-`depends_on`, but practical preconditions)

These artifacts are already on `origin/dev` and pin the release-truth frame the new runbook must align with:

| Artifact | Why it constrains the runbook |
| --- | --- |
| `docs/ops/branch-strategy.md` | Defines the v4 nightly publish + hourly promote + prod tag model. Declares `main` as bootstrap branch (mutable only via PR + 3 gates), `publish/v<YYYY.MM.DD>.<N>` as immutable nightly snapshot branch, `release/v<YYYY.MM.DD>.<N>` as immutable tag pointing at the same SHA as the matching publish branch, and `prod/v<YYYY.MM.DD>.<N>` as the immutable tag created when `hourly-promote.yml` merges a publish into `main`. The runbook must reuse these role definitions and must not redefine them. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | Current Phase 1 gate matrix. Still contains `WF-PRT-001`, which the runbook must call out for `WF-PARTNER-001` rename per directive §3.2. The runbook should cite the matrix as the downstream consumer that depends on the rename decision, not duplicate it. |
| `docs/04-uat/fbp-014a-e2e-matrix.md` | Existing E2E matrix. The runbook must echo directive §3.1 (retain E2E-007/008/009, add E2E-010/011) and align row references rather than re-author the matrix. |

### C. Sibling Phase 1 gap-closure briefs that depend on `PH1GC-BPL-002`

These tasks read directly from the runbook the parent task produces. The packet calls them out so the reviewer can confirm the parent-task closeout publishes the terminology these downstream briefs need:

- `PH1GC-MATRIX-001` — Release Gate Matrix Full Reconciliation. Will rename `WF-PRT-001 → WF-PARTNER-001` and add `WF-DRV-MP-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, `WF-REL-001`; depends on `PH1GC-BPL-002` for terminology and gate-read wording.
- `PH1GC-MATRIX-002` — E2E Matrix Reconciliation. Will publish E2E-007..011 rows and downgrade E2E-006 warning-skip to a risk note; depends on `PH1GC-MATRIX-001` (which itself depends on `PH1GC-BPL-002`).
- `PH1GC-PBK-001` — Partner Booking pilot cutover. The status-truth doc's runbook citation says "cutover runbook landed at canonical path declared by PH1GC-BPL-002", so the runbook must declare a single canonical cutover-runbook reference even if the cutover-runbook file itself ships under another brief.

### D. Directive deliverables enumerated in machine truth that the runbook must mention

Directive §4.4 and §10 enumerate the following sidecar paths that the runbook's "sidecar reference mapping" section (parent acceptance bullet 4) must cover:

- `support/sidecars/FWD-LIVE-001/` (workflow family `WF-FWD-001`)
- `support/sidecars/PARTNER-ELIG-LIVE-001/` (workflow family `WF-PARTNER-001`)
- `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` (workflow family `WF-DRV-MP-001`)
- `support/sidecars/WF-COM-001-LIVE-PROVIDER/` (workflow family `WF-COM-001`)
- `support/sidecars/WF-PROD-001-LIVE-EXEC/` (workflow family `WF-PROD-001`)
- `support/sidecars/PBK-PILOT-001/` (workflow family `WF-PBK-001`)

Directive §2 also lists the full 16 workflow-family target gate-reads (`WF-RLS-001`, `WF-PROD-001`, `WF-TEN-001`, `WF-ORD-001`, `WF-TGV-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-DRV-MP-001`, `WF-FWD-001`, `WF-PARTNER-001`, `WF-PBK-001`, `WF-COM-001`, `WF-FIN-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, `WF-REL-001`). Every row must be mapped to either an in-repo sidecar (above), an external-gated holdback, or "no sidecar required" in the runbook.

## §4 Repo Baseline Snapshot (verification anchors only)

Captured against `origin/dev` and the assigned worker worktree (`claude/ph1gc-bpl-002-sidecar-acceptance`) at packet draft time. Reviewer must re-verify with `git ls-tree -r origin/dev -- <path>` because the tree advances.

Target deliverable for the parent task:

- `git ls-tree -r origin/dev -- docs/03-runbooks/phase1-release-truth-sync-20260519.md` returns no path. The runbook is not yet on `origin/dev`. This is the exact gap `PH1GC-BPL-002` exists to close.

Anchors the runbook must align to (present on `origin/dev`):

- `docs/ops/branch-strategy.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`

Anchors the runbook will likely cite that are **not** yet on `origin/dev`:

- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` (directive — canonical repo root only)
- `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` (status truth — canonical repo root only)
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` (`PH1GC-BPL-001` output — not yet landed)

The runbook must distinguish "verified absent from `origin/dev`" from "assumed absent" when it cites these. The status-truth doc's §2 table already does this; the runbook should reuse that classification rather than invent a new one.

Predecessor commits on machine truth (useful for the parent closeout's "Files changed / Commit" lines):

- `DEV-SYNC-001` → commit `073c39eda12c5d54ae6710fcbd7a7947c79eb305`, push `origin/codex2/dev-sync-001`.
- `REL-SYNC-001` → commit `3604aa80510713fbbc7ddcd5d494a5ad27d98bb8` (closed in older v3 wave; runbook must not contradict).
- `WF-REL-001-MATRIX` → commit `6da045d879e4c99cfa0f1cc70ec4451533c2df2d`.
- `WF-REL-001-AUDIT` → commit `538a8fe4c2fc1a7bbb0a5fe4d0f61eeb6730fb24`.

## §5 Parent-Task Acceptance Checklist (`PH1GC-BPL-002`)

These reviewer-facing gates are derived from `ai-status.json`, the embedded task brief, directive §A `BPL-002`, directive §2 (16-row workflow gate matrix), directive §3 (ID-and-numbering decisions), directive §4.4 / §10 (sidecar inventory), and directive §7 (closeout format). They do not add new product semantics.

### A. Artifact existence and scope gates

- [ ] Deliver `docs/03-runbooks/phase1-release-truth-sync-20260519.md` and make it visible on `origin/dev` (verify via `git ls-tree -r origin/dev -- docs/03-runbooks/phase1-release-truth-sync-20260519.md`).
- [ ] Runbook stays inside the directive §A `BPL-002` scope: release-truth synchronization only. Do not turn it into a gate-matrix rewrite (`PH1GC-MATRIX-001` owns that), an E2E matrix rewrite (`PH1GC-MATRIX-002`), or a branch-strategy rewrite.
- [ ] Runbook is locatable from the release manager's primary entrypoint (i.e., it is the file the matrix and other runbooks point at, not a buried annex).

### B. Branch-role declarations (parent acceptance bullet 2)

- [ ] Runbook explicitly assigns canonical roles to `dev`, `publish/v*`, `release/v*`, `main`, `prod/v*`, using the exact role names from `docs/ops/branch-strategy.md`.
- [ ] No declaration contradicts `docs/ops/branch-strategy.md`:
  - `dev` continues to be the integration trunk.
  - `publish/v<YYYY.MM.DD>.<N>` is an immutable nightly snapshot branch cut by `nightly-publish.yml`.
  - `release/v<YYYY.MM.DD>.<N>` is the immutable tag at the same SHA as the matching `publish/v*` branch.
  - `main` is the bootstrap branch, mutable only via PR + 3 gates, advanced hourly by `hourly-promote.yml`.
  - `prod/v<YYYY.MM.DD>.<N>` is the immutable tag created when `hourly-promote.yml` merges a publish into `main`, used as the `deploy-prod.yml` input.
- [ ] Runbook does not re-introduce the deprecated v3 per-merge `prod-*` tag model.

### C. Naming and numbering decisions (parent acceptance bullet 3)

- [ ] E2E-007 (Partner Airport Transfer), E2E-008 (Partner Booking Cutover), E2E-009 (Production Rail Dry-Run) are explicitly **retained** with their existing numbers — no rename.
- [ ] E2E-010 (Governance-aware Billing / Reporting) and E2E-011 (Platform Admin Control Plane) are explicitly **added** with their canonical filenames `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` and `tests/e2e/E2E-011-platform-admin-control-plane.sh`.
- [ ] `WF-PRT-001` is explicitly **renamed** to `WF-PARTNER-001` with no alias row retained, matching directive §3.2.
- [ ] Finance split is documented: `WF-FIN-001` (Baseline Billing / Invoice / Report Export) and `WF-FIN-GOV-001` (Governance-aware Billing / Reporting / Settlement), with `WF-FIN-GOV-001 depends_on = {WF-TGV-001, WF-FIN-001}`.

### D. Workflow-family sidecar reference mapping (parent acceptance bullet 4)

- [ ] Runbook maps every workflow family in directive §2 to either an in-repo sidecar path, an external-gated holdback note, or an explicit "no sidecar required" entry. The 16 families are: `WF-RLS-001`, `WF-PROD-001`, `WF-TEN-001`, `WF-ORD-001`, `WF-TGV-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-DRV-MP-001`, `WF-FWD-001`, `WF-PARTNER-001`, `WF-PBK-001`, `WF-COM-001`, `WF-FIN-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, `WF-REL-001`.
- [ ] For each evidence sidecar named in directive §4.4 / §10, the runbook records the canonical path and which workflow family consumes it:
  - `support/sidecars/FWD-LIVE-001/` → `WF-FWD-001`
  - `support/sidecars/PARTNER-ELIG-LIVE-001/` → `WF-PARTNER-001`
  - `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` → `WF-DRV-MP-001`
  - `support/sidecars/WF-COM-001-LIVE-PROVIDER/` → `WF-COM-001`
  - `support/sidecars/WF-PROD-001-LIVE-EXEC/` → `WF-PROD-001`
  - `support/sidecars/PBK-PILOT-001/` → `WF-PBK-001`
- [ ] Runbook clarifies that the existing `support/sidecars/COM-LIVE-001/` and `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/` are **not** substitutes for the new `WF-COM-001-LIVE-PROVIDER/` and `WF-PROD-001-LIVE-EXEC/` sidecar paths required by the directive.

### E. Non-claim and rollback wording

- [ ] Runbook spells out non-claim language for live-provider / external-gated families (`WF-COM-001`, `WF-FWD-001`, `WF-PARTNER-001`, `WF-PBK-001`, `WF-PROD-001`) that matches directive §9 ("不得把 production dry-run 說明成 production launch", etc.).
- [ ] Runbook documents rollback / redeploy truth (parent task brief: "rollback / redeploy truth"): the operator re-dispatches a previous known-good `prod/v<date>` tag via `deploy-prod.yml`; no force-push, no tag mutation.

### F. Directive §7 closeout format gate

- [ ] Parent owner's closeout report contains every directive §7 field: `Task ID`, `Owner`, `Reviewer`, `Branch`, `PR`, `Commit`, `Files changed`, `Verification commands`, `Evidence artifact`, `Workflow family affected`, `Gate read before`, `Gate read after`, `Remaining non-claim`, `External dependencies, if any`.
- [ ] `Verification commands` includes at least `git ls-tree -r origin/dev -- docs/03-runbooks/phase1-release-truth-sync-20260519.md` returning the file.
- [ ] `Workflow family affected` cites `WF-REL-001` (directive §2 row "Release-truth synchronization").

### G. Dependency-consistency gates

- [ ] Runbook stays consistent with the `PH1GC-BPL-001` blueprint alignment audit. If `PH1GC-BPL-001` has not yet landed when `PH1GC-BPL-002` is reviewed, the runbook must either wait for it or explicitly call out the unresolved baseline gap.
- [ ] Runbook does not contradict prior `REL-SYNC-001`, `WF-REL-001-MATRIX`, or `WF-REL-001-AUDIT` closeouts; if any wording must change, the runbook records the rationale rather than silently overriding the older evidence.
- [ ] Runbook does not re-classify any workflow family's external-gated status (e.g., does not claim `WF-FWD-001` is `PASS (live)` when it is `PASS (sandbox evidence)` minimum).

## §6 Packet Completeness Check (sidecar self-audit)

- [x] This packet stays inside `support/sidecars/PH1GC-BPL-002/`.
- [x] The packet captures both the parent sidecar row and the parent runbook row from canonical `ai-status.json`.
- [x] The packet identifies `PH1GC-BPL-001` as the only declared `depends_on`.
- [x] The packet enumerates the canonical release-governance peers (`docs/ops/branch-strategy.md`, `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, `docs/04-uat/fbp-014a-e2e-matrix.md`) that constrain the runbook.
- [x] The packet maps the six directive-required sidecar evidence paths to their workflow families.
- [x] The packet lists every parent acceptance bullet (1)–(5) as a checklist item, and adds derived sub-gates from directive §A `BPL-002`, §2, §3, §4.4, §7, §9, §10.
- [x] The packet does not freeze the sidecar's own volatile fields (`status`, `next`, `last_update`); reviewer must re-read canonical `ai-status.json` at review / closeout time.

## §7 Reviewer Handoff Notes (for `Codex2`)

1. Reconfirm canonical `ai-status.json` at review time. The parent `PH1GC-BPL-002` should still be `owner=Codex2`, `reviewer=Codex`, depending on `PH1GC-BPL-001`, with the five acceptance bullets preserved exactly as machine truth. The sidecar `PH1GC-BPL-002-SIDECAR-ACCEPTANCE` should still be `owner=Claude`, `reviewer=Codex2`, `task_class=sidecar`, `helper_kind=acceptance_packet`, `helper_parent=PH1GC-BPL-002`, `mutates_canonical=false`.
2. Reconfirm the shared parent artifact path is still `docs/03-runbooks/phase1-release-truth-sync-20260519.md`. Do not approve a runbook that ships under any other path.
3. Treat the missing `planning_ref` and `status-truth` paths on `origin/dev` (directive at `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`; status truth at `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`) as a dispatch-time gap, not as permission to invent substitute semantics. The directive and status truth are present in the canonical repo root and remain the authoritative source for runbook content until they themselves land on `origin/dev`.
4. Review the packet's checklist for drift against `docs/ops/branch-strategy.md` (branch roles), `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (matrix rows / external-gated holdbacks), and `docs/04-uat/fbp-014a-e2e-matrix.md` (E2E numbering). If any of those files have advanced since this packet was written, the runbook's reviewer (`Codex`) should re-verify rather than rely on the snapshot here.
5. Treat this packet as support-only. Approval should reject any change that edits canonical truth under the name of this sidecar task. The runbook deliverable itself belongs to `PH1GC-BPL-002` and must come from the parent owner (`Codex2`), not from this sidecar slice.
6. After approval, return to the sidecar owner (`Claude`) for the standard sidecar closeout. Sidecar closeouts may use `NO_COMMIT_REQUIRED=1`; this packet still produces a normal anchor commit under `support/sidecars/PH1GC-BPL-002/` so the artifact appears on the task branch with the same git evidence shape as other PH1GC sidecars.

## §8 Suggested Reviewer Disposition

- approve with note "acceptance checklist and dependency map are complete and properly cited; planning artifact only"
- request changes listing missing checklist items, unclear dependency citations, or any drift against the canonical anchors in §3.B
