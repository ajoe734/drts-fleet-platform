# Platform Admin: Partner Notification Screen Requirements (SR-PARTNER-NOTIFY-UI-20260917)

**Surface**: Platform Admin
**Section**: Partner Details -> Notifications Tab

## Missing Canvas Coverage
There is no approved design canvas for the "Notifications" tab in the partner entry management page (`Platform Admin.html`, `platform-screens-1.jsx`, etc.). The component `partner-notification-panel.tsx` is currently blocked, showing a `CanvasBanner` placeholder.

## Required UI States & Interactions
To pass functional product acceptance, the design MUST include visual specifications for:
1. **Binding Read State**: Display current webhook binding data: `webhook_id`, subscribed `eventTypes`, and state (`ready`, `test_pending`, `disabled`).
2. **Delivery List View**: Display a paginated list of notification deliveries (status, target, failure reason). Must handle loading and empty states.
3. **Edit Controls**: Form to update webhook binding and event types.
4. **Lifecycle Controls**: Action buttons for 'Test', 'Enable', and 'Disable' binding.
5. **Retry Control**: Action button on individual failed deliveries to trigger a manual retry.
6. **Error/Recovery States**: Visible banners or states handling 409 (version conflict), 404 (not found), and 403 (forbidden). Must preserve "endpoint-accepted/device-unknown" wording and secret masking.
