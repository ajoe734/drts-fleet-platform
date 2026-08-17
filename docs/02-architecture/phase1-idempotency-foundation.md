# Phase 1 Shared Idempotency Foundation

**Document Reference**: `docs/02-architecture/phase1-idempotency-foundation.md`  
**Task Reference**: `CONF-IDEM-001` (GAP-CONF-01 Architectural Foundation)  
**Status**: Accepted Canonical Architecture Pattern  
**Date**: 2026-08-17  
**Owner**: Codex2  
**Reviewer**: Gemini

---

## 1. Overview & Objectives

In high-reliability fleet, mobility, and financial platforms, network timeouts, client retries, and concurrent user actions inevitably produce duplicate HTTP command submissions. Without strict idempotency semantics, duplicate requests cause severe real-world anomalies:

- Double vehicle dispatch (dispatching two taxis to the same passenger and double-charging fares).
- Duplicate driver payouts or double-reimbursement approvals.
- Duplicate regulatory filing packages whose cryptographic hashes conflict.
- Split CRM complaint cases with competing SLA timers.

This document establishes the canonical wire semantics, deterministic payload comparison algorithm, database concurrency constraints, uniqueness scoping rules, and shared application helper across all Phase 1 services.

---

## 2. Wire Semantics & Decision Matrix

All mutating command endpoints (`POST`, `PUT`, `PATCH`) accept the standard HTTP header:

```http
Idempotency-Key: <unique-client-or-intent-key>
```

### 2.1 The Three Core Cases

| Case                                     | Scenario                                                                             | Action & Wire Status                                                                                                                                                                                                     | Response Payload                                                                                                                                        |
| :--------------------------------------- | :----------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Case 1: Unseen Key**                   | First time the key is seen within the given scope.                                   | Executes command side-effects. Returns standard success status code (**`200 OK`**, **`201 Created`**, or **`202 Accepted`**).                                                                                            | Fresh execution result & `ActionReceipt`. The response body and payload hash are durably stored in the database.                                        |
| **Case 2: Matching Payload (Replay)**    | Key seen previously within the same scope with **identical** canonical payload hash. | **Replays** the stored response without re-executing business logic, generating new database entities, or calling external payment/dispatch gateways. Returns original status code (**`200`**, **`201`**, or **`202`**). | Returns stored response body and `ActionReceipt`. Header `X-Idempotent-Replay: true` is included.                                                       |
| **Case 3: Differing Payload (Conflict)** | Key seen previously within the same scope with **different** canonical payload hash. | Rejects request immediately with **`409 Conflict`**. No domain mutations occur.                                                                                                                                          | `{ "error": { "code": "IDEMPOTENCY_KEY_REUSED", "message": "Idempotency-Key was already used for a different command payload.", "retryable": false } }` |

### 2.2 Missing or Invalid Key Handling

- **Mandatory Commands**: For endpoints requiring idempotency (e.g. order creation, driver payouts, filing generation), a missing, empty, or whitespace-only header returns **`400 Bad Request`** with error code `IDEMPOTENCY_KEY_REQUIRED` (`retryable: false`).
- **Key Length Limit**: Maximum length is 255 characters. Keys exceeding 255 characters return **`400 Bad Request`** with error code `IDEMPOTENCY_KEY_TOO_LONG`.
- **In-Progress Concurrency**: If a concurrent request with the identical key is currently executing (`status = 'processing'`), the concurrent caller receives **`409 Conflict`** with error code `IDEMPOTENCY_IN_PROGRESS` (`retryable: true`).

---

## 3. Deterministic Payload Canonicalization & Hashing

To guarantee that independent service workers (across TypeScript, Node.js, NestJS, and background workers) compute identical payload comparisons, comparison is performed using **Canonical JSON SHA-256 Hashing**.

### 3.1 Canonicalization Algorithm

1. **Object Key Sorting**: Object keys are sorted lexicographically in ascending Unicode code point order (`keys.sort()`).
2. **Recursive Traversal**: Nested objects and array elements are recursively canonicalized.
3. **Undefined Pruning**: Properties with `undefined` values in objects are omitted.
4. **Date Normalization**: Date objects are serialized using their standard ISO 8601 string representation (`date.toISOString()`).
5. **Array Preservation**: Array elements retain their exact index order.
6. **Primitive Formatting**: Numbers, booleans, strings, and nulls serialize using standard JSON representations without extraneous whitespace.

### 3.2 Hashing Algorithm

```
payloadHash = SHA-256( canonicalizeJson(payload) ) -> 64-character lowercase hex string
```

#### Determinism Example:

```json
// Payload A
{ "b": 2, "a": 1, "nested": { "z": "last", "m": "middle" } }

// Payload B (different key order)
{ "a": 1, "nested": { "m": "middle", "z": "last" }, "b": 2 }
```

Both Payload A and Payload B produce the exact same canonical string `{"a":1,"b":2,"nested":{"m":"middle","z":"last"}}` and identical SHA-256 digest `e69cb4...`.

---

## 4. Concurrency Safety: Why Database UNIQUE Constraints are Mandatory

### 4.1 Failure Mode of Service-Layer Checks (TOCTOU Race Condition)

A naive service-layer check ("look-up-then-insert") operates as follows:

```
Thread 1: SELECT * FROM idempotency WHERE key = 'K1' -> NOT FOUND
Thread 2: SELECT * FROM idempotency WHERE key = 'K1' -> NOT FOUND
Thread 1: Execute dispatch logic -> Dispatches Taxi A ($$$)
Thread 2: Execute dispatch logic -> Dispatches Taxi B ($$$) [DUPLICATE!]
Thread 1: INSERT INTO idempotency (key) VALUES ('K1')
Thread 2: INSERT INTO idempotency (key) VALUES ('K1')
```

Under high network concurrency or rapid client retries, both requests query before either writes. **A service-layer check fails under exactly the concurrency that network retries produce.**

### 4.2 Mandatory Database UNIQUE Constraint

To ensure absolute concurrency serialization, idempotency is enforced by a **PostgreSQL `UNIQUE` constraint**:

```sql
CONSTRAINT uq_idempotency_records_scope_key UNIQUE (scope, idempotency_key)
```

When concurrent requests race:

1. Both attempt `INSERT INTO ops.idempotency_records ... ON CONFLICT (scope, idempotency_key) DO NOTHING`.
2. Exactly one transaction wins the insert and transitions to `processing`.
3. The losing transaction receives 0 inserted rows (or unique violation code `23505`), queries the winner's record, verifies payload hash conformance, and either replays the completed response or returns conflict.

---

## 5. Uniqueness Scoping Matrix

Idempotency keys must be scoped to avoid collision across different tenants, entities, or commands.

| Domain / Command                     | Scope Format                                       | Scoping Justification                                                                        |
| :----------------------------------- | :------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **Tenant Booking Creation**          | `tenant:<tenant_id>:booking_create`                | Prevents key collision across tenants and enforces multi-tenant boundary isolation.          |
| **Passenger Order Creation**         | `orders:passenger_create`                          | Enforces single order creation per passenger intent across the fleet platform.               |
| **Dispatch Assignment / Redispatch** | `dispatch:order:<order_id>:assign`                 | Scoped to the specific order to allow redispatch with a new key if previous dispatch failed. |
| **Payment Recovery (Retry Capture)** | `billing:payment:<payment_id>:retry_capture`       | Scoped to payment record and action; prevents double credit card capture.                    |
| **Driver Payout Request**            | `billing:payout:driver:<driver_id>:<period>`       | Prevents duplicate bank wire transfer requests for the same billing period.                  |
| **Reimbursement Batch Approval**     | `billing:reimbursement_batch:<batch_id>:approve`   | Ensures batch approval and funds allocation executes exactly once.                           |
| **Call Center Order Creation**       | `crm:callcenter:session:<session_id>:order_create` | Scopes order creation across the full call center orchestration.                             |
| **Complaint Case Creation**          | `crm:complaint:case_create`                        | Ensures one customer complaint yields exactly one `case_no` and one SLA timer.               |
| **Report Job Creation**              | `reporting:job_create`                             | Prevents spawning duplicate background compute workers for identical filters.                |
| **Filing Package Generation**        | `reporting:filing:<package_type>:<period>`         | Guarantees single filing bundle generation with immutable manifest and checksum.             |
| **Certificate Regeneration**         | `certificate:<receipt_id>:regenerate`              | Scoped to receipt entity; enforces single superseding version per admin intent.              |

---

## 6. Implementation Guide: Shared API Helper

The shared foundation provides `IdempotencyService` and `executeWithIdempotency` in `apps/api/src/common/idempotency/`.

### 6.1 Using in NestJS Controllers & Services

```typescript
import { Controller, Post, Body, Headers, HttpStatus } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency";
import type { CreateOrderDto, OrderRecord } from "@drts/contracts";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly idempotencyService: IdempotencyService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post()
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const result = await this.idempotencyService.execute({
      scope: dto.tenantId
        ? `tenant:${dto.tenantId}:booking_create`
        : "orders:passenger_create",
      idempotencyKey,
      tenantId: dto.tenantId,
      required: true,
      payload: dto,
      execute: async () => {
        const order = await this.ordersService.create(dto);
        return {
          data: order,
          statusCode: HttpStatus.CREATED,
        };
      },
    });

    return toApiSuccessEnvelope(result.data);
  }
}
```

### 6.2 Wave B Task Directives

- **CONF-IDEM-002** (Order & Dispatch): Adopt `IdempotencyService` with scopes `orders:passenger_create`, `tenant:<tenant_id>:booking_create`, and `dispatch:order:<order_id>:assign`. Reconcile legacy referral body field `idempotencyKey` by prioritizing the HTTP header and falling back to body field.
- **CONF-IDEM-003** (Finance & Reporting): Adopt `IdempotencyService` for driver payout, reimbursement batch approval, report job creation, and filing package generation.
- **CONF-IDEM-004** (CRM & Webhook): Adopt `IdempotencyService` for call-center order orchestration, complaint case creation (`case_no` and SLA timer deduplication), and tenant webhook test deliveries.
