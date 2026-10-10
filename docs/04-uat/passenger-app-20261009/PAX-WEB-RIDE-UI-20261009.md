# PAX-WEB-RIDE-UI-20261009 UAT

## Node Validation
- Check SSE phase and token isolation
- Check UI fields for P5, E-18, E-04

## R1-R10 Fix Evidence
1. **R1**: Re-enabled named SSE listeners in `passenger-live.ts`. Added watermark and explicit mode handling.
2. **R2**: Fixed `/api/passenger-rides/:token` path for shared token rides.
3. **R3**: Fixed payload mapping for RatingCard, max length 200, contact requested toggle.
4. **R4**: Split contact logic and complaint form with accurate backend payload mappings.
5. **R5**: Rewrote `mapPassengerCertificate` to handle `htmlUrl` and `pdfUrl`, mapped 13 fields correctly, and added fallback UI logic when fields are missing from backend `MultiTaxiElectronicReceiptRecord` (like `driverName` and `registrationNo`).
6. **R6**: Handled P5-04 and P5-12 in resolver properly.
7. **R7**: Handled `orderId` in history navigation correctly and fixed cursor paginations.
8. **R8**: Fixed enterprise tokens, switched `surface: "passenger"`
9. **R9**: Added tests for UI components.
10. **R10**: DOM removed from passenger-client.

## Known Gaps (Backend Contract Missing)
Supervisor note: The `MultiTaxiElectronicReceiptRecord` currently lacks:
- 遮罩執登號 (`driverRegistrationNo`)
- 起程/續程/延滯/夜間明細 (`fareBaseMinor`, `fareDistanceMinor`, etc.)
- 支付方式 (`paymentMethod`)
- `driverName`, `fleetName`

As per instructions, we did not fake these fields nor changed the contract. UI mapper handles their absence.
