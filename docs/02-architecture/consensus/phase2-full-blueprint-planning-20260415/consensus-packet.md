# Full Blueprint Planning Consensus Packet

Status: accepted

## Metadata

- Date: 2026-04-15
- Editor: Codex synthesis for the accepted full-blueprint planning round
- Workspace: `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/`
- Based on: `starter-draft.md`, `scope-matrix.md`, `backlog-proposal.md`, `review-round-1.md`, and the explicit human topology decision on tenant portal ownership
- Human gate basis: the user explicitly directed Codex to finish the planning work and carry it to execution-mode readiness on 2026-04-15

## 1. Accepted Scope Framing

- Planning scope is the **entire blueprint**, not only the currently visible remaining repo gaps.
- Full-scope planning must inventory every canonical domain, operator surface, client surface, rollout gate, cross-repo dependency, and future-gated blueprint slice.
- Narrower planning baselines are no longer sufficient as the master plan because they underrepresent absent surfaces and future-gated scope.
- `drts-fleet-platform` remains the canonical backend / contracts / control-plane / BFF repo.

## 2. Review Round Conclusions

- `Qwen` review outcome: `refine`
  - The full-blueprint reframing is correct, but the plan must distinguish `implemented_baseline`, `missing_surface`, `repo_topology_decision`, `cross_repo_cutover`, and `future_gated`.
- `Gemini` review outcome: `refine`
  - Wave E rollout / staging / smoke / UAT artifacts exist, but they are `implemented_baseline_but_evidence_pending`, not fully closed production proof.
- `Copilot` review outcome: `refine`
  - Missing blueprint surfaces must remain explicit backlog families; they cannot disappear merely because the current monorepo lacks landing zones.
- `Claude` topology review outcome: `confirm`
  - Tenant portal topology is stable enough to promote into execution: `tenant-commute-hub` is the only tenant UI, `drts-fleet-platform` is the BFF / authority, and `apps/tenant-portal-web` is a retire target.
- `Claude` sequencing review outcome: `refine`
  - The family order stands, but verification must run alongside each major execution family instead of waiting until the very end.

## 3. Final Planning Decisions

### 3.1 Classification Rules

The accepted planning taxonomy is:

- `implemented_baseline`
- `implemented_baseline_but_evidence_pending`
- `partially_aligned`
- `cross_repo_cutover`
- `missing_surface_future_gated`
- `future_gated`

This taxonomy supersedes the looser earlier framing that treated all rollout/UAT gaps as generic documentation debt.

### 3.2 Tenant Portal Topology

This decision is fixed for execution:

- `tenant-commute-hub` is the **only** tenant portal UI that should survive as the product-facing tenant portal.
- `drts-fleet-platform` owns tenant backend authority, contracts, BFF endpoints, audit, webhook, billing, and API semantics.
- `tenant-commute-hub` must remove Supabase and any other backend authority so that it becomes a pure UI consumer of `drts-fleet-platform`.
- `apps/tenant-portal-web` is **not** the long-term production tenant portal.
- Execution should freeze `apps/tenant-portal-web` only for the cutover window and then retire it under a named sunset rule.

### 3.3 Missing-Surface Disposition

The accepted disposition for absent blueprint surfaces is:

- `Passenger App / Web` remains visible as an explicit roadmap family, but does **not** block the current execution wave on a new repo landing.
- `Call Point / Concierge Portal` also remains visible as an explicit roadmap family, but does **not** block the current execution wave on a new repo landing.
- `Complaint Hotline Console` is treated as an operator-topology refinement inside the callcenter / complaint completion family; it does not require a separate standalone app before execution promotion.

### 3.4 Evidence-Closeout Rule

- Wave E established the staging / smoke / UAT **baseline**.
- Operational proof, sign-off, and production-readiness evidence are still incomplete.
- Every major execution family must therefore carry paired verification children while implementation proceeds.
- `FBP-013` remains the final integrated evidence-closeout family, and `FBP-014` remains the integrated cross-surface / cross-repo E2E family.

## 4. Planning Outputs Completed By This Session

The accepted packet treats these planning families as complete:

- `FBP-001` — full blueprint scope matrix: complete
- `FBP-002` — supersede stale planning baselines and freeze implemented baseline: complete
- `FBP-003` — missing-surface topology disposition: resolved for this master plan by preserving Passenger / Concierge as deferred roadmap families and folding hotline topology into the operator-completion family
- `FBP-004` — tenant portal topology capture and cutover/decommission direction: complete

These should not be reopened as fresh execution tasks.

## 5. Execution Families To Start Next

Execution should start from these families:

1. `FBP-005` through `FBP-007`
   - tenant-facing BFF parity in `drts-fleet-platform`
   - `tenant-commute-hub` BFF cutover and authority deletion
   - retire / decommission `apps/tenant-portal-web`
2. `FBP-008` through `FBP-012`
   - Platform Admin blueprint completion
   - Ops / Host / OpCo / ROC completion
   - callcenter / complaint / dispatch-trace completion
   - finance / billing / reimbursement / filing completion
   - public info / placard / regulatory report completion
3. `FBP-013` and `FBP-014`
   - final evidence closeout
   - integrated E2E verification
4. `FBP-015`
   - preserve Passenger / Concierge / AV / ODD / Tesla / ROC live-board scope in the deferred roadmap packet

## 6. Promotion Outcome

- Consensus packet status: **accepted**
- Human gate: **satisfied**
- Mode promotion decision: the repo may move from `discussion_planning` to `supervisor_managed_execution`
- Promotion rationale: the full blueprint scope is now inventoried, cross-repo tenant topology is fixed, missing surfaces are preserved in the master plan instead of lost, and the execution family order is defined clearly enough to instantiate supervisor-managed work
