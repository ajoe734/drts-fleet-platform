# Tenant Admin Governance Onboarding

Last updated: 2026-05-13
Task: `DOC-TEN-GOV-001`
Audience: `tenant_admin`

This guide walks a new tenant admin through the Phase 1 governance bootstrap in
the same order the backend contracts expect:

1. create cost centers
2. set a monthly quota policy
3. write approval rules
4. invite approvers

As of 2026-05-13, `/users` is landed in `tenant-console-web`, while
cost-center / quota / approval-rule screens are still prototype-first. The UI
evidence below therefore uses ASCII mockups derived from
`docs/05-ui/drts-design-canvas/tenant-screens.jsx` when a route has not landed
yet.

## Before You Start

- Sign in as a user with `tenant_admin` authority.
- Send all requests with `Authorization: Bearer <tenant session>` and
  `x-tenant-id: <tenant-id>`.
- For command-style POST or PUT requests, also send `x-request-id` and
  `Idempotency-Key` so retries stay within the canonical envelope rules.
- Keep at least one active `tenant_admin` user in the tenant. Approval fallback
  can escalate to `tenant_admin`, but it cannot resolve to an empty directory.
- If your tenant still has zero cost centers, booking can temporarily accept
  legacy free-text cost center values. Once you create the first active cost
  center, booking switches to canonical directory validation.

Recommended first-pass bootstrap set:

- `CC-OPS`
- `CC-ENG`
- `CC-FINANCE`

<a id="bootstrap-overview"></a>

## Bootstrap Flow At A Glance

```text
Cost centers
  -> give booking a canonical billing / ownership directory

Quota policy
  -> define monthly count / amount guardrails at tenant or cost-center scope

Approval rule
  -> decide when a booking should warn, block, or require approval

Approver invite
  -> make sure every approver descriptor resolves to real tenant users
```

<a id="cost-center-create"></a>

## 1. Create Cost Centers

Create the directory first so bookings, quotas, and approval rules all point at
the same canonical code.

### UI mockup

```text
+--------------------------------------------------------------------------------+
| 成本中心                                                    [新增]             |
| 部門 · 月配額 · 預設審批規則                                                   |
+--------------+-------------------+------------------+-----------+--------------+
| CODE         | NAME              | OWNER            | 月配額    | 審批         |
+--------------+-------------------+------------------+-----------+--------------+
| CC-OPS       | Operations        | Ops Lead         | inherited | owner signoff|
| CC-ENG       | Engineering       | Tenant Admin     | inherited | owner signoff|
| CC-FINANCE   | Finance           | Finance Lead     | inherited | owner signoff|
+--------------+-------------------+------------------+-----------+--------------+
```

### REST example

```http
POST /api/tenant/cost-centers HTTP/1.1
Authorization: Bearer <tenant session>
x-tenant-id: tenant-acme-001
Content-Type: application/json

{
  "code": "CC-FINANCE",
  "name": "Finance",
  "description": "Billing, settlement, and audit support.",
  "ownerUserId": "tenant-user-finance-001"
}
```

### What to verify

- `GET /api/tenant/cost-centers?activeOnly=true` returns the new code.
- `ownerUserId` is set for any cost center that will later use
  `cost_center_owner` approvers.
- If you are migrating from legacy free-text values, run
  `GET /api/tenant/cost-centers/coverage` and map the unresolved samples before
  enforcing strict booking validation.

<a id="quota-policy-set"></a>

## 2. Set A Quota Policy

Start with one tenant-wide monthly policy. Add per-cost-center overrides only
when the tenant needs different limits for executive, finance, or high-volume
operational travel.

### UI mockup

```text
+-------------------------------------------------------------------------------+
| 審批與配額 > 配額政策                                                         |
| period: monthly          enforcement: hard_block                              |
| booking count limit: 50  amount limit: NT$ 100,000                            |
| applies to: tenant default                                                     |
|                                                       [預覽影響] [儲存政策]   |
+-------------------------------------------------------------------------------+
| Preview                                                                        |
| CC-FINANCE · 2026-05 · booking_count remaining 2 -> 1                         |
| CC-FINANCE · 2026-05 · amount remaining NT$ 20,000 -> NT$ 12,000             |
+-------------------------------------------------------------------------------+
```

### REST example

```http
POST /api/tenant/quotas/policies HTTP/1.1
Authorization: Bearer <tenant session>
x-tenant-id: tenant-acme-001
Content-Type: application/json

{
  "period": "monthly",
  "limit": {
    "bookingCountLimit": 50,
    "amountMinorLimit": 10000000,
    "currency": "TWD",
    "enforcementMode": "hard_block"
  }
}
```

### What to verify

- Omitting `costCenterCode` creates the tenant-wide default policy.
- Use `POST /api/tenant/quotas/preview` before go-live to dry-run a likely
  booking amount against the selected cost center.
- Use `GET /api/tenant/quotas` for tenant summary and
  `GET /api/tenant/cost-centers/:code/quota` for an override-aware cost-center
  view.

Rule of thumb for `enforcementMode`:

- `warn_only`: show the tenant they are near limit, but do not stop booking.
- `require_approval`: quota excess should generate approval instead of blocking.
- `hard_block`: booking must fail if the final reservation cannot fit.

<a id="approval-rule-write"></a>

## 3. Write Approval Rules

Approval rules decide whether a booking is allowed, warned, blocked, or turned
into an approval request. The most common starting point is a single
amount-based `require_approval` rule above NT$5,000.

### UI mockup

```text
+--------------------------------------------------------------------------------+
| 審批規則                                                     [新增規則]        |
| 條件 -> 動作 · 規則先後優先級                                                 |
+-----+------------------------------------+----------------+-------------------+
| PRI | 條件                               | 動作           | 審批者            |
+-----+------------------------------------+----------------+-------------------+
| 10  | booking.amount_minor >= 500000     | require_approval | cost_center_owner|
| 20  | pickup_time in overnight window    | require_approval | finance + admin  |
| 30  | cost_center.code = CC-EXEC         | warn / manual    | tenant_admin     |
+-----+------------------------------------+----------------+-------------------+
```

### REST example

```http
POST /api/tenant/approval-rules HTTP/1.1
Authorization: Bearer <tenant session>
x-tenant-id: tenant-acme-001
Content-Type: application/json

{
  "ruleName": "High-value trips require approval",
  "description": "Bookings above NT$5,000 need business owner approval.",
  "priority": 10,
  "conditions": [
    {
      "field": "booking.amount_minor",
      "op": "gte",
      "value": 500000
    }
  ],
  "action": "require_approval",
  "approvalMode": "any_of",
  "approvers": [
    {
      "kind": "cost_center_owner"
    }
  ],
  "timeoutHoursOverride": 24,
  "fallbackPolicyOverride": "escalate_to_tenant_admin"
}
```

### What to verify

- Use priority `10`, `20`, `30` so later inserts still have room.
- Dry-run the rule before production traffic with
  `POST /api/tenant/approval-rules/evaluate`.
- Do not turn on a rule whose approvers cannot yet resolve to active tenant
  users. If a rule matches and resolves to nobody, booking creation fails
  closed with `APPROVAL_NO_RESOLVABLE_APPROVERS`.

<a id="approval-mode-decision-tree"></a>

## Approval Mode Decision Tree

Use `approvalMode` according to who must decide and whether order matters.

- `any_of`
  - Use when any one approver can unblock the booking.
  - Best for SMB or a single cost-center-owner signoff.
- `all_of_parallel`
  - Use when multiple approvers must all sign, but sequence does not matter.
  - Best for finance + ops dual control.
- `ordered_chain`
  - Use when multiple approvers must all sign and the business wants a visible
    order such as `cost_center_owner -> tenant_finance_admin -> tenant_admin`.
  - Phase 1 runtime still resolves every non-`any_of` mode as "all listed
    approvers must eventually decide", so `ordered_chain` currently preserves
    review order intent and audit meaning more than it changes terminal status
    semantics.

Quick picker:

```text
Can one approval finish the request?
  yes -> any_of
  no  -> Must everyone sign?
           yes -> Does sign-off order matter to policy or audit?
                    yes -> ordered_chain
                    no  -> all_of_parallel
```

<a id="approver-invite"></a>

## 4. Invite Approvers

The user-management surface is the last bootstrap step because it turns the
rule descriptors into real identities. Without active invitees, approval
requests cannot be resolved.

### UI mockup

```text
+--------------------------------------------------------------------------------+
| User Management                                                                |
| Invite users and manage tenant access with formal role framing                 |
+---------------------------+--------------------+----------------------+--------+
| Email                     | Display Name       | Role                 |        |
+---------------------------+--------------------+----------------------+--------+
| finance.approver@acme.io  | Finance Approver   | Tenant Finance Admin | Invite |
+---------------------------+--------------------+----------------------+--------+
```

### REST example

```http
POST /api/tenant/users HTTP/1.1
Authorization: Bearer <tenant session>
x-tenant-id: tenant-acme-001
Content-Type: application/json

{
  "email": "finance.approver@acme.io",
  "displayName": "Finance Approver",
  "roleCode": "tenant_finance_admin"
}
```

### What to verify

- `POST /api/tenant/users` creates the user in `invited` status.
- `GET /api/tenant/roles` returns the assignable catalog:
  `tenant_admin`, `tenant_ops_admin`, `tenant_finance_admin`, `tenant_viewer`.
- If you need to change the role later, use
  `POST /api/tenant/users/:userId/role`.
- `/users` is the landed `tenant-console-web` route for this step on
  2026-05-13.

<a id="starter-rule-sets"></a>

## Recommended Starter Rule Sets

These profiles mirror the current seed templates in
`apps/api/src/seed/tenant-governance-default.ts`.

| Tenant size | Cost centers                                         | Monthly quota baseline                    | Starter approval rule                                                                              |
| ----------- | ---------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SMB         | `CC-OPS`                                             | `100` bookings, `NT$250,000`, `warn_only` | `any_of`, `cost_center_owner`, threshold `NT$5,000`                                                |
| Mid-market  | `CC-OPS`, `CC-ENG`, `CC-FINANCE`                     | `50` bookings, `NT$100,000`, `hard_block` | `any_of`, `cost_center_owner`, threshold `NT$5,000`                                                |
| Enterprise  | `CC-OPS`, `CC-ENG`, `CC-FINANCE`, `CC-HR`, `CC-EXEC` | `30` bookings, `NT$60,000`, `hard_block`  | `ordered_chain`, `cost_center_owner -> tenant_finance_admin -> tenant_admin`, threshold `NT$5,000` |

When to override the starter set:

- Raise the booking-count limit before you raise the amount limit if the tenant
  has many low-fare trips.
- Prefer adding cost-center-specific quota overrides over adding many tenant
  global exceptions.
- For enterprise, invite finance and admin approvers before activating the
  ordered chain.

<a id="troubleshooting"></a>

## Troubleshooting

| Error code                         | What it means                                                                                                                                                              | Most common fix                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `BOOKING_COST_CENTER_INVALID`      | The submitted cost-center code is malformed.                                                                                                                               | Force selection from the directory and use canonical codes like `CC-FINANCE`, not free text such as `finance dept!`.  |
| `BOOKING_COST_CENTER_UNKNOWN`      | The code does not exist for this tenant, or belongs to another tenant.                                                                                                     | Create the code first, or correct the tenant-scoped value.                                                            |
| `BOOKING_COST_CENTER_DISABLED`     | The code exists but is inactive.                                                                                                                                           | Re-enable or replace the cost center before booking.                                                                  |
| `QUOTA_INSUFFICIENT_AT_COMMIT`     | A hard-block quota reservation failed at final commit time. Preview may have passed earlier, but another booking consumed the last unit or the limit was already exceeded. | Refresh quota summary, retry with a different cost center, reduce booking scope, or raise the limit.                  |
| `APPROVAL_NO_RESOLVABLE_APPROVERS` | A rule matched, but every approver descriptor resolved to zero active users.                                                                                               | Set `ownerUserId` on the cost center, invite the missing role holder, or temporarily revise the rule/fallback policy. |

Additional notes:

- `cost_center_owner` can fall back to `tenant_admin` if the owner is missing
  and the fallback user exists.
- Rejections are final for the request. For `all_of_parallel` and
  `ordered_chain`, any rejection resolves the request as rejected.
- Booking updates that change approval-relevant fields re-evaluate policy and
  can cancel an older pending request with status
  `cancelled_by_re_evaluation`.

<a id="help-link-sketch"></a>

## In-App Help Link Sketch

Suggested URL convention:

```text
/help/tenant-governance-onboarding-20260513#<section-id>
```

Suggested mappings:

| Surface                                      | Route status on 2026-05-13                | Help CTA label                      | Target                                                                    |
| -------------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Cost center list                             | pending route (prototype `TN_CostCenter`) | `How to set up cost centers`        | `/help/tenant-governance-onboarding-20260513#cost-center-create`          |
| Quota policy editor                          | pending route under governance surfaces   | `How to set quota policy`           | `/help/tenant-governance-onboarding-20260513#quota-policy-set`            |
| Approval rule editor                         | pending route (prototype `TN_Rules`)      | `How to write approval rules`       | `/help/tenant-governance-onboarding-20260513#approval-rule-write`         |
| Approval mode selector                       | pending route under rule editor           | `Which approval mode should I use?` | `/help/tenant-governance-onboarding-20260513#approval-mode-decision-tree` |
| Users / role invite                          | landed route `/users`                     | `Invite approvers`                  | `/help/tenant-governance-onboarding-20260513#approver-invite`             |
| Booking error toast for cost-center failures | booking surface                           | `Fix cost center governance`        | `/help/tenant-governance-onboarding-20260513#troubleshooting`             |
| Booking error toast for quota failure        | booking surface                           | `Resolve quota block`               | `/help/tenant-governance-onboarding-20260513#troubleshooting`             |
| Booking error toast for no approvers         | booking surface                           | `Resolve approver mapping`          | `/help/tenant-governance-onboarding-20260513#troubleshooting`             |

## Bootstrap Exit Checklist

- Cost-center directory exists and owners are assigned.
- Tenant-wide monthly quota policy is saved.
- At least one approval rule has been dry-run through the evaluate endpoint.
- All referenced approvers exist in the `/users` roster and resolve through
  `GET /api/tenant/users`.
- The tenant admin knows which help link should be shown from each governance
  surface.
