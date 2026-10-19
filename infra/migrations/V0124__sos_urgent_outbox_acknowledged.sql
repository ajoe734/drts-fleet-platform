-- Complete the existing S-3 §24 delivered / duty-acknowledged distinction.
-- V0053 is deployed history; retain its bytes and change only this check.
ALTER TABLE safety.driver_sos_urgent_alert_outbox
  DROP CONSTRAINT driver_sos_urgent_alert_outbox_status_chk;
ALTER TABLE safety.driver_sos_urgent_alert_outbox
  ADD CONSTRAINT driver_sos_urgent_alert_outbox_status_chk CHECK (status IN (
    'pending', 'sending', 'delivered', 'acknowledged', 'failed'
  ));

-- Only the same event's actual canonical duty ACK qualifies historical rows.
-- Delivery/render alone does not establish a human acknowledgment.
UPDATE safety.driver_sos_urgent_alert_outbox AS outbox
SET status = 'acknowledged'
FROM safety.driver_sos_events AS event
WHERE event.sos_event_id = outbox.sos_event_id
  AND event.duty_ack_snapshot->>'acknowledgedByActorId' IS NOT NULL
  AND event.duty_ack_snapshot->>'acknowledgedAt' IS NOT NULL;
