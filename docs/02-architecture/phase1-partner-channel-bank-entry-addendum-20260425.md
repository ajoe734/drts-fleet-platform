## Phase 1 Partner Channel and Bank Entry Addendum

Status: implementation-blueprint addendum  
Date: 2026-04-25  
Scope: `drts-fleet-platform`, `tenant-commute-hub`

### Purpose

This addendum captures a business-capability gap that is now explicit after the
Phase 1 closeout wave:

1. business dispatch already supports `enterprise_dispatch` and
   `credit_card_airport_transfer`
2. tenant portal entry already exists for tenant-scoped bookings
3. driver execution and finance surfaces already exist
4. but bank-specific partner entry, partner-authenticated ingress, and
   card-eligibility verification are not yet fully materialized

This document does not reopen first-party passenger app/web scope. It clarifies
how partner-channel entry should extend the current topology.

### Current Reality

What already exists on remote `main`:

- `Driver App` exists as the active Phase 1 driver surface, including jobs,
  trip lifecycle, incident handling, earnings, and settings.
- `tenant-commute-hub` exists as the current partner / tenant booking frontend.
- backend contracts and booking rules already recognize
  `credit_card_airport_transfer` and `enterprise_dispatch`.
- airport pickup validation already requires `flightNo` in the owned-mobility
  booking flow.
- tenant-facing integration primitives already exist:
  `tenant/api-keys`, `tenant/webhooks`, tenant-scoped bookings, and billing /
  reporting surfaces.

What is not yet fully materialized:

- dedicated bank-specific entry bootstrap
- dedicated partner-authenticated ingress for partner-driven booking flows
- bank-card eligibility verification before creating
  `credit_card_airport_transfer` bookings
- canonical partner-channel identity carried end-to-end in booking, audit, and
  settlement truth

### Topology Clarification

Phase 1 should not solve this by creating one frontend repo per cooperating
bank.

Preferred topology:

- one partner-capable frontend codebase
- multiple partner-specific entry points
- partner context established at entry time
- partner / bank identity enforced by backend ingress and eligibility checks

Acceptable entry forms:

- dedicated subdomain, for example `bank-a.example.com`
- dedicated path, for example `/partner/bank-a`
- signed partner bootstrap link from an external app

The product requirement is therefore "different partner entry contexts", not
"many unrelated tenant portal codebases".

### Proposed Capability Model

#### 1. Partner Channel Registry

The system should materialize a canonical registry for partner-channel entry.

Minimum fields:

- `partner_id`
- `partner_code`
- `partner_type` such as `bank`, `property_manager`, `enterprise_program`
- `program_id`
- `entry_slug`
- `entry_host` or `entry_path`
- `channel_type`
- `branding_theme`
- `enabled_service_buckets`
- `enabled_business_dispatch_subtypes`
- `eligibility_mode`
- `api_auth_mode`
- `active_flag`

This registry becomes the source of truth for:

- which entry point belongs to which cooperating partner
- which booking subtype is allowed through that entry
- which downstream verification rule applies

#### 2. Partner Ingress

Tenant portal APIs are not enough for direct partner-app integration.

Phase 1 should materialize a dedicated partner ingress, for example:

- `POST /api/partner/eligibility/verify`
- `POST /api/partner/bookings`
- `GET /api/partner/bookings/:bookingId`
- `POST /api/partner/bookings/:bookingId/cancel`
- `POST /api/partner/webhooks/...` where needed

Required properties:

- partner-authenticated caller identity
- request signing, mTLS, or equivalent partner credential policy
- explicit partner / program / channel context
- no overload of tenant-admin semantics for external partner callers

#### 3. Bank-Card Eligibility Verification

For `credit_card_airport_transfer`, booking creation should not rely only on
the selected subtype.

The flow should support one of these verified inputs:

- synchronous issuer / bank eligibility verification before booking creation
- a pre-issued partner eligibility token / reference that the backend verifies
  before booking creation

Minimum verification output to persist:

- `eligibility_verification_id`
- `partner_id`
- `program_id`
- `bank_code`
- `card_program_code`
- `verification_status`
- `verification_reason_code`
- `benefit_reference`
- `issuer_authorization_ref`
- `verified_at`
- `expires_at`

#### 4. Booking Truth Additions

Partner-channel bookings, especially airport-transfer programs, should carry
partner truth beyond current tenant truth.

Recommended booking / settlement carry-through fields:

- `partnerId`
- `partnerProgramId`
- `entryChannel`
- `benefitReference`
- `eligibilityVerificationId`
- `issuerAuthorizationRef`
- `payerType`
- `receiptOwner`

This prevents bank-program orders from collapsing into a generic tenant booking
without partner provenance.

### UX Implications

#### `tenant-commute-hub`

Current portal can continue to act as the shared frontend baseline, but
partner-specific entry should be able to:

- pre-bind partner context from host/path/bootstrap token
- hide unrelated tenant flows
- apply partner-specific branding
- show program-specific required fields
- require eligibility verification for airport transfer before submission

#### Driver App

No new driver topology is required for this addendum. The existing driver app
already supports:

- source-aware task inbox
- trip execution lifecycle
- platform / dispatch subtype awareness
- earnings and statement views

The driver-facing delta is mainly better surfacing of partner / program context
on relevant tasks, not a missing driver surface.

### What Counts as a Real Gap

The following should now be treated as true capability gaps rather than
historical ambiguity:

1. bank-specific partner entry bootstrap
2. dedicated partner ingress for non-tenant external callers
3. card-eligibility verification for `credit_card_airport_transfer`
4. partner-aware booking / settlement carry-through

The following should **not** be reopened by this addendum:

- first-party passenger app/web
- passenger receipt center
- multiple separate frontend repos per bank

### Suggested Implementation Order

1. materialize `partner channel registry`
2. materialize partner-authenticated ingress
3. add bank-card eligibility verification contract and persistence
4. bind partner entry context into frontend bootstrap
5. surface partner / program provenance into audit, settlement, and exports

### Canonical Companions

- `docs/02-architecture/phase1_system_design_decision_packet_for_dev_team_20260422.md`
- `docs/03-runbooks/execution-mode-candidate-backlog.md`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `PHASE1_OPEN_QUESTIONS.md`
