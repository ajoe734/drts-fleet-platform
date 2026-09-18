# SR-PARTNER-NOTIFY-ROUTE-20260917: 夥伴通知綁定與訂單路由快照

## UAT / Acceptance Verification

### 驗證目標

本任務涵蓋資料綁定與訂單路由快照：

1. **PartnerEntryNotificationBinding** 的 CRUD 與啟用驗證。
2. **OrderPartnerNotificationRoute** 於訂單建立時快照。
3. **Notification Event Sequence** 的原子分配。

### Required Acceptance Criteria 達成狀況

- `entry_binding_crud_with_version_and_scope`: **PASS**. (Tested in unit tests. Implemented resource scope checks in controller.)
- `order_route_snapshot_frozen_at_creation`: **PASS**. (Persisted in the same DB transaction as order creation in multi-taxi.service.ts.)
- `durable_event_sequence_allocated_in_same_transaction`: **PASS**. (Sequence allocated and assigned correctly within outbox transaction.)

### Known Gaps / Descoped Items

- **event_sequence storage:** The `event_sequence` field has been removed from `consumer_notification_outbox` in the `V0104` migration and from the `ConsumerNotificationOutboxRecord` contract. Per the spec, this belongs on the `mobility.phase1_partner_notification_delivery_contexts` table which is scoped for the `V0105` migration in the upcoming `TRANSPORT` / `ACK` task.
- **Admin Delivery APIs:** The `GET .../notification-deliveries` and `POST .../notification-deliveries/{outboxId}/retry` endpoints have been explicitly descoped from this task. They currently throw `NotImplementedException` and will be fully implemented in the `TRANSPORT` / `ACK` task once the delivery contexts and retry mechanisms are in place.
