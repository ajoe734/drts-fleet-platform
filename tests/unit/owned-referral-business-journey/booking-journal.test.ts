import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  BookingWriteJournal,
  hash,
  persistPrivateJson,
  requireFact,
  type BookingJournalContext,
  type BookingJournalSnapshot,
} from "../../e2e/owned-referral-business-journey/protocol";

const context: BookingJournalContext = {
  definitionSha: "a".repeat(40),
  runtimeSha: "b".repeat(40),
  nonce: "owned-unit",
  entrySlug: "yuhe-residence",
  partnerUserRef: "referral-demo-yuhe-residence",
  quoteId: "quote-current",
  pickupAddress: "合成測試上車地址",
  dropoffAddress: "合成測試下車地址",
  passengerName: "合成測試 unit",
  passengerPhone: "0900000001",
  vehicleType: "standard",
};
function command(patch: Record<string, unknown> = {}) {
  return {
    entrySlug: context.entrySlug,
    quoteId: context.quoteId,
    pickupAddress: context.pickupAddress,
    dropoffAddress: context.dropoffAddress,
    passengerName: context.passengerName,
    passengerPhone: context.passengerPhone,
    vehicleType: context.vehicleType,
    idempotencyKey: "own-key-1",
    ...patch,
  };
}
function deferred() {
  let finish: () => void = () => {
    throw new Error("deferred resolver not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, resolve: () => finish() };
}

describe("frozen own booking before network send", () => {
  it("awaits durable persistence before the actual continuation can run", async () => {
    const gate = deferred();
    const persist = vi.fn(async () => gate.promise);
    const send = vi.fn(async () => undefined);
    const journal = new BookingWriteJournal(context, persist);
    const raw = JSON.stringify(command(), null, 2);
    const pending = journal.beforeSend(raw, "own-key-1", send);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(journal.current).toBeUndefined();
    gate.resolve();
    await pending;
    expect(send).toHaveBeenCalledTimes(1);
    expect(journal.current).toMatchObject({
      state: "ack_unknown",
      body: raw,
      idempotencyKey: "own-key-1",
      bodySha256: hash(Buffer.from(raw)),
    });
  });

  it("does not send if persistence fails and does not invent a replacement intent", async () => {
    const persist = vi.fn(async () => {
      throw new Error("disk write failed");
    });
    const send = vi.fn(async () => undefined);
    const journal = new BookingWriteJournal(context, persist);
    await expect(
      journal.beforeSend(JSON.stringify(command()), "own-key-1", send),
    ).rejects.toThrow("disk write failed");
    expect(send).not.toHaveBeenCalled();
    expect(journal.current).toBeUndefined();
    await expect(
      journal.beforeSend(
        JSON.stringify(command({ idempotencyKey: "replacement" })),
        "replacement",
        send,
      ),
    ).rejects.toThrow("one frozen booking send");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("retains exact body/key when the response is lost and refuses an automatic second send", async () => {
    const saved: BookingJournalSnapshot[] = [];
    const persist = vi.fn(async (snapshot: BookingJournalSnapshot) => {
      saved.push(snapshot);
    });
    const send = vi.fn(async () => {
      throw new Error("ACK lost");
    });
    const raw = JSON.stringify(command(), null, 2);
    const journal = new BookingWriteJournal(context, persist);
    await expect(journal.beforeSend(raw, "own-key-1", send)).rejects.toThrow(
      "ACK lost",
    );
    const current = journal.current;
    requireFact(current, "persisted unknown write required");
    expect(current.state).toBe("ack_unknown");
    expect(current.body).toBe(raw);
    expect(current.idempotencyKey).toBe("own-key-1");
    expect(current.orderId).toBeUndefined();
    expect(current.recovery).toContain("same Idempotency-Key");
    expect(current.recovery).toContain("Do not create a replacement key");
    expect(saved).toHaveLength(1);
    await expect(journal.beforeSend(raw, "own-key-1", send)).rejects.toThrow(
      "one frozen booking send",
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
  });

  it("only acknowledges the frozen quote and retains original bytes across the ACK update", async () => {
    const saved: BookingJournalSnapshot[] = [];
    const journal = new BookingWriteJournal(context, async (snapshot) => {
      saved.push(snapshot);
    });
    const raw = JSON.stringify(command());
    await journal.beforeSend(raw, "own-key-1", async () => undefined);
    await expect(
      journal.acknowledge("order-own", "quote-foreign"),
    ).rejects.toThrow("frozen quote");
    expect(saved).toHaveLength(1);
    await journal.acknowledge("order-own", context.quoteId);
    expect(journal.current).toMatchObject({
      state: "acknowledged",
      orderId: "order-own",
      body: raw,
      bodySha256: hash(Buffer.from(raw)),
      idempotencyKey: "own-key-1",
    });
    expect(saved).toHaveLength(2);
  });

  it("rejects credentials, foreign context, scheduled replacement, and body/header key mismatch before writing", async () => {
    for (const patch of [
      { token: "private-token" },
      { cookie: "private-cookie" },
      { authorization: "Bearer private" },
      { headers: { cookie: "private" } },
      { entrySlug: "foreign" },
      { quoteId: "old-quote" },
      { partnerUserRef: "foreign" },
      { passengerName: "foreign" },
      { passengerPhone: "0999999999" },
      { pickupAddress: "foreign" },
      { dropoffAddress: "foreign" },
      { vehicleType: "foreign" },
      { scheduledAt: "2027-01-01T00:00:00Z" },
      { idempotencyKey: "different-key" },
    ]) {
      const persist = vi.fn(async () => undefined);
      const send = vi.fn(async () => undefined);
      const journal = new BookingWriteJournal(context, persist);
      await expect(
        journal.beforeSend(JSON.stringify(command(patch)), "own-key-1", send),
      ).rejects.toThrow();
      expect(persist).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("writes an actual private atomic file before send and updates it with the exact acknowledged order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owned-booking-journal-"));
    const path = join(directory, "booking-write-journal.json");
    const raw = JSON.stringify(command(), null, 2);
    const journal = new BookingWriteJournal(context, (snapshot) =>
      persistPrivateJson(path, snapshot),
    );
    try {
      await journal.beforeSend(raw, "own-key-1", async () => {
        const before = JSON.parse(await readFile(path, "utf8"));
        expect(before.state).toBe("ack_unknown");
        expect(before.body).toBe(raw);
        expect(before.bodySha256).toBe(hash(Buffer.from(raw)));
        expect((await stat(path)).mode & 0o777).toBe(0o600);
      });
      await journal.acknowledge("order-own", context.quoteId);
      const after = JSON.parse(await readFile(path, "utf8"));
      expect(after.state).toBe("acknowledged");
      expect(after.orderId).toBe("order-own");
      expect(after.body).toBe(raw);
      expect(after.syntheticData).toBe(true);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
