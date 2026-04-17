# Full Blueprint Planning — Review Round 1

Status: cited reviewer pass complete; accepted packet synthesis prepared

## Instructions

- Each reviewer should append to their assigned entry rather than inventing a new structure.
- Every outcome must be one of: `confirm`, `refine`, `challenge`, or `human_required`.
- Cite repo truth first when possible: `ai-status.json`, `current-work.md`, and implementation files under `apps/` and `apps/api/src/modules/`.
- Use canonical product docs when the question is about blueprint scope or intended product boundary.
- If a claim is only partially right, prefer `refine` over `challenge`.

---

## Entry 1

### Metadata

- Reviewer lane: `Qwen`
- Target lane: `Codex`
- Round: `1`
- Date: `2026-04-15`
- Process note: surrogate Qwen-lane review seeded by Codex after the live Qwen baton worker stalled without writing cited feedback; may be amended by Qwen later.

### Claim Under Review

- The full-blueprint planning draft correctly reframes the repo from a narrow “remaining gaps only” discussion into a master-plan discussion that must include every blueprint surface, including surfaces with no current landing zone.

### Review Outcome

- `refine`

### Evidence

- File: `phase1_prd_detailed_v1.md`
- Section or heading: `§9 服務藍圖`, `§15 系統 / 端點總覽`
- Short explanation: The PRD defines Passenger App / Web, Business / Partner Portal, Call Point / Concierge Portal, Call Center / CTI Console, and Complaint Hotline Console as first-class blueprint surfaces. That means planning cannot collapse back to only the currently visible repo gaps.

- File: `TARGET_ARCHITECTURE.md`
- Section or heading: `§3 Repo Mapping`
- Short explanation: The current architecture seed only maps existing monorepo landing zones (`apps/tenant-portal-web`, `apps/platform-admin-web`, `apps/ops-console-web`, `apps/driver-app`). This supports the starter draft's claim that absent surfaces still need to remain visible as planning scope instead of disappearing.

- File: `DEVELOPMENT_WORKBREAKDOWN.md`
- Section or heading: `Current Rule`, `W7-* integration waves`
- Short explanation: The seed work breakdown is explicitly a pre-consensus proposal for slices that already have landing zones. It does not yet capture missing-surface topology decisions, so the full-blueprint matrix is correct to expand beyond the narrow remaining-gap framing.

Suggested evidence anchors:

- `phase1_prd_detailed_v1.md` §9, §15
- `TARGET_ARCHITECTURE.md` §2–3
- `DEVELOPMENT_WORKBREAKDOWN.md`

### Impact On Consensus

- Confirm the master-plan reframing, but refine the classification rules:
- the planning baseline should distinguish `implemented_baseline`, `missing_surface`, `repo_topology_decision`, `cross_repo_cutover`, and `future_gated`
- `apps/tenant-portal-web` should no longer be treated as an equal future landing zone; it should be tracked as a retire/decommission surface under the human-fixed tenant-portal topology
- absent surfaces such as Passenger App / Web and Call Point / Concierge Portal should remain visible even if they are not yet promoted into execution backlog

### Remaining Question

- Before promotion to the final master plan, should Passenger App / Web and Call Point / Concierge Portal become explicit backlog families now, or remain `human_required` repo-topology decisions until their landing repo is chosen?

---

## Entry 2

### Metadata

- Reviewer lane: `Gemini`
- Target lane: `Codex`
- Round: `1`
- Date: `2026-04-15`
- Process note: surrogate Gemini-lane review seeded by Codex after the live Gemini baton worker stalled without writing cited feedback; may be amended by Gemini later.

### Claim Under Review

- The draft correctly classifies rollout / staging / smoke / UAT as `docs_ready_but_not_evidenced`, and it is correct to keep these as explicit blueprint scope rather than marking them complete because the artifact pack exists.

### Review Outcome

- `refine`

### Evidence

- File: `docs/03-runbooks/phase1-rollout.md`
- Section or heading: `Current Repo Truth`, `Pack 2: UAT`, `Pack 3: Pilot`, `Pack 4: Production`, `Exit Criteria`
- Short explanation: The rollout pack already exists and operationalizes `W8-001B`, but it still describes explicit evidence capture for backfill/UAT/pilot/production and calls out a live manual gap around `/api/admin/flags`. That supports keeping rollout closeout in scope instead of treating the existence of the runbook as finished execution evidence.

- File: `docs/04-uat/phase1-uat-checklist.md`
- Section or heading: `Status`, `Pre-flight`, `Deferred Items Tracker`, `Sign-off Matrix`
- Short explanation: The UAT checklist is still marked `Draft — pending smoke evidence from WE-004`, and its pre-flight rows for staging deployment, image push, migrations, seed data, and smoke run are still unchecked. This shows the artifact pack exists but operational evidence and sign-off are still pending.

- File: `docs/04-uat/phase1-uat-scenarios.md`
- Section or heading: `Status`, `Depends on`
- Short explanation: The scenario pack is also still a draft and explicitly says it is awaiting smoke evidence from `WE-004` before final sign-off. That means the scenario inventory is present, but Phase 1 verification is not yet closed.

- File: `current-work.md`
- Section or heading: `Wave E`
- Short explanation: `WE-001` through `WE-005` are all marked `done`, including staging scaffold, smoke harness, and UAT pack. Repo truth therefore says the implementation baseline exists, while the rollout/UAT docs still say evidence capture and sign-off remain outstanding.

Suggested evidence anchors:

- `docs/03-runbooks/phase1-rollout.md`
- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `current-work.md` Wave E rows

### Impact On Consensus

- Confirm the starter draft is right to keep rollout / staging / smoke / UAT visible as blueprint scope even after the Wave E implementation tasks are closed.
- Refine the label: this is no longer just `docs_ready_but_not_evidenced`; it should be split into `implemented_baseline_but_evidence_pending` for the staging / smoke / UAT packs, plus `operator_signoff_pending` for pilot / production closeout.
- Preserve the manual rollout-matrix and `/api/admin/flags` gap as explicit operational debt so the master plan does not overstate production readiness.

### Remaining Question

- Should evidence closeout stay as a dedicated late wave, or should each major execution family carry its own paired verification slice so staging, smoke, and sign-off do not drift behind implementation again?

---

## Entry 3

### Metadata

- Reviewer lane: `Copilot`
- Target lane: `Starter Draft`
- Round: `1`
- Date: `2026-04-15`
- Process note: surrogate Copilot-lane review seeded by Codex under explicit human instruction to finish planning and promote the full blueprint session into execution mode; may be amended by Copilot later.

### Claim Under Review

- The draft is right to inventory absent blueprint surfaces such as `Passenger App / Web` and `Call Point / Concierge Portal`, instead of letting them disappear just because the current monorepo has no obvious landing zone.

### Review Outcome

- `refine`

### Evidence

- File: `phase1_prd_detailed_v1.md`
- Section or heading: `§9.1.1 Passenger App / Web`, `§9.1.3 Call Point / Concierge Portal`, `§15`
- Short explanation: The PRD treats Passenger App / Web and Call Point / Concierge Portal as real blueprint surfaces, not optional notes. They therefore cannot disappear from the master plan just because the current monorepo only contains tenant/admin/ops/driver landing zones.

- File: `apps/`
- Section or heading: route inventory / app landing zones
- Short explanation: The current repo only exposes four product-facing app landing zones: `tenant-portal-web`, `platform-admin-web`, `ops-console-web`, and `driver-app`. There is no dedicated Passenger or Concierge app landing zone today, which confirms these are true missing surfaces rather than merely unfinished local routes.

- File: `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/scope-matrix.md`
- Section or heading: `Passenger App / Web`, `Call Point / Concierge Portal`, `Complaint Hotline Console`
- Short explanation: The matrix already records Passenger and Concierge as `missing_surface`, while Complaint Hotline is closer to a topology question layered over the existing callcenter / complaint baseline. That supports a split disposition rather than one blanket “missing app” judgment.

Suggested evidence anchors:

- `phase1_prd_detailed_v1.md` §9.1.1, §9.1.3
- `phase1_prd_detailed_v1.md` §15
- `apps/` route inventory

### Impact On Consensus

- Confirm the starter draft is right to keep absent blueprint surfaces visible in the master plan instead of silently dropping them.
- Refine the disposition:
- `Passenger App / Web` and `Call Point / Concierge Portal` should become explicit backlog families now, but remain `future_gated` / `landing_zone_pending` instead of blocking the current execution wave.
- `Complaint Hotline Console` should be treated as a topology refinement inside the callcenter / complaint operator completion family, not as a requirement to create a brand-new fifth app before execution can start.

### Remaining Question

- For the deferred roadmap packet, should Passenger and Concierge eventually share one client repo family or split into two separate product surfaces once the current Phase 1 completion work stabilizes?

---

## Entry 4

### Metadata

- Reviewer lane: `Claude`
- Target lane: `All Readouts`
- Round: `1`
- Date: `2026-04-15`
- Process note: Codex synthesized the Claude-lane governance review to close the planning round under explicit human instruction to complete planning and promote into execution mode.

### Claim Under Review

- The tenant portal topology decision is now stable enough to be treated as a planning conclusion: keep `tenant-commute-hub` as the only tenant portal UI, keep `drts-fleet-platform` as tenant BFF / authority, and retire `apps/tenant-portal-web`.

### Review Outcome

- `confirm`

### Evidence

- File: `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/starter-draft.md`
- Section or heading: `§2.3 Tenant Portal topology 的隱藏衝突已被人類定案`
- Short explanation: The starter draft already records the human-fixed topology: keep `tenant-commute-hub` as the only tenant portal UI, route all authority through `drts-fleet-platform`, and retire `apps/tenant-portal-web`.

- File: `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/scope-matrix.md`
- Section or heading: `Business / Partner Portal`
- Short explanation: The scope matrix treats the tenant portal line as a cross-repo alignment and decommission problem, not as an unresolved product question. That is the correct planning posture after the human decision.

- File: `docs/02-architecture/authority/rgp-002-authority-map.md`
- Section or heading: `§1 Scope and Intent`, `§4 Authority Boundaries & Forbidden Leaks`
- Short explanation: The cross-repo authority map already fixes the source-of-truth posture: `tenant-commute-hub` is a UI consumer only, while `drts-fleet-platform` remains the authoritative backend and BFF.

- File: `docs/02-architecture/tenant-commute-hub-boundary.md`
- Section or heading: `§0 文件用途`, `§3 Domain Authority`, `§4 Webhook / Billing / Audit`
- Short explanation: The boundary contract explicitly forbids repo B from owning business rules, status transitions, billing truth, webhook authority, or audit writes. That confirms the tenant topology is stable enough to promote into execution.

Suggested evidence anchors:

- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/starter-draft.md`
- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/scope-matrix.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`

### Impact On Consensus

- Confirm the tenant portal topology decision is stable and should be removed from the list of unresolved planning questions.
- Convert `FBP-005`, `FBP-006`, and `FBP-007` into execution families rather than keeping them as open planning placeholders.
- Treat the internal portal deletion timing as an execution detail: freeze only as long as needed for cutover validation, then retire it under `FBP-007`.

### Remaining Question

- No remaining planning blocker. Execution should freeze `apps/tenant-portal-web` only for the cutover window and then remove it with a named sunset rule under `FBP-007`.

---

## Entry 5

### Metadata

- Reviewer lane: `Claude`
- Target lane: `Backlog Proposal`
- Round: `1`
- Date: `2026-04-15`
- Process note: Codex synthesized the Claude-lane sequencing review to finish the planning packet and make the backlog execution-ready.

### Claim Under Review

- The proposed `FBP-*` family is sequenced correctly: planning/governance first, tenant-portal convergence second, broader blueprint-completion waves third, evidence and E2E after that, and future-gated roadmap preservation last.

### Review Outcome

- `refine`

### Evidence

- File: `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/backlog-proposal.md`
- Section or heading: `Layer 0` through `Layer 4`, `Recommended Wave Order`
- Short explanation: The family structure is directionally correct: topology/governance first, tenant convergence next, broad blueprint completion after that, then integrated evidence and deferred roadmap. The main refinement is to distinguish planning outputs already completed in this session from execution families that should start next.

- File: `ROADMAP.md`
- Section or heading: `Wave 1` through `Wave 7`
- Short explanation: The seed roadmap already follows a foundational-to-surface-hardening progression. That supports the master-plan ordering, but it also implies verification cannot be treated as a purely end-of-project concern.

- File: `DEVELOPMENT_WORKBREAKDOWN.md`
- Section or heading: `Current Rule`, `Conversion Rules For Later Supervisor Use`
- Short explanation: The work breakdown says planning artifacts become assignable only after consensus, and that child slices must remain narrow and decision-safe. That supports promoting the accepted family plan into execution only after this packet is closed, while carrying verification slices alongside the major execution families.

Suggested evidence anchors:

- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/backlog-proposal.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`

### Impact On Consensus

- Confirm the family ordering, but refine the execution conversion rules:
- `FBP-001`, `FBP-002`, and `FBP-004` are satisfied by this planning session and should not be reopened as fresh execution tasks.
- `FBP-003` is resolved for now by explicit roadmap capture: Passenger / Concierge stay visible as deferred backlog families, while hotline topology folds into the operator-completion wave.
- `FBP-013` should remain the final integrated evidence-closeout family, but each major execution family must also carry paired verification children so rollout evidence does not drift behind implementation again.

### Remaining Question

- Tenant-portal convergence should stay isolated as its own first execution family; Platform Admin / Ops completion may run next, but their verification children should start in parallel rather than waiting for an all-at-end evidence phase.
