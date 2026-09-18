import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";

const [directory, mode] = process.argv.slice(2);
if (!directory || !mode) throw new Error("directory and mode required");
const service = new NotificationDeliveryService(
  new FileMailOutbox(directory),
  {
    provider: "controlled-crash-transport",
    send: async (message) => {
      // Reached only after the started attempt has committed to real disk.
      process.stdout.write(
        `${JSON.stringify({ claimed: message.deliveryId })}\n`,
      );
      return new Promise(() => setInterval(() => undefined, 10_000));
    },
  },
  { leaseMs: 100 },
);

async function run() {
  const receipt = await service.enqueue({
    tenantId: "sr-notify-process-test",
    idempotencyKey: "same-key-across-processes",
    fromEmail: "sender@example.invalid",
    recipientEmail: "receiver@example.invalid",
    subject: "Process durability",
    body: "controlled test content",
  });
  if (mode === "crash") {
    await service.dispatch(receipt.tenantId, receipt.deliveryId);
  } else {
    process.stdout.write(
      `${JSON.stringify({ deliveryId: receipt.deliveryId })}\n`,
    );
  }
}

void run().catch(() => {
  process.exitCode = 1;
});
