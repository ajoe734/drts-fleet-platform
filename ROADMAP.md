# Roadmap

Status: seed delivery-order proposal for multi-LLM review. This file is not the final execution plan yet.

## Summary

This roadmap is the current proposal for Phase 1 delivery order. It is not the supervisor task board yet, and it should be challenged against the canonical product truth during the consensus workflow.

## Wave 0: Canonical Architecture Bootstrap

- specialize the repo from imported orchestrator seed state to DRTS Phase 1
- track all Phase 1 source files and extracted reference bundles
- define canonical document precedence
- publish target architecture, work breakdown, decision ledger, and open questions
- create repo landing zones for contracts, fixtures, migrations, and seeds

Exit gate:

- human accepts the architecture docs and agrees they are ready for implementation slicing

## Wave 1: Foundation and Governance

- identity and access baseline
- tenant-partner master data baseline
- regulatory registry baseline
- audit and notification baseline
- product-rule publication baseline

## Wave 2: Owned Standard Taxi Core

- passenger and call-center order creation
- geocode and service-area validation
- order classification
- realtime dispatch
- driver task lifecycle
- dispatch trace and recording linkage

## Wave 3: Business Dispatch Core

- tenant booking lifecycle
- reservation scheduler and holds
- enterprise dispatch rules
- airport transfer rules
- proof and signoff enforcement

## Wave 4: Compliance and Customer Service

- vehicle, driver, contract, insurance, exclusivity, placard, and public-info lifecycles
- complaint case lifecycle and SLA
- incident linkage without lifecycle mixing

## Wave 5: Billing, Reporting, and Filing

- receipts, invoices, driver statements, reimbursements
- report jobs and artifact lifecycle
- filing package generation and manifesting

## Wave 6: Forwarder and Reconciliation

- external platform mirror lifecycle
- accept/lost-race/status sync
- reconciliation jobs

## Wave 7: Surface Integration and Hardening

- connect web and mobile surfaces to the accepted APIs and read models
- expand acceptance coverage from MVP regression set to broader operational flows
- prepare the repo for longer-running supervisor-managed delivery

## Deferred Scope (Phase 2+)

The following blueprint families are **not targeted by the current Phase 1 execution wave**.
They are preserved here explicitly so they remain visible in the master plan and are not
misread as complete or permanently out-of-scope.
See `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md` for full detail,
gate conditions, and promotion criteria for each family.

### Passenger App / Web (missing_surface_future_gated)

- PRD §9.1.1
- End-consumer-facing order creation, live tracking, receipt download, trip history
- No repo landing zone exists; deferred pending human topology decision
- Do not treat as complete; do not remove from master plan

### Call Point / Concierge Portal (missing_surface_future_gated)

- PRD §9.1.3
- Concierge-assisted order entry, CTI screen-pop, assisted booking workflow
- Backend callcenter module exists but no dedicated frontend surface
- Deferred pending human topology decision (extend ops-console-web vs. new app)
- Do not treat as complete; do not remove from master plan

### AV / ODD / Tesla / ROC Live-Board (future_gated)

- PRD §16
- Autonomous-vehicle runtime hooks, ODD geo-fence enforcement, Tesla Fleet API adapter,
  ROC live-board, AV-specific dispatch qualification, AV → human-driver fallback path
- No implementation landing zone in the current monorepo
- Deferred until AV regulatory approval, Tesla Fleet API agreement, and ROC design are ready
- Do not treat as complete; do not remove from master plan

---

## Tenant Portal Topology Note

**`apps/tenant-portal-web` is retired as of 2026-04-15 (FBP-007, SUNSET-001-tenant-portal-web).**

- This app was a Phase 1 Wave D scaffolding reference and is no longer a production target.
- The production tenant UI is `tenant-commute-hub` (external repo), which has been cut over to
  `drts-fleet-platform` as its BFF/authority (FBP-005, FBP-006).
- All active rollout and master plan references to a "tenant portal" mean `tenant-commute-hub`.
- See `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md` for the sunset record.
