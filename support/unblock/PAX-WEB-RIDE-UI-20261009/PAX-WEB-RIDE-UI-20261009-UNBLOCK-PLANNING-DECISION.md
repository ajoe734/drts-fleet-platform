# PAX-WEB-RIDE-UI-20261009 Unblock Planning Decision

## Issue
The parent task `PAX-WEB-RIDE-UI-20261009` is blocked due to a missing product/contract decision regarding the `MultiTaxiElectronicReceiptRecord`.
Specifically, the backend contract currently lacks the following fields required for a complete receipt UI:
- `driverRegistrationNo` (遮罩執登號)
- `fareBaseMinor`, `fareDistanceMinor`, etc. (起程/續程/延滯/夜間明細)
- `paymentMethod` (支付方式)
- `driverName`
- `fleetName`

As per UI design rules, the UI layer cannot fake these fields or change the contract on its own. The UI mapper has been implemented to gracefully handle their absence (fallback UI logic).

## Decision
**Decision:** Scope Cut for UI task & Explicit Follow-up

1. **Unblock the UI Task:** The current UI implementation in `PAX-WEB-RIDE-UI-20261009` is correct in gracefully handling the missing fields. We accept this as a scope cut for the current UI implementation. The UI task should be unblocked and proceed to merge.
2. **Follow-up Route:** A new backend/system-design task must be created (e.g., `PAX-SD-RECEIPT-EXPANSION`) to expand the `MultiTaxiElectronicReceiptRecord` to include these missing fields in the API contract. Once the backend provides these fields, the UI will automatically display them due to the mapper's fallback logic.

## Next Steps
- Return to the `PAX-WEB-RIDE-UI-20261009` parent task.
- Mark the planning blocker as resolved.
- Note the follow-up requirement in the parent task's `ai-status` or documentation.
