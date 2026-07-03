# MAP-FE-TEN-001 — Tenant address & booking map alignment — Review Evidence

- Task: `MAP-FE-TEN-001`
- Owner: `Claude2`
- Reviewer: `Gemini2`
- Branch: `claude2/map-fe-ten-001` (base `dev`)
- Anchor commits: `89e3a94d5` (tenant-portal address book), `3f8af7882` (tenant-console booking)
- Depends on: `MAP-UI-001` (shared `AddressMapPicker`, merged #1038), `MAP-BE-004` (geo provider gateway), `MAP-BE-005` (serviceability / booking gate — in progress; FE is degrade-safe and treats the backend gate as authoritative).

## Summary

Replaces the hand-typed lat/lng flows on the two tenant surfaces with the shared
`@drts/ui-web` picker delivered by MAP-UI-001, wired to the backend geo /
service-area endpoints through same-origin proxy routes, with a degrade-safe
browser provider adapter.

### Tenant Portal — address book (`apps/tenant-portal-web`)

- `app/addresses/page.tsx`: the New / Edit address forms drop the raw
  Latitude/Longitude number inputs in favour of `AddressMapField`, a client
  wrapper around the shared `AddressMapPicker` (search → pin, saved-pin
  confirmation on edit via `defaultValue`, manual-coordinate fallback with the
  advanced-override reason).
- `components/address-map-field.tsx`: mirrors the picked coordinate into hidden
  inputs (`lat`, `lng`, `coordinateSource`, `manualOverrideReason`,
  `priorGeocodeSource`) and shows an **advanced warning banner when no
  coordinate is pinned**, so a saved address always has coordinates *or* an
  explicit warning (acceptance #1).
- `lib/tenant-address-map.ts`: pure mappers — `savedAddressToPayload` (seeds the
  saved pin), `geocodeSourceFromCoordinateSource` (picker `coordinateSource` →
  contract `geocodeSource`, preserving the prior classification for an unchanged
  saved pin).
- Server actions (`createAddress` / `updateAddress`) now persist
  `geocodeSource` alongside `lat`/`lng`.

### Tenant Console — booking (`apps/tenant-console-web`)

- `app/bookings/new/tenant-booking-create-form.tsx`: the manual pickup/drop-off
  address + lat/lng inputs are replaced by the shared `AddressMapPairPicker`.
  Saved-address selects seed the picker (remount nonce, since the pair picker
  seeds internal state from props at mount). Picker payloads drive the booking
  command coordinate fields, so **address text and coordinates always travel
  together** (acceptance #2 — consistent payloads).
- Serviceability: the pair picker evaluates the backend `/service-area/evaluate`
  for the current pickup/drop-off + `serviceProductType` (= booking subtype). A
  `not_serviceable` decision disables **and** blocks submit with a localized
  banner. This is the client half of the gate; the booking-create backend
  remains authoritative (acceptance #3 — cannot be bypassed).
- `lib/tenant-address-map.ts` + unit test
  `tests/unit/tenant-address-map.test.ts` cover the payload ↔ command mapping.
- `lib/translations.ts`: adds `newBooking.serviceability.blocked{Title,Body}`
  in EN + zh.

### Shared wiring (per app)

- `app/api/geo/[action]/route.ts`: same-origin proxy forwarding
  `search/resolve/reverse/health` and `evaluate-service-area` to the backend via
  the tenant API client (`@drts/api-client` already exposes these methods).
- `lib/geo-map-provider.ts`: browser `AddressMapPickerProvider` that calls the
  proxy and rethrows failures as `AddressProviderUnavailableError`, so the
  picker falls back to manual entry when geo is degraded (Gate E — Degraded
  safe).

## UI design contract

Both surfaces pass the shared `tenant` realm theme
(`buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" })`) to
the picker. No raw hex palette introduced; colors come from `@drts/ui-tokens`
via the canvas theme. Surface tags: `tenant_portal`, `tenant_console`.

## Executed gate evidence (task worktree, HEAD = 3f8af7882)

| Check | Command | Result |
| --- | --- | --- |
| tenant-portal typecheck | `pnpm --filter tenant-portal-web typecheck` | PASS (exit 0) |
| tenant-portal lint | `pnpm --filter tenant-portal-web lint` | PASS (exit 0) |
| tenant-portal build | `pnpm --filter tenant-portal-web build` | PASS (exit 0) |
| tenant-console typecheck | `pnpm --filter tenant-console-web typecheck` | PASS (exit 0) |
| tenant-console lint | `pnpm --filter tenant-console-web lint` | PASS (exit 0) |
| tenant-console test | `pnpm --filter tenant-console-web test` | PASS — 5 files / 20 tests |
| tenant-console build | `pnpm --filter tenant-console-web build` | PASS (exit 0) |
| e2e + config lint | `eslint playwright.tenant-map-booking.config.ts tests/e2e/tenant-map-booking-ui.spec.ts` | PASS (exit 0) |

(acceptance #4 — tenant package checks pass.)

## e2e (infra-gated)

`tests/e2e/tenant-map-booking-ui.spec.ts` + `playwright.tenant-map-booking.config.ts`
drive the real pair picker with `/api/geo/*` stubbed (serviceable pins clear the
service-area state; not_serviceable blocks submit). It is excluded from the
default `playwright.config.ts` projects (which boot ops/platform-admin) via
`testIgnore`. Execution requires booting the tenant console dev server against a
reachable backend for the page shell; **not executed in this worker** (no
dev API / seeded tenant here) — this remains the same device/infra UAT gate
tracked by the MAP readiness burndown.

## Integration status

`branch_pushed` (pending). No dev merge / deploy claimed.
