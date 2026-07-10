# E2E-FIX-A-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `E2E-FIX-A-001` - Dispatch E2E fixtures: correct per-product serviceable coordinates  
**Parent Owner:** `Gemini`  
**Parent Reviewer:** `Codex`<br>
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Gemini`  
**Last Revised:** `2026-07-10 (UTC closeout refresh)`<br>
**Status:** `OWNER-CLOSEOUT SUPPORT ARTIFACT` - reviewer-approved support-only packet finalized for branch closeout; does not modify canonical truth, runtime behavior, or parent task ownership.

---

## 1. Scope Boundary

This sidecar exists to give the assigned reviewer a compact acceptance frame for the shared E2E fixture slice behind `E2E-FIX-A-001`.

In scope:

- freeze the current machine-truth snapshot for the sidecar, parent task, and declared backend dependency
- map the seeded service-area expectations that make per-product coordinates matter
- identify the shared fixture consumers that can regress if the parent patch changes payload shape
- surface reviewer hotspots before the parent owner absorbs this support material into the main task

Out of scope:

- editing `tests/e2e/**`, `apps/api/**`, canonical product truth, or machine-truth files
- deciding which exact coordinates the parent owner should ship
- claiming the parent acceptance has already passed
- replacing the parent review that now belongs to `Codex`

---

## 2. Machine-Truth Snapshot

Snapshot refreshed during owner closeout on `2026-07-10 (UTC)` after the sidecar review returned to `Codex` for finalization.

### Sidecar - `E2E-FIX-A-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Gemini`
- status=`in_progress` during owner closeout
- review_notes_zh=`審查通過`, `回到 owner 收尾`
- helper_parent=`E2E-FIX-A-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/E2E-FIX-A-001/E2E-FIX-A-001-SIDECAR-ACCEPTANCE.md`

### Parent - `E2E-FIX-A-001`

- owner=`Gemini`
- reviewer=`Codex`
- status=`in_progress`
- depends_on=`E2E-FIX-BE-001`
- artifacts=`tests/e2e/fixtures/`, `tests/e2e/`
- acceptance=`受 service_area 影響場景在 gate 這關全部不再 fail;取代/關 PR #1069`

### Declared backend dependency - `E2E-FIX-BE-001`

- owner=`Gemini`
- reviewer=`Codex`
- status=`in_progress`
- acceptance=`無服務區 product 不再被 gate 擋;有服務區者行為不變;apps/api typecheck+vitest 綠`

### Machine-truth implication

- The parent task is not an isolated fixture tweak; it is explicitly blocked on a backend rule change that is still in active implementation (`in_progress`), so parent acceptance cannot be treated as cleared.
- The parent owner and dependency owner are the same lane (`Gemini`), so reviewer notes should treat the fixture patch and the backend exemption as a coupled acceptance surface.

---

## 3. Authoritative Product / Runtime Anchors

These are the minimum repo-visible anchors that explain why per-product coordinates are the acceptance-critical detail:

- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
  - `MAP-BE-004` states passenger, callcenter, and tenant booking creation evaluate service-area decisions when coordinates are present.
- `apps/api/src/modules/service-area/service-area.service.ts`
  - seed service area `TAIPEI_CORE` applies to `enterprise_dispatch`
  - seed service area `TAOYUAN_AIRPORT` applies to `credit_card_airport_transfer`
- `apps/api/tests/unit/service-area.service.test.ts`
  - product scoping is enforced: Taoyuan airport coordinates are `serviceable` for `credit_card_airport_transfer` and `not_serviceable` for a mismatched product
- `apps/api/src/modules/service-product/service-product.service.ts`
  - runtime service products still include `insurance_replacement_vehicle`, `travel_agency_transfer`, and `third_party_forwarded_order`, even though those products are not represented in the seeded service-area list above
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - service-area compliance becomes `clear` only when the selected service product has serviceable coordinates; missing coordinates remain review-oriented evidence rather than a clean pass

Reviewer reading:

- `enterprise_dispatch` and `credit_card_airport_transfer` should not be "fixed" by the backend exemption in `E2E-FIX-BE-001`; they already have seeded service-area expectations.
- The backend dependency matters for products with no seeded area, not as a substitute for supplying deterministic serviceable coordinates to seeded-product E2E fixtures.

---

## 4. Dependency Map

### Formal dependency edge

| Dependency | Machine-truth status | Why it matters |
| --- | --- | --- |
| `E2E-FIX-BE-001` | `in_progress` | Parent acceptance covers scenarios that were failing at the service-area gate. The backend fix remains the only declared path for products with no active seeded service area. |

### Effective fixture-level dependency graph

| Fixture / surface | Current payload shape | Primary product expectation | Current consumers |
| --- | --- | --- | --- |
| `tests/e2e/fixtures/e2e-booking-enterprise.json` | address-only; no explicit `lat` / `lng` | `enterprise_dispatch` should resolve into seeded `TAIPEI_CORE` serviceability | `E2E-001`, `E2E-004`, `E2E-012`, `E2E-022`, `dev-seed-pending-task.sh` |
| `tests/e2e/fixtures/e2e-booking-airport.json` | address-only; no explicit `lat` / `lng` | `credit_card_airport_transfer` should resolve into seeded `TAOYUAN_AIRPORT` serviceability | `E2E-007`, `E2E-008`, `E2E-013`, `E2E-020` |
| `tests/e2e/fixtures/e2e-phone-booking.json` | address-only; no explicit `lat` / `lng` | `enterprise_dispatch` callcenter order should avoid the same seeded-area mismatch as tenant enterprise flows | `E2E-003` |

### Shared-consumer risk

The parent task's artifact list is broad (`tests/e2e/fixtures/`, `tests/e2e/`). Repo inspection shows the likely blast radius is the three shared booking fixtures above, not one single scenario script.

Important reviewer consequence:

- a "small" fixture correction can silently change multiple E2E scripts at once
- if payload shape changes, every consumer that patches those files with `jq` must remain schema-compatible
- if payload shape does not change and coordinates remain implicit, the parent patch may still be relying on environment-specific geocoding rather than deterministic serviceable coordinates

---

## 5. Current Repo Surface Snapshot

### Relevant fixtures are still address-only

Current versions of:

- `tests/e2e/fixtures/e2e-booking-enterprise.json`
- `tests/e2e/fixtures/e2e-booking-airport.json`
- `tests/e2e/fixtures/e2e-phone-booking.json`

all provide street-address text and scenario metadata, but none include:

- `pickup.lat` / `pickup.lng`
- `dropoff.lat` / `dropoff.lng`
- `coordinateProvenance`

### Consumer scripts only inject timing or scenario metadata

Repo-visible E2E scripts currently patch these fixtures with `jq` for fields such as:

- reservation window timestamps
- partner entry / verification metadata
- callcenter `callId` / `agentId`

They do **not** currently add coordinate fields in the script layer before POSTing the booking/order payload.

### Runtime consequence

This is the core acceptance risk for the parent task:

1. If the parent patch still leaves seeded-product fixtures address-only, reviewer should ask where deterministic serviceable coordinates now enter the request path.
2. If the parent patch adds explicit coordinates, reviewer should check that:
   - `enterprise_dispatch` aligns to the seeded Taipei-core surface
   - `credit_card_airport_transfer` aligns to the seeded Taoyuan-airport surface
3. If the parent patch broadens coverage to no-seed products, reviewer should keep that approval coupled to `E2E-FIX-BE-001`.

---

## 6. Acceptance Checklist

Legend:

- `[SIDECAR]` = acceptance for this support packet
- `[PARENT]` = reviewer-facing checkpoint for `E2E-FIX-A-001`

### Sidecar packet acceptance

- [x] `[SIDECAR]` Packet created only under `support/sidecars/E2E-FIX-A-001/`
- [x] `[SIDECAR]` No canonical truth or runtime files were changed
- [x] `[SIDECAR]` Parent/dependency coupling is recorded from machine truth
- [x] `[SIDECAR]` Shared fixture consumers and reviewer hotspots are made explicit

### Parent review checkpoints

- [ ] `[PARENT]` Every seeded-product fixture touched by the parent patch gains deterministic serviceable coordinates or an equally deterministic coordinate source
- [ ] `[PARENT]` `enterprise_dispatch` scenarios land inside the seeded `TAIPEI_CORE` surface rather than depending on the no-seed exemption
- [ ] `[PARENT]` `credit_card_airport_transfer` scenarios land inside the seeded `TAOYUAN_AIRPORT` surface
- [ ] `[PARENT]` No-seed products (`insurance_replacement_vehicle`, `travel_agency_transfer`, `third_party_forwarded_order`) are treated as a backend-exemption concern tied to `E2E-FIX-BE-001`, not as evidence that seeded fixtures are correct
- [ ] `[PARENT]` Shared consumers of `e2e-booking-enterprise.json`, `e2e-booking-airport.json`, and `e2e-phone-booking.json` still match the edited payload shape
- [ ] `[PARENT]` Acceptance evidence shows service-area gate failures disappear for the intended scenarios without relaxing seeded-product enforcement

---

## 7. Reviewer Hotspots

When `Gemini` reviews this sidecar or folds it into the parent work, the highest-signal questions are:

1. Did the parent patch make coordinates product-specific and deterministic, or did it only move the flakiness to runtime geocoding?
2. Was `E2E-003` considered along with the tenant enterprise scripts, since `e2e-phone-booking.json` also carries `enterprise_dispatch`?
3. Is the parent change limited to seeded-product fixture correctness, or is it implicitly claiming `E2E-FIX-BE-001` is already accepted for no-seed products?
4. If a shared fixture schema changed, were all `jq`-based consumer scripts validated against that new shape?

---

## 8. Verification Performed For This Sidecar

Machine-truth checks:

- `AI_NAME=Codex scripts/ai-status.sh show E2E-FIX-A-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex scripts/ai-status.sh show E2E-FIX-A-001`
- `AI_NAME=Codex scripts/ai-status.sh show E2E-FIX-BE-001`

Repo inspection:

- shared fixture contents under `tests/e2e/fixtures/`
- current fixture consumers in `tests/e2e/E2E-001`, `003`, `004`, `007`, `008`, `012`, `013`, `020`, `022`, and `dev-seed-pending-task.sh`
- seeded service-area definitions in `apps/api/src/modules/service-area/service-area.service.ts`
- product-scoping test coverage in `apps/api/tests/unit/service-area.service.test.ts`
- runtime service-product inventory in `apps/api/src/modules/service-product/service-product.service.ts`
- service-area compliance gate behavior in `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`

Closeout checks:

- `git status --short --branch`
- `git show -s --format=fuller HEAD`
- `git rev-parse HEAD`
- `git rev-parse --abbrev-ref --symbolic-full-name @{u}`

No runtime tests were executed because this sidecar only adds support documentation and does not change executable code.

---

## 9. Handoff / Closeout

- Reviewer handoff completed: `Codex` -> `Gemini`
- Reviewer outcome: approved and returned to owner for finalization
- Sidecar integration status: `not_applicable`
- Intended use: reviewer may absorb Sections 3-7 into parent review notes for `E2E-FIX-A-001`, especially where the fixture patch and `E2E-FIX-BE-001` backend exemption interact
- This packet documents acceptance framing only; the parent owner decides whether and how to absorb it into the main task branch
