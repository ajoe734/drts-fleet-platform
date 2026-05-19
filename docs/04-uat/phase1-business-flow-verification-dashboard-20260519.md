# Phase 1 Business-Flow Verification Dashboard (2026-05-19)

## Snapshot Basis

- Snapshot purpose: give delivery lead one page for the current gate read across
  `RLS`, `TEN`, `ORD`, `TGV`, `DSP`, `DRV`, `DRV-MP`, `FWD`, `PBK`,
  `PARTNER`, `COM`, `FIN`, and `PROD`.
- Baseline source: `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  on the current `dev` snapshot in this worktree.
- Accepted-but-not-yet-merged source: when `ai-status.json` records a workflow
  family task as `done` but the current `dev` snapshot still lacks that row,
  this dashboard reads the pushed owner-branch artifact named in `ai-status.json`.
- Machine-truth snapshot: dynamic task statuses below are aligned to canonical
  `ai-status.json` as of `2026-05-19T07:48:26Z`.
- Naming note: the partner family is tracked by task lineage
  `WF-PARTNER-001`, but the accepted gate row currently uses canonical gate id
  `WF-PRT-001`.

Accepted owner-branch rows used in this snapshot:

- `WF-TGV-001` from `origin/codex/wf-tgv-001` at `02d4ef8`
- `WF-DRV-MP-001` from `origin/codex2/wf-drv-mp-001` at `0ad963a`
- `WF-PRT-001` from `origin/codex/wf-partner-001` at `979ebe2`
- `WF-PBK-001` from `origin/codex/pbk-cutover-001` at `3edd033`
- `WF-PROD-001` from `origin/codex2/prod-rail-001` at `d21e326`
- `WF-FIN-001` refresh note from `origin/codex/fin-gov-001` at `3d740ca`

## Quick Read

| Lead bucket | Families | Read |
| --- | --- | --- |
| `staging-proven now` | `RLS`, `TEN`, `ORD`, `DSP` | Current gate read is already `PASS (live staging evidence)` on `dev`. |
| `static / repo-local only` | `TGV`, `DRV`, `DRV-MP`, `PARTNER`, `FIN`, `PROD` | Evidence exists, but the current accepted read is still `PASS (static evidence)` or `PASS (repo-local)`, not a fresh live promotion. |
| `sandbox promotion path open` | `FWD`, `COM` | Sandbox harness / E2E promotion work exists or is in flight, but the gate still reads `EXTERNAL-GATED` or `HOLD`. |
| `pilot / production gated` | `PBK`, `RLS`, `PROD` | Human-controlled pilot or production dispatch evidence is still required even after repo-local work. |

## Family Matrix

| Family | Gate id | Current gate read | Lead bucket | Evidence now | Next unlock |
| --- | --- | --- | --- | --- | --- |
| `RLS` | `WF-RLS-001` | `PASS (live staging evidence)` | `staging now; prod-gated next` | `dev` release-gates row; `support/sidecars/FBP-013A/`; `support/sidecars/FBP-013D/`; `PROD-RAIL-001` done; `TST-E2E-009-PROD-RAIL` is still `backlog` | Pick up and run the prod-rail dry-run path, then capture named production approver and rollback-owner evidence. |
| `TEN` | `WF-TEN-001` | `PASS (live staging evidence)` | `staging now` | `dev` release-gates row; `tests/e2e/E2E-004-tenant-attribution.sh`; `support/sidecars/FBP-014B/` | No baseline sandbox gap remains; tenant-by-tenant rollout approval stays separate. |
| `ORD` | `WF-ORD-001` | `PASS (live staging evidence)` | `staging now` | `dev` release-gates row; `tests/smoke/02-booking-create.sh`; `tests/e2e/E2E-001-enterprise-dispatch.sh`; `tests/e2e/E2E-004-tenant-attribution.sh`; `support/sidecars/FBP-014B/` | Baseline is already staging-proven; external partner-channel credentials remain separate. |
| `TGV` | `WF-TGV-001` | `PASS (static evidence)` | `static; staging-ready` | owner-branch row on `origin/codex/wf-tgv-001@02d4ef8`; `TST-E2E-005-TGV` is `done` on `origin/codex2/tst-e2e-005-tgv@9603f03` | If leadership wants a live staging read instead of static-only closure, rerun the new shell E2E on staging and refresh the gate row. |
| `DSP` | `WF-DSP-001` | `PASS (live staging evidence)` | `staging now` | `dev` release-gates row; `tests/smoke/03-dispatch-assign.sh`; `tests/e2e/E2E-001-enterprise-dispatch.sh` | Baseline dispatch is staging-proven; exception-hold and manual-override governance remain tracked separately. |
| `DRV` | `WF-DRV-001` | `PASS (static evidence)` | `static` | `dev` release-gates row; `tests/smoke/04-driver-task-accept.sh`; `tests/e2e/E2E-001-enterprise-dispatch.sh` | A stronger read would need dedicated live device/auth proof beyond the current static pack. |
| `DRV-MP` | `WF-DRV-MP-001` | `PASS (static evidence)` | `static; staging proof not started` | owner-branch row on `origin/codex2/wf-drv-mp-001@0ad963a`; `TST-E2E-006-DRV-MP` is still `backlog` | Pick up `TST-E2E-006-DRV-MP`; installable device/tester proof still remains external under `EXT-003`. |
| `FWD` | `WF-FWD-001` | `EXTERNAL-GATED` | `sandbox path open; external now` | `dev` release-gates row; `FWD-LIVE-001` partial pack on `origin/codex2/fwd-live-001@43455e3`; `FWD-SBX-001` is `review`; `FWD-E2E-001` is `backlog` | Approve the sandbox harness, then land sandbox E2E promotion; real partner callback / credential blockers remain open if live adapter proof is required. |
| `PBK` | `WF-PBK-001` | `HOLD` | `pilot / production gated` | owner-branch row on `origin/codex/pbk-cutover-001@3edd033`; `TST-E2E-008-PBK-CUTOVER` is `done` on `origin/codex2/tst-e2e-008-pbk-cutover@c264750` | Name the pilot partner entry plus `cutoverOwner` / `rollbackOwner`, run the pilot window, and capture rollback-drill / supervisor closeout evidence. |
| `PARTNER` | `WF-PRT-001` | `PASS (static evidence)` | `external-gated for live issuer` | owner-branch row on `origin/codex/wf-partner-001@979ebe2`; `TST-E2E-007-PRT` is `done` on `origin/codex/tst-e2e-007-prt@1a71b02`; `support/sidecars/EXT-001/` remains binding | Real issuer sandbox/live proof still needs `EXT-001` closure or equivalent `PARTNER-ELIG-LIVE-001` work. |
| `COM` | `WF-COM-001` | `HOLD` | `sandbox path open; live hold` | `dev` release-gates row; `COM-LIVE-001` partial pack on `origin/codex2/com-live-001@a2c27da`; `COM-CTI-SBX-001` is `in_progress`; `COM-E2E-003` is `backlog` | Finish the CTI sandbox harness, then land sandbox E2E proof; `EXT-004-BLK-*` still keep live filing/export on hold. |
| `FIN` | `WF-FIN-001` | `PASS (static evidence)` | `static; staging ingress blocked` | refreshed owner-branch note on `origin/codex/fin-gov-001@3d740ca`; `support/sidecars/FBP-014B/` still proves the earlier live baseline; `FIN-GOV-001` records the 2026-05-19 blocked rerun | Resolve valid IAP token minting or a reachable staging ingress, then rerun the governance-aware billing/reporting chain. |
| `PROD` | `WF-PROD-001` | `PASS (repo-local)` | `production-gated` | owner-branch row on `origin/codex2/prod-rail-001@d21e326`; `TST-E2E-009-PROD-RAIL` is still `backlog` | Pick up the dry-run script, then capture a manual `prod/v<date>` deploy with named approver evidence. |

## Delivery Lead Watchlist

1. `TGV` is the closest static family to a staging promotion: the row is in an
   accepted owner branch and `TST-E2E-005-TGV` is already `done`.
2. `DRV-MP` and `PROD` both have their gate rows landed on owner branches, but
   their strengthening shell E2Es (`TST-E2E-006-DRV-MP` and
   `TST-E2E-009-PROD-RAIL`) are both still `backlog`, so the read should stay
   at `static` or `repo-local`.
3. `FWD` and `COM` are the two explicit sandbox-conversion tracks. `FWD-SBX-001`
   is already in `review`, while `COM-CTI-SBX-001` is still `in_progress`; both
   preserve their conservative baseline reads (`EXTERNAL-GATED` and `HOLD`)
   until the sandbox harness plus the follow-on E2E promotion task land.
4. `PBK` is not waiting on repo-local implementation anymore. It is waiting on
   named pilot cutover ownership and a real rollback-ready pilot window.
