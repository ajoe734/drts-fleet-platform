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
