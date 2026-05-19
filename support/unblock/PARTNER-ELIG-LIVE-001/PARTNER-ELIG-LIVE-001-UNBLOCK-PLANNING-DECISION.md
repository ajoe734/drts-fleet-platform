# PARTNER-ELIG-LIVE-001 — Unblock Planning Decision

**Task:** `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION`  
**Parent:** `PARTNER-ELIG-LIVE-001`  
**Owner:** `Codex2`  
**Reviewer:** `Claude2`  
**Date:** `2026-05-19`

## Decision

No additional repo-local product or contract decision is pending for `PARTNER-ELIG-LIVE-001`.
The missing input is explicitly routed as an external issuer-activation gate, not a design ambiguity.

## Canonical evidence

1. `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
   already classifies `PARTNER-ELIG-LIVE-001` under `HELD (external)`.
2. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
   states that repo/static proof for partner eligibility is complete, but live issuer proof remains
   external-gated and must not be restated as closed before `PARTNER-ELIG-LIVE-001`.
3. `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a
   already cuts the remaining work to real issuer API contract, sandbox credentials, and allowed
   test cards under `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`.
4. `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
   enumerates the exact blockers as `EXT-001-BLK-001` through `EXT-001-BLK-006`.

## Scope cut

`PARTNER-ELIG-LIVE-001` does not need more Phase 1 repo design work after `PRT-SPEC-001`.
The remaining closure is operational and external:

- issuer or bank API contract authority
- sandbox credentials and network allowlist
- issuer-approved eligible/ineligible/timeout fixture matrix
- timeout and retry confirmation
- manual-review business sign-off
- sensitive-data handling approval

## Parent next step

Resume `PARTNER-ELIG-LIVE-001` only when an owner can attach evidence for `EXT-001-BLK-001`
through `EXT-001-BLK-006` to `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`.
Until then, keep the task blocked as an external-resource hold and do not reopen contract/spec scope.

## Acceptance mapping

- Resolve or route missing decision: routed to `EXT-001` external gate.
- Record the decision: this packet plus the planning runbook update below.
- Scope cut / follow-up: repo-local design work is cut; the only follow-up is external evidence
  collection against `EXT-001-BLK-001..006`.
- Update parent with concrete next step: parent `next` should reference the same blocker list and
  evidence path.
