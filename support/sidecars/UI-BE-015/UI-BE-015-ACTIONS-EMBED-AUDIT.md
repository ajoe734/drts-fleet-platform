# UI-BE-015 Actions Embed Audit

Date: 2026-05-26
Task: `UI-BE-015-ACTIONS-EMBED`
Owner: `Codex2`

## Scope

Audit the completed Layer 1 backend wave modules against ADR `PACK-LAND-202605`:

- `UI-BE-006`
- `UI-BE-007-DSP`
- `UI-BE-007-CMP`
- `UI-BE-007-INC`
- `UI-BE-007-BKG`

## Result

All audited mutating resource read models now embed `availableActions[]` in list/detail responses. No standalone `*/actions` routes are present in the audited controllers.

## Coverage

| Module | Resource / response | Evidence |
| --- | --- | --- |
| `UI-BE-006` | `TenantRolloutStateMachineRecord.availableActions` on `GET /platform-admin/tenants/:tenantId/rollout-state` | `apps/api/src/modules/tenant-rollout/tenant-rollout-state-machine.ts`, `apps/api/src/modules/platform-admin/tenants.controller.ts` |
| `UI-BE-007-DSP` | `OwnedOrderRecord.availableActions` on owned dispatch queue rows | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` |
| `UI-BE-007-DSP` | `ForwardedOrderRecord.availableActions` on forwarded queue rows | `apps/api/src/modules/forwarder/forwarder.service.ts` |
| `UI-BE-007-CMP` | `ComplaintCaseRecord.availableActions` on complaint list/detail read models | `apps/api/src/modules/complaint/complaint.service.ts`, `apps/api/src/modules/complaint/complaint.controller.ts` |
| `UI-BE-007-INC` | `IncidentReadModel.availableActions` on incident list/detail read models | `apps/api/src/modules/incident/incident.service.ts`, `apps/api/src/modules/incident/incident.controller.ts` |
| `UI-BE-007-BKG` | `BookingRecord.availableActions` on tenant booking list/detail read models | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` |

## Guardrail

`apps/api/scripts/lint-available-actions.ts` now fails if the audited contract or implementation markers disappear, or if a standalone `actions` route is introduced in the audited controllers.

## Disabled-state verification

`apps/api/tests/unit/ui-read-model.test.ts` verifies that a disabled action descriptor remains disabled after downstream read-model shaping.
