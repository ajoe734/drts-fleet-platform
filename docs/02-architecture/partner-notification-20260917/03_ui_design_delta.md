# 乘客通知送達夥伴 App：UI Design Delta

This document describes the UI changes to the partner entry management page to support passenger notifications.

## Partner Entry Management - Notification Tab

- **Tab Name**: Notifications
- **Location**: Added as a new tab next to 'Audit' in the `Platform Admin.html` partner details page.
- **Components**:
  Currently, the notification layout lacks canonical canvas coverage in `Platform Admin.html`.
  Following the design contract, we have recorded the explicit required states and are awaiting design handoff.
  The UI component `partner-notification-panel.tsx` is temporarily a placeholder to avoid inventing a layout.

### Explicit Screen Requirements for Handoff

To pass functional UI acceptance, the requested canvas must include the following explicit states and controls:

1. **Binding Read State**: Display current `webhook_id`, `eventTypes`, and state (`ready`, `test_pending`, `disabled`).
2. **Delivery List View**: Display a paginated list of deliveries (status, target, failure reason).
3. **Edit Controls**: Form to update webhook binding and event types.
4. **Lifecycle Controls**: Action buttons for Test, Enable, and Disable binding.
5. **Retry Control**: Action button on individual failed deliveries to trigger a manual retry.
6. **Error/Recovery States**: Visible banners or states handling 409 (version conflict), 404 (not found), and 403 (forbidden).
