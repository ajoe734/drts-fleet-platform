# Dispatch Orchestration Model

Task: OPX-DP-001
Status: in_progress
Owner: Codex

## 1. Scope

This document defines queue-entry policy, reservation hold state machine, and
exception-hold criteria for the owned-mobility dispatch domain.

## 2. Queue-Entry Policy

Queue entry is governed by a per-dispatch-semantics policy defined in
`packages/contracts/src/index.ts` as `QUEUE_ENTRY_POLICY_MAP`.

| Dispatch Semantics    | Allows Queue Entry | Requires Site Check-In | Requires Vehicle Dispatchable |
| --------------------- | ------------------ | ---------------------- | ----------------------------- |
| `realtime`            | Yes                | Yes                    | Yes                           |
| `reservation`         | No                 | No                     | No                            |
| `queue`               | Yes                | Yes                    | Yes                           |
| `forwarder_broadcast` | No                 | No                     | No                            |

Reservation orders do not use site-based queue entry. Their queueing behavior
is managed through the reservation hold state machine (redispatch queue).

### Order Source to Dispatch Semantics

Each order source maps to a default dispatch semantics via
`ORDER_SOURCE_DISPATCH_SEMANTICS_MAP`:

| Order Source | Default Dispatch Semantics |
| ------------ | -------------------------- |
| `app`        | `realtime`                 |
| `web`        | `realtime`                 |
| `phone`      | `realtime`                 |
| `portal`     | `reservation`              |
| `api`        | `reservation`              |
| `concierge`  | `realtime`                 |

## 3. Reservation Hold State Machine

The reservation hold lifecycle tracks supply confirmation for reservation
orders. States and valid transitions are defined in
`RESERVATION_HOLD_VALID_TRANSITIONS`:

```
none ──────────► requested
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
     released   redispatch   exception
                 _queue       _hold
                    │          │
         ┌──────────┤          │
         ▼          ▼          ▼
     requested  released   released
               exception
                _hold
```

### State Descriptions

| State              | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `none`             | Order has no reservation hold (realtime orders default to this)      |
| `requested`        | Hold created at booking time, awaiting supply confirmation           |
| `released`         | Hold resolved — order assigned, cancelled, or exception resolved     |
| `redispatch_queue` | Dispatch failed before confirmation window; waiting for retry        |
| `exception_hold`   | Dispatch failed inside confirmation window; requires operator action |

### Transition Rules

- `none` may only transition to `requested` (at booking creation).
- `requested` may transition to `released` (assignment), `redispatch_queue`
  (no supply before window), or `exception_hold` (no supply inside window).
- `redispatch_queue` may transition to `requested` (retry dispatch),
  `released` (cancel/assign), or `exception_hold` (window reached).
- `exception_hold` may transition to `requested` (operator chooses
  `release_to_dispatch`) or `released` (operator cancels the order).
- `released` is terminal — no further transitions allowed.

Invalid transitions are rejected with `INVALID_HOLD_TRANSITION` error.

## 4. Exception-Hold Criteria

An order enters `exception_hold` when all of the following are true:

1. `dispatchSemantics === "reservation"`
2. The current time is within the confirmation window
   (reservation start minus `confirmationWindowMinutes`)
3. No eligible supply is available

The confirmation window is defined per `businessDispatchSubtype`:

| Subtype                        | Confirmation Window |
| ------------------------------ | ------------------- |
| `enterprise_dispatch`          | 30 minutes          |
| `credit_card_airport_transfer` | 60 minutes          |

### Exception-Hold Reason Codes

Defined in `EXCEPTION_HOLD_REASON_CODES`:

- `no_eligible_supply` — dispatch attempted, no candidates found
- `confirmation_window_expired` — redispatch queue reached the window boundary
- `driver_rejected_in_window` — driver rejected assignment inside the window
- `manual_escalation` — operator escalated manually

### Exception-Hold Resolution

Operators resolve exception holds via `POST /orders/:orderId/resolve-exception-hold`:

```json
{
  "resolution": "release_to_dispatch" | "cancel_order",
  "operatorId": "ops-user-001",
  "reason": "Supply confirmed manually"
}
```

- `release_to_dispatch`: sets order back to `ready_for_dispatch`, hold to
  `requested` so the reservation can re-enter dispatch legally
- `cancel_order`: cancels the order, hold to `released`

Both resolutions produce audit logs and dispatch trace entries.

## 5. Verification Anchors

- `packages/contracts/src/index.ts` — contract types and policy constants
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` — enforcement
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` — endpoint
- `apps/api/tests/unit/owned-mobility.service.test.ts` — test coverage
