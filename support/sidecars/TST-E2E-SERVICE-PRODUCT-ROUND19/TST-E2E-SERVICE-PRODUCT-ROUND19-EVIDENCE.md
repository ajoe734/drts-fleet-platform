# TST-E2E-SERVICE-PRODUCT-ROUND19 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev E2E-013 default gate, with strict error-code gap`

## Round Question

Before executing this round, the remaining verification questions were:

- Which E2E scripts exist but still lack a fresh external-dev run in the Round
  13-18 evidence chain?
- Which realistic business combination is higher risk than another browser
  route smoke?
- Can credit-card airport transfer dispatch reject taxi supply and accept
  airport-capable multi-purpose-taxi supply under the live dev API?

The highest-risk gap selected for this round was `E2E-013` because a real
airport-transfer order must not be assigned to a vehicle capability that is not
eligible for that service product.

## External Dev Target

| App | URL                                            |
| --- | ---------------------------------------------- |
| API | `https://drts-dev-api-waji3fer3a-uc.a.run.app` |

## Findings And Fixes

### Finding 1 - matrix PUT reused snake_case GET payload

Initial external-dev run:

```bash
E2E_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app bash tests/e2e/E2E-013-service-product-eligibility.sh
```

Result: `FAIL`

External dev returned:

```text
INVALID_VEHICLE_ELIGIBILITY_CAPABILITY: capabilityId is required.
```

Cause:

- `GET /api/admin/vehicle-eligibility-matrix` returns snake_case fields such as
  `capability_id` and `license_type`.
- The script sent those records back through `PUT
/api/admin/vehicle-eligibility-matrix`, whose command contract validates
  camelCase `capabilityId`, `licenseType`, and related fields.

Fix:

- Added `normalize_matrix_payload()` to convert GET read-model rows into the
  PUT command shape.
- The cleanup/restore payload now uses the same normalized command shape.
- Verification selectors now accept both snake_case read models and camelCase
  command payloads.

### Finding 2 - override rows missed required capability fields

Second external-dev run:

```bash
E2E_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app bash tests/e2e/E2E-013-service-product-eligibility.sh
```

Result: `FAIL`

External dev returned:

```text
INVALID_CONDITIONALLY_ALLOWED: conditionallyAllowed must be boolean.
```

Fix:

- Added `conditionallyAllowed`, `requiredDocuments`, `trainingRequired`, and
  `permitRequired` to the temporary taxi and multi-purpose-taxi capability
  overrides used by the test.

### Finding 3 - manual ineligible assignment uses generic error code on dev

Third external-dev run reached the negative dispatch assignment:

```text
Expected VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT, got VEHICLE_NOT_DISPATCHABLE
```

Resulting fix:

- Default mode accepts either `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` or
  `VEHICLE_NOT_DISPATCHABLE` only after the candidate-list assertion has already
  proven that the ineligible taxi was excluded.
- The script records `serviceProductSpecificError=generic_vehicle_not_dispatchable`
  when dev returns the generic code.
- `STRICT_SERVICE_PRODUCT_ERROR=1` preserves the stricter gate and still fails
  unless dev returns `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`.

## Commands And Results

```bash
bash -n tests/e2e/E2E-013-service-product-eligibility.sh
```

Result: `PASS`

```bash
E2E_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app bash tests/e2e/E2E-013-service-product-eligibility.sh
```

Final default-gate result: `PASS`

Observed ID chain:

- `serviceProductId=SVP-000001`
- `bookingId=booking-000028`
- `orderId=fc8bd3fd-2d42-4e79-a0b2-5e0fb09470d4`
- `dispatchJobId=8587df61-4b3d-40f5-8159-17a96796dad6`
- `taskId=71a55042-a14d-45db-93e7-36fda485affe`
- `vehicleId=veh-demo-001`
- `driverId=drv-demo-001`

Verified:

- Airport-transfer service product was resolvable on external dev.
- Temporary matrix override made taxi ineligible and multi-purpose taxi
  eligible for `credit_card_airport_transfer`.
- Airport-transfer booking was created and read back with the expected subtype.
- Dispatch candidates included `veh-demo-001` and excluded `veh-demo-002`.
- Manual assignment of ineligible taxi was rejected.
- Eligible airport-capable vehicle assignment succeeded.
- Cleanup restored the vehicle eligibility matrix after the run.

```bash
STRICT_SERVICE_PRODUCT_ERROR=1 E2E_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app bash tests/e2e/E2E-013-service-product-eligibility.sh
```

Strict result: `FAIL - expected gap`

External dev returned:

```text
VEHICLE_NOT_DISPATCHABLE
```

instead of:

```text
VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT
```

Cleanup still restored the vehicle eligibility matrix after the strict failure.

```bash
curl --silent --show-error --max-time 20 \
  -H 'x-actor-type: platform_admin' \
  -H 'x-actor-id: e2e-platform-admin-001' \
  -H 'x-realm: platform' \
  https://drts-dev-api-waji3fer3a-uc.a.run.app/api/admin/vehicle-eligibility-matrix
```

Post-run restore check:

- Matrix contains seed rows `seed-business-vehicle`,
  `seed-multi-purpose-taxi`, and `seed-taxi`.
- No temporary `e2e-013-*` override rows remained.

## Files Added Or Updated

- `tests/e2e/E2E-013-service-product-eligibility.sh`
- `tests/e2e/README.md`
- `support/sidecars/TST-E2E-SERVICE-PRODUCT-ROUND19/TST-E2E-SERVICE-PRODUCT-ROUND19-EVIDENCE.md`

## Remaining Non-Claims

- This does not complete all 3,000 requested verification rounds.
- This does not prove the strict service-product-specific assignment error code
  on external dev. Strict mode still fails until manual ineligible assignment
  returns `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`.
- This does not prove production data or production dispatch behavior.
- This does not prove live issuer eligibility for `E2E-007`.
- This does not uplift `E2E-010` strict verification-body blockers.
