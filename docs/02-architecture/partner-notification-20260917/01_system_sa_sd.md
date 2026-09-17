# Partner Notification System SA/SD

## 1. Overview
This document outlines the architecture and contract design for routing passenger notifications to the Partner App.

## 3. Bindings
### 3.1 PartnerEntryNotificationBinding
Defines the webhook binding for partner notifications.
- `bindingId`: UUID
- `entrySlug`: Partner entry identifier
- `tenantId`, `partnerId`, `webhookId`
- `state`: `test_pending`, `ready`, `disabled`
- `purpose`: Fixed to `passenger_notification`
- `eventTypes`: Supported events
- `schemaVersion`: Fixed to `1.0`
- `acknowledgementPolicy`: Fixed to `durable_partner_acceptance_v1`

## 4. Route
### 4.1 OrderPartnerNotificationRoute
Maps an order to a partner notification destination.
Includes `orderId`, `tenantId`, `partnerId`, `entrySlug`, `partnerUserRef`, `drtsPassengerId`, `passengerSubjectRef`, `consentBundleVersion`, `notificationPolicyVersion`, and `rideRef`.

## 5. Event Types
The following external event names are supported:
- `passenger.assignment_disclosure_ready.v1`
- `passenger.assignment_replaced.v1`
- `passenger.eta_changed.v1`
- `passenger.driver_arrived.v1`
- `passenger.receipt_ready.v1`
- `passenger.notification_test.v1`

## 6. Wire Payload
Structure sent to the partner webhook. Version is strictly `1.0`.
Contains `event`, `delivery_id`, `occurred_at`, `tenant_id`, and `data`.
`data` includes `notification_id`, `partner_entry_slug`, `recipient`, `ride_ref`, `event_sequence`, etc.

## 7. Ack Structure
Structure for accepted/duplicate acknowledgements.
- `status`: `accepted` or `duplicate`
- `receipt_id`: Must be provided by the partner (not synthesized)

## 9. Failure and Retry
- **Retry Disposition**: `automatic`, `configuration_blocked`, `manual_only`, `terminal`, `none`
- **Failure Reason**: `provider_not_configured`, `endpoint_disabled`, `route_missing`, `route_ambiguous`, `owner_changed`, `recipient_revoked`, `credential_rejected`, `endpoint_unavailable`, `partner_ack_invalid`, `notification_expired`, `notification_obsolete`, `notification_superseded`, `timeout`, `unknown`

## 11. Database Schema (Four New Tables)
1. `admin.phase1_partner_notification_bindings`
2. `mobility.phase1_order_partner_notification_routes`
3. `mobility.phase1_partner_notification_delivery_contexts`
4. `mobility.phase1_partner_notification_sequences`
