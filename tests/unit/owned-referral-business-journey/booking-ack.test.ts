import { describe, expect, it, vi } from "vitest";
import {
  BookingWriteJournal,
  Evidence,
  JourneyFailure,
  clickAndSettleOriginalBookingAck,
  observeOriginalBookingAck,
  settleRoutedOriginalBookingAck,
  originalBookingRouteFailure,
  type BookingAckResponse,
  type BookingJournalSnapshot,
} from "../../e2e/owned-referral-business-journey/protocol";

const runtime = "a".repeat(40);
const url = "https://referral.example.test/api/referral/booking";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function setup(
  persist: (snapshot: BookingJournalSnapshot) => Promise<void> = async () =>
    undefined,
) {
  const command = {
    entrySlug: "yuhe-residence",
    quoteId: "quote-own",
    pickupAddress: "合成上車地址",
    dropoffAddress: "合成下車地址",
    vehicleType: "standard",
    passengerName: "合成測試",
    passengerPhone: "0900000001",
    idempotencyKey: "original-own-key",
  };
  const raw = JSON.stringify(command, null, 2);
  const journal = new BookingWriteJournal(
    {
      ...command,
      definitionSha: "b".repeat(40),
      runtimeSha: runtime,
      nonce: "synthetic-unit",
      partnerUserRef: "referral-demo-yuhe-residence",
    },
    persist,
  );
  await journal.beforeSend(raw, command.idempotencyKey, async () => undefined);
  const body = {
    ok: true,
    data: { orderId: "order-own", quote: { quoteId: command.quoteId } },
  };
  const response: BookingAckResponse = {
    url: () => url,
    status: () => 200,
    headers: () => ({ "x-drts-candidate-sha": runtime }),
    json: vi.fn(async () => body),
    request: () => ({
      url: () => url,
      method: () => "POST",
      headers: () => ({ "idempotency-key": command.idempotencyKey }),
      postData: () => raw,
    }),
  };
  const claim = vi.fn<(id: string) => void>();
  const evidence = new Evidence();
  const observe = (
    pending: Promise<BookingAckResponse> = Promise.resolve(response),
  ) =>
    observeOriginalBookingAck(
      pending,
      () => ({
        url,
        runtimeSha: runtime,
        journal,
        quote: { quoteId: command.quoteId },
      }),
      claim,
      evidence,
    );
  return { response, journal, raw, command, body, claim, evidence, observe };
}

describe("original browser booking ACK observation", () => {
  it("reads and durably captures a body while the UI action is still pending", async () => {
    const s = await setup();
    const action = deferred<void>();
    let actionFinished = false;
    s.response.json = vi.fn(async () => {
      if (actionFinished) throw new Error("body unavailable after navigation");
      return s.body;
    });
    const observed = s.observe();
    const combined = clickAndSettleOriginalBookingAck(
      () => action.promise,
      observed,
    );
    await observed;
    expect(actionFinished).toBe(false);
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current).toMatchObject({
      state: "acknowledged",
      body: s.raw,
      orderId: "order-own",
    });
    actionFinished = true;
    action.resolve();
    await expect(combined).resolves.toEqual({
      orderId: "order-own",
      quoteId: "quote-own",
    });
  });

  it("settles a late ACK before surfacing a failed click and allowing cleanup", async () => {
    const s = await setup();
    const response = deferred<BookingAckResponse>();
    const timeout = new Error("private URL, body and token must not escape");
    timeout.name = "TimeoutError";
    let cleanupStarted = false;
    const outcome = clickAndSettleOriginalBookingAck(async () => {
      throw timeout;
    }, s.observe(response.promise)).finally(() => {
      cleanupStarted = true;
    });
    // Attach the test's rejection assertion before resolving the late response.
    const rejected = expect(outcome).rejects.toThrow(
      "booking-ui-click:TimeoutError",
    );
    await Promise.resolve();
    expect(cleanupStarted).toBe(false);
    expect(s.claim).not.toHaveBeenCalled();
    response.resolve(s.response);
    await rejected;
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current?.state).toBe("acknowledged");
    expect(cleanupStarted).toBe(true);
  });

  it.each([
    "runtime",
    "response-quote",
    "raw-body",
    "header-key",
    "endpoint",
    "method",
  ] as const)(
    "rejects a foreign %s before claiming any owned ID",
    async (fault) => {
      const s = await setup();
      if (fault === "runtime")
        s.response.headers = () => ({ "x-drts-candidate-sha": "c".repeat(40) });
      if (fault === "response-quote")
        s.body.data.quote.quoteId = "quote-foreign";
      if (fault === "endpoint")
        s.response.url = () =>
          "https://foreign.example.test/api/referral/booking";
      const originalRequest = s.response.request();
      if (fault === "raw-body")
        s.response.request = () => ({
          ...originalRequest,
          postData: () =>
            JSON.stringify({ ...s.command, passengerName: "changed" }),
        });
      if (fault === "header-key")
        s.response.request = () => ({
          ...originalRequest,
          headers: () => ({ "idempotency-key": "replacement" }),
        });
      if (fault === "method")
        s.response.request = () => ({
          ...originalRequest,
          method: () => "GET",
        });
      await expect(s.observe()).rejects.toBeInstanceOf(JourneyFailure);
      expect(s.claim).not.toHaveBeenCalled();
      expect(s.journal.current).toMatchObject({
        state: "ack_unknown",
        body: s.raw,
        idempotencyKey: s.command.idempotencyKey,
      });
    },
  );

  it("preserves the original body/key and emits only phase/class when JSON reading fails", async () => {
    const s = await setup();
    s.response.json = async () => {
      throw new SyntaxError("secret-cookie=private-request-body");
    };
    await expect(s.observe()).rejects.toThrow(
      "booking-response-json:SyntaxError",
    );
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current?.state).toBe("ack_unknown");
    expect(JSON.stringify(s.evidence.events)).not.toMatch(
      /secret-cookie|private-request-body/,
    );
    expect(s.evidence.events).toContainEqual({
      stage: "booking-response-observed",
      status: 200,
    });
    expect(s.evidence.events).toContainEqual({
      stage: "booking-response-json:SyntaxError",
      result: "failed",
    });
  });

  it("keeps a recognized ID for owned cleanup when durable ACK persistence fails", async () => {
    const persisted: BookingJournalSnapshot[] = [];
    const s = await setup(async (snapshot) => {
      if (snapshot.state === "acknowledged")
        throw new Error("private disk path and request");
      persisted.push(snapshot);
    });
    await expect(s.observe()).rejects.toThrow("booking-ack-persist:Error");
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current?.state).toBe("ack_unknown");
    expect(persisted).toHaveLength(1);
    expect(JSON.stringify(s.evidence.events)).not.toContain("private disk");
  });

  it("keeps a typed HTTP refusal without interpreting it as a successful ACK", async () => {
    const s = await setup();
    s.response.status = () => 409;
    s.response.json = async () => ({
      ok: false,
      error: { code: "FARE_QUOTE_EXPIRED", message: "private detail" },
    });
    await expect(s.observe()).rejects.toMatchObject({
      stage: "booking-response-http",
      status: 409,
      code: "FARE_QUOTE_EXPIRED",
    });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current?.state).toBe("ack_unknown");
    expect(JSON.stringify(s.evidence.events)).not.toContain("private detail");
  });

  it("reports a response timeout by safe phase and does not hide it behind a successful click", async () => {
    const s = await setup();
    const timeout = new Error("private URL");
    timeout.name = "TimeoutError";
    await expect(
      clickAndSettleOriginalBookingAck(
        async () => undefined,
        s.observe(Promise.reject(timeout)),
      ),
    ).rejects.toThrow("booking-response-wait:TimeoutError");
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current?.state).toBe("ack_unknown");
  });
});

describe("original booking ACK join with a never-settling UI click", () => {
  const never = () => new Promise<void>(() => undefined);

  async function collectUnhandled(run: () => Promise<void>) {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      await run();
      // Let any late rejection reach the process-level hook.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", listener);
    }
    return unhandled;
  }

  it("surfaces an already expired observation instead of waiting for the click", async () => {
    const s = await setup();
    const timeout = new Error("private URL");
    timeout.name = "TimeoutError";
    await expect(
      clickAndSettleOriginalBookingAck(
        never,
        s.observe(Promise.reject(timeout)),
      ),
    ).rejects.toThrow("booking-response-wait:TimeoutError");
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current).toMatchObject({
      state: "ack_unknown",
      body: s.raw,
      idempotencyKey: s.command.idempotencyKey,
    });
  });

  it("surfaces a refused ACK while the click is pending without treating it as success", async () => {
    const s = await setup();
    s.response.status = () => 409;
    s.response.json = async () => ({
      ok: false,
      error: { code: "CONFLICT", message: "private detail" },
    });
    await expect(
      clickAndSettleOriginalBookingAck(never, s.observe()),
    ).rejects.toMatchObject({
      stage: "booking-response-http",
      status: 409,
      code: "CONFLICT",
    });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current?.state).toBe("ack_unknown");
  });

  it("ends at the existing operation deadline and retains a received ACK", async () => {
    const s = await setup();
    const click = deferred<void>();
    const expired = new AbortController();
    const removed = vi.spyOn(expired.signal, "removeEventListener");
    const unhandled = await collectUnhandled(async () => {
      const observed = s.observe();
      const outcome = clickAndSettleOriginalBookingAck(
        () => click.promise,
        observed,
        expired.signal,
      );
      const rejected = expect(outcome).rejects.toThrow(
        "supplemental-original-booking-timeout",
      );
      await observed;
      expect(s.journal.current).toMatchObject({
        state: "acknowledged",
        orderId: "order-own",
        body: s.raw,
      });
      expired.abort(
        new JourneyFailure("supplemental-original-booking-timeout"),
      );
      await rejected;
      expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
      // A late native click failure after the join exits stays observed.
      click.reject(new Error("private late click detail"));
    });
    expect(unhandled).toEqual([]);
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current?.state).toBe("acknowledged");
  });

  it("keeps a durable ACK and still surfaces a click that fails later", async () => {
    const s = await setup();
    const click = deferred<void>();
    const observed = s.observe();
    const outcome = clickAndSettleOriginalBookingAck(
      () => click.promise,
      observed,
      new AbortController().signal,
    );
    const rejected = expect(outcome).rejects.toThrow(
      "booking-ui-click:TimeoutError",
    );
    await observed;
    const timeout = new Error("private selector and URL");
    timeout.name = "TimeoutError";
    click.reject(timeout);
    await rejected;
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current?.state).toBe("acknowledged");
  });

  it("leaves no rejection or timer behind when the click settles after an expired observation", async () => {
    const s = await setup();
    const click = deferred<void>();
    const unhandled = await collectUnhandled(async () => {
      const timeout = new Error("private URL");
      timeout.name = "TimeoutError";
      // Count only timers the join itself would create; the clock is not run.
      vi.useFakeTimers();
      try {
        await expect(
          clickAndSettleOriginalBookingAck(
            () => click.promise,
            s.observe(Promise.reject(timeout)),
            new AbortController().signal,
          ),
        ).rejects.toThrow("booking-response-wait:TimeoutError");
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
      click.reject(new Error("private late click detail"));
    });
    expect(unhandled).toEqual([]);
  });

  it("does not let an operation deadline skip an ACK that already settled with the click", async () => {
    const s = await setup();
    const expired = new AbortController();
    await expect(
      clickAndSettleOriginalBookingAck(
        async () => undefined,
        s.observe(),
        expired.signal,
      ),
    ).resolves.toEqual({ orderId: "order-own", quoteId: "quote-own" });
    expired.abort(new JourneyFailure("scheduled-original-cancel-timeout"));
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current?.state).toBe("acknowledged");
  });
});

describe("original routed server ACK before UI release", () => {
  it("persists the actual ACK before navigation and releases its exact bytes once", async () => {
    const order: string[] = [];
    const s = await setup(async (snapshot) => {
      if (snapshot.state === "acknowledged") order.push("durable");
    });
    const bytes = Buffer.from(JSON.stringify(s.body));
    let navigated = false;
    const release = vi.fn(async (actual: Buffer) => {
      expect(actual).toBe(bytes);
      expect(s.journal.current?.state).toBe("acknowledged");
      order.push("release");
      navigated = true;
    });
    const observed = await settleRoutedOriginalBookingAck(
      {
        ...s.response,
        body: async () => {
          if (navigated) throw new Error("browser body gone");
          order.push("body");
          return bytes;
        },
      },
      s.response.request(),
      (original) => s.observe(Promise.resolve(original)),
      release,
    );
    expect(observed).toEqual({ orderId: "order-own", quoteId: "quote-own" });
    expect(order).toEqual(["body", "durable", "release"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("delivers the original refusal even when the observer rejects it", async () => {
    const s = await setup();
    const bytes = Buffer.from(
      JSON.stringify({ ok: false, error: { code: "CONFLICT" } }),
    );
    const release = vi.fn(async (actual: Buffer) => {
      expect(actual).toBe(bytes);
    });
    await expect(
      settleRoutedOriginalBookingAck(
        { ...s.response, status: () => 409, body: async () => bytes },
        s.response.request(),
        (original) => s.observe(Promise.resolve(original)),
        release,
      ),
    ).rejects.toMatchObject({
      stage: "booking-response-http",
      status: 409,
      code: "CONFLICT",
    });
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current?.state).toBe("ack_unknown");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("keeps the first ownership failure when delivery also fails", async () => {
    const s = await setup();
    const bytes = Buffer.from(JSON.stringify(s.body));
    await expect(
      settleRoutedOriginalBookingAck(
        {
          ...s.response,
          headers: () => ({ "x-drts-candidate-sha": "c".repeat(40) }),
          body: async () => bytes,
        },
        s.response.request(),
        (original) => s.observe(Promise.resolve(original)),
        async () => {
          throw new Error("private delivery details");
        },
      ),
    ).rejects.toThrow("booking ACK exact served runtime");
    expect(s.claim).not.toHaveBeenCalled();
  });

  it("retains a recognized own ID if delivery fails after durable ACK", async () => {
    const s = await setup();
    await expect(
      settleRoutedOriginalBookingAck(
        {
          ...s.response,
          body: async () => Buffer.from(JSON.stringify(s.body)),
        },
        s.response.request(),
        (original) => s.observe(Promise.resolve(original)),
        async () => {
          throw new Error("private delivery details");
        },
      ),
    ).rejects.toThrow("booking-response-release:Error");
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current?.state).toBe("acknowledged");
  });

  it("does not fabricate an ACK or release if the real server body is unavailable", async () => {
    const s = await setup();
    const release = vi.fn();
    await expect(
      settleRoutedOriginalBookingAck(
        {
          ...s.response,
          body: async () => {
            throw new Error("private response details");
          },
        },
        s.response.request(),
        (original) => s.observe(Promise.resolve(original)),
        release,
      ),
    ).rejects.toThrow("booking-response-body:Error");
    expect(s.claim).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(s.journal.current?.state).toBe("ack_unknown");
  });
});

describe("original route failure privacy", () => {
  it("does not expose a native transport message or stack to the reporter", () => {
    const failure = originalBookingRouteFailure(
      new Error("Authorization Bearer private URL body"),
    );
    expect(failure).toBeInstanceOf(JourneyFailure);
    expect(failure.message).toBe("booking-original-route:Error");
    expect(failure.stack).not.toContain("Bearer");
  });
  it("preserves an already typed original binding refusal", () => {
    const failure = new JourneyFailure("booking ACK exact served runtime");
    expect(originalBookingRouteFailure(failure)).toBe(failure);
  });
});

it("validates an actual new server fee snapshot without altering legacy original ACK handling", async () => {
  const s = await setup();
  // The original command remains a legacy immutable body. A new command has
  // explicit fields and a distinct own journal; it does not rewrite s.raw.
  const version = "fee-version-unit",
    contentHash = "c".repeat(64);
  const command = {
    ...s.command,
    feeDisclosureVersion: version,
    feeConfirmed: true,
  };
  const raw = JSON.stringify(command);
  const journal = new BookingWriteJournal(
    {
      ...command,
      definitionSha: "b".repeat(40),
      runtimeSha: runtime,
      nonce: "fee-unit",
      partnerUserRef: "referral-demo-yuhe-residence",
    },
    async () => undefined,
  );
  await journal.beforeSend(raw, command.idempotencyKey, async () => undefined);
  const response: BookingAckResponse = {
    ...s.response,
    request: () => ({ ...s.response.request(), postData: () => raw }),
    json: async () => ({
      ok: true,
      data: {
        orderId: "order-own",
        quote: { quoteId: command.quoteId },
        feeConfirmation: {
          orderId: "order-own",
          quoteId: command.quoteId,
          disclosureVersion: version,
          contentHash,
          feeConfirmedAt: "2026-10-20T00:00:00Z",
        },
      },
    }),
  };
  const claim = vi.fn();
  await expect(
    observeOriginalBookingAck(
      Promise.resolve(response),
      () => ({
        url,
        runtimeSha: runtime,
        journal,
        quote: { quoteId: command.quoteId, feeContentHash: contentHash },
      }),
      claim,
      new Evidence(),
    ),
  ).resolves.toEqual({ orderId: "order-own", quoteId: command.quoteId });
  expect(claim).toHaveBeenCalledExactlyOnceWith("order-own");
  expect(s.raw).not.toContain("feeConfirmed");
});
