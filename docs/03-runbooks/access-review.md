# Runbook: Privileged Access Review Campaigns and Remediation (`IAM-GOV-001`)

- **Status**: Production Operational Runbook
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **Reference**: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`

---

## 1. Overview

Privileged access review campaigns ensure that all administrative and high-privilege memberships, roles, and access credentials across platform, tenant, partner, and operations realms are periodically certified by assigned scope owners. Uncertified or excessive access must be remediated via role reduction or complete access removal, triggering immediate session revocation and producing immutable audit evidence.

---

## 2. Access Review Campaign Lifecycle

### 2.1 Campaign Creation & Durable Scope Ownership

Campaigns can be created for specific realms (`platform`, `tenant`, `partner`, `operations`) or bounded to a specific tenant (`tenantId`).

- **Durable Campaign Record**: Each campaign specifies:
  - `campaignId`: Durable unique campaign identifier (`arc_...`).
  - `title`: Descriptive campaign title (e.g. `2026 Q3 Privileged Tenant Access Review`).
  - `realm`: Scope boundary (`platform` | `tenant` | `partner` | `operations`).
  - `tenantId`: Optional tenant boundary filter.
  - `reviewerPrincipalId`: Principal ID of the designated reviewer/owner responsible for certification.
  - `deadlineAt`: ISO timestamp deadline for certification completion.
  - `overduePolicy`: `alert_only` or `auto_revoke`.
  - `status`: `draft` | `active` | `completed` | `overdue` | `cancelled`.

### 2.2 Review Item Auto-Population

Upon campaign creation, all active memberships and role bindings within the defined scope are automatically enumerated into review items (`ar_...`). Each item records:
- Target principal ID (`targetPrincipalId`)
- Target membership ID & role binding ID
- Target role code (`roleCode`)
- Current review status (`pending`, `certified`, `reduced`, `removed`, `overdue`)
- Optimistic concurrency version (`version`)

---

## 3. Certification & Remediation Workflow

Reviewers interact with access reviews via `/api/platform-admin/access-reviews` or `/api/identity/access-reviews`.

### 3.1 Certification Options

| Decision | Action Taken | Target Role State | Session State |
|---|---|---|---|
| `certify` | Confirms current access is legitimate and necessary. | Retained | Unchanged |
| `reduce` | Downgrades target privilege level (e.g., to `viewer` or specified `reducedRoleCode`). | Reduced | Active sessions updated |
| `remove` / `revoke` | Strips target role binding / membership completely. | Removed | **Immediately Revoked** |
| `defer` | Defers review decision for re-evaluation before campaign deadline. | Pending | Unchanged |

### 3.2 Tenant Boundary Enforcement

All review decisions strictly enforce tenant boundaries:
- A reviewer operating in a tenant context (`actor.tenantId`) can only query and decide review items matching their `tenantId`.
- Cross-tenant review mutation attempts by non-platform actors are immediately rejected with `403 Forbidden` (`AUTHZ_REALM_DENIED` / `IAM_ACCESS_REVIEW_CROSS_TENANT_DENIED`).

### 3.3 Session Revocation Mechanics

When a decision of `remove` (or auto-remediation on overdue) is executed:
1. `AccessReviewService` calls `IdentityRepository.revokeSessionsForPrincipal(targetPrincipalId, reason, actorId)`.
2. All active sessions and refresh families for `targetPrincipalId` are marked `status = 'revoked'` with timestamp and reason.
3. The review item sets `sessionRevoked = true` and `remediatedAt = now`.
4. Subsequent API calls using existing tokens/sessions for `targetPrincipalId` fail closed with `SESSION_REVOKED`.

---

## 4. Overdue Policy & Auto-Remediation

Campaigns that pass their `deadlineAt` without all items being resolved transition to `overdue` status during the overdue evaluation sweep (`POST /api/platform-admin/access-reviews/overdue-sweep`).

### 4.1 Overdue Evaluation Rules

1. Any campaign with `status = 'active'` and `deadlineAt < now` is marked `status = 'overdue'`.
2. All uncertified items with `status = 'pending'` in the campaign are marked `status = 'overdue'`.
3. An audit event `access_review.overdue_alert` is emitted to the security events log.
4. **Auto-Revoke Policy Execution**:
   - If `overduePolicy === 'auto_revoke'`, all overdue items are automatically remediated:
     - Target principal sessions are immediately revoked via `IdentityRepository`.
     - Item status is set to `removed` and `sessionRevoked = true`.
     - An immutable evidence record with `decision = 'auto_revoke_overdue'` is appended.

---

## 5. Immutable Evidence & Verification

Every campaign creation, certification decision, reduction, removal, and overdue remediation generates an append-only evidence record in `iam.access_review_evidence` and records a security event in `admin.security_events`.

### 5.1 Evidence Record Schema

- `evidenceId`: Unique evidence ID (`evd_...`).
- `campaignId` & `reviewId`: Context pointers.
- `actorPrincipalId`: Principal ID of the decision maker (or `system_overdue_sweep`).
- `targetPrincipalId`: Target user reviewed.
- `tenantId`: Tenant context.
- `decision`: `certify` | `reduce` | `remove` | `auto_revoke_overdue` | `defer`.
- `beforeState` & `afterState`: Complete JSON snapshot of review item state changes.
- `sessionRevoked`: Boolean flag confirming session invalidation.
- `reasonCode` & `reasonText`: Mutation metadata.
- `createdAt`: Immutable ISO timestamp.

### 5.2 Verification Queries

Review evidence is queryable via API:

```bash
# Platform Admin Evidence Query
GET /api/platform-admin/access-reviews/evidence?campaignId=arc_12345678&tenantId=tenant-01

# Tenant Scoped Evidence Query
GET /api/identity/access-reviews/evidence?decision=remove
```

---

## 6. Operational Checklist for Security Audits

- [ ] Confirm quarterly review campaigns are scheduled with valid `reviewerPrincipalId` and `deadlineAt`.
- [ ] Verify all high-privilege platform and tenant roles are included in campaign auto-population.
- [ ] Validate that all `remove` decisions reflect `sessionRevoked = true` in evidence logs.
- [ ] Execute `POST /api/platform-admin/access-reviews/overdue-sweep` periodically via cron to catch expired reviews.
- [ ] Query evidence logs to generate audit sign-off reports for compliance verification.
