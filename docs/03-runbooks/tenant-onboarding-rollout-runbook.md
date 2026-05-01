# Tenant Onboarding, Bootstrap Defaults, And Rollout Gates

Last updated: 2026-04-30
Task ref: `OPX-MD-003`, `ORX-MD-003`

This runbook defines the standard path for opening a new tenant from initial
provisioning through sandbox, pilot, and production.

Tenant API key and webhook operating rules are defined in
`docs/03-runbooks/tenant-api-webhook-governance-runbook.md`.

Cross-lane ownership routing for rollback and escalation is summarized in
`docs/03-runbooks/phase1-operator-routing-runbook.md`.

## Bootstrap Defaults

Provision every new tenant with these platform-owned defaults:

- Tenant roles: `tenant_admin`, `tenant_ops_admin`, `tenant_finance_admin`,
  `tenant_viewer`
- Billing baseline:
  - invoice title defaults to the tenant display name
  - billing contact defaults to `<tenant name> Billing Owner`
  - billing email defaults to the bootstrap admin email or
    `billing@<tenant-code>.example.com`
- Notification subscriptions:
  - `reservation.failed` -> `ops_console`
  - `tenant.sla.threshold_breached` -> `webhook`
- Default webhook event bundle:
  - `booking.created`
  - `booking.updated`
  - `dispatch.assigned`
  - `invoice.issued`
- Integration package:
  - `none`
  - `api_key`
  - `api_key_and_webhook`
  - `partner_managed`

## Rollout Stages

Use the explicit `rollout.stage` field on the platform tenant record.

- `sandbox`
  - mandatory starting state for all new tenants
  - bootstrap defaults, quota baseline, and integration package are prepared
  - sandbox endpoint and test credentials are validated
- `pilot`
  - sandbox gate is approved
  - tenant operators complete workflow smoke checks
  - billing baseline, notifications, and webhook delivery are verified against
    pilot traffic
- `production`
  - pilot gate is approved
  - cutover owner and rollback owner are named
  - rollback plan is marked prepared before promotion

Each stage also carries independent gate statuses:

- `sandboxStatus`
- `pilotStatus`
- `productionStatus`

Allowed values: `pending`, `ready`, `approved`, `blocked`

## Role Invitation And Acknowledgment

Each tenant has bootstrap role defaults. Required roles must be invited and
acknowledged before production promotion is permitted.

### Invitation flow

1. Platform admin selects a role in the tenant detail view and clicks **Invite**.
2. The API records `invitedAt` on the role default record.
3. An optional `inviteeEmail` may be provided for reference and future
   notification integration.

### Acknowledgment flow

1. After the invited user confirms ownership, platform admin clicks
   **Acknowledge** on the role.
2. The API records `acknowledgedAt` on the role default record.
3. Acknowledgment is only allowed after invitation (`TENANT_ROLE_NOT_INVITED`
   is returned otherwise).

### Promotion gate enforcement

The API enforces these checks automatically on `setRolloutStage`:

- **pilot**: `sandboxStatus` must be `approved`.
- **production**: `pilotStatus` must be `approved`, `cutoverOwner` and
  `rollbackOwner` must be set, `rollbackPrepared` must be `true`, and all
  required roles must have `acknowledgedAt` set.
- **rollback_hold**: any promotion is blocked until the hold is resolved.

If any gate is not met, the API returns `TENANT_PROMOTION_GATE_BLOCKED` with
the list of missing prerequisites.

## Cutover Checklist

Before promoting a tenant into `production`, confirm:

1. Tenant user roles were invited and role ownership was acknowledged.
2. Billing baseline matches the commercial agreement and invoice recipient.
3. Integration package scopes, webhook events, sandbox URL, and production URL
   are correct.
4. Notification subscriptions route to the expected operator channel.
5. Cutover owner and rollback owner are named in the tenant rollout record.
6. Rollback plan is marked prepared in the platform-admin tenant record.

## Rollback Hold

A tenant can be placed into `rollback_hold` status when a critical issue is
discovered during or after production cutover.

### Entering rollback hold

1. Platform admin clicks **Rollback Hold** on the tenant row in the tenant
   console, or calls `POST /platform-admin/tenants/:tenantId/rollback-hold`.
2. The API sets `status` to `rollback_hold` and `productionStatus` to `blocked`.
3. All further rollout stage promotions are blocked until the hold is resolved.

### Resolving rollback hold

1. Investigate and resolve the underlying issue.
2. Record the resolution in `rollout.notes`.
3. Reactivate the tenant by clicking **Activate** or calling the activate
   endpoint, which sets `status` back to `active`.
4. Update `productionStatus` through the onboarding endpoint if production
   readiness has been re-confirmed.

## Rollback Procedure

If production cutover fails:

1. Place the tenant in `rollback_hold` via the platform-admin console.
2. Revert partner or tenant integration endpoints back to sandbox or prior
   production credentials.
3. Disable production webhook delivery targets if they were part of the failed
   cutover.
4. Record the incident note in `rollout.notes` and keep `productionStatus`
   at `blocked`.
5. Resume only after the rollback owner confirms the previous working state is
   restored.
6. Reactivate the tenant and, if appropriate, re-promote through the rollout
   stages.

## Source Of Truth

- Platform-admin tenant record owns bootstrap defaults, integration package,
  rollout stage, cutover owner, rollback owner, and rollback readiness.
- Tenant hub is read-only for this onboarding package and must not fork its own
  bootstrap truth.
