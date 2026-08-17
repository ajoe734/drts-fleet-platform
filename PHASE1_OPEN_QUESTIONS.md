# Phase 1 Open Questions

These questions are intentionally isolated here so the repo does not silently invent answers.

## Open Items

| ID    | Question | Source / Module | Named Owner | Decision Route | Interim Default |
| ----- | -------- | --------------- | ----------- | -------------- | --------------- |
| Q-001 | Can one `call_session` create more than one order, or should Phase 1 UI remain one-call-one-primary-order? | service contracts §10.1 (`callcenter` + `owned-mobility`) | `Codex` (Contracts & Schema) | Callcenter & Order Service contract review / RFC; determine 1:1 vs 1:n foreign key constraints and ops-console callcenter UI dispatch flow | allow backend data model to stay extensible, but keep current planning assumption at one primary order per call flow |
| Q-002 | Should airport-related booking contracts keep a dedicated `flight_ref` field in Phase 1 even before flight-tracking runtime exists? | service contracts §10.2 (`tenant-partner` + `product-rule`) | `Codex2` (Partner & Airport Transfer) | Partner channel & airport transfer contract review; determine whether `flight_ref` is retained as optional metadata in DTOs or deferred to Phase 2 runtime integration | reserve the field in contracts and examples, but do not implement flight monitoring logic |
| Q-003 | Does driver payout stop at statement and reimbursement request, or does Phase 1 also need a real wallet ledger and payout accounting flow? | service contracts §10.3 + PRD (`billing-settlement`) | `Codex` (Contracts & Financial Model) | Billing & Settlement architecture decision / RFC with finance product owner; define boundary between batch statement/reimbursement and real-time wallet ledger | assume statement and reimbursement flow only; no real wallet ledger yet |
| Q-004 | For forwarded orders, do we need a strong local `trip completed` truth, or only a mirrored completion projection from the external platform? | service contracts §10.4 (`forwarder`) | `Codex2` (Forwarder Adapter) | Forwarder lifecycle & state machine RFC (aligned with GAP-CONF-04 / `CONF-STATE-001`); determine whether forwarder maintains internal trip completion lifecycle entity | assume mirrored projection only |
| Q-005 | Do filing and report artifacts need storage-level object lock, or are immutable manifest plus hash guarantees enough for Phase 1? | service contracts §10.5 (`reporting-filing` + `infra`) | `Gemini` (Infra & Compliance) | Regulatory storage architecture RFC; evaluate cloud storage Object Lock policy vs database immutable manifest with SHA-256 checksum verification | assume immutable manifest and controlled access first |
| Q-007 | When a booking or complaint rule conflicts with a UI placeholder that already exists, should implementation change the UI skeleton or bend the contract? | extracted glossary | `Claude` (Governance) | L1 Product Truth precedence rule | change the UI skeleton; never bend the product contract to fit an old placeholder |
| Q-013 | For `credit_card_airport_transfer`, should cooperating banks get distinct entry contexts (subdomain / path / signed bootstrap) or all share the exact same neutral tenant entry? | partner-channel addendum | `Claude2` (Partner Integration) | Partner booking surface topology decision (`docs/02-architecture/credit-card-airport-transfer-sd-20260610.md`) | assume one shared frontend codebase but distinct partner entry contexts; do not fork into one repo per bank |
| Q-014 | Must Phase 1 materialize a dedicated partner-authenticated ingress for bank / partner apps instead of routing every B2B flow through tenant-admin `/api/tenant/*` semantics? | partner-channel addendum | `Claude2` (API Integration) | Partner ingress architecture review | assume a dedicated `/api/partner/*` or equivalent partner ingress is required; do not overload tenant-admin auth |
| Q-015 | For `credit_card_airport_transfer`, is card / benefit eligibility verified synchronously before booking creation, or can Phase 1 accept a partner-issued verification reference token? | partner-channel addendum | `Codex2` (Eligibility Contracts) | Partner eligibility integration contract review | require backend-visible eligibility truth before booking creation; allow direct verify or reference-backed proof only |

## Resolved Items

| ID    | Resolution | Accepted Decision |
| ----- | ---------- | ----------------- |
| Q-006 | Passenger App / Web is deferred beyond Phase 1 closeout. Reopening requires a human topology decision (standalone consumer app vs embedded web route vs third-party white-label). Current Phase 1 demand entry relies on third-party ride-hailing, partner / tenant channel, and operator manual entry. | `support/sidecars/MSC-P1-001/MSC-P1-001-SURFACE-DECISION-PACKET.md` §Decision 1 (also `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`) |
| Q-008 | Dedicated concierge / call-point portal surface is deferred beyond Phase 1. Callcenter booking workflow is complete in `ops-console-web` for Phase 1. Reopening dedicated concierge portal requires a human topology decision (extend ops-console-web with restricted role vs dedicated frontend app). | `support/sidecars/MSC-P1-001/MSC-P1-001-SURFACE-DECISION-PACKET.md` §Decision 2 (also `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`) |
| Q-009 | Phase 1 removes first-party `Passenger App / Web` from the current completion bar. Demand entry is third-party ride-hailing, partner / tenant channel, and operator / backoffice manual entry. | `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md` |
| Q-010 | Phase 1 does not ship a passenger receipt UI. Receipt ownership follows order source, while DRTS keeps canonical finance / settlement / audit records and admin / tenant / backoffice retrieval. | `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md` |
| Q-011 | `GAP-P2S3-001` follows staged identity cutover: internal control-plane API first, internal web surfaces second; tenant, driver, partner, and webhook paths are not default IAP targets. | `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md` |
| Q-012 | Accepted decision packets temporarily supersede conflicting L1 wording within scoped execution conflicts; L1 PRD / SA sync happens later in a controlled design revision. | `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md` |

## Contract & Schema Synchronisation Backlog

| Item | Description | Owning Backlog / Task | Status |
| ---- | ----------- | --------------------- | ------ |
| `call_point_id` contract-type gap | `call_point_id` canonical ID is present in database (`core.call_points.call_point_id` in `V0003:60`) and referenced in `tenant-partner.controller.ts`, but lacks TypeScript contract type export in `packages/contracts/src/index.ts`. | `CONF-CODE-001` / `packages/contracts` sync backlog | Pending contract sync |

