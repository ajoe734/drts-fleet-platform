const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.repository.ts";
let code = fs.readFileSync(file, "utf8");

const injection = `
    for (const outbox of changes.consumerNotificationOutbox ?? []) {
      writes.push(() =>
        executor.query(
          \`
            UPDATE mobility.phase1_partner_notification_sequences
            SET next_sequence = next_sequence + 1
            WHERE order_id = $1
            RETURNING next_sequence - 1 AS event_sequence
          \`,
          [outbox.orderId]
        )
      );
    }
`;

code = code.replace(
  "for (const outbox of changes.consumerNotificationOutbox ?? []) {",
  injection +
    "\n    for (const outbox of changes.consumerNotificationOutbox ?? []) {",
);

fs.writeFileSync(file, code);
