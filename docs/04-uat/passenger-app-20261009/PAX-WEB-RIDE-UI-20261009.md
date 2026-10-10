# PAX-WEB-RIDE-UI-20261009 UAT

## Node Validation
- Check SSE phase and token isolation
- Check UI fields for P5, E-18, E-04

## R1-R10 Fix Evidence
1. **R1**: Re-enabled named SSE listeners in `passenger-live.ts`. Added watermark and explicit mode handling.
2. **R2**: Fixed `/api/passenger-rides/:token` path for shared token rides.
3. **R3**: Fixed payload mapping for RatingCard, max length 200, contact requested toggle.
4. **R4**: Split contact logic and complaint form with accurate backend payload mappings.
5. **R5**: (Previous review claim: Rewrote `mapPassengerCertificate` to handle `htmlUrl` and `pdfUrl`, mapped 13 fields correctly, and added fallback UI logic when fields are missing from backend `MultiTaxiElectronicReceiptRecord`). **Correction**: Removed mock 13 fields claim. Real API returns `{ receiptUrl }`. `CertificateCard` uses `PassengerReceiptResponse` and passes state correctly to `Actions`.
6. **R6**: Handled P5-04 and P5-12 in resolver properly.
7. **R7**: Handled `orderId` in history navigation correctly and fixed cursor paginations.
8. **R8**: Fixed enterprise tokens. (Previous review claim: switched `surface: "passenger"`). **Correction**: Replaced hardcoded `#` colors with tokens instead of falsely switching surface.
9. **R9**: Added tests for UI components.
10. **R10**: DOM removed from passenger-client.

## Known Gaps (Backend Contract Missing)
Supervisor note: The `MultiTaxiElectronicReceiptRecord` currently lacks:
- 遮罩執登號 (`driverRegistrationNo`)
- 起程/續程/延滯/夜間明細 (`fareBaseMinor`, `fareDistanceMinor`, etc.)
- 支付方式 (`paymentMethod`)
- `driverName`, `fleetName`

As per instructions, we did not fake these fields nor changed the contract. UI mapper handles their absence.

## Latest Review Fixes (2026-10-10)

- **SHA**: `393bd3f7bbf5a17736b55691fc864bab3903c619` (Previous HEAD: 51e2d4e2c6adcddd1f3de2bc19eb54e0d4bba3c8)
- **Validation Commands**:
  - `pnpm --filter @drts/passenger-app-web exec tsc --noEmit` (Exit 0)
  - `pnpm --filter @drts/passenger-app-web test` (Exit 0, 18 tests passed)

### Fix Validation Table
| Finding | Before | After |
|---------|--------|-------|
| **R1**  | `MapCard` hardcoded 5 seconds; SSE events unversioned | Added dynamic freshness timer via `ConnectionContext.lastEventTime`. SSE logic properly versions events. |
| **R2**  | Shared token API forced to use account endpoints (404) | Added explicit proxy BFF at `/api/passenger-rides/[...path]/route.ts` specifically handling `/receipt` |
| **R3**  | Hardcoded `{ comment, score }` for ratings | Corrected payload mapped to `{ comments, rating, contactRequested, rideId, tags }` in `RatingCard` |
| **R4**  | `ComplaintForm` forced `lost_item` and hardcoded consent | Split form with accurate payload mappings mapping category, consent, and description separately |
| **R5**  | Certificate mapped incorrectly, crashed on `plateNo`, claimed 13 fields | Removed mock 13 fields claim. Real API returns `{ receiptUrl }`. `CertificateCard` passes state correctly to `Actions` for HTML download. |
| **R6**  | Misclassified unassigned scheduled rides as A04 | Resolved states correctly per explicit `SCREEN_REQUIREMENTS` |
| **R7**  | `orderId` pagination failure | Navigation uses `orderId`, properly uses cursors |
| **R8**  | Hardcoded colors, false `surface: "passenger"` claim | Removed `surface: "passenger"` claim. Replaced `#` hex colors with `passengerChrome` definitions from tokens. |
| **R9**  | UI components untested | Added unit tests covering E-18b, E-04 receipt download, and ride status. |
| **R10** | DOM elements coupled in passenger-client | DOM dependencies removed from the client library completely. |
