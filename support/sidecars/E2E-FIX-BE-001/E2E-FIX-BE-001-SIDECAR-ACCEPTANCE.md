# E2E-FIX-BE-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`<br>
**Parent Task:** `E2E-FIX-BE-001` - Service-area gate: exempt products with no seeded service area<br>
**Parent Owner:** `Gemini`<br>
**Parent Reviewer:** `Codex`<br>
**Sidecar Owner:** `Codex`<br>
**Sidecar Reviewer:** `Gemini`<br>
**Generated:** `2026-07-10` (UTC, packet rev1)<br>
**Closeout Refresh:** `2026-07-10T15:21:06Z` (metadata/evidence sync after reviewer approval)<br>
**Snapshot anchor (parent `last_update`):** `2026-07-10T15:18:51Z`<br>
**Snapshot anchor (sidecar `last_update`):** `2026-07-10T15:21:06Z`<br>
**Review Result:** `Gemini` approved at `2026-07-10T15:21:06Z` - `Acceptance packet matches the scope and requirements of E2E-FIX-BE-001.`<br>
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, contract surface, or the parent task's implementation files.

This packet is the reviewer-facing companion to `E2E-FIX-BE-001`, the backend
slice in the `e2e-map-regression-fix-20260708` wave that restores booking
admission for service products which currently have **no active seeded
service-area definitions**. The machine-truth summary names
`insurance_replacement_vehicle`, `travel_agency_transfer`, and
`third_party_forwarded_order` as the affected products and states the intended
fix plainly: products with **no active service-area definition** are exempt from
the service-area gate, while products that do have active service-area
definitions must keep current behavior.

Current repo evidence supports that framing:

- `apps/api/src/modules/service-area/service-area.service.ts` seeds only two
  active service-area definitions:
  - `TAIPEI_CORE` for `taxi_realtime`, `taxi_reservation`,
    `enterprise_dispatch`
  - `TAOYUAN_AIRPORT` for `credit_card_airport_transfer`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` calls
  `serviceAreaService.evaluate(...)` during booking/order creation whenever a
  service product resolves and pickup coordinates exist, then converts
  `decision === "not_serviceable"` into a blocking `400` error.

That means a coordinate-bearing order for a product with **zero matching active
areas** will currently be treated the same as "outside a seeded area" unless the
parent slice introduces an explicit exemption path.

Two reviewer watchpoints matter:

1. **Inference from the brief:** the wording "no active service-area
   definition" implies a **data-driven predicate** keyed to active/effective
   service-area records, not a permanent product-name allowlist baked into the
   code.
2. `third_party_forwarded_order` is named in machine truth, but current repo
   search only found direct service-area evaluation on the owned-mobility
   booking path. The forwarder flow clearly uses
   `third_party_forwarded_order` for eligibility, yet this packet found no
   direct `ServiceAreaService.evaluate(...)` consumer under
   `apps/api/src/modules/forwarder/`. Reviewer should confirm whether the parent
   patch intentionally proves only the owned-booking surface today, or whether
   an additional current consumer exists outside the searched path.

Like all sidecar packets, this file is a snapshot for reviewer convenience.
Live lifecycle state remains authoritative in `ai-status.json` and
`ai-activity-log.jsonl`.

This closeout refresh only aligns packet metadata with current machine truth
and records the approval event. The acceptance checklist, dependency map, and
review watchpoints below are unchanged in substance from the reviewed packet.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance line from `ai-status.json` as a concrete
  reviewer checklist
- pin the current code surfaces where the regression exists:
  `apps/api/src/modules/owned-mobility/` and
  `apps/api/src/modules/service-area/`
- document the seeded service-area coverage gap that distinguishes seeded
  products from the no-service-area products named in machine truth
- map the downstream task-board dependency from `E2E-FIX-BE-001` to
  `E2E-FIX-A-001` and `E2E-FIX-VERIFY`
- record the current proof gap: existing unit tests cover seeded products and
  stop-policy behavior, but do not yet cover the zero-active-area exemption path

Out of scope:

- editing L1/L2 canonical truth, the parent task row in `ai-status.json`, or
  any runtime implementation file as part of this sidecar packet
- solving the sibling fixture task `E2E-FIX-A-001` or running the full hermetic
  E2E wave `E2E-FIX-VERIFY`
- widening or reseeding canonical service-area definitions just to make the
  affected products pass
- folding separate service-product activation or vehicle-eligibility fixes into
  this slice unless machine truth for the parent is updated to say so

---

## 2. Machine Truth Anchors

### 2.1 Sidecar task snapshot

Machine-truth row: `ai-status.json` -> `E2E-FIX-BE-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Gemini`
- status=`review_approved`
- depends_on=`[]`
- helper_parent=`E2E-FIX-BE-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/E2E-FIX-BE-001/E2E-FIX-BE-001-SIDECAR-ACCEPTANCE.md`
- review_notes_zh:
  - `審查通過`
- approval event:
  - `2026-07-10T15:21:06Z` reviewer `Gemini`: `Acceptance packet matches the scope and requirements of E2E-FIX-BE-001.`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 2.2 Parent task snapshot

Machine-truth row: `ai-status.json` -> `E2E-FIX-BE-001`

- title=`Service-area gate: exempt products with no seeded service area`
- owner=`Gemini`
- reviewer=`Codex`
- status=`review`
- depends_on=`[]`
- artifacts:
  - `apps/api/src/modules/owned-mobility/`
  - `apps/api/src/modules/service-area/`
- acceptance:
  - `無服務區 product 不再被 gate 擋;有服務區者行為不變;apps/api typecheck+vitest 綠`
- current handoff summary:
  - `E2E-FIX-BE-001: Exemption logic for products with no service area defined has been implemented and tested successfully. 112 test files passed, typecheck passed, lint passed. Branch gemini/e2e-fix-be-001 pushed with commit 12613ee63.`
- summary anchor:
  - map gate currently returns `not_serviceable` for products with no seeded
    service area
  - intended fix: exempt products with no active service-area definitions;
    products that do have service-area definitions keep current behavior

### 2.3 Downstream task-board coupling

Machine-truth rows:

- `E2E-FIX-A-001`
  - status=`in_progress`
  - depends_on=`[E2E-FIX-BE-001]`
  - reason it depends on this parent: fixture correction should only add
    serviceable coordinates to products that actually have service-area
    authority; products with no service-area definitions are explicitly expected
    to rely on the backend exemption from this slice
- `E2E-FIX-VERIFY`
  - status=`backlog`
  - depends_on=`[E2E-FIX-BE-001, E2E-FIX-C-001, E2E-FIX-D-001, E2E-FIX-A-001]`
  - reason it depends on this parent: the full hermetic rerun is not meaningful
    until the backend gate semantics are corrected

### 2.4 Authority and evidence anchors

- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
  records that service-area enforcement is backend authority and that booking
  creation should block, warn, or route to manual review based on evaluator
  output.
- `apps/api/src/modules/service-area/service-area.service.ts`
  is the runtime seed/evaluation authority for active service-area and
  stop-policy matching.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  is the current booking/order admission surface that converts service-area
  evaluation into blocking or review-required behavior.
- `apps/api/tests/unit/service-area.service.test.ts` and
  `apps/api/tests/unit/owned-mobility.service.test.ts` are the existing unit
  proof surfaces that should absorb the parent regression coverage.

---

## 3. Current Code Surface

### 3.1 Seeded service-area coverage is narrower than the service-product catalog

Current default runtime seeds show:

- `TAIPEI_CORE` applies to:
  - `taxi_realtime`
  - `taxi_reservation`
  - `enterprise_dispatch`
- `TAOYUAN_AIRPORT` applies to:
  - `credit_card_airport_transfer`

No default active area in the current in-memory seed is published for:

- `insurance_replacement_vehicle`
- `travel_agency_transfer`
- `third_party_forwarded_order`

That difference is the factual basis for the parent fix.

### 3.2 The blocking path today is data-agnostic once coordinates exist

Current behavior in `OwnedMobilityService`:

- `resolveServiceProductCodeForOrder(...)` derives the precise
  `ServiceProductType` for the order
- `resolveServiceAreaGate(...)` calls `serviceAreaService.evaluate(...)` when a
  service product resolves and pickup coordinates are available
- `applyServiceAreaCreationPolicy(...)` throws a `400` when
  `evaluation.decision === "not_serviceable"`

Current behavior in `ServiceAreaService`:

- `activeServiceAreas(...)` filters active/effective area records by product
- `evaluateStop(...)` returns `decision = "not_serviceable"` when
  `matchedAreas.length === 0`

Combined effect:

- for seeded products, "outside area" is correctly blocking
- for zero-area products, "no active definitions exist" currently collapses into
  the same `not_serviceable` outcome once coordinates are present, unless the
  parent adds an exemption path

### 3.3 Existing tests cover seeded behavior, not the zero-area exemption

Existing positive coverage already present:

- `apps/api/tests/unit/service-area.service.test.ts`
  - inside-area success
  - outside-area rejection
  - deny stop-policy rejection
  - manual-review stop-policy behavior
  - service-product scoping between `credit_card_airport_transfer` and
    `taxi_realtime`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
  - booking creation blocked on seeded `not_serviceable`
  - manual-review routing away from normal dispatch
  - spatial-audit snapshot persistence and defensive copying

Current proof gap:

- no test in the touched surfaces proves the intended exemption for a product
  with zero active service-area definitions

### 3.4 Existing E2E scripts do not fully prove this fix yet

`tests/e2e/E2E-015-partner-program-variants.sh` currently creates
`insurance_replacement_vehicle` and `travel_agency_transfer` bookings with
address-only pickup/dropoff payloads. That means today's script does **not**
prove the coordinate-bearing zero-area case by itself, because
`OwnedMobilityService` only calls `serviceAreaService.evaluate(...)` once pickup
coordinates exist.

Reviewer implication:

- do not accept a parent proof that only says "E2E-015 still passes with
  address-only fixtures"
- prefer unit or integration evidence that exercises the no-service-area
  exemption with explicit coordinates, because `E2E-FIX-A-001` is already tasked
  with pushing more scenarios onto coordinate-aware fixtures

### 3.5 `third_party_forwarded_order` needs explicit scope confirmation

Repo search found `third_party_forwarded_order` in:

- `apps/api/src/modules/service-product/service-product.service.ts`
- `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts`
- `apps/api/src/modules/forwarder/forwarder.service.ts`
- E2E scripts `E2E-002`, `E2E-013`, `E2E-020`

This packet did **not** find a direct current call from the forwarder path to
`ServiceAreaService.evaluate(...)`.

Reviewer implication:

- if the parent patch only changes `owned-mobility`/`service-area`, that still
  matches the declared artifact surface
- but if the owner claims `third_party_forwarded_order` is fully fixed, the
  reviewer should ask for the exact current consumer path and the proof that it
  now benefits from the same exemption

---

## 4. Dependency Map

### 4.1 Hard task dependencies

| Dependency | Status | Relevance |
| --- | --- | --- |
| _(none)_ | - | The parent has no machine-truth `depends_on` blockers. The regression can be fixed directly in the backend gate surface. |

### 4.2 Runtime/code dependencies

| Surface | Relevance |
| --- | --- |
| `apps/api/src/modules/service-area/service-area.service.ts` | Holds the active/effective area filter and the `matchedAreas.length === 0` -> `not_serviceable` decision that creates the current regression condition. |
| `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | Converts service-area evaluation into booking creation blocking behavior. This is the most likely patch site for the exemption. |
| `apps/api/tests/unit/service-area.service.test.ts` | Existing seeded-product service-area proof. Reviewer should expect new regression coverage here or equivalent nearby. |
| `apps/api/tests/unit/owned-mobility.service.test.ts` | Existing booking-admission and spatial-audit proof surface. Reviewer should expect the no-service-area admission case here or equivalent nearby. |

### 4.3 Downstream slices

| Task | Relationship | Relevance |
| --- | --- | --- |
| `E2E-FIX-A-001` | direct downstream dependency | Fixture correction can safely add serviceable coordinates only after the backend knows how to exempt products with no active area definitions. |
| `E2E-FIX-VERIFY` | wave closeout dependency | Full hermetic rerun should validate the post-fix gate semantics, not the current false-negative `not_serviceable` behavior. |

### 4.4 Reviewer anti-patterns to reject

- solving this by expanding default service-area seed coverage to the affected
  products without machine-truth approval for a product/governance change
- solving this by relying on "no coordinates means no evaluation" rather than a
  true no-active-area exemption
- solving this with a permanent hardcoded product-name allowlist when the brief
  specifically frames the rule as "no active service-area definition"

The third bullet is an inference from the brief's wording, not an explicit
line from machine truth. Reviewer should treat it as the preferred reading
unless the owner provides a cited reason to do otherwise.

---

## 5. Reviewer Checklist

Reviewer should walk the parent diff against these checks:

- the implementation stays within the declared backend artifact surface and does
  not mutate canonical docs or seed-truth files just to close the regression
- products with at least one active/effective service-area definition keep
  existing behavior:
  - out-of-area coordinates still block
  - deny stop-policies still block
  - manual-review policies still route to review
- a coordinate-bearing booking/order for a product with **zero active/effective
  service-area definitions** no longer throws the current service-area
  `not_serviceable` admission error
- the exemption rule is keyed to active/effective definitions, not to the
  temporary absence of coordinates
- if the implementation is data-driven, adding a future active service-area
  definition for one of the currently exempt products would automatically
  re-enable normal gating for that product
- regression proof includes executable backend verification, at minimum:
  - `pnpm --filter @drts/api typecheck`
  - vitest covering the touched suites or the full API test command claimed by
    the owner
- proof includes at least one new test that exercises the no-service-area
  exemption with explicit coordinates, not only the current address-only E2E
  fixtures
- if `third_party_forwarded_order` is claimed as covered, the handoff evidence
  names the current runtime consumer path and the exact test/evidence used to
  prove it

---

## 6. Suggested Review Questions

- Where exactly is the exemption decided: inside `ServiceAreaService`,
  `OwnedMobilityService`, or both, and does that choice preserve current seeded
  product behavior?
- Does the patch preserve spatial-audit snapshot behavior for exempt products,
  or does it accidentally suppress audit evidence entirely?
- Is the rule future-proofed against adding a real service-area definition for
  `insurance_replacement_vehicle`, `travel_agency_transfer`, or
  `third_party_forwarded_order` later?
- Did the owner prove the fix with coordinate-bearing inputs, rather than only
  with legacy text-only booking fixtures?

---

## 7. Handoff Expectation

When the parent owner hands off `E2E-FIX-BE-001`, the review message should
name:

- touched files
- verification commands actually run
- any scope decision about `third_party_forwarded_order`
- the commit evidence for the canonical backend fix

This sidecar packet does not approve the parent by itself. It only sharpens the
review bar and records the current dependency/scope map.
