# MTX-AUTH-UI-001 Fleets Handoff & Acceptance Evidence

## Implementation Summary

Implemented Fleet B authorization admin UI for `platform-admin-web` according to `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §4-§6.

### UI Screens & Capability Mapping

1. **Registry View (`registry`)**: `apps/platform-admin-web/app/multi-taxi-authorizations/page.tsx`
   - Canonical fields table: `authorityCode`, `operatorId`, `status`, `serviceAreaCodes`, `activeFareVersionId`, `effectiveFrom`, `effectiveUntil`.
   - Filter pills for quick scanning: `All`, `Draft`, `Approved`, `Suspended`, `Expired`, `Revoked`.
   - Visual styling strictly conforms to `@drts/ui-web` Platform Admin shell (`buildCanvasTheme({ surface: "platform", density: "compact" })`).

2. **Detail View (`detail`)**:
   - `CanvasDL` key-value grid for full authorization metadata.
   - Read-only banner when status is `expired` or `revoked`.

3. **Draft Editor (`draft editor`)**:
   - Mode selection to create new draft or edit existing draft authorization.
   - Form inputs with validation for `operatorId`, `authorityCode`, `businessPlanVersion`, `serviceAreaCodes`, `activeFareVersionId`, `effectiveFrom`, `effectiveUntil`.

4. **Lifecycle Confirm Dialog (`lifecycle confirm`)**:
   - Confirmation modal overlay prior to executing `activate` or `suspend` commands.

5. **Authorized Vehicles (`authorized vehicles`)**:
   - Authorized vehicle membership list (`vehicleId`, `status`, `effectiveFrom`, `effectiveUntil`).
   - Add authorized vehicle form enabled when authorization status is active/draft/suspended (disabled when `expired` or `revoked`).

6. **Conflict & Permission Error States (`conflict-permission states`)**:
   - Catches 403 (Permission Denied), 409 (Lifecycle Conflict), 400 (Validation Error) and displays inline `CanvasBanner`.

### Capability Controls (§3 & §6 Conformance)
- Forbidden commands (`revoke`, `restore`, `delete`, `vehicle suspend`, `legal hold`, `bulk import`) are NOT exposed.
- Expired and revoked records are read-only.
- i18n support via `t()` for `zh` and `en` locales in `lib/translations.ts`.

### Verification Evidence
- Unit tests: `tests/unit/multi-taxi-authorizations-ui.test.ts` (PASS)
- Typecheck & Lint: Clean pass across workspace.
