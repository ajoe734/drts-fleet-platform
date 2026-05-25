# UI-BE-008 Acceptance Packet

## Overview
- Task: UI-BE-008 (DriverOpsInstruction module)
- Description: Backend implementation of ops issues, driver receives via push + inbox.

## Dependencies
- `UI-BE-003`: Backend dependency for DriverOpsInstruction storage and ops-side endpoints.

## Dependency Map
```mermaid
graph TD
    A[UI-BE-008 DriverOpsInstruction] -->|Depends on| B[UI-BE-003 Storage/Endpoints]
    A -->|Used by| C[UI-CL-005 Driver Methods]
    A -->|Used by| D[UI-FE-DRV Driver App Screen]
```

## Acceptance Checklist
- [ ] Backend endpoints for `DriverOpsInstruction` implemented
- [ ] Driver-side push notification integration verified
- [ ] Driver inbox integration verified
- [ ] `UI-BE-003` dependencies validated
- [ ] Vitest coverage for `expiresAt` handling verified

## Support Artifacts
- No canonical truth changes.
- This file is for acceptance review only.
