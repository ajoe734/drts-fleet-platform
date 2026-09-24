# Partner Notification Screen Contract

## Contract Mapping
- Events: mapped to `PN_EVENTS` in UI.
- Lifecycle: `ready`, `test_pending`, `disabled`.
- Deliveries: mapped to `PN_DLV` (`accepted_unknown_device`, `failed`, `pending`, `enqueued`).
- Errors: handled via `PA_PartnerNotifyErrors` (409, 404, 403, 202).

## Implementation Details
- `platform-partner-notify.jsx` was modified to correctly align with the API endpoints.
- `Platform Admin.html` successfully embeds the component.
- The UI properly restricts actions when binding is not ready or when 403 scope issues occur.
