# WF-COM-001-LIVE-PROVIDER — Unblock Planning Decision

**Task:** `WF-COM-001-LIVE-PROVIDER-UNBLOCK-PLANNING-DECISION`  
**Parent:** `WF-COM-001-LIVE-PROVIDER`  
**Owner:** `Codex`  
**Reviewer:** `Claude`  
**Date:** `2026-05-19`

## Summary

The missing planning decision is whether approved CTI stub or sandbox proof can clear the
`WF-COM-001-LIVE-PROVIDER` hold. It cannot.

`WF-COM-001` already has a separate base evidence posture for CTI/recording/filing design and
sandbox/static verification. The live-provider helper task remains a narrower P1 follow-on for
actual provider activation, live webhook controls, and live or staging evidence.

`COM-BLUEPRINT-001` is already closed in machine truth and is not the remaining gate.

## Canonical Decision

1. `WF-COM-001` base closure and `WF-COM-001-LIVE-PROVIDER` are different scopes.
   - The directive only requires `WF-COM-001` to move beyond `HOLD` to at least
     `PASS (static evidence)`, while clearly labeling CTI provider / sandbox / simulation level.
     Source: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.6.4.
   - The release gate matrix already records `WF-COM-001` as `PASS (sandbox evidence)` and keeps
     live CTI/provider activation explicitly out of the base claim. Source:
     `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.

2. Approved stub or sandbox proof is enough for the base workflow evidence path, but not for the
   live-provider helper parent.
   - `EXT-004` defines the remaining live activation blockers as provider/stub environment,
     callback contract, webhook security, staging callback proof, filing/export activation,
     retention/access sign-off, and an end-to-end live or staging run. Source:
     `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`.
   - `COM-LIVE-001` already records that partial evidence does not upgrade the gate and that
     `EXT-004-BLK-001` through `EXT-004-BLK-008` remain open. Source:
     `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`.

3. No further repo-side product decision is required before the parent stays blocked.
   - The service contract already fixes the ownership boundary: Callcenter owns callback metadata
     and recording index, but not the recording binary body itself, which may remain in object
     storage or with the CTI provider. Source: `phase1_service_contracts_v1.md` §3.9.
   - The migration plan still lists long-term CTI recording-body API support as an open future
     decision, but that does not block the base blueprint or justify reopening the live-provider
     task as a repo-only planning gap. Source: `phase1_migration_plan_v1.md` §14.

## Scope Cut

- Do not treat this helper task as permission to upgrade `WF-COM-001` beyond its existing sandbox
  claim.
- Do not treat approved stub or simulation evidence as sufficient to close
  `WF-COM-001-LIVE-PROVIDER`.
- Keep real CTI provider procurement, callback payload confirmation, webhook security alignment,
  staging callback proof, filing/export activation, retention sign-off, and end-to-end execution
  under `EXT-004-BLK-001` through `EXT-004-BLK-008`.

## Parent Next Step

1. Do not reopen `COM-BLUEPRINT-001`; canonical machine truth already records it done at
   `9373084`.
2. Keep `WF-COM-001-LIVE-PROVIDER` blocked until the CTI provider owner provides an actual live
   environment plus callback/security details for `EXT-004-BLK-001` through `EXT-004-BLK-003`.
3. After that external handoff exists, rerun the live-provider evidence pack to collect
   `EXT-004-BLK-004` through `EXT-004-BLK-008`.
