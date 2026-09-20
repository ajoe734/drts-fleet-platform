# Screen Requirements: Partner Notification Panel

This screen is required for SR-PARTNER-NOTIFY-UI-20260917 to manage passenger notification bindings and retry failed deliveries.
Currently, this screen is missing from the canonical design canvas (`Platform Admin.html`).

## Required States
1. **Loading**: Initial state while fetching binding and deliveries.
2. **Error**: Global error banner for network/403/500 errors on GET.
3. **No Binding**: Empty state showing that no binding is configured.
4. **Binding Ready/Disabled/Test Pending**: Shows webhook ID, event types, expected version, and buttons to Test/Enable/Disable.
5. **Action In-Flight**: Buttons should be disabled while an action (test/enable/disable/retry) is in progress.
6. **Action Conflict (409)**: Shows a specific error if a concurrent modification occurred (expectedVersion mismatch).
7. **Action Failed**: Shows the `kind=failed` reason if an action is rejected by the backend.
8. **Deliveries Empty**: Shows a message if there are no deliveries.
9. **Deliveries Table**: Shows outbox ID, status (with specific meaning: delivered = partner endpoint accepted, device unknown), failure reason, and a conditional Retry button.
10. **Retry Eligibility**: Retry button is only enabled if status is failed AND retryDisposition is automatic/manual_only/configuration_blocked AND expiresAt is in the future.

Please provide a design canvas update covering these states using the `platform` realm tokens.
