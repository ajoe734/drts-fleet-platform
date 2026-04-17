# BUG-002 — Dispatch Semantics Evidence

**Task:** `BUG-002`  
**Owner:** `Codex2`  
**Reviewer:** `Codex`  
**Status:** review evidence prepared

---

## Decision

`E2E-001` should explicitly trigger dispatch with `POST /api/orders/:orderId/dispatch` after
tenant booking creation. This bug is a test-harness correction, not a runtime change to make
tenant enterprise-dispatch bookings auto-enter the dispatch queue on create.

---

## Why This Is The Correct Fix

1. Shared truth already describes the bug as: Phase 1 dispatch is ops-manual, while the old
   E2E script incorrectly assumed dispatch jobs would appear immediately after
   `POST /api/tenant/bookings`.
2. Owned mobility reservation bookings keep reservation semantics until an explicit dispatch
   action occurs. The service behavior remains consistent with that boundary.
3. Changing `createTenantBooking()` to auto-dispatch would silently alter the Phase 1 owned
   mobility contract and reservation flow instead of fixing the test assumption.

---

## Runtime / Test Evidence

- `tests/e2e/E2E-001-enterprise-dispatch.sh`
  - captures `orderId` from tenant booking read-back
  - switches ops legs to `ops_user`
  - calls `POST /api/orders/:orderId/dispatch`
  - then polls `/api/dispatch/tasks` for the matching `orderId`
- `tests/unit/owned-mobility.test.ts`
  - adds regression coverage that `listDispatchJobs()` stays empty after
    `createTenantBooking()`
  - proves a dispatch job appears only after `dispatchOrder(orderId, { mode: "auto" })`

Verification rerun in this workspace:

```bash
bash -n tests/e2e/E2E-001-enterprise-dispatch.sh
pnpm vitest run tests/unit/owned-mobility.test.ts
```

Observed result:

- `bash -n` passed
- `vitest` passed: `1` file, `11` tests

---

## Reviewer Conclusion

`BUG-002` is correctly fixed as an explicit-dispatch E2E correction. The runtime contract for
reservation bookings remains unchanged, and the regression test now guards against future
reintroduction of the incorrect auto-dispatch assumption.
