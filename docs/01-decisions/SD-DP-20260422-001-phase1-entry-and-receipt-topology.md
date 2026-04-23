# SD-DP-20260422-001 Phase 1 Entry and Receipt Topology

## Decision Record

- `decision_id`: `SD-DP-20260422-001`
- `title`: `Phase 1 entry topology and receipt delivery without a first-party passenger surface`
- `owner`: `Human / system-design via accepted 2026-04-22 review`
- `date`: `2026-04-22`
- `status`: `accepted`
- `affected_docs`:
  - `ROADMAP.md`
  - `PHASE1_OPEN_QUESTIONS.md`
  - `docs/03-runbooks/execution-mode-candidate-backlog.md`
  - `docs/03-runbooks/execution-next-wave-task-board.md`
  - `docs/02-architecture/tenant-commute-hub-boundary.md`
- `old_wording_or_conflicting_anchor`:
  - `phase1_prd_detailed_v1.md` passenger app/web scope wording
  - `phase1_system_analysis_v1.md` passenger-entry wording
  - `PHASE1_OPEN_QUESTIONS.md` `Q-009`, `Q-010`
- `superseding_decision`:
  - Phase 1 removes first-party `Passenger App / Web` from the current completion bar.
  - Current Phase 1 demand entry is limited to third-party ride-hailing platforms, partner / tenant channels, and operator / backoffice manual entry.
  - Phase 1 does not ship a passenger receipt UI or passenger receipt delivery center.
  - Receipt ownership follows order source: third-party platforms own third-party receipts; partner / tenant channels own their customer-facing receipt delivery; DRTS keeps canonical finance, settlement, and audit records plus admin / tenant / backoffice retrieval.
  - `tenant-commute-hub` remains a tenant / partner frontend consumer of `/api/tenant/*`, not a second booking authority and not a passenger product.
- `scope`:
  - execution backlog wording
  - runbooks and repo-orientation docs
  - tenant / driver / finance implementation direction
- `out_of_scope`:
  - direct edits to L1 PRD / SA files in this change
  - reopening a first-party passenger surface
  - inventing email / SMS receipt delivery without a separate design decision
- `implementation_implications`:
  - do not open first-party passenger UI backlog for the current Phase 1 execution mode
  - do not open passenger receipt-center work
  - keep `tenant-commute-hub` frontend-only and route production tenant data through `drts-fleet-platform`
  - keep driver and settlement surfaces source-aware for third-party / partner / owned orders
- `migration_tasks`:
  - update execution docs to name first-party passenger UI as out of the Phase 1 completion bar
  - keep tenant portal convergence focused on `/api/tenant/*`
  - preserve external receipt reference and source-owned finance fields in settlement / reporting flows
- `completion_bar`:
  - passenger demand entry for current Phase 1 comes from third-party / partner / tenant / operator channels
  - no first-party passenger login, booking, or receipt center is required
  - canonical financial and audit records remain in DRTS even when customer-facing receipts are external
- `rollback_or_revisit_conditions`:
  - product strategy explicitly reopens a first-party passenger surface
  - a new system-design packet defines a DRTS-owned customer receipt channel
- `approval`:
  - accepted for implementation-blueprint use after the 2026-04-22 human instruction to review the decision feedback and integrate it if there were no objections

## References

- Source synthesis:
  - `docs/02-architecture/phase1_system_design_decision_packet_for_dev_team_20260422.md`
- Related execution anchors:
  - `support/sidecars/MSC-P1-001/MSC-P1-001-SURFACE-DECISION-PACKET.md`
  - `support/sidecars/MSC-F1-001/MSC-F1-001-FINANCE-REPORTING-AUDIT.md`
