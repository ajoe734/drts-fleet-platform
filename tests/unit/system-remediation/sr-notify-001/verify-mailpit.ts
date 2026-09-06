/** Explicit local integration command; no external mailbox or provider is contacted. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { createMailpitSmtpTransportFromEnv } from "../../../../apps/api/src/modules/notification-delivery/smtp-mail.transport";

async function verify() {
  const directory = process.env.NOTIFICATION_OUTBOX_DIRECTORY;
  const http = new URL(
    process.env.SR_NOTIFY_MAILPIT_HTTP ?? "http://unconfigured.invalid",
  );
  assert(directory, "explicit durable spool required");
  assert.equal(http.protocol, "http:");
  assert.equal(
    http.hostname,
    "127.0.0.1",
    "controlled loopback receiver required",
  );
  const transport = createMailpitSmtpTransportFromEnv(process.env);
  assert(transport, "explicit local SMTP provider required");
  const input = {
    tenantId: "sr-notify-local-verification",
    idempotencyKey: randomUUID(),
    fromEmail: "sender@sr-notify.invalid",
    recipientEmail: "receiver@sr-notify.invalid",
    subject: "SR-NOTIFY-001 受控傳輸驗證",
    body: "Only controlled local test content. 真實 UTF-8 SMTP payload.",
  };
  const service = new NotificationDeliveryService(
    new FileMailOutbox(directory),
    transport,
  );
  const queued = await service.enqueue(input);
  assert.equal(queued.status, "queued");
  assert.equal(queued.sentAt, null);
  const sent = await service.dispatch(input.tenantId, queued.deliveryId);
  assert.equal(sent?.status, "sent");
  const acknowledgement = sent?.attempts[0]?.acknowledgement;
  assert(
    acknowledgement?.providerMessageId,
    "Mailpit queue ID must be observed",
  );

  const response = await fetch(
    new URL(
      `/api/v1/message/${encodeURIComponent(acknowledgement.providerMessageId)}`,
      http,
    ),
  );
  assert.equal(response.status, 200);
  const received = (await response.json()) as {
    ID: string;
    MessageID: string;
    Subject: string;
    Text: string;
    To: { Address: string }[];
  };
  assert.equal(received.ID, acknowledgement.providerMessageId);
  assert.equal(received.MessageID, queued.messageId.slice(1, -1));
  assert.equal(received.Subject, input.subject);
  assert.equal(received.Text.trim(), input.body);
  assert.equal(received.To[0]?.Address, input.recipientEmail);

  const resumed = new NotificationDeliveryService(
    new FileMailOutbox(directory),
    transport,
  );
  assert.deepEqual(await resumed.get(input.tenantId, queued.deliveryId), sent);
  assert.deepEqual(await resumed.enqueue(input), sent);
  assert.deepEqual(
    await resumed.dispatch(input.tenantId, queued.deliveryId),
    sent,
  );
  assert.deepEqual(await resumed.drain(), []);
  const listResponse = await fetch(new URL("/api/v1/messages", http));
  assert.equal(listResponse.status, 200);
  const list = (await listResponse.json()) as { messages: { ID: string }[] };
  assert.equal(
    list.messages.filter((item) => item.ID === received.ID).length,
    1,
  );
  console.log(
    JSON.stringify(
      {
        deliveryId: queued.deliveryId,
        messageId: queued.messageId,
        idempotencyKey: input.idempotencyKey,
        attemptId: sent!.attempts[0]!.attemptId,
        status: sent!.status,
        acknowledgement,
        receiverMessageId: received.ID,
        matchedRecipientSubjectAndBody: true,
        durableReceiptAfterRestart: true,
        deduplicatedAfterRestart: true,
        receiverTotalMessages: list.messages.length,
      },
      null,
      2,
    ),
  );
}

void verify().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
