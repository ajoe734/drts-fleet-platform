-- UV-EXEC-015 / SD §7: accepted authority is immutable and survives worker
-- lease changes. Never persist a bearer credential in the proof or work item.
CREATE TABLE IF NOT EXISTS voice.booking_command_proof (
  command_id uuid PRIMARY KEY REFERENCES voice.command_receipt(command_id),
  confirmation_id uuid NOT NULL REFERENCES voice.confirmation(confirmation_id),
  proof jsonb NOT NULL CHECK (jsonb_typeof(proof) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
SELECT voice._make_append_only('voice.booking_command_proof');

-- The delivery worker reads this immutable intent only after commit. Its
-- work_item dedupe key is also the consumer's idempotency key.
CREATE TABLE IF NOT EXISTS voice.booking_audit_intent (
  command_id uuid PRIMARY KEY REFERENCES voice.command_receipt(command_id),
  order_id varchar(100) NOT NULL REFERENCES ops.phase1_owned_orders(order_id),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
SELECT voice._make_append_only('voice.booking_audit_intent');
