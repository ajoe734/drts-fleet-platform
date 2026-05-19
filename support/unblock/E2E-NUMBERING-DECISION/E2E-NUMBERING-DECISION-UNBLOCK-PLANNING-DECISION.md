# E2E-NUMBERING-DECISION unblock: planning decision repair

Status: resolved
Task: `E2E-NUMBERING-DECISION-UNBLOCK-PLANNING-DECISION`
Parent: `E2E-NUMBERING-DECISION`
Owner: `Codex2`
Reviewer: `Claude2`
Date: 2026-05-19

## Problem

The parent task was already marked `done` with Q1 approved in `docs/00-context/phase1-v3-resolution-20260519.md`, but the planning runbook still contained stale "decision needed" and HELD wording for the E2E numbering conflict. That left the canonical planning artifacts inconsistent and obscured the concrete next step for downstream tasks.

## Canonical decision

Authoritative source: `docs/00-context/phase1-v3-resolution-20260519.md` §Q1.

Approved outcome:

- Keep shipped numbering unchanged:
  - `E2E-007` = partner-airport-transfer
  - `E2E-008` = partner-booking-cutover
  - `E2E-009` = prod-rail-dry-run
- Add new scripts without renumbering shipped evidence:
  - `E2E-010` = governance-aware-billing-reporting
  - `E2E-011` = platform-admin-control-plane

## Planning repair applied

- Updated `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` to mirror the approved `A / A / B / C` resolution instead of treating numbering/naming/doc-strategy as pending decisions.
- Replaced stale references to `E2E-010-platform-admin-control-plane.sh` with the approved `E2E-011-platform-admin-control-plane.sh`.
- Repointed `REL-SYNC-001` to the canonical artifact name `docs/03-runbooks/phase1-release-truth-sync-20260519.md`.

## Concrete unblocked next step

- `REL-SYNC-001` must mirror Q1 in the release-truth-sync runbook and explain that shipped `E2E-007/008/009` remain immutable evidence anchors.
- `WF-ADM-001-E2E` must implement `tests/e2e/E2E-011-platform-admin-control-plane.sh`.
- `WF-FIN-GOV-001` planning continues under the approved Q3 split: keep `WF-FIN-001` baseline and add `WF-FIN-GOV-001` as enrichment.

## Evidence

- Canonical planning artifact updated: `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- Support note added: `support/unblock/E2E-NUMBERING-DECISION/E2E-NUMBERING-DECISION-UNBLOCK-PLANNING-DECISION.md`
