# Tenant Onboarding, Bootstrap Defaults, And Rollout Gates

Last updated: 2026-04-29
Task ref: `OPX-MD-003`

This runbook defines the standard path for opening a new tenant from initial
provisioning through sandbox, pilot, and production.

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

## Cutover Checklist

Before promoting a tenant into `production`, confirm:

1. Tenant user roles were invited and role ownership was acknowledged.
2. Billing baseline matches the commercial agreement and invoice recipient.
3. Integration package scopes, webhook events, sandbox URL, and production URL
   are correct.
4. Notification subscriptions route to the expected operator channel.
5. Cutover owner and rollback owner are named in the tenant rollout record.
6. Rollback plan is marked prepared in the platform-admin tenant record.

## Rollback Procedure

If production cutover fails:

1. Pause the tenant in `platform-admin`.
2. Revert partner or tenant integration endpoints back to sandbox or prior
   production credentials.
3. Disable production webhook delivery targets if they were part of the failed
   cutover.
4. Record the incident note in `rollout.notes` and keep `productionStatus`
   at `blocked`.
5. Resume only after the rollback owner confirms the previous working state is
   restored.

## Source Of Truth

- Platform-admin tenant record owns bootstrap defaults, integration package,
  rollout stage, cutover owner, rollback owner, and rollback readiness.
- Tenant hub is read-only for this onboarding package and must not fork its own
  bootstrap truth.
