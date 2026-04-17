# Review Round 2 — Qwen

**Reviewer:** Qwen
**Baton received:** 2026-04-17T04:45:00Z
**Focus:** API implementation scope Sprint 1/2, webhook delivery complexity, driver statement pattern, driver-profile module design

---

## Q2: GAP-002 — Webhook Delivery Engine (Scope + Timing)

**Code verified — `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`:**

Existing delivery infrastructure:

- `StoredWebhookDelivery` type has: deliveryId, webhookId, tenantId, eventType,
  attempt, status, httpStatus, rawBody, hmacSha256Header, attemptedAt
- `createWebhookEndpoint()` stores URL, events, secret, retryPolicy
- `sendTestWebhook()` assembles HMAC header signature (already implemented!) at line ~980:
  ```typescript
  const signature = createHmac("sha256", endpoint.secretPlaintext)
    .update(rawBodyStr)
    .digest("hex");
  ```
  The HMAC logic **already exists**. Only the actual `fetch()` call is missing.

**Revised scope estimate for GAP-P2S2-003 (delivery engine):**

- 80-100 LOC: `WebhookDispatchService` with `fetch()` + retry loop
- 20-30 LOC: connect to order status events
- Total: ~130 LOC — **Sprint 1 (not Sprint 2)** is feasible

**Recommendation:** Move GAP-P2S2-003 to **Phase 2 Sprint 1** (not Sprint 2).
The HMAC infrastructure is already in place; just needs dispatch wiring.

---

## Q4: GAP-005a — Driver Statement Live Trip Pattern

**Code verified — `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:154-202`:**

```typescript
async listLiveCompletedTenantTrips(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<LiveSettlementTripRecord[]>
```

This queries `ops.phase1_owned_orders` joined with `ops.phase1_dispatch_jobs` and
`ops.phase1_driver_tasks` for completed orders.

**For driver-scoped variant**, the same query can be adapted:

- Add `AND t.driver_id = $1` filter
- Swap `tenantId` param for `driverId`

`LiveSettlementTripRecord` already has `driverId: string` — all fields present.

**No new DB schema needed for GAP-P2S1-003.** The existing tables support the query.
Only a new repository method + service wiring is required.

**Verdict:** GAP-P2S1-003 (driver statement live trips) is correctly scoped for Sprint 1.
No DB migration dependency. Estimated effort: ~60 LOC in repository + service.

---

## GAP-008a — Driver Profile Module Design

**Current state:** `regulatory-registry.service.ts` manages drivers as read-only
registry records. `DriverRegistryRecord` has: driverId, name, supportedServiceBuckets,
workState, licensesValid. No contact info, no photo, no license details.

**Design options:**

**Option A: Standalone `driver-profile` module** (as proposed)

- Pro: Clean separation; driver can update profile without touching compliance registry
- Con: Dual source-of-truth for driver name/workState

**Option B: Extend regulatory-registry with driver self-service endpoints**

- Pro: Single source-of-truth; no entity sync needed
- Con: Conflates compliance data (licensesValid, dispatchableFlag) with profile data

**Recommendation: Option A (standalone module)**, but with a clear contract:

- `driver-profile` owns: name, contact, photo, emergency_contact, bank_account (for reimbursement)
- `regulatory-registry` owns: compliance flags, workState, service buckets
- The two are linked by `driverId` only

**This is correctly scoped for Sprint 1** but ownership should be Codex (contracts design)
not Qwen (who handles API implementation). Recommend reassignment.

---

## API Contract Change Audit

Reviewing whether any backlog tasks require `@drts/contracts` version bump:

| Task                                     | Contract change needed?                                |
| ---------------------------------------- | ------------------------------------------------------ |
| GAP-P2S1-001 (SOS screen)                | No — severity=critical already exists                  |
| GAP-P2S1-002 (incident severity support) | No — contracts already valid                           |
| GAP-P2S1-003 (driver statement live)     | No — internal service change only                      |
| GAP-P2S1-004 (driver profile module)     | YES — new DriverProfileRecord + Create/Update commands |
| GAP-P2S2-001 (trip proof bundle)         | No — CompletionProofBundle already in contracts        |
| GAP-P2S2-003 (webhook engine)            | No — delivery types already exist                      |
| GAP-P2S2-008 (WebSocket gateway)         | YES — need WebSocket event payload types               |

**Summary:** 2 tasks require contracts update: driver-profile types and WS payload types.
These should be flagged as contract-first tasks (Codex owns contracts).

---

## Summary Verdict

- **Codex Round 1 amendments are well-grounded. Accept all 4 recommendations.**
- **Webhook delivery is Sprint 1 scope** — HMAC already built, just needs fetch() wire-up.
- **Driver statement live trips** needs no new DB migration; correct for Sprint 1.
- **Driver profile** needs new contracts types — flag as Codex-first, then Qwen implements.
- **2 contract additions needed** — add as explicit pre-requisite tasks in backlog.

**Passing baton to Gemini for Round 3.**
