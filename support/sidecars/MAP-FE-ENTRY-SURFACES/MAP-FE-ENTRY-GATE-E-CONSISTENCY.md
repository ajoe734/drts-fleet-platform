# MAP-FE Entry Surfaces Gate E Consistency Packet

**Sidecar task:** `MAP-FE-ENTRY-SIDECAR-GATEE`

**Parent tasks:** `MAP-FE-TEN-001`, `MAP-FE-CON-001`

**Parent owners/reviewers:** `Claude2` / `Codex2`, `Codex2` / `Claude`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This packet defines Tenant / Concierge / Partner entry-surface consistency and Gate E evidence; it does not implement those surfaces.

## 1. Gate E Verdict

Do **not** claim Gate E or cross-surface map readiness until non-callcenter entry surfaces prove they use the same coordinate, serviceability, and degraded-mode model as callcenter.

Current state:

- Tenant Portal address book allows manual coordinates, but not map-assisted pin confirmation.
- Tenant Console booking can inherit saved-address coordinates, but manual booking flows still need shared picker and serviceability preview.
- Concierge booking has text-oriented pickup/dropoff entry and no production map pinning evidence.
- Partner/assisted entry paths must be audited for text-only addresses and provider-outage behavior.
- Backend booking gates are useful only if every entry surface sends consistent coordinates/provenance or receives explicit manual-review/block outcomes.

Gate E is failed if any entry surface can silently create a normal dispatchable coordinate-less order during provider outage, address ambiguity, or out-of-area policy denial.

## 2. Production Acceptance

`MAP-FE-TEN-001` and `MAP-FE-CON-001` should not close unless all relevant rows below have evidence.

| Capability | Required behavior | Must not happen |
| --- | --- | --- |
| Shared picker model | Tenant, Concierge, and Partner/assisted entry use `AddressMapPicker`/shared helpers or a documented compatible adapter. | Each surface invents its own lat/lng/provenance payload shape. |
| Saved-address pin confirmation | Tenant saved addresses show coordinate/provenance status; missing coordinates are visible and require confirm/fix before dispatchable use. | A saved text address silently becomes a normal dispatchable coordinate-less pickup. |
| Booking payload consistency | Dispatchable bookings submit pickup/dropoff coordinates and provenance in the same backend contract shape as callcenter. | One surface sends `lat/lng` while another sends display address only for the same dispatchable state. |
| Serviceability preview | Surfaces render serviceable/manual-review/not-serviceable/provider-unavailable reason codes before submit. | Backend blocks but UI hides or rewrites the reason into unrelated copy. |
| Backend anti-bypass | API-level or E2E evidence proves tampered/missing coordinates cannot bypass backend service-area gate. | UI-only disabled buttons are the only safety proof. |
| Provider outage | Provider unavailable/no-geocode/ambiguous address paths show degraded state and route to explicit manual review/block policy. | Provider outage hides map but leaves normal submit enabled. |
| Customer-safe copy | Concierge/partner-facing copy is understandable without leaking internal policy jargon, while retaining machine reason codes in telemetry/state. | Customer sees raw internal strings only, or machine reason codes are lost. |
| Observability handoff | Coordinate-less attempts, provider outage, manual fallback, and policy denial emit the events/metrics required by `MAP-OBS-001`. | Support cannot distinguish provider outage from address ambiguity or policy denial. |

## 3. Surface-Specific Requirements

### Tenant Portal Address Book

Required:

- Replace manual lat/lng as the primary flow with map search/pin confirmation.
- Keep manual coordinate entry as an advanced/degraded fallback with warning copy.
- Show coordinate provenance, last pinned/confirmed actor/time where available, and missing-coordinate warning.
- Prevent unconfirmed or missing-coordinate saved addresses from being used as normal dispatchable pickup/dropoff without confirmation.

Evidence:

- Unit/component tests for address with coordinates, missing coordinates, manual fallback, and provider unavailable.
- Tenant Portal route screenshot/trace showing saved-address pin status.

### Tenant Console Booking

Required:

- Saved address selection shows pickup/dropoff pin and provenance.
- Manual address flow uses shared picker and serviceability preview.
- Backend gate errors render consistent reason code and tenant-safe copy.
- Serviceable booking persists coordinates/snapshot through backend.

Evidence:

- Test that a serviceable tenant booking submits coordinates/provenance.
- Test that no-pickup/not-serviceable/manual-review/provider-unavailable states cannot enter normal dispatch silently.

### Concierge Portal

Required:

- Concierge booking uses shared picker with desk/default-location assistive defaults where useful.
- Operator-facing copy can mention manual review and provider outage clearly.
- Customer-facing copy avoids internal policy jargon but preserves machine reason codes in state.

Evidence:

- Concierge unit/component tests for serviceable, blocked, manual-review, and provider-unavailable paths.
- Playwright trace or E2E evidence that text-only concierge booking cannot become normal dispatchable unless policy explicitly allows manual review.

### Partner / Assisted Entry

Required:

- Audit partner/assisted booking paths for pickup/dropoff text-only payloads.
- For partner-provided coordinates, validate lat/lng range and provenance/source.
- For partner-provided text-only addresses, resolve/pin or route to explicit manual review/block outcome.
- Keep partner-visible reason copy stable and machine reason codes aligned with tenant/callcenter.

Evidence:

- Inventory of affected partner/assisted routes or APIs.
- Tests showing missing/invalid coordinates do not bypass backend gate.

## 4. E2E Scenarios

`MAP-QA-002` should use these for `E2E-MAP-004` and `E2E-MAP-005`.

| Scenario | Required assertions | Gate risk covered |
| --- | --- | --- |
| `E2E-ENTRY-001 tenant saved address pin confirmation` | Create/update saved address with provider candidate; saved address stores coordinates/provenance; booking selection shows pin; submit payload contains coordinates. | Prevents tenant address master from becoming stale text-only authority. |
| `E2E-ENTRY-002 tenant no-pickup blocked` | Tenant booking pickup inside no-pickup zone renders tenant-safe blocked reason; backend rejects normal dispatch; no normal order is created. | Proves Gate B policy applies outside callcenter. |
| `E2E-ENTRY-003 concierge serviceable booking` | Concierge selects pickup/dropoff pins; order persists coordinates/snapshot; Ops map can show pins. | Proves assisted entry reaches same spatial authority as callcenter. |
| `E2E-ENTRY-004 concierge manual-review zone` | Manual-review policy creates manual-review state with clear operator copy; no silent normal dispatch. | Proves degraded/manual policy is explicit. |
| `E2E-ENTRY-005 partner text-only anti-bypass` | Partner/assisted entry with text-only or invalid coordinates is blocked or manual-review per backend policy. | Prevents external/partner entry bypass. |
| `E2E-ENTRY-006 provider outage cross-surface` | Mock provider unavailable for tenant and concierge/partner; UI shows degraded state; backend prevents normal coordinate-less dispatch; no live provider calls occur. | Proves Gate E across non-callcenter surfaces. |

## 5. Minimum Verification Commands

Parent task handoffs should include exact branch/SHA and relevant commands.

Tenant side:

```bash
pnpm --filter @drts/tenant-portal-web typecheck
pnpm --filter @drts/tenant-portal-web test
pnpm --filter @drts/tenant-portal-web lint
pnpm --filter @drts/tenant-console-web typecheck
pnpm --filter @drts/tenant-console-web test
pnpm --filter @drts/tenant-console-web lint
```

Concierge/partner side:

```bash
pnpm --filter @drts/concierge-portal-web typecheck
pnpm --filter @drts/concierge-portal-web test
pnpm --filter @drts/concierge-portal-web lint
pnpm --filter @drts/partner-booking-web typecheck
pnpm --filter @drts/partner-booking-web test
pnpm --filter @drts/partner-booking-web lint
```

Cross-surface E2E:

```bash
pnpm exec playwright test -c playwright.map-geofence-harness.config.ts --grep "tenant|concierge|partner|provider outage|manual-review|not-serviceable"
```

If any package has no test target yet, the parent handoff must either add one or document the exact substitute evidence. Missing package commands cannot be counted as Gate E pass.

## 6. Release Evidence Required

`MAP-REL-001` should not mark Gate E pass until evidence includes:

- Tenant saved-address pin confirmation proof.
- Tenant booking serviceable/blocked/manual-review/provider-unavailable proof.
- Concierge serviceable/blocked/manual-review/provider-unavailable proof.
- Partner/assisted entry text-only and invalid-coordinate anti-bypass proof.
- Backend audit/snapshot assertion for at least one tenant and one concierge/partner path.
- Observability assertion for provider outage, coordinate-less attempt, and policy denial.
- Screenshot/trace showing user/operator-safe degraded copy.
- Command log and branch/SHA for all relevant packages and E2E specs.

## 7. Do-Not-Claim Rules

`MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-QA-002`, and `MAP-REL-001` must not claim:

- "Gate E pass"
- "All entry surfaces use map pinning"
- "Tenant/concierge/partner provider outage safe"
- "No coordinate-less dispatch bypass remains"
- "Cross-surface E2E complete"

unless the evidence proves every affected entry surface.

Safe interim wording:

- "Tenant/concierge/partner map alignment is scoped and assigned."
- "Entry-surface E2E requirements are defined."
- "Gate E remains pending implementation and cross-surface E2E evidence."

## 8. Parent And QA Handoff

Recommended note for `MAP-FE-TEN-001`:

```text
Use support/sidecars/MAP-FE-ENTRY-SURFACES/MAP-FE-ENTRY-GATE-E-CONSISTENCY.md as the tenant Gate E checklist. Tenant Portal saved addresses and Tenant Console bookings must use shared map/pin/provenance/serviceability behavior, and provider outage or missing coordinates must not create normal dispatchable orders.
```

Recommended note for `MAP-FE-CON-001`:

```text
Use support/sidecars/MAP-FE-ENTRY-SURFACES/MAP-FE-ENTRY-GATE-E-CONSISTENCY.md as the concierge/partner Gate E checklist. Concierge and partner/assisted entry must use shared map/pin/provenance/serviceability behavior, customer-safe degraded copy, backend anti-bypass evidence, and provider-outage tests.
```

Recommended note for `MAP-QA-002`:

```text
Use MAP-FE-ENTRY-SIDECAR-GATEE for E2E-MAP-004 and E2E-MAP-005. Final E2E must prove tenant/concierge/partner consistency and provider-outage safety, not just callcenter behavior.
```
