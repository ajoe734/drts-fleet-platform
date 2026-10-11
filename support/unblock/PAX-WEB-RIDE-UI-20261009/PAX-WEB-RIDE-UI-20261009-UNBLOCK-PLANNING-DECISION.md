# PAX-WEB-RIDE-UI-20261009 Unblock Planning Decision

## Issue
The parent task `PAX-WEB-RIDE-UI-20261009` (candidate SHA `ec6cca170e259824e2c6b0342331db49a86e6570`, reopening from Codex2 review) is blocked due to missing upstream actual E-04 receipt fields in the backend contract (`PassengerReceiptResponse` / `MultiTaxiElectronicReceiptRecord`).
As defined in `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md:24-40` and `105`, 13 E-04 fields are required, including:
- `driverRegistrationNo` (Masked driver registration)
- `fareBaseMinor`, `fareDistanceMinor`, etc. (Fare details)
- `paymentMethod` (Payment method)
- `driverName`, `fleetName`

Currently, `PassengerReceiptResponse` provides only `receiptUrl`, and `MultiTaxiElectronicReceiptRecord` lacks these E-04 fields. Expanding the interface alone does not establish actual issuer/driver/fare/payment facts.

## Decision & Coordination Route
**Decision:** Bounded UI Implementation vs. Full E-04 Acceptance
1. **No Blanket Scope Cut / No Unconditional Merge:** The parent UI task `PAX-WEB-RIDE-UI-20261009` must carefully handle the unavailable E-04 data (e.g., via placeholders or omitting rows depending on E04 availability), but **this does NOT constitute full E-04 production/download acceptance**. We do NOT waive the formal completion bar or merge the parent task unconditionally. The parent task's full delivery remains blocked on upstream requirements.
2. **Contract Ownership & Upstream Route:** The official ownership for producing these E-04 fields lies with existing task `PAX-RECEIPT-COMPLAINT-20261009`, not a duplicate task like `PAX-SD-RECEIPT-EXPANSION`. `PAX-RECEIPT-COMPLAINT-20261009` is currently blocked (E04 probes FAIL2) pending actual issuer/driver/four actual fare components/payment facts. We will route the dependency through this existing task instead of fabricating a new one.

## Evidence & Acceptance
- **Examined Parent SHA:** `ec6cca170e259824e2c6b0342331db49a86e6570` (last review: Codex2 independent reopen at `2026-10-10T15:08:23Z`, reviewed by this helper: `7e861e0f358f0cf00f9ab85780b7a46fe0776b30`).
- **Parent Disposition:** Parent `PAX-WEB-RIDE-UI-20261009` retains its `resolved_parent_status=blocked` and `waiting_for=Codex2`. Its UAT findings (R5 account receiptUrl -> rows=[]/no PDF and official record -> error) remain preserved.
- **Authority:** `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md:105`, `common.md` A9 and `01_system_sa_sd.md:125`. `PAX-RECEIPT-COMPLAINT-20261009` canonical definition.
- **Outcome:** The frontend mapper gracefully handling missing data is approved as a *bounded UI delivery step*, but full E-04 acceptance remains blocked. No source takeover or contract relaxation is performed.

## Concrete Next Steps
1. The original owner (Gemini) of `PAX-WEB-RIDE-UI-20261009` must update the UI code to properly handle unavailable data in a bounded manner.
2. The `PAX-WEB-RIDE-UI-20261009` task will be updated via `ai-status.sh` to explicitly record its concrete next action: waiting for the upstream E-04 fields from `PAX-RECEIPT-COMPLAINT-20261009`, retaining its blocked status and waiting_for as needed, without a blanket resume or merge.
