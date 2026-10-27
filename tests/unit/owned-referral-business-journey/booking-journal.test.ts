import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  BookingWriteJournal,
  NativeTransport,
  futureTaipeiReservationIntents,
  verifyOwnedReservationCancellation,
  runOwnedRedispatchToSecond,
  type ObjectData,
  type CallOptions,
  hash,
  persistPrivateJson,
  requireFact,
  type BookingJournalContext,
  type BookingJournalSnapshot,
} from "../../e2e/owned-referral-business-journey/protocol";

import { parseOriginalUnknownBookingJournal } from "../../e2e/owned-referral-business-journey/original-journal-recovery";

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

describe("new fee intent journal retains exact original business bytes", () => {
  const expected = { ...context, feeDisclosureVersion: "fee-version-unit" };
  function feeBody(patch: Record<string, unknown> = {}) {
    return JSON.stringify(
      command({
        feeDisclosureVersion: expected.feeDisclosureVersion,
        feeConfirmed: true,
        ...patch,
      }),
    );
  }
  it("awaits durable storage before sending the exact explicitly confirmed command", async () => {
    const events: string[] = [],
      saved: BookingJournalSnapshot[] = [];
    const journal = new BookingWriteJournal(expected, async (snapshot) => {
      events.push("persist");
      saved.push(snapshot);
    });
    const raw = feeBody();
    await journal.beforeSend(raw, "own-key-1", async () => {
      events.push("send");
      expect(saved[0]?.body).toBe(raw);
    });
    expect(events).toEqual(["persist", "send"]);
    expect(journal.current?.bodySha256).toBe(hash(Buffer.from(raw)));
  });
  it.each([
    { feeConfirmed: false },
    { feeConfirmed: undefined },
    { feeDisclosureVersion: "different" },
  ])(
    "rejects absent/false/changed fee intent before any write or send %#",
    async (patch) => {
      const persist = vi.fn(),
        send = vi.fn();
      const journal = new BookingWriteJournal(expected, persist);
      await expect(
        journal.beforeSend(feeBody(patch), "own-key-1", send),
      ).rejects.toThrow("fee confirmation");
      expect(persist).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
  it("retains an unknown ACK original body/key and never adds a replacement key", async () => {
    const raw = feeBody(),
      journal = new BookingWriteJournal(expected, async () => undefined);
    await expect(
      journal.beforeSend(raw, "own-key-1", async () => {
        throw new Error("controlled response loss");
      }),
    ).rejects.toThrow("controlled response loss");
    expect(journal.current).toMatchObject({
      body: raw,
      idempotencyKey: "own-key-1",
      state: "ack_unknown",
    });
    await expect(
      journal.beforeSend(feeBody(), "replacement", async () => undefined),
    ).rejects.toThrow("one frozen booking send");
  });
});

describe("exact scheduled booking custody", () => {
  const scheduledAt = "2027-01-01T15:55:00.000Z";
  const expected = {
    ...context,
    expectedScheduledAt: scheduledAt,
    feeDisclosureVersion: "reservation-fee-version",
  };
  const body = (patch: Record<string, unknown> = {}) =>
    JSON.stringify(
      command({
        scheduledAt,
        feeDisclosureVersion: expected.feeDisclosureVersion,
        feeConfirmed: true,
        ...patch,
      }),
      null,
      2,
    );

  it("persists each independent raw scheduled intent before send and retains unknown ACK", async () => {
    const snapshots: BookingJournalSnapshot[] = [];
    const first = new BookingWriteJournal(expected, async (s) => {
      snapshots.push(s);
    });
    const second = new BookingWriteJournal(
      { ...expected, expectedScheduledAt: "2027-01-01T16:05:00.000Z" },
      async (s) => {
        snapshots.push(s);
      },
    );
    const raw = body();
    await first.beforeSend(raw, "own-key-1", async () => {
      expect(snapshots[0]?.body).toBe(raw);
      expect(snapshots[0]?.state).toBe("ack_unknown");
    });
    await first.acknowledge("reservation-one", context.quoteId);
    const other = body({
      scheduledAt: "2027-01-01T16:05:00.000Z",
      idempotencyKey: "own-key-2",
    });
    await expect(
      second.beforeSend(other, "own-key-2", async () => {
        throw new Error("lost ACK");
      }),
    ).rejects.toThrow("lost ACK");
    expect(first.current).toMatchObject({
      state: "acknowledged",
      orderId: "reservation-one",
      body: raw,
    });
    expect(second.current).toMatchObject({
      state: "ack_unknown",
      body: other,
      idempotencyKey: "own-key-2",
    });
    await expect(
      second.beforeSend(other, "own-key-2", async () => undefined),
    ).rejects.toThrow("one frozen booking send");
  });

  it.each([
    { scheduledAt: undefined },
    { scheduledAt: "invalid" },
    { scheduledAt: "2027-01-01T23:55:00+08:00" },
    { scheduledAt: "2027-01-01T16:05:00.000Z" },
    { quoteId: undefined },
    { quoteId: "other" },
    { entrySlug: "other" },
    { partnerUserRef: "other" },
    { passengerPhone: "0999999999" },
    { idempotencyKey: "other" },
    { feeConfirmed: false },
    { feeConfirmed: undefined },
    { feeDisclosureVersion: "other" },
  ])(
    "rejects changed scheduled/subject/quote/key/fee intent before persistence %#",
    async (patch) => {
      const persist = vi.fn(),
        send = vi.fn();
      await expect(
        new BookingWriteJournal(expected, persist).beforeSend(
          body(patch),
          "own-key-1",
          send,
        ),
      ).rejects.toThrow();
      expect(persist).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    { expectedScheduledAt: "2027-02-30T15:55:00.000Z" },
    { expectedScheduledAt: "invalid" },
    { quoteId: "" },
    { feeDisclosureVersion: undefined },
  ])(
    "does not turn an invalid expected context into a scheduled bypass %#",
    async (patch) => {
      const persist = vi.fn(),
        send = vi.fn();
      const invalid = { ...expected, ...patch };
      await expect(
        new BookingWriteJournal(
          invalid as BookingJournalContext,
          persist,
        ).beforeSend(
          body({
            scheduledAt: invalid.expectedScheduledAt,
            quoteId: invalid.quoteId,
          }),
          "own-key-1",
          send,
        ),
      ).rejects.toThrow();
      expect(persist).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
});

describe("reservation orchestration through public ports", () => {
  it("uses future Taipei 23:55 and next 00:05 with explicit offsets across UTC year boundary", () => {
    expect(
      futureTaipeiReservationIntents(Date.parse("2026-12-29T20:00:00Z")),
    ).toEqual(["2027-01-01T23:55:00+08:00", "2027-01-02T00:05:00+08:00"]);
  });
  it.each([
    "open",
    "closed",
    "mismatched-order",
    "mismatched-quote",
    "bad-ACK",
  ])(
    "binds real before-window -> original cancel -> canonical terminal readback (%s)",
    async (scenario) => {
      const intendedInput = futureTaipeiReservationIntents()[0]!;
      const scheduled = new Date(intendedInput).toISOString();
      const expected = {
        ...context,
        expectedScheduledAt: scheduled,
        feeDisclosureVersion: "fee-reservation",
      };
      const journal = new BookingWriteJournal(expected, async () => undefined);
      await journal.beforeSend(
        JSON.stringify(
          command({
            scheduledAt: scheduled,
            feeDisclosureVersion: "fee-reservation",
            feeConfirmed: true,
          }),
        ),
        "own-key-1",
        async () => undefined,
      );
      await journal.acknowledge("reservation", context.quoteId);
      const cutoff = new Date(
        Date.parse(scheduled) - 30 * 60_000,
      ).toISOString();
      const events: string[] = [];
      const order = {
        orderId: scenario === "mismatched-order" ? "foreign" : "reservation",
        status: "created",
        reservationWindowStart: scheduled,
        cancelableUntil: cutoff,
        referralPassengerLifecycle: { quote: { quoteId: context.quoteId } },
      };
      let terminal = false;
      const run = verifyOwnedReservationCancellation({
        intendedInput,
        journal,
        orderId: "reservation",
        quote: {
          quoteId:
            scenario === "mismatched-quote" ? "foreign" : context.quoteId,
          requestedScheduledAt: scheduled,
          timingMode: "scheduled",
        },
        readOrder: async () => {
          events.push("read");
          return terminal
            ? {
                ...order,
                status: "cancelled",
                cancelledAt: "2026-10-27T00:00:00Z",
              }
            : order;
        },
        readWindow: async () => ({
          canCancel: scenario !== "closed",
          cancelableUntil: cutoff,
        }),
        cancel: async () => {
          events.push("cancel");
          terminal = true;
          return {
            orderId: scenario === "bad-ACK" ? "foreign" : "reservation",
            status: "cancelled",
            cancelledAt: "2026-10-27T00:00:00Z",
          };
        },
        persist: async (facts) => {
          events.push(facts.terminal ? "persist-terminal" : "persist-before");
        },
      });
      if (scenario === "open") {
        await run;
        expect(events).toEqual([
          "read",
          "persist-before",
          "cancel",
          "read",
          "persist-terminal",
        ]);
      } else {
        await expect(run).rejects.toThrow();
        expect(events).not.toContain("persist-terminal");
        if (scenario !== "bad-ACK") expect(events).not.toContain("cancel");
      }
    },
  );
});

describe("true redispatch orchestration and independent Driver actors", () => {
  it.each([
    "normal",
    "second-ineligible",
    "old-task-not-cancelled",
    "wrong-second-actor",
    "wrong-completed-task",
  ])(
    "uses actual redispatch command/guard and separate task readbacks (%s)",
    async (scenario) => {
      const first = { driverId: "first-driver", vehicleId: "first-vehicle" };
      const second = { driverId: "second-driver", vehicleId: "second-vehicle" };
      const commands: { path: string; options: CallOptions | undefined }[] = [];
      const firstTask = {
        taskId: "first-task",
        assignmentId: "first-assignment",
        dispatchJobId: "job-1",
        orderId: "order",
        ...first,
        status: "pending_acceptance",
      };
      const secondTask = {
        taskId: "second-task",
        assignmentId: "second-assignment",
        dispatchJobId: "job-2",
        orderId: "order",
        ...second,
        status: "pending_acceptance",
      };
      let redispatched = false;
      const ops = async (
        path: string,
        options?: CallOptions,
      ): Promise<ObjectData> => {
        commands.push({ path, options });
        if (path.includes("/candidates"))
          return {
            items: [first, second].map((pair) => ({
              ...pair,
              serviceBuckets: ["business_dispatch"],
              eligibilityDecision:
                scenario === "second-ineligible" && pair === second
                  ? "ineligible"
                  : "eligible",
              etaMinutes: 1,
              hardReasonCodes: [],
            })),
          };
        if (path.endsWith("/redispatch")) {
          redispatched = true;
          return { dispatchJobId: "job-2" };
        }
        if (path.endsWith("/dispatch")) return { dispatchJobId: "job-1" };
        if (path === "/dispatch/assign")
          return redispatched ? secondTask : firstTask;
        if (path.endsWith("/dispatch-trace")) return { items: [] }; // instance memory absence is qualified, never a PG/global proof
        throw new Error("unexpected path");
      };
      const firstDriver = vi.fn(async () => ({
        ...firstTask,
        status:
          redispatched && scenario !== "old-task-not-cancelled"
            ? "cancelled"
            : "pending_acceptance",
      }));
      const secondDriver = vi.fn(async () => ({
        ...secondTask,
        driverId:
          scenario === "wrong-second-actor" ? "first-driver" : second.driverId,
      }));
      const persist = vi.fn(async () => undefined);
      const complete = vi.fn(async () => ({
        ...secondTask,
        taskId:
          scenario === "wrong-completed-task"
            ? "foreign-task"
            : secondTask.taskId,
        status: "completed",
      }));
      const run = runOwnedRedispatchToSecond({
        orderId: "order",
        nonce: "own-rd",
        first,
        second,
        ops,
        firstDriver,
        secondDriver,
        persist,
        completeSecond: complete,
      });
      if (scenario === "normal") {
        expect(await run).toMatchObject({
          traceObservedRedispatchCount: 0,
          completedTask: { driverId: second.driverId },
        });
        expect(firstDriver).toHaveBeenCalledWith(
          "/api/driver/tasks/first-task",
        );
        expect(secondDriver).toHaveBeenCalledWith(
          "/api/driver/tasks/second-task",
        );
        expect(
          commands.find((c) => c.path.endsWith("/redispatch"))?.options,
        ).toMatchObject({
          method: "POST",
          body: {
            expectedAssignmentVersion: 1,
            reasonCode: "synthetic_owned_second_supply",
            idempotencyKey: "own-rd-redispatch",
          },
          headers: { "Idempotency-Key": "own-rd-redispatch" },
        });
        expect(persist).toHaveBeenCalledTimes(2);
      } else {
        await expect(run).rejects.toThrow();
        if (scenario !== "wrong-completed-task")
          expect(complete).not.toHaveBeenCalled();
      }
      expect(commands.some((c) => c.path.includes("reassign_driver"))).toBe(
        false,
      );
      if (scenario === "second-ineligible")
        expect(commands.some((c) => c.path.endsWith("/redispatch"))).toBe(
          false,
        );
    },
  );
});

describe("two owned Driver transports keep actor authority separate", () => {
  it("uses each original actor token for its own task and binding revocation", async () => {
    const requests: { url: string; auth: string | null; body: unknown }[] = [];
    const fetcher = (async (url, init) => {
      requests.push({
        url: String(url),
        auth: new Headers(init?.headers).get("authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(
        JSON.stringify({ ok: true, data: { accepted: true } }),
        {
          status: 200,
          headers: { "x-drts-candidate-sha": context.runtimeSha },
        },
      );
    }) as typeof fetch;
    const origins = {
      api: "https://api.example.test",
      admin: "https://admin.example.test",
      ops: "https://ops.example.test",
      fleet: "https://fleet.example.test",
      referral: "https://referral.example.test",
    };
    const first = new NativeTransport(origins, context.runtimeSha, {}, fetcher);
    const second = new NativeTransport(
      origins,
      context.runtimeSha,
      {},
      fetcher,
    );
    first.setSession("driver", "first-private-token");
    second.setSession("driver", "second-private-token");
    await first.call("driver", "/api/driver/tasks/first");
    await second.call("driver", "/api/driver/tasks/second");
    for (const [transport, bindingId, deviceId] of [
      [first, "first-binding", "first-device"],
      [second, "second-binding", "second-device"],
    ] as const)
      await transport.call("driver", "/api/auth/driver/device/revoke", {
        method: "POST",
        body: { bindingId, deviceId },
      });
    expect(requests.map((r) => r.auth)).toEqual([
      "Bearer first-private-token",
      "Bearer second-private-token",
      "Bearer first-private-token",
      "Bearer second-private-token",
    ]);
    expect(requests.slice(2).map((r) => r.body)).toEqual([
      { bindingId: "first-binding", deviceId: "first-device" },
      { bindingId: "second-binding", deviceId: "second-device" },
    ]);
  });
});

describe("historical recovery remains immediate and immutable", () => {
  it("does not recover a new scheduled unknown ACK even with an otherwise matching test binding", async () => {
    const expected = {
      ...context,
      nonce: "owned-referral-123-new-reservation",
      expectedScheduledAt: "2027-01-01T15:55:00.000Z",
      feeDisclosureVersion: "fee-reservation",
    };
    const journal = new BookingWriteJournal(expected, async () => undefined);
    await expect(
      journal.beforeSend(
        JSON.stringify(
          command({
            scheduledAt: expected.expectedScheduledAt,
            feeDisclosureVersion: expected.feeDisclosureVersion,
            feeConfirmed: true,
          }),
        ),
        "own-key-1",
        async () => {
          throw new Error("lost ACK");
        },
      ),
    ).rejects.toThrow("lost ACK");
    const snapshot = journal.current!;
    expect(() =>
      parseOriginalUnknownBookingJournal(snapshot, expected.runtimeSha, {
        originalRun: 123,
        definitionSha: expected.definitionSha,
        runtimeSha: expected.runtimeSha,
        entrySlug: expected.entrySlug,
        partnerUserRef: expected.partnerUserRef,
        quoteId: expected.quoteId,
        bodySha256: snapshot.bodySha256,
        keySha256: hash(Buffer.from(snapshot.idempotencyKey)),
      }),
    ).toThrow("original exact immediate business command required");
    expect(journal.current).toMatchObject({
      state: "ack_unknown",
      body: snapshot.body,
      idempotencyKey: "own-key-1",
    });
  });
});
