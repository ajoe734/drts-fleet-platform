import { describe, expect, it, vi } from "vitest";
import { hash } from "../../e2e/owned-referral-business-journey/protocol";
import {
  parseOriginalUnknownBookingJournal,
  recoverOriginalUnknownBookingAck,
} from "../../e2e/owned-referral-business-journey/original-journal-recovery";

function fixture() {
  const command = {
    entrySlug: "synthetic-entry",
    quoteId: "original-quote",
    pickupAddress: "上車",
    dropoffAddress: "下車",
    passengerName: "合成資料",
    passengerPhone: "0900000000",
    idempotencyKey: "exact-original-key",
  };
  const body = JSON.stringify(command);
  const binding = {
    originalRun: 123,
    definitionSha: "a".repeat(40),
    runtimeSha: "b".repeat(40),
    entrySlug: command.entrySlug,
    partnerUserRef: "original-subject",
    quoteId: command.quoteId,
    bodySha256: hash(Buffer.from(body)),
    keySha256: hash(Buffer.from(command.idempotencyKey)),
  };
  const journal = {
    version: 1,
    state: "ack_unknown",
    syntheticData: true,
    ...binding,
    nonce: "owned-referral-123-synthetic",
    body,
    idempotencyKey: command.idempotencyKey,
  };
  return { command, body, binding, journal };
}

describe("one original unknown ACK journal recovery", () => {
  it("sends the exact retained bytes/key once and recognizes only the replayed original quote", async () => {
    const f = fixture();
    const original = parseOriginalUnknownBookingJournal(
      f.journal,
      f.binding.runtimeSha,
      f.binding,
    );
    const send = vi.fn(async (command, key) => {
      expect(JSON.stringify(command)).toBe(f.body);
      expect(key).toBe(f.command.idempotencyKey);
      return {
        orderId: "committed-original-order",
        quote: { quoteId: f.command.quoteId },
        replayed: true,
      };
    });
    await expect(
      recoverOriginalUnknownBookingAck(original, send),
    ).resolves.toMatchObject({
      originalRun: 123,
      orderId: "committed-original-order",
      bodySha256: f.binding.bodySha256,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(["body", "key", "subject", "quote", "source", "run", "acknowledged"])(
    "rejects a changed %s before any recovery send",
    (fault) => {
      const f = fixture();
      const changed: Record<string, unknown> = { ...f.journal };
      if (fault === "body")
        changed.body = JSON.stringify({ ...f.command, pickupAddress: "別處" });
      if (fault === "key") changed.idempotencyKey = "new-key";
      if (fault === "subject") changed.partnerUserRef = "foreign-subject";
      if (fault === "quote") changed.quoteId = "new-quote";
      if (fault === "source") changed.runtimeSha = "c".repeat(40);
      if (fault === "run") changed.nonce = "owned-referral-456-foreign";
      if (fault === "acknowledged") changed.state = "acknowledged";
      expect(() =>
        parseOriginalUnknownBookingJournal(
          changed,
          f.binding.runtimeSha,
          f.binding,
        ),
      ).toThrow();
    },
  );

  it("does not retry or replace a command after another lost response", async () => {
    const f = fixture();
    const original = parseOriginalUnknownBookingJournal(
      f.journal,
      f.binding.runtimeSha,
      f.binding,
    );
    const send = vi.fn(async () => {
      throw new Error("lost original response");
    });
    await expect(
      recoverOriginalUnknownBookingAck(original, send),
    ).rejects.toThrow("lost original response");
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(original.command)).toBe(f.body);
  });

  it.each(["foreign-quote", "not-replay"])(
    "refuses a %s ACK",
    async (fault) => {
      const f = fixture();
      const original = parseOriginalUnknownBookingJournal(
        f.journal,
        f.binding.runtimeSha,
        f.binding,
      );
      const send = vi.fn(async () => ({
        orderId: "observed-id",
        quote: {
          quoteId: fault === "foreign-quote" ? "foreign" : f.command.quoteId,
        },
        replayed: fault !== "not-replay",
      }));
      await expect(
        recoverOriginalUnknownBookingAck(original, send),
      ).rejects.toThrow("original recovery replay ACK and quote required");
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
});
