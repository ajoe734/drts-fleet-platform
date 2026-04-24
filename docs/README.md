# Documentation Index

This index groups the repo's active documentation into a few practical entry
points so the team can answer three different questions quickly:

1. What is the canonical blueprint?
2. What is the current code-backed system reality?
3. Which historical planning / review / closeout artifacts explain how we got here?

## Start Here

- `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
  Code-first audit of current implementation vs. the full Phase 1 blueprint.
- `docs/03-runbooks/master-system-closeout-checklist.md`
  Current closeout definition for the whole system.
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
  Closeout runbook for the protected control-plane auth migration and its
  staged fallback policy.

## Canonical Blueprint

These are the highest-value sources for intended product scope and delivery
order. They live at repo root, not under `docs/`.

- `phase1_prd_detailed_v1.md`
- `phase1_system_analysis_v1.md`
- `phase1_service_contracts_v1.md`
- `phase1_migration_plan_v1.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/`
- `phase1_db_migration_extracted/`

Supporting repo-local orientation:

- `docs/01-product/scope-phase1.md`
- `TARGET_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`
- `CANONICAL_DOCUMENT_MAP.md`

## Accepted System Design Decisions

Use these when a scoped human-accepted decision temporarily supersedes older
L1 wording without rewriting the canonical PRD / SA in the same execution wave.

- `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`

## Current System Truth

Use these when the question is about what is actually implemented and what
remains open now.

- `ai-status.json`
  Machine-readable task and closeout truth.
- `current-work.md`
  Generated human-readable mirror of `ai-status.json`.
- `docs/00-context/project-overview.md`
  Short repo posture summary.
- `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
  Code-verified alignment and residual gaps.
- `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
  Cross-repo code-backed annex audit capturing the historical workspace-vs-clean-clone split state, plus later addenda for the merged remote-baseline closeout.

## Runbooks, Rollout, and Evidence

- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `docs/03-runbooks/execution-next-wave-task-board.md`
- `docs/03-runbooks/execution-mode-candidate-backlog.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `docs/03-runbooks/phase1-rollout.md`
- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`

## Architecture, Authority, and Cross-Repo Topology

- `docs/02-architecture/repo-structure.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
- `docs/02-architecture/authority/fbp-005-tenant-bff-parity-matrix.md`
- `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`
- `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`
- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`

## Planning and Consensus Archives

These directories are historical decision trails. They are useful for context,
but they are not the current execution truth unless a later closeout/runbook
explicitly references them.

- `docs/02-architecture/consensus/phase1/`
- `docs/02-architecture/consensus/phase1-status-audit/`
- `docs/02-architecture/consensus/phase1-next-wave/`
- `docs/02-architecture/consensus/phase2-gap-reassessment-20260415/`
- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/`
- `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/`
- `docs/02-architecture/consensus/gap-phase2-planning-20260417/`

## Development Feedback and Sidecars

Execution feedback and acceptance packets mostly live outside `docs/`.

- `support/sidecars/`
- `ai-activity-log.jsonl`

Use these when you need to understand reviewer findings, acceptance evidence,
handoff context, or why a task was reopened or classified a certain way.

## Reading Order by Question

- "What should exist?"  
  Read the root `phase1_*` blueprint files first.
- "What exists in code today?"  
  Read `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`,
  then confirm against `apps/*` and `apps/api/src/modules/*`.
- "What is still blocking closeout?"  
  Read `ai-status.json`, `current-work.md`, and
  `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`.
- "Why was a planning or topology decision made?"  
  Read the relevant directory under `docs/02-architecture/consensus/`.
