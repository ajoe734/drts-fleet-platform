import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type EnqueueMail,
  type MailTransport,
  type ProviderAcknowledgement,
  type TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

// Provider doubles below exercise fault/recovery behavior, not live delivery.
// The SMTP receiver suite supplies the independent network-delivery evidence.
describe("SR-NOTIFY-001 durable mail delivery and fault recovery", () => {
  let directory: string;
  let clock: number;
  const now = () => new Date(clock);
  const mail: EnqueueMail = {
    tenantId: "tenant-recovery",
    idempotencyKey: "invitation-resource-001:recipient-001",
    recipientEmail: "recipient@example.test",
    fromEmail: "notifications@example.test",
    subject: "Invitation to the controlled test tenant",
    body: "Private invitation token: never-expose-this-proof",
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-notify-001-outbox-"));
    clock = Date.parse("2026-09-06T12:00:00.000Z");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function acknowledgement(
    id = "controlled-provider-message-001",
  ): ProviderAcknowledgement {
    return {
      provider: "injected-test-provider",
      response: `250 Accepted as ${id}`,
      providerMessageId: id,
      acceptedAt: now().toISOString(),
    };
  }

  function acceptingTransport() {
    return {
      provider: "injected-test-provider",
      send: vi.fn(async (message: TransportMessage) => {
        void message;
        return acknowledgement();
      }),
    };
  }

  function service(transport: MailTransport | null = null, maxAttempts = 5) {
    return new NotificationDeliveryService(
      new FileMailOutbox(directory),
      transport,
      {
        now,
        maxAttempts,
        retryDelayMs: 1_000,
        leaseMs: 1_000,
      },
    );
  }

  it("persists queued mail before dispatch and exposes only a safe receipt", async () => {
    const transport = acceptingTransport();
    const queued = await service(transport).enqueue(mail);

    expect(queued).toMatchObject({
      tenantId: mail.tenantId,
      idempotencyKey: mail.idempotencyKey,
      status: "queued",
      sentAt: null,
      attempts: [],
    });
    expect(transport.send).not.toHaveBeenCalled();
    const afterRestart = await service().get(mail.tenantId, queued.deliveryId);
    expect(afterRestart).toEqual(queued);
    for (const privateValue of [
      mail.recipientEmail,
      mail.fromEmail,
      mail.subject,
      mail.body,
    ]) {
      expect(JSON.stringify(afterRestart)).not.toContain(privateValue);
    }
    expect(
      await service().get("different-tenant", queued.deliveryId),
    ).toBeNull();
  });

  it("reports an unconfigured provider as a persisted failure, never sent", async () => {
    const deliveryService = service();
    expect(deliveryService.availability()).toBe("unavailable");
    const queued = await deliveryService.enqueue(mail);
    const receipt = await deliveryService.dispatch(
      mail.tenantId,
      queued.deliveryId,
    );

    expect(receipt).toMatchObject({ status: "failed", sentAt: null });
    expect(receipt?.attempts).toHaveLength(1);
    expect(receipt?.attempts[0]).toMatchObject({
      outcome: "failed",
      acknowledgement: null,
      retryable: true,
    });
    expect(receipt?.attempts[0]?.errorCode).toMatch(/unavailable/);
    expect(receipt?.nextAttemptAt).not.toBeNull();
    expect(await service().get(mail.tenantId, queued.deliveryId)).toEqual(
      receipt,
    );
  });

  it("records real transport acknowledgement separately from queued state and avoids repeat sends", async () => {
    const transport = acceptingTransport();
    const deliveryService = service(transport);
    expect(deliveryService.availability()).toBe("available");
    const queued = await deliveryService.enqueue(mail);
    const sent = await deliveryService.dispatch(
      mail.tenantId,
      queued.deliveryId,
    );

    expect(transport.send).toHaveBeenCalledExactlyOnceWith({
      ...mail,
      deliveryId: queued.deliveryId,
      messageId: queued.messageId,
    });
    expect(sent).toMatchObject({
      status: "sent",
      sentAt: now().toISOString(),
      nextAttemptAt: null,
      attempts: [{ outcome: "sent", acknowledgement: acknowledgement() }],
    });
    const restarted = service(transport);
    expect(await restarted.get(mail.tenantId, queued.deliveryId)).toEqual(sent);
    expect(await restarted.dispatch(mail.tenantId, queued.deliveryId)).toEqual(
      sent,
    );
    expect(await restarted.drain()).toEqual([]);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("deduplicates across service restarts and scopes the key to a tenant", async () => {
    const original = await service().enqueue(mail);
    expect(await service().enqueue({ ...mail })).toEqual(original);
    const anotherTenant = await service().enqueue({
      ...mail,
      tenantId: "tenant-other",
    });
    expect(anotherTenant.deliveryId).not.toBe(original.deliveryId);
    expect(anotherTenant.messageId).not.toBe(original.messageId);
    await expect(
      service().enqueue({ ...mail, body: "a different invitation proof" }),
    ).rejects.toThrow("notification_idempotency_conflict");
    expect(await service().get(mail.tenantId, original.deliveryId)).toEqual(
      original,
    );
  });

  it("serializes independent outbox writers without dropping queued records", async () => {
    const requests = Array.from({ length: 12 }, (_, index) => ({
      ...mail,
      idempotencyKey: `concurrent-resource-${index}`,
    }));
    const receipts = await Promise.all(
      requests.map((request) => service().enqueue(request)),
    );

    expect(new Set(receipts.map((receipt) => receipt.deliveryId)).size).toBe(
      requests.length,
    );
    const restarted = service();
    const loaded = await Promise.all(
      receipts.map((receipt) =>
        restarted.get(mail.tenantId, receipt.deliveryId),
      ),
    );
    expect(loaded).toEqual(receipts);
    const duplicates = await Promise.all(
      Array.from({ length: 8 }, () => service().enqueue(mail)),
    );
    expect(new Set(duplicates.map((receipt) => receipt.deliveryId)).size).toBe(
      1,
    );
  });

  it("persists the attempt before invoking the transport and prevents a competing claim", async () => {
    let release!: (ack: ProviderAcknowledgement) => void;
    let observeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observeStarted = resolve;
    });
    const pending = new Promise<ProviderAcknowledgement>((resolve) => {
      release = resolve;
    });
    const transport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        observeStarted();
        return pending;
      }),
    };
    const queued = await service(transport).enqueue(mail);
    const firstDispatch = service(transport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    await started;

    try {
      const duringNetwork = await service().get(
        mail.tenantId,
        queued.deliveryId,
      );
      expect(duringNetwork?.attempts).toHaveLength(1);
      expect(duringNetwork?.attempts[0]).toMatchObject({
        outcome: "started",
        finishedAt: null,
      });
      await service(transport).dispatch(mail.tenantId, queued.deliveryId);
      expect(transport.send).toHaveBeenCalledTimes(1);
    } finally {
      release(acknowledgement());
      await firstDispatch;
    }
  });

  it("retries only when due after restart and keeps the same transport Message-ID", async () => {
    const transport = {
      provider: "injected-test-provider",
      send: vi
        .fn<(message: TransportMessage) => Promise<ProviderAcknowledgement>>()
        .mockRejectedValueOnce(
          new DeliveryTransportError("smtp_temporary_failure", true),
        )
        .mockResolvedValueOnce(acknowledgement()),
    };
    const queued = await service(transport).enqueue(mail);
    const failed = await service(transport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    expect(failed).toMatchObject({ status: "failed", sentAt: null });
    expect(failed?.attempts[0]).toMatchObject({
      outcome: "failed",
      errorCode: "smtp_temporary_failure",
      retryable: true,
    });
    await service(transport).dispatch(mail.tenantId, queued.deliveryId);
    expect(await service(transport).drain()).toEqual([]);
    expect(transport.send).toHaveBeenCalledTimes(1);

    clock = Date.parse(failed!.nextAttemptAt!);
    const results = await service(transport).drain();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "sent", nextAttemptAt: null });
    expect(results[0]?.attempts.map((attempt) => attempt.outcome)).toEqual([
      "failed",
      "sent",
    ]);
    expect(
      transport.send.mock.calls.map(([message]) => message.messageId),
    ).toEqual([queued.messageId, queued.messageId]);
  });

  it("does not schedule retries for permanent provider failures", async () => {
    const transport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        throw new DeliveryTransportError("smtp_recipient_rejected", false);
      }),
    };
    const queued = await service(transport).enqueue(mail);
    const receipt = await service(transport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    expect(receipt).toMatchObject({
      status: "failed",
      nextAttemptAt: null,
      sentAt: null,
    });
    expect(receipt?.attempts[0]).toMatchObject({
      outcome: "failed",
      errorCode: "smtp_recipient_rejected",
      retryable: false,
    });
    clock += 86_400_000;
    expect(await service(transport).drain()).toEqual([]);
    await service(transport).dispatch(mail.tenantId, queued.deliveryId);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("persists retry exhaustion so restart cannot reset the attempt budget", async () => {
    const transport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        throw new DeliveryTransportError("smtp_temporary_failure", true);
      }),
    };
    const queued = await service(transport, 2).enqueue(mail);
    const first = await service(transport, 2).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    clock = Date.parse(first!.nextAttemptAt!);
    const exhausted = await service(transport, 2).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    expect(exhausted).toMatchObject({
      status: "failed",
      nextAttemptAt: null,
      sentAt: null,
    });
    expect(exhausted?.attempts).toHaveLength(2);
    clock += 86_400_000;
    expect(await service(transport, 2).drain()).toEqual([]);
    await service(transport, 2).dispatch(mail.tenantId, queued.deliveryId);
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it("preserves a late genuine acknowledgement without replacing a newer acknowledgement", async () => {
    let release!: (ack: ProviderAcknowledgement) => void;
    let observeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observeStarted = resolve;
    });
    const pending = new Promise<ProviderAcknowledgement>((resolve) => {
      release = resolve;
    });
    const oldTransport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        observeStarted();
        return pending;
      }),
    };
    const queued = await service(oldTransport).enqueue(mail);
    const abandoned = service(oldTransport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    await started;
    clock += 1_001;
    const replacementTransport = acceptingTransport();
    const winnerAcceptedAt = now().toISOString();

    try {
      const recovered = await service(replacementTransport).dispatch(
        mail.tenantId,
        queued.deliveryId,
      );
      expect(recovered?.attempts.map((attempt) => attempt.outcome)).toEqual([
        "uncertain",
        "sent",
      ]);
      expect(recovered?.attempts[0]).toMatchObject({
        errorCode: "delivery_outcome_unknown",
      });
      expect(replacementTransport.send.mock.calls[0]?.[0].messageId).toBe(
        queued.messageId,
      );
      expect(recovered?.attempts[1]?.acknowledgement?.providerMessageId).toBe(
        "controlled-provider-message-001",
      );
    } finally {
      clock += 500;
      release(acknowledgement("stale-provider-completion"));
      await abandoned;
    }

    const persisted = await service().get(mail.tenantId, queued.deliveryId);
    expect(persisted?.status).toBe("sent");
    expect(persisted?.sentAt).toBe(winnerAcceptedAt);
    expect(persisted?.attempts.map((attempt) => attempt.outcome)).toEqual([
      "sent",
      "sent",
    ]);
    expect(
      persisted?.attempts.map(
        (attempt) => attempt.acknowledgement?.providerMessageId,
      ),
    ).toEqual(["stale-provider-completion", "controlled-provider-message-001"]);
  });

  it("does not resend an uncertain attempt after its final lease expires", async () => {
    let release!: (ack: ProviderAcknowledgement) => void;
    let observeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observeStarted = resolve;
    });
    const pending = new Promise<ProviderAcknowledgement>((resolve) => {
      release = resolve;
    });
    const transport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        observeStarted();
        return pending;
      }),
    };
    const queued = await service(transport, 1).enqueue(mail);
    const abandoned = service(transport, 1).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    await started;
    clock += 1_001;
    const replacement = acceptingTransport();
    try {
      const exhausted = await service(replacement, 1).dispatch(
        mail.tenantId,
        queued.deliveryId,
      );
      expect(exhausted).toMatchObject({
        status: "failed",
        nextAttemptAt: null,
        sentAt: null,
      });
      expect(exhausted?.attempts).toHaveLength(1);
      expect(exhausted?.attempts[0]).toMatchObject({
        outcome: "uncertain",
        errorCode: "delivery_outcome_unknown",
      });
      expect(replacement.send).not.toHaveBeenCalled();
    } finally {
      release(acknowledgement("stale-final-attempt"));
      await abandoned;
    }

    const recovered = await service(replacement, 1).get(
      mail.tenantId,
      queued.deliveryId,
    );
    expect(recovered).toMatchObject({
      status: "sent",
      sentAt: now().toISOString(),
      nextAttemptAt: null,
    });
    expect(recovered?.attempts[0]).toMatchObject({
      outcome: "sent",
      acknowledgement: { providerMessageId: "stale-final-attempt" },
    });
    expect(await service(replacement, 1).drain()).toEqual([]);
    expect(replacement.send).not.toHaveBeenCalled();
  });

  it("keeps a late accepted delivery sent when a newer in-flight attempt fails", async () => {
    let acceptOld!: (ack: ProviderAcknowledgement) => void;
    let rejectNew!: (error: Error) => void;
    let observeOldStarted!: () => void;
    let observeNewStarted!: () => void;
    const oldStarted = new Promise<void>((resolve) => {
      observeOldStarted = resolve;
    });
    const newStarted = new Promise<void>((resolve) => {
      observeNewStarted = resolve;
    });
    const oldPending = new Promise<ProviderAcknowledgement>((resolve) => {
      acceptOld = resolve;
    });
    const newPending = new Promise<ProviderAcknowledgement>(
      (_resolve, reject) => {
        rejectNew = reject;
      },
    );
    const oldTransport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        observeOldStarted();
        return oldPending;
      }),
    };
    const newTransport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        observeNewStarted();
        return newPending;
      }),
    };
    const queued = await service(oldTransport).enqueue(mail);
    const originalDispatch = service(oldTransport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    await oldStarted;
    clock += 1_001;
    const newerDispatch = service(newTransport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    await newStarted;
    const acceptedAt = now().toISOString();

    try {
      acceptOld(acknowledgement("accepted-after-original-lease-expired"));
      const lateAccepted = await originalDispatch;
      expect(lateAccepted).toMatchObject({
        status: "sent",
        sentAt: acceptedAt,
        nextAttemptAt: null,
      });
      expect(lateAccepted?.attempts.map((attempt) => attempt.outcome)).toEqual([
        "sent",
        "started",
      ]);

      clock += 50;
      rejectNew(new DeliveryTransportError("smtp_temporary_failure", true));
      const afterNewFailure = await newerDispatch;
      expect(afterNewFailure).toMatchObject({
        status: "sent",
        sentAt: acceptedAt,
        nextAttemptAt: null,
      });
      expect(
        afterNewFailure?.attempts.map((attempt) => attempt.outcome),
      ).toEqual(["sent", "failed"]);
      expect(
        afterNewFailure?.attempts[0]?.acknowledgement?.providerMessageId,
      ).toBe("accepted-after-original-lease-expired");
      expect(afterNewFailure?.attempts[1]).toMatchObject({
        errorCode: "smtp_temporary_failure",
        acknowledgement: null,
      });
      expect(await service().get(mail.tenantId, queued.deliveryId)).toEqual(
        afterNewFailure,
      );
      expect(await service(newTransport).drain()).toEqual([]);
      expect(newTransport.send).toHaveBeenCalledTimes(1);
    } finally {
      acceptOld(acknowledgement("cleanup-original-attempt"));
      rejectNew(new DeliveryTransportError("cleanup_injected_failure", true));
      await Promise.allSettled([originalDispatch, newerDispatch]);
    }
  });

  it("never dispatches a tenant's message using another tenant's delivery lookup", async () => {
    const transport = acceptingTransport();
    const queued = await service(transport).enqueue(mail);
    expect(
      await service(transport).dispatch("tenant-other", queued.deliveryId),
    ).toBeNull();
    expect(transport.send).not.toHaveBeenCalled();
    expect(await service().get(mail.tenantId, queued.deliveryId)).toEqual(
      queued,
    );
  });

  it("fails closed on corrupt durable state without sending or replacing it", async () => {
    const transport = acceptingTransport();
    const queued = await service(transport).enqueue(mail);
    const corruptBytes = "{not-valid-outbox-json";
    await writeFile(join(directory, "outbox.json"), corruptBytes, "utf8");

    await expect(
      service(transport).dispatch(mail.tenantId, queued.deliveryId),
    ).rejects.toThrow();
    await expect(
      service(transport).enqueue({ ...mail, idempotencyKey: "other-key" }),
    ).rejects.toThrow();
    expect(transport.send).not.toHaveBeenCalled();
    expect(await readFile(join(directory, "outbox.json"), "utf8")).toBe(
      corruptBytes,
    );
  });

  it("does not let callers mutate persisted receipts or nested acknowledgements", async () => {
    const deliveryService = service(acceptingTransport());
    const queued = await deliveryService.enqueue(mail);
    const original = structuredClone(queued);
    queued.status = "sent";
    queued.tenantId = "tampered-tenant";
    expect(await deliveryService.get(mail.tenantId, queued.deliveryId)).toEqual(
      original,
    );

    const sent = await deliveryService.dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    const originalSent = structuredClone(sent);
    sent!.attempts[0]!.acknowledgement!.response = "tampered-provider-response";
    sent!.attempts.length = 0;
    expect(await service().get(mail.tenantId, queued.deliveryId)).toEqual(
      originalSent,
    );
  });

  it("snapshots enqueue input before asynchronous storage can observe caller mutations", async () => {
    const transport = acceptingTransport();
    const deliveryService = service(transport);
    const input = { ...mail };
    const pendingEnqueue = deliveryService.enqueue(input);
    Object.assign(input, {
      tenantId: "mutated-tenant",
      idempotencyKey: "mutated-key",
      recipientEmail: "changed@example.test",
      fromEmail: "changed-sender@example.test",
      subject: "changed subject",
      body: "changed invitation proof",
    });
    const queued = await pendingEnqueue;

    expect(queued).toMatchObject({
      tenantId: mail.tenantId,
      idempotencyKey: mail.idempotencyKey,
    });
    await deliveryService.dispatch(mail.tenantId, queued.deliveryId);
    expect(transport.send).toHaveBeenCalledExactlyOnceWith({
      ...mail,
      deliveryId: queued.deliveryId,
      messageId: queued.messageId,
    });
    expect((await service().enqueue(mail)).deliveryId).toBe(queued.deliveryId);
  });

  it("does not call the transport when the attempt cannot commit to durable storage", async () => {
    const transport = acceptingTransport();
    const outbox = new FileMailOutbox(directory);
    const deliveryService = new NotificationDeliveryService(outbox, transport, {
      now,
    });
    const queued = await deliveryService.enqueue(mail);
    const commit = vi
      .spyOn(
        outbox as unknown as {
          commit(path: string, content: string): Promise<void>;
        },
        "commit",
      )
      .mockRejectedValueOnce(new Error("injected storage fsync failure"));

    try {
      await expect(
        deliveryService.dispatch(mail.tenantId, queued.deliveryId),
      ).rejects.toThrow("injected storage fsync failure");
      expect(transport.send).not.toHaveBeenCalled();
      expect(await service().get(mail.tenantId, queued.deliveryId)).toEqual(
        queued,
      );
    } finally {
      commit.mockRestore();
    }
  });

  it("leaves an accepted attempt uncertain if its receipt cannot commit", async () => {
    const outbox = new FileMailOutbox(directory);
    const commit = vi.spyOn(
      outbox as unknown as {
        commit(path: string, content: string): Promise<void>;
      },
      "commit",
    );
    const transport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        commit.mockRejectedValueOnce(
          new Error("injected receipt fsync failure"),
        );
        return acknowledgement();
      }),
    };
    const deliveryService = new NotificationDeliveryService(outbox, transport, {
      now,
      leaseMs: 1_000,
    });
    const queued = await deliveryService.enqueue(mail);

    try {
      await expect(
        deliveryService.dispatch(mail.tenantId, queued.deliveryId),
      ).rejects.toThrow("injected receipt fsync failure");
      const receipt = await service().get(mail.tenantId, queued.deliveryId);
      expect(receipt?.status).toBe("queued");
      expect(receipt?.sentAt).toBeNull();
      expect(receipt?.attempts).toHaveLength(1);
      expect(receipt?.attempts[0]).toMatchObject({
        outcome: "started",
        acknowledgement: null,
      });
      expect(transport.send).toHaveBeenCalledTimes(1);
    } finally {
      commit.mockRestore();
    }

    clock += 1_001;
    const recovered = await service(acceptingTransport()).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    expect(recovered?.attempts.map((attempt) => attempt.outcome)).toEqual([
      "uncertain",
      "sent",
    ]);
    expect(recovered?.messageId).toBe(queued.messageId);
  });

  it.each([
    { response: "" },
    { acceptedAt: "not-an-acknowledgement-time" },
    { provider: "unrelated-provider" },
  ])(
    "rejects invalid provider acknowledgement %j instead of marking sent",
    async (override) => {
      const transport = {
        provider: "injected-test-provider",
        send: vi.fn(async () => ({ ...acknowledgement(), ...override })),
      };
      const queued = await service(transport).enqueue(mail);
      const failed = await service(transport).dispatch(
        mail.tenantId,
        queued.deliveryId,
      );
      expect(failed).toMatchObject({
        status: "failed",
        sentAt: null,
        nextAttemptAt: null,
      });
      expect(failed?.attempts[0]).toMatchObject({
        outcome: "failed",
        acknowledgement: null,
        errorCode: "provider_acknowledgement_invalid",
      });
    },
  );

  it("does not copy arbitrary transport exception content into durable public receipts", async () => {
    const transport = {
      provider: "injected-test-provider",
      send: vi.fn(async () => {
        throw new Error(`Provider reflected ${mail.body}`);
      }),
    };
    const queued = await service(transport).enqueue(mail);
    const failed = await service(transport).dispatch(
      mail.tenantId,
      queued.deliveryId,
    );
    expect(failed?.status).toBe("failed");
    expect(failed?.sentAt).toBeNull();
    expect(failed?.attempts[0]?.acknowledgement).toBeNull();
    expect(JSON.stringify(failed)).not.toContain(mail.body);
    expect(await service().get(mail.tenantId, queued.deliveryId)).toEqual(
      failed,
    );
  });

  it("drains only the requested number of pending resources", async () => {
    const transport = acceptingTransport();
    const deliveryService = service(transport);
    const receipts = await Promise.all(
      ["resource-a", "resource-b", "resource-c"].map((idempotencyKey) =>
        deliveryService.enqueue({ ...mail, idempotencyKey }),
      ),
    );
    expect(await deliveryService.drain(2)).toHaveLength(2);
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(await service(transport).drain(2)).toHaveLength(1);
    expect(transport.send).toHaveBeenCalledTimes(3);
    for (const receipt of receipts) {
      expect(
        (await service().get(mail.tenantId, receipt.deliveryId))?.status,
      ).toBe("sent");
    }
  });
});
