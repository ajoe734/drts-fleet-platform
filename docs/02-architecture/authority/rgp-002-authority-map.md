# Cross-Repo Authority Map — drts-fleet-platform ↔ tenant-commute-hub

Status: planning artifact (no code change)
Task: RGP-002 — Produce durable cross-repo authority map
Owner: Codex • Reviewer: Claude
Created: 2026-04-13

This document clarifies source-of-truth boundaries, producer/consumer responsibilities, and forbidden authority leaks between the core backend mono-repo (`drts-fleet-platform`) and the external UI consumer repo (`tenant-commute-hub`). It is grounded in the accepted Phase 1 product truth and service contracts, and it should be cited by onboarding and any future reopen/annex work.

Primary citations:

- phase1_service_contracts_v1.md (Sections 2.5, 3.x, 4.x, 5.x, 7.x)
- phase1_prd_detailed_v1.md (Sections 2–9, especially 7: Information Architecture)
- phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md (Sections 3.2, 3.3, 3.18, 3.19)
- docs/02-architecture/consensus/sessions/20260413T025550Z-repo-gap-reassessment-v3/consensus-packet.md (Bucket A decisions; C4 boundary notes)

---

## 1) Scope and Intent

- Planning artifact only; does not change product semantics or runtime code.
- Defines cross-repo authority boundaries so that `tenant-commute-hub` remains UI-only and consumes contracts produced by `drts-fleet-platform`.
- Mirrors the accepted consensus packet: Phase 1 closeout remains core-repo scoped; `tenant-commute-hub` annex audit is a separate, blocked follow-up. See: docs/02-architecture/consensus/sessions/20260413T025550Z-repo-gap-reassessment-v3/consensus-packet.md.

---

## 2) Source-of-Truth Surfaces (by domain)

For each surface, the authoritative write path and core definitions live in `drts-fleet-platform`. `tenant-commute-hub` consumes read APIs and issues commands strictly via those APIs.

- Identity & Scopes: Authentication realms, scopes, and RBAC enforcement. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.1; W7-001B posture summarized in §7.
- Tenant & Partner Directory: Tenants, users/roles, addresses, webhooks, billing profile. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.2.
- Regulatory Registry: Vehicle, driver, contracts, insurance, exclusivity, placard/public info. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.3.
- Product & Rule Catalog: SLA/pricing/split templates, qualification profiles. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.4.
- Orders & Bookings (owned): Order and booking lifecycles, classification, notes. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.5, §4.1–4.2.
- Dispatch: Dispatch job/attempt/assignment, ETA snapshot, reservations/queue/trace. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.6, §4.3.
- Forwarder Mirror: Inbound external orders, accept relay, native status sync. Source of truth: backend services (mirror only; external platform remains authoritative for native state). Ref: phase1_service_contracts_v1.md §3.7.
- Driver Tasking & Shifts: Task lifecycle, shift/attendance, earnings read model. Source of truth: backend services (earnings is read model). Ref: phase1_service_contracts_v1.md §3.8.
- Callcenter & Recording Index: Call sessions, recording index, callback tasks. Source of truth: backend services (recording binary is external). Ref: phase1_service_contracts_v1.md §3.9, §4.5.
- Complaint Case Center: Cases, timeline, SLA, resolution/export view. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.10, §4.6.
- Billing & Settlement: Invoices, driver statements, reimbursements, fee plans. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.11.
- Reporting & Filing: Report jobs, artifacts, filing packages. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.12, §4.7.
- Audit & Notification: Append-only audit log, notification fan-out, webhook delivery. Source of truth: backend services. Ref: phase1_service_contracts_v1.md §3.13.

---

## 3) Producer / Consumer Matrix

Legend — P: Producer • C: Consumer • SoT: Source of Truth • RM: Read Model

| Surface                                   | Producer Repo (role)           | Consumer Repo(s) (role) | Rationale                                                            | Canonical Citation                            |
| ----------------------------------------- | ------------------------------ | ----------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Identity/Scopes                           | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | UI sessions derive scopes; all authorization enforced server-side    | phase1_service_contracts_v1.md §3.1; PRD §7.1 |
| Tenants/Users/Webhooks                    | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | UI manages via APIs; webhook secrets/keys not stored in UI           | §3.2; dev-pack §3.15                          |
| Vehicle/Driver/Contracts/Insurance        | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Registry is authoritative; UI reads, never writes DB                 | §3.3                                          |
| Product/Rule Catalog                      | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Templates published immutably; UI previews/reads                     | §3.4                                          |
| Orders/Bookings (owned)                   | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | UI creates via command APIs; state machine lives server-side         | §3.5; dev-pack §3.5–3.6                       |
| Dispatch                                  | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Scheduling/assignment/trace owned by server; UI drives via endpoints | §3.6; dev-pack §3.8                           |
| Forwarder Mirror                          | drts-fleet-platform (P mirror) | tenant-commute-hub (C)  | External platform remains native authority                           | §3.7                                          |
| Driver Tasks/Shifts/Earnings (RM)         | drts-fleet-platform (P, RM)    | tenant-commute-hub (C)  | Earnings is a read model; UI displays only                           | §3.8; dev-pack §3.12                          |
| Call Sessions/Recording Index             | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Recording binary is external; indexing SoT is server                 | §3.9; dev-pack §3.7                           |
| Complaint Cases                           | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Case lifecycle enforced server-side                                  | §3.10; dev-pack §3.11                         |
| Invoices/Driver Statements/Reimbursements | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Financial SoT and versions live server-side                          | §3.11; dev-pack §3.12                         |
| Report Jobs/Filing Packages               | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Job lifecycle and signed downloads are server-owned                  | §3.12; dev-pack §3.13–3.14                    |
| Audit/Notifications/Webhooks              | drts-fleet-platform (P, SoT)   | tenant-commute-hub (C)  | Append-only audit; webhook delivery/retry centralized                | §3.13; dev-pack §3.15                         |

Notes:

- “Producer Repo” denotes where contracts and write paths are authored and enforced. “Consumer Repo” uses those contracts via HTTP/API clients.
- External platforms (CTI, maps, forwarder partners, payment providers) are not part of `tenant-commute-hub` authority; they integrate with `drts-fleet-platform` per provider contracts.

---

## 4) Authority Boundaries & Forbidden Leaks

Explicit rules to prevent cross-repo authority drift:

- No direct DB writes from `tenant-commute-hub`. All state changes flow through backend command endpoints. Ref: phase1_service_contracts_v1.md §7.1; dev-pack §3.19 (not allowed behaviors).
- UI must not evaluate business rules or derive authoritative states locally (e.g., computing dispatchability, editing order status, or mutating billing/statement fields). Ref: service contracts §§3.3, 3.5–3.6, 3.11.
- Canonical enums are serialized in snake_case and must not be reinterpreted as display strings for submission. Ref: dev-pack §3.18.
- Error/Success envelopes and list pagination must conform exactly (data/meta, items/page_info). UI cannot special-case or silently unwrap to different shapes. Ref: dev-pack §§3.2.3–3.2.5.
- Idempotency and headers must be honored for command endpoints; UI must not retry in ways that violate server idempotency semantics. Ref: dev-pack §3.2.2, §3.2.6.
- Webhook signing/verification and signed downloads are server-owned; UI must not proxy or store secrets. Ref: dev-pack §§3.13–3.15; service contracts §3.13.
- Forwarded orders remain authoritative at the external platform; UI must not coerce forwarded states into owned states. Ref: service contracts §3.7.

---

## 5) Integration Guardrails (Consumer Obligations)

Minimum client-side obligations for `tenant-commute-hub`:

- Headers: `Authorization`, `X-Request-Id`, `Idempotency-Key` (for POST commands), optional `X-Tenant-Code` for Platform admin cross-tenant actions. Ref: dev-pack §3.2.2.
- Envelope contract: all responses carry `data/meta`; lists carry `items[]` + `page_info`. Ref: dev-pack §§3.2.3–3.2.5.
- Error handling: handle registry errors and business constraints using the standard error envelope and codes. Ref: dev-pack §3.3.
- Enum/field casing: send/accept snake_case; do not transform canonical enum values. Ref: dev-pack §3.18.
- Auth scopes: requests must present realms/scopes appropriate to the surface; server enforces RBAC. Ref: service contracts §3.1 and Phase 1 hardening (W7-001B posture summarized in §7).

---

## 6) Governance & Change Control

- Ownership for this map: Codex (contracts/schema lane). Reviewer: Claude.
- Update triggers: creating a new API surface or DTO family; moving a surface between repos; introducing a new read model that crosses repo boundaries; adding a new external provider class.
- Process: propose diffs in this file; cite L1/L2 documents or a new consensus packet. If semantics change, route through discussion → consensus packet → supervisor-managed execution before updating this map.

---

## 7) Alignment With Accepted Consensus

- Phase 1 completion remains core-repo scoped; `tenant-commute-hub` staging readiness is not a gate for current Phase 1 closeout. Ref: consensus-packet.md Human Gate Outcome.
- `tenant-commute-hub` posture: UI-only; consumes contracts from `drts-fleet-platform`. Detailed code-level posture is deferred to a blocked annex audit. Ref: consensus-packet.md §C4 and “Items Safe to Convert”.
- Auth/RBAC and wire-contract conformance (snake_case, envelopes) are already enforced server-side per accepted W7-001B/W7-001D outcomes captured in repo history and service contracts §7.1 and dev-pack §§3.2, 3.18.

---

## 8) Open Questions (tracked)

- Annex Audit (RGX-010): Confirm `tenant-commute-hub` code does not implement forbidden authority (e.g., local rule evaluation, state mutation, non-conforming envelopes). Blocked until code access is granted. Ref: .orchestrator/task-briefs/RGX-010-SIDECAR-ACCEPTANCE.md; consensus-packet.md §C4.
- Future Phase scope: If Phase 2 introduces new cross-repo flows (e.g., AV), this map must be updated in tandem with consensus decisions.

---

## 9) File Location

- This document lives at: docs/02-architecture/authority/rgp-002-authority-map.md
- Planning artifact; citeable by onboarding materials and reopen/annex tasks.
