import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  BookingWriteJournal,
  Evidence,
  JourneyFailure,
  clickAndSettleOriginalBookingAck,
  drainWithinOperationBudget,
  settleOriginalBookingOperation,
  OriginalBookingOperation,
  closeOriginalBookingOperation,
  NATIVE_REQUEST_TIMEOUT_MS,
  object,
  requireFact,
  text,
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

describe("original booking ACK join with a never-settling UI click", () => {
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

describe("original booking caller drains within the existing operation budget", () => {
  // Caller-shaped route: it drains observed quote tasks before it can finish,
  // exactly like the main page.route handler before its own finally.
  function stuckRoute(quoteTasks: Promise<unknown>[]) {
    let finished = false;
    const routeFinished = (async () => {
      try {
        await Promise.all([...quoteTasks]);
      } finally {
        finished = true;
      }
    })();
    void routeFinished.catch(() => undefined);
    return { routeFinished, finished: () => finished };
  }

  async function pendingAfterTurns(outcome: Promise<unknown>) {
    let done = false;
    void outcome.then(
      () => (done = true),
      () => (done = true),
    );
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    return !done;
  }

  it("leaves a stuck route/quote drain at expiry and keeps the observation failure primary", async () => {
    const s = await setup();
    const timeout = new Error("private URL");
    timeout.name = "TimeoutError";
    const quote = deferred<unknown>();
    const route = stuckRoute([quote.promise]);
    const expired = new AbortController();
    const unhandled = await collectUnhandled(async () => {
      const outcome = settleOriginalBookingOperation(
        never,
        s.observe(Promise.reject(timeout)),
        expired.signal,
        () => route.routeFinished,
      );
      void outcome.catch(() => undefined);
      // Observation already failed; only the route drain is still held.
      expect(await pendingAfterTurns(outcome)).toBe(true);
      expired.abort(new JourneyFailure("main-original-booking-timeout"));
      await expect(outcome).rejects.toThrow(
        "booking-response-wait:TimeoutError",
      );
      expect(route.finished()).toBe(false);
      // The abandoned quote task still settles observed later.
      quote.reject(new Error("private late quote body"));
    });
    expect(unhandled).toEqual([]);
    expect(route.finished()).toBe(true);
    expect(s.claim).not.toHaveBeenCalled();
    expect(s.journal.current).toMatchObject({
      state: "ack_unknown",
      body: s.raw,
      idempotencyKey: s.command.idempotencyKey,
    });
  });

  it("reports an abandoned route drain after a durable ACK without losing it", async () => {
    const s = await setup();
    const route = stuckRoute([never()]);
    const expired = new AbortController();
    const outcome = settleOriginalBookingOperation(
      async () => undefined,
      s.observe(),
      expired.signal,
      () => route.routeFinished,
    );
    const rejected = expect(outcome).rejects.toThrow(
      "main-original-booking-timeout",
    );
    expect(await pendingAfterTurns(outcome)).toBe(true);
    expect(s.journal.current?.state).toBe("acknowledged");
    expired.abort(new JourneyFailure("main-original-booking-timeout"));
    await rejected;
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
    expect(s.journal.current).toMatchObject({
      state: "acknowledged",
      orderId: "order-own",
      body: s.raw,
    });
  });

  it("still drains a genuine late ACK and its route before surfacing a failed click", async () => {
    const s = await setup();
    const response = deferred<BookingAckResponse>();
    const route = deferred<void>();
    const expired = new AbortController();
    let cleanupStarted = false;
    const outcome = settleOriginalBookingOperation(
      async () => {
        throw new Error("private selector");
      },
      s.observe(response.promise),
      expired.signal,
      () => route.promise,
    ).finally(() => {
      cleanupStarted = true;
    });
    const rejected = expect(outcome).rejects.toThrow("booking-ui-click:Error");
    response.resolve(s.response);
    expect(await pendingAfterTurns(outcome)).toBe(true);
    expect(s.journal.current?.state).toBe("acknowledged");
    expect(cleanupStarted).toBe(false);
    route.resolve();
    await rejected;
    expect(cleanupStarted).toBe(true);
    expect(s.claim).toHaveBeenCalledExactlyOnceWith("order-own");
  });

  it("returns the ACK after a finished route and waits for no route that never started", async () => {
    const s = await setup();
    const expired = new AbortController();
    await expect(
      settleOriginalBookingOperation(
        async () => undefined,
        s.observe(),
        expired.signal,
        () => Promise.resolve(),
      ),
    ).resolves.toEqual({ orderId: "order-own", quoteId: "quote-own" });
    const t = await setup();
    await expect(
      settleOriginalBookingOperation(
        async () => undefined,
        t.observe(),
        expired.signal,
        () => undefined,
      ),
    ).resolves.toEqual({ orderId: "order-own", quoteId: "quote-own" });
  });

  it("bounds a supplemental unroute/quote drain by the same expired signal", async () => {
    const quote = deferred<void>();
    const expired = new AbortController();
    const removed = vi.spyOn(expired.signal, "removeEventListener");
    const unhandled = await collectUnhandled(async () => {
      const drain = drainWithinOperationBudget(
        (async () => {
          await Promise.resolve(); // unroute
          await Promise.all([quote.promise]);
        })(),
        expired.signal,
      );
      void drain.catch(() => undefined);
      expect(await pendingAfterTurns(drain)).toBe(true);
      expired.abort(
        new JourneyFailure("supplemental-original-booking-timeout"),
      );
      await expect(drain).rejects.toThrow(
        "supplemental-original-booking-timeout",
      );
      expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
      quote.reject(new Error("private late quote body"));
    });
    expect(unhandled).toEqual([]);
  });

  it("keeps a quote failure that settles within the budget", async () => {
    const expired = new AbortController();
    const failure = new JourneyFailure("supplemental actual UI quote intent");
    await expect(
      drainWithinOperationBudget(Promise.reject(failure), expired.signal),
    ).rejects.toBe(failure);
    await expect(
      drainWithinOperationBudget(Promise.resolve(), expired.signal),
    ).resolves.toBeUndefined();
  });
});

describe("original booking operation closes on every exit and never sends late", () => {
  // Only the clock functions the budget uses are faked; promise turns and
  // setImmediate stay real.
  const fakeBudgetClock = () =>
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  async function unsentJournal(
    persist: (snapshot: BookingJournalSnapshot) => Promise<void>,
  ) {
    const s = await setup();
    const journal = new BookingWriteJournal(
      {
        ...s.command,
        definitionSha: "b".repeat(40),
        runtimeSha: runtime,
        nonce: "synthetic-unit-late-send",
        partnerUserRef: "referral-demo-yuhe-residence",
      },
      persist,
    );
    return { ...s, journal };
  }

  it("refuses the one real send when the budget expires while the journal persist is held", async () => {
    fakeBudgetClock();
    try {
      const persisted = deferred<void>();
      const s = await unsentJournal(() => persisted.promise);
      const operation = new OriginalBookingOperation(
        "supplemental-original-booking",
      );
      const expiredWith: JourneyFailure[] = [];
      operation.arm(25_000, (failure) => expiredWith.push(failure));
      const fetch = vi.fn(async () => undefined);
      const sending = s.journal.beforeSend(
        s.raw,
        s.command.idempotencyKey,
        () => operation.send(fetch),
      );
      const refused = expect(sending).rejects.toThrow(
        "supplemental-original-booking within its operation budget",
      );
      // The caller's existing deadline fires and the caller exits first.
      vi.advanceTimersByTime(25_000);
      expect(expiredWith.map((f) => f.message)).toEqual([
        "supplemental-original-booking-timeout",
      ]);
      expect(operation.open).toBe(false);
      persisted.resolve();
      await refused;
      expect(fetch).not.toHaveBeenCalled();
      expect(s.journal.current).toMatchObject({
        state: "ack_unknown",
        body: s.raw,
        idempotencyKey: s.command.idempotencyKey,
      });
      // The original attempt stays single: no replacement send is possible.
      await expect(
        s.journal.beforeSend(s.raw, s.command.idempotencyKey, fetch),
      ).rejects.toThrow("one frozen booking send only");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends exactly once while the operation is open", async () => {
    const s = await unsentJournal(async () => undefined);
    const operation = new OriginalBookingOperation("main-original-booking");
    const fetch = vi.fn(async () => undefined);
    await s.journal.beforeSend(s.raw, s.command.idempotencyKey, () =>
      operation.send(fetch),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    operation.close();
  });

  it("closes a main operation whose observation failed before its route started", async () => {
    fakeBudgetClock();
    try {
      const s = await setup();
      const timeout = new Error("private URL");
      timeout.name = "TimeoutError";
      const operation = new OriginalBookingOperation("main-original-booking");
      const unroute = vi.fn(async () => undefined);
      let routeStarted = false;
      let succeeded = false;
      operation.arm(15_000);
      try {
        await settleOriginalBookingOperation(
          () => new Promise<void>(() => undefined),
          s.observe(Promise.reject(timeout)),
          operation.signal,
          () => (routeStarted ? Promise.resolve() : undefined),
        );
        succeeded = true;
      } catch (error) {
        expect((error as Error).message).toBe(
          "booking-response-wait:TimeoutError",
        );
      } finally {
        await closeOriginalBookingOperation(operation, succeeded, unroute);
      }
      expect(succeeded).toBe(false);
      expect(unroute).not.toHaveBeenCalled();
      expect(operation.open).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      // A late UI POST reaching the still-registered route is refused.
      routeStarted = true;
      const fetch = vi.fn(async () => undefined);
      await expect(operation.send(fetch)).rejects.toThrow(
        "main-original-booking within its operation budget",
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(() => operation.arm(15_000)).toThrow(
        "main-original-booking budget armed once while open",
      );
      expect(s.claim).not.toHaveBeenCalled();
      expect(s.journal.current?.state).toBe("ack_unknown");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drains a successful operation within its armed budget and reports an abandoned drain", async () => {
    fakeBudgetClock();
    try {
      const operation = new OriginalBookingOperation(
        "supplemental-original-booking",
      );
      operation.arm(25_000);
      const closing = closeOriginalBookingOperation(
        operation,
        true,
        () => new Promise<void>(() => undefined),
      );
      const rejected = expect(closing).rejects.toThrow(
        "supplemental-original-booking-timeout",
      );
      await Promise.resolve();
      expect(operation.open).toBe(true);
      vi.advanceTimersByTime(25_000);
      await rejected;
      expect(operation.open).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a drain failure of a successful operation and closes it", async () => {
    const operation = new OriginalBookingOperation("main-original-booking");
    const failure = new JourneyFailure("supplemental actual UI quote intent");
    await expect(
      closeOriginalBookingOperation(operation, true, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(operation.open).toBe(false);
    const ok = new OriginalBookingOperation("main-original-booking");
    await expect(
      closeOriginalBookingOperation(ok, true, async () => undefined),
    ).resolves.toBeUndefined();
    expect(ok.open).toBe(false);
  });
});

describe("actual main and supplemental booking callers keep a failed guard until page close", () => {
  // The production caller code is executed from the actual spec source: the
  // main route handler and its try/finally, and the entire bookExtraFromUI
  // initializer. Only external Playwright page/route/expect/finalizer ports,
  // the click, quote json and fetched server response are controlled here.
  const specSource = ts.createSourceFile(
    "owned-business.spec.ts",
    readFileSync(
      fileURLToPath(
        new URL(
          "../../e2e/owned-referral-business-journey/owned-business.spec.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
    ts.ScriptTarget.ES2022,
    true,
  );
  function findSpec<T extends ts.Node>(
    test: (node: ts.Node) => node is T,
    marker: string,
  ): T {
    const found: T[] = [];
    const visit = (node: ts.Node) => {
      if (test(node) && node.getText(specSource).includes(marker))
        found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(specSource);
    // The innermost match is the exact production node.
    const node = found.at(-1);
    if (!node) throw new Error(`spec node not found: ${marker}`);
    return node;
  }
  function compile<T>(code: string, bindings: Record<string, unknown>): T {
    const { outputText } = ts.transpileModule(`const __actual = ${code};`, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    });
    const scope = new Proxy(bindings, {
      has: (target, key) => typeof key === "string" && key in target,
    });
    // Sloppy-mode `with` resolves the caller's free names against `bindings`;
    // anything not bound falls through to real globals (or throws).
    return new Function(
      "scope",
      `with (scope) { ${outputText.replace(/^"use strict";/, "")} return __actual; }`,
    )(scope) as T;
  }
  const mainRouteHandler = findSpec(
    ts.isArrowFunction,
    "booking:command-or-journal-rejected-before-send",
  ).getText(specSource);
  const mainCaller = `async () => { ${findSpec(
    ts.isTryStatement,
    'finalizer.checkpoint("main-original-booking")',
  ).getText(specSource)} }`;
  const bookExtraFromUI = findSpec(
    ts.isArrowFunction,
    "supplemental original booking ACK custody",
  ).getText(specSource);

  const origin = "https://referral.example.test";
  const bookingUrl = `${origin}/api/referral/booking`;
  const quoteUrl = `${origin}/api/referral/quote`;
  const ENTRY = "yuhe-residence";
  const SUBJECT = "referral-demo-yuhe-residence";
  const pickupAddress = "合成上車地址";
  const dropoffAddress = "合成下車地址";
  const passengerName = "合成測試";
  const phone = "0900000001";
  const feeVersion = "fee-version-unit";
  const feeHash = "c".repeat(64);
  const turns = async () => {
    for (let i = 0; i < 6; i += 1)
      await new Promise((resolve) => setImmediate(resolve));
  };

  type Handler = (route: unknown) => Promise<void>;
  // Playwright-shaped page: the latest matching handler intercepts a request
  // and does not fall back; with none, the request reaches the network.
  function fakePage() {
    const counts = {
      network: 0,
      aborts: 0,
      continues: 0,
      fetches: 0,
      fulfills: 0,
      unroutes: 0,
      offs: 0,
    };
    const fulfilledBodies: Buffer[] = [];
    let routes: { url: string; handler: Handler }[] = [];
    const listeners: ((response: unknown) => void)[] = [];
    let closed = false;
    let responder: () => Promise<Buffer> = async () => {
      throw new Error("no server response configured");
    };
    let responseStatus = 200;
    let clickImpl: () => Promise<void> = async () => undefined;
    const failures: Record<string, Error | undefined> = {};
    // Optional controlled settlement of the actual Playwright release/drain
    // ports; unset, each settles at once as before.
    const holds: Partial<
      Record<"fulfill" | "dispose" | "unroute", () => Promise<void>>
    > = {};
    const page = {
      route: async (url: string, handler: Handler) => {
        routes.push({ url, handler });
      },
      unroute: async (url: string, handler?: Handler) => {
        counts.unroutes += 1;
        routes = routes.filter(
          (r) => !(r.url === url && (!handler || r.handler === handler)),
        );
        await holds.unroute?.();
      },
      on: (_event: string, listener: (response: unknown) => void) =>
        listeners.push(listener),
      off: (_event: string, listener: (response: unknown) => void) => {
        counts.offs += 1;
        listeners.splice(listeners.indexOf(listener), 1);
      },
      goto: async () => undefined,
      getByRole: () => ({ check: async () => undefined }),
      locator: (selector: string) => ({
        fill: async () => undefined,
        check: async () => undefined,
        click: () =>
          selector === '[data-drt-operation="referral-create"]'
            ? clickImpl()
            : Promise.resolve(),
      }),
    };
    const expectPort = (subject: unknown) => {
      void subject;
      const check = (name: string) => async () => {
        if (failures[name]) throw failures[name];
      };
      return {
        not: { toBeChecked: check("not.toBeChecked") },
        toBeChecked: check("toBeChecked"),
        toBeDisabled: check("toBeDisabled"),
        toBeEnabled: check("toBeEnabled"),
      };
    };
    // One browser POST of the frozen UI command, as the click would emit it.
    async function post(raw: string, key: string) {
      if (closed) throw new Error("page closed");
      const target = [...routes].reverse().find((r) => r.url === bookingUrl);
      if (!target) {
        counts.network += 1;
        return;
      }
      const request = {
        url: () => bookingUrl,
        method: () => "POST",
        postData: () => raw,
        headers: () => ({ "idempotency-key": key }),
      };
      await target.handler({
        request: () => request,
        abort: async () => {
          counts.aborts += 1;
        },
        continue: async () => {
          counts.continues += 1;
        },
        fetch: async () => {
          counts.fetches += 1;
          const body = await responder();
          return {
            url: () => bookingUrl,
            status: () => responseStatus,
            headers: () => ({ "x-drts-candidate-sha": runtime }),
            body: async () => body,
            dispose: async () => {
              await holds.dispose?.();
            },
          };
        },
        fulfill: async (options: { body: Buffer }) => {
          counts.fulfills += 1;
          fulfilledBodies.push(options.body);
          await holds.fulfill?.();
        },
      });
    }
    function quoteResponse(json: Promise<unknown>) {
      for (const listener of [...listeners])
        listener({
          url: () => quoteUrl,
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": runtime }),
          json: () => json,
          request: () => ({
            method: () => "POST",
            postDataJSON: () => ({
              entrySlug: ENTRY,
              pickupAddress,
              dropoffAddress,
              vehicleType: "standard",
            }),
          }),
        });
    }
    return {
      page,
      counts,
      fulfilledBodies,
      failures,
      holds,
      expect: expectPort,
      post,
      quoteResponse,
      routes: () => routes.length,
      close: () => {
        closed = true;
        routes = [];
      },
      setResponder: (next: () => Promise<Buffer>) => {
        responder = next;
      },
      setResponseStatus: (status: number) => {
        responseStatus = status;
      },
      setClick: (next: () => Promise<void>) => {
        clickImpl = next;
      },
    };
  }
  const command = (quoteId: string, key: string) =>
    JSON.stringify({
      entrySlug: ENTRY,
      quoteId,
      pickupAddress,
      dropoffAddress,
      vehicleType: "standard",
      passengerName,
      passengerPhone: phone,
      idempotencyKey: key,
      feeDisclosureVersion: feeVersion,
      feeConfirmed: true,
    });
  const ack = (orderId: string, quoteId: string) =>
    Buffer.from(
      JSON.stringify({
        ok: true,
        data: {
          orderId,
          quote: { quoteId },
          feeConfirmation: {
            orderId,
            quoteId,
            disclosureVersion: feeVersion,
            contentHash: feeHash,
            feeConfirmedAt: "2026-10-29T00:00:00Z",
          },
        },
      }),
    );
  const proposal = (quoteId: string) => ({
    quoteId,
    vehicleType: "standard",
    feeDisclosureVersion: feeVersion,
    feeContentHash: feeHash,
    requestedScheduledAt: null,
    timingMode: "immediate",
    pickupAddress,
    dropoffAddress,
    fixedPrice: false,
    isGuaranteed: false,
  });

  function mainHarness() {
    const p = fakePage();
    const writes: string[] = [];
    const evidence = new Evidence();
    const bookingState: {
      journal?: BookingWriteJournal;
      quote?: Record<string, unknown>;
      routeError?: unknown;
    } = {};
    let resolveOriginalResponse!: (response: BookingAckResponse) => void;
    let rejectOriginalResponse!: (error: unknown) => void;
    const originalResponse = new Promise<BookingAckResponse>((yes, no) => {
      resolveOriginalResponse = yes;
      rejectOriginalResponse = no;
    });
    void originalResponse.catch(() => undefined);
    // Stands in for the native page.waitForResponse deadline.
    const browserResponseDeadline = deferred<BookingAckResponse>();
    let finishOriginalRoute!: () => void;
    const originalRouteFinished = new Promise<void>((resolve) => {
      finishOriginalRoute = resolve;
    });
    const bindings: Record<string, unknown> = {
      orderId: undefined,
      routeStarted: false,
      mainBookingSucceeded: false,
    };
    const bookingAck = observeOriginalBookingAck(
      Promise.race([originalResponse, browserResponseDeadline.promise]),
      () => ({
        url: bookingUrl,
        runtimeSha: runtime,
        journal: bookingState.journal,
        quote: bookingState.quote,
      }),
      (id) => {
        bindings.orderId = id;
      },
      evidence,
    );
    void bookingAck.catch(() => undefined);
    const quotesById = new Map([["quote-main", proposal("quote-main")]]);
    const checkpoint = vi.fn(async () => undefined);
    Object.assign(bindings, {
      page: p.page,
      expect: p.expect,
      origins: { referral: origin },
      finalizer: { checkpoint },
      mainBooking: new OriginalBookingOperation("main-original-booking"),
      NATIVE_REQUEST_TIMEOUT_MS,
      settleOriginalBookingOperation,
      closeOriginalBookingOperation,
      bookingAck,
      originalRouteFinished,
      finishOriginalRoute,
      resolveOriginalResponse,
      rejectOriginalResponse,
      observedQuoteTasks: [] as Promise<unknown>[],
      quotesById,
      bookingState,
      text,
      object,
      requireFact,
      BookingWriteJournal,
      definition: "b".repeat(40),
      runtime,
      nonce: "synthetic-main",
      ENTRY,
      SUBJECT,
      pickupAddress,
      dropoffAddress,
      passengerName,
      phone,
      DIRECTORY: "/synthetic",
      persistPrivateJson: async (path: string) => {
        writes.push(path);
      },
      settleRoutedOriginalBookingAck,
      originalBookingRouteFailure,
      evidence,
    });
    const handler = compile<Handler>(mainRouteHandler, bindings);
    const caller = compile<() => Promise<void>>(mainCaller, bindings);
    const raw = command("quote-main", "main-own-key");
    return {
      ...p,
      bindings,
      bookingState,
      writes,
      checkpoint,
      browserResponseDeadline,
      raw,
      register: () => p.page.route(bookingUrl, handler),
      postOnce: () => p.post(raw, "main-own-key"),
      run: () => caller(),
      operation: bindings.mainBooking as OriginalBookingOperation,
    };
  }
  const timeoutError = () =>
    Object.assign(new Error("private native URL"), { name: "TimeoutError" });

  it.each(["POST while the click is pending", "POST after the click settled"])(
    "main: an observation failed before the route started never lets a late first POST out (%s)",
    async (order) => {
      const h = mainHarness();
      await h.register();
      const click = deferred<void>();
      h.setClick(() => click.promise);
      h.browserResponseDeadline.reject(timeoutError());
      await expect(h.run()).rejects.toThrow(
        "booking-response-wait:TimeoutError",
      );
      expect(h.operation.open).toBe(false);
      expect(h.bindings.routeStarted).toBe(false);
      if (order === "POST after the click settled") {
        click.reject(new Error("private late click detail"));
        await turns();
      }
      await h.postOnce();
      if (order === "POST while the click is pending") {
        click.resolve();
        await turns();
        await h.postOnce(); // still guarded after the click settled
      }
      expect(h.routes()).toBe(1);
      expect(h.counts).toMatchObject({
        network: 0,
        fetches: 0,
        unroutes: 0,
      });
      expect(h.counts.aborts).toBeGreaterThan(0);
      expect(h.bookingState).toEqual({});
      expect(h.writes).toEqual([]);
      expect(h.bindings.orderId).toBeUndefined();
      // Only the page's own close drops the closed guard.
      h.close();
      expect(h.routes()).toBe(0);
    },
  );

  it("main: a route held in its quote drain is left at the 15s budget and resumes with no state", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const h = mainHarness();
      await h.register();
      const quote = deferred<unknown>();
      (h.bindings.observedQuoteTasks as Promise<unknown>[]).push(quote.promise);
      let route: Promise<void> | undefined;
      h.setClick(async () => {
        route = h.postOnce();
      });
      h.browserResponseDeadline.reject(timeoutError());
      const outcome = h.run();
      const rejected = expect(outcome).rejects.toThrow(
        "booking-response-wait:TimeoutError",
      );
      await turns();
      // Route started: the caller drains it, but only within its budget.
      expect(h.bindings.routeStarted).toBe(true);
      vi.advanceTimersByTime(NATIVE_REQUEST_TIMEOUT_MS);
      await rejected;
      expect(h.operation.open).toBe(false);
      quote.resolve(proposal("quote-main"));
      await route;
      expect(h.bookingState).toEqual({});
      expect(h.writes).toEqual([]);
      expect(h.counts).toMatchObject({ fetches: 0, network: 0, aborts: 1 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("main: a normal click/ACK sends once, keeps the raw body/key and unroutes", async () => {
    const h = mainHarness();
    await h.register();
    h.setResponder(async () => ack("order-main", "quote-main"));
    h.setClick(async () => {
      void h.postOnce();
    });
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.bindings.orderId).toBe("order-main");
    expect(h.bookingState.journal?.current).toMatchObject({
      state: "acknowledged",
      orderId: "order-main",
      body: h.raw,
      idempotencyKey: "main-own-key",
    });
    expect(h.counts).toMatchObject({
      fetches: 1,
      fulfills: 1,
      network: 0,
      unroutes: 1,
    });
    expect(h.routes()).toBe(0);
    expect(h.operation.open).toBe(false);
  });

  it("main: a failed click drains the genuine late ACK first, then refuses any second POST", async () => {
    const h = mainHarness();
    await h.register();
    const server = deferred<Buffer>();
    h.setResponder(() => server.promise);
    h.setClick(async () => {
      void h.postOnce();
      throw new Error("private selector");
    });
    const outcome = h.run();
    const rejected = expect(outcome).rejects.toThrow("booking-ui-click:Error");
    await turns();
    expect(h.counts.fetches).toBe(1);
    server.resolve(ack("order-main", "quote-main"));
    await rejected;
    expect(h.bindings.orderId).toBe("order-main");
    expect(h.bookingState.journal?.current).toMatchObject({
      state: "acknowledged",
      body: h.raw,
      idempotencyKey: "main-own-key",
    });
    expect(h.routes()).toBe(1);
    await h.postOnce();
    expect(h.counts).toMatchObject({ fetches: 1, network: 0, aborts: 1 });
  });

  it.each([
    ["setup", "toBeDisabled"],
    ["finalizer checkpoint", "checkpoint"],
  ])(
    "main: a %s failure closes before any click and still guards a stray POST",
    async (_label, port) => {
      const h = mainHarness();
      await h.register();
      const failure = new JourneyFailure(`synthetic ${port} refusal`);
      if (port === "checkpoint") h.checkpoint.mockRejectedValueOnce(failure);
      else h.failures[port] = failure;
      const click = vi.fn(async () => undefined);
      h.setClick(click);
      await expect(h.run()).rejects.toBe(failure);
      expect(click).not.toHaveBeenCalled();
      expect(h.operation.open).toBe(false);
      await h.postOnce();
      expect(h.counts).toMatchObject({ network: 0, fetches: 0, aborts: 1 });
      expect(h.routes()).toBe(1);
    },
  );

  function supplementalHarness(
    options: { clock?: () => number; evidence?: Evidence } = {},
  ) {
    const p = fakePage();
    const writes: string[] = [];
    const operations: OriginalBookingOperation[] = [];
    const evidence = options.evidence ?? new Evidence();
    const extraBookings: Record<string, unknown>[] = [];
    const controlledOrderIds: string[] = [];
    const checkpoint = vi.fn(async () => undefined);
    const bindings: Record<string, unknown> = {
      extraBookings,
      controlledOrderIds,
      completedOrderId: "order-main",
      assertNoForeignActive: () => undefined,
      referral: async () => ({ data: {} }),
      origins: { referral: origin },
      ENTRY,
      SUBJECT,
      pickupAddress,
      dropoffAddress,
      passengerName,
      phone,
      runtime,
      definition: "b".repeat(40),
      nonce: "synthetic-extra",
      feesReadback: { disclosureVersion: feeVersion, contentHash: feeHash },
      supplementalArtifacts: {
        bookingJournals: new Proxy(
          {},
          { get: (_t, name) => `/synthetic/${String(name)}-journal.json` },
        ),
      },
      DIRECTORY: "/synthetic",
      persistPrivateJson: async (path: string) => {
        writes.push(path);
      },
      page: p.page,
      expect: p.expect,
      finalizer: { checkpoint },
      object,
      text,
      requireFact,
      // The actual operation class; only its clock is controllable and each
      // instance is retained for inspection.
      OriginalBookingOperation: class extends OriginalBookingOperation {
        constructor(label: string) {
          super(label, options.clock);
          operations.push(this);
        }
      },
      closeOriginalBookingOperation,
      clickAndSettleOriginalBookingAck,
      originalBookingRouteFailure,
      observeOriginalBookingAck,
      settleRoutedOriginalBookingAck,
      BookingWriteJournal,
      evidence,
    };
    const book = compile<(name: string) => Promise<Record<string, unknown>>>(
      bookExtraFromUI,
      bindings,
    );
    return {
      ...p,
      writes,
      extraBookings,
      controlledOrderIds,
      checkpoint,
      operations,
      evidence,
      book,
      raw: (quoteId: string, key: string) => command(quoteId, key),
    };
  }
  const budgetClock = () =>
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  it.each(["POST while the click is pending", "POST after the click failed"])(
    "supplemental: an expired 25s operation never lets a late first POST out (%s)",
    async (order) => {
      budgetClock();
      try {
        const h = supplementalHarness();
        const click = deferred<void>();
        h.setClick(() => click.promise);
        const outcome = h.book("reservation-1");
        const rejected = expect(outcome).rejects.toThrow(
          order === "POST after the click failed"
            ? "booking-ui-click:Error"
            : "supplemental-original-booking-timeout",
        );
        await turns();
        if (order === "POST after the click failed")
          click.reject(new Error("private late click detail"));
        await turns();
        vi.advanceTimersByTime(25_000);
        await rejected;
        expect(h.routes()).toBe(1);
        await h.post(h.raw("quote-extra", "extra-key"), "extra-key");
        click.resolve();
        await turns();
        await h.post(h.raw("quote-extra", "extra-key"), "extra-key");
        expect(h.counts).toMatchObject({
          network: 0,
          fetches: 0,
          aborts: 2,
          unroutes: 0,
          offs: 1,
        });
        expect(h.extraBookings).toEqual([
          { name: "reservation-1", actions: [] },
        ]);
        expect(h.writes).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("supplemental: a handler resumed from its quote drain after close changes no state", async () => {
    budgetClock();
    try {
      const h = supplementalHarness();
      const json = deferred<unknown>();
      h.setClick(async () => {
        h.quoteResponse(json.promise);
        void h.post(h.raw("quote-extra", "extra-key"), "extra-key");
      });
      const outcome = h.book("reservation-1");
      const rejected = expect(outcome).rejects.toThrow(
        "supplemental-original-booking-timeout",
      );
      await turns();
      vi.advanceTimersByTime(25_000);
      await rejected;
      json.resolve({ data: proposal("quote-extra") });
      await turns();
      expect(h.extraBookings).toEqual([{ name: "reservation-1", actions: [] }]);
      expect(h.writes).toEqual([]);
      expect(h.counts).toMatchObject({ fetches: 0, network: 0, aborts: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("supplemental: a later operation on the same page is not touched by an old closed guard", async () => {
    budgetClock();
    try {
      const h = supplementalHarness();
      const click = deferred<void>();
      h.setClick(() => click.promise);
      const failed = expect(h.book("reservation-1")).rejects.toThrow(
        "supplemental-original-booking-timeout",
      );
      await turns();
      vi.advanceTimersByTime(25_000);
      await failed;
      h.setResponder(async () => ack("order-extra", "quote-extra"));
      h.setClick(async () => {
        h.quoteResponse(Promise.resolve({ data: proposal("quote-extra") }));
        void h.post(h.raw("quote-extra", "extra-key-2"), "extra-key-2");
      });
      const booked = await h.book("reservation-2");
      expect(booked).toMatchObject({
        name: "reservation-2",
        orderId: "order-extra",
        actions: ["booking"],
      });
      expect((booked.journal as BookingWriteJournal).current).toMatchObject({
        state: "acknowledged",
        body: h.raw("quote-extra", "extra-key-2"),
        idempotencyKey: "extra-key-2",
      });
      expect(h.controlledOrderIds).toEqual(["order-extra"]);
      // The successful operation unrouted its own handler; the old closed
      // guard remains and was never invoked.
      expect(h.counts).toMatchObject({ fetches: 1, aborts: 0, unroutes: 1 });
      expect(h.routes()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Diagnostics for the existing 25s deadline after a durable ACK: each window
  // below ends in the same original failure; only the frozen safe phase trace
  // in journey evidence identifies which real await was still outstanding.
  const phaseEvidence = (evidence: Evidence) =>
    evidence.events.filter((e) =>
      /^supplemental-original-booking-(phase|expired-pending|closed-pending)/.test(
        e.stage,
      ),
    );
  const pendingStages = (evidence: Evidence) =>
    phaseEvidence(evidence)
      .map((e) => e.stage)
      .filter((stage) => stage.includes("-pending:"));
  const transitions = (evidence: Evidence) =>
    phaseEvidence(evidence)
      .map((e) => e.stage)
      .filter((stage) => stage.includes("-phase:"))
      .map((stage) => stage.split(":")[1]);
  type AfterAckWindow =
    | "release"
    | "dispose"
    | "click"
    | "unroute"
    | "quote-drain";
  async function expireAfterDurableAck(
    window: AfterAckWindow,
    options: Parameters<typeof supplementalHarness>[0] = {},
  ) {
    const h = supplementalHarness(options);
    const raw = h.raw("quote-extra", "extra-key");
    h.setResponder(async () => ack("order-extra", "quote-extra"));
    // The one held real await; the test may let it settle after the deadline.
    const late = deferred<void>();
    const held = () => late.promise;
    if (window === "release") h.holds.fulfill = held;
    if (window === "dispose") h.holds.dispose = held;
    if (window === "unroute") h.holds.unroute = held;
    h.setClick(async () => {
      h.quoteResponse(Promise.resolve({ data: proposal("quote-extra") }));
      void h.post(raw, "extra-key");
      // Observed after the route consumed its quote: only the final drain
      // waits for it.
      if (window === "quote-drain")
        h.quoteResponse(
          late.promise.then(() => ({ data: proposal("quote-extra") })),
        );
      if (window === "click") await late.promise;
    });
    const outcome = h.book("reservation-2");
    const rejected = outcome.then(
      () => undefined,
      (error: unknown) => error,
    );
    await turns();
    vi.advanceTimersByTime(25_000);
    const error = await rejected;
    await turns();
    return { h, error, raw, late };
  }

  it("supplemental: windows after a durable ACK keep one original timeout and report the exact outstanding phase", async () => {
    budgetClock();
    try {
      const expected: Record<AfterAckWindow, string> = {
        release: "release",
        dispose: "dispose",
        click: "click",
        unroute: "unroute",
        "quote-drain": "quote-drain",
      };
      const seen: Record<string, string[]> = {};
      for (const window of Object.keys(expected) as AfterAckWindow[]) {
        const unhandled = await collectUnhandled(async () => {
          const { h, error, raw, late } = await expireAfterDurableAck(window);
          // The identical original failure and budget; durable ACK is not UI
          // success and nothing is retried or relaxed.
          expect(error).toBeInstanceOf(JourneyFailure);
          expect((error as JourneyFailure).stage).toBe(
            "supplemental-original-booking-timeout",
          );
          expect(h.counts.fetches).toBe(1);
          expect(h.counts.network).toBe(0);
          const state = h.extraBookings[0] as {
            actions: string[];
            journal: BookingWriteJournal;
          };
          expect(state.actions).toEqual(["booking"]);
          expect(state.journal.current).toMatchObject({
            state: "acknowledged",
            orderId: "order-extra",
            body: raw,
            idempotencyKey: "extra-key",
          });
          // Only a completed click/ACK join reached the existing custody
          // bookkeeping before its drain; the return itself never happened.
          expect(h.controlledOrderIds).toEqual(
            window === "unroute" || window === "quote-drain"
              ? ["order-extra"]
              : [],
          );
          expect(transitions(h.evidence)).toContain("ack-durable");
          seen[window] = pendingStages(h.evidence);
          // The held await settling after the deadline is not retained in
          // the frozen trace, and a stray POST is still not sent.
          const before = phaseEvidence(h.evidence);
          const frozen = h.operations[0]!.phases();
          late.resolve();
          await turns();
          await h.post(raw, "extra-key");
          await turns();
          expect(phaseEvidence(h.evidence)).toEqual(before);
          expect(h.operations[0]!.phases()).toEqual(frozen);
          expect(h.counts.fetches).toBe(1);
          expect(vi.getTimerCount()).toBe(0);
        });
        expect(unhandled).toEqual([]);
      }
      expect(seen).toEqual(
        Object.fromEntries(
          Object.entries(expected).map(([window, pending]) => [
            window,
            [`supplemental-original-booking-expired-pending:${pending}`],
          ]),
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["release", "refused"],
    ["dispose", "refused"],
    ["release", "malformed"],
    ["dispose", "malformed"],
  ] as const)(
    "supplemental: settled observer refusal held at %s (%s response) reports its real pending phase",
    async (window, responseKind) => {
      budgetClock();
      try {
        const unhandled = await collectUnhandled(async () => {
          const h = supplementalHarness();
          const raw = h.raw("quote-extra", "extra-key");
          const bytes =
            responseKind === "refused"
              ? Buffer.from(
                  JSON.stringify({
                    ok: false,
                    error: {
                      code: "CONFLICT",
                      message: "private-refusal-payload",
                    },
                  }),
                )
              : Buffer.from("{private-malformed-payload");
          const observationStage =
            responseKind === "refused"
              ? "booking-response-http"
              : "booking-response-json:SyntaxError";
          if (responseKind === "refused") h.setResponseStatus(409);
          h.setResponder(async () => bytes);
          const late = deferred<void>();
          if (window === "release") h.holds.fulfill = () => late.promise;
          else h.holds.dispose = () => late.promise;
          h.setClick(async () => {
            h.quoteResponse(Promise.resolve({ data: proposal("quote-extra") }));
            void h.post(raw, "extra-key");
          });
          const outcome = h.book("reservation-2");
          const rejected = outcome.then(
            () => undefined,
            (error: unknown) => error,
          );
          await turns();
          expect(h.counts.fetches).toBe(1);
          expect(h.fulfilledBodies).toEqual([bytes]);
          const state = h.extraBookings[0] as {
            actions: string[];
            journal: BookingWriteJournal;
          };
          expect(state.actions).toEqual(["booking"]);
          expect(state.journal.current).toMatchObject({
            state: "ack_unknown",
            body: raw,
            idempotencyKey: "extra-key",
          });
          expect(h.evidence.events.map((e) => e.stage)).toContain(
            observationStage,
          );
          vi.advanceTimersByTime(25_000);
          const error = await rejected;
          expect(error).toBeInstanceOf(JourneyFailure);
          expect((error as JourneyFailure).stage).toBe(
            "supplemental-original-booking-timeout",
          );
          expect(pendingStages(h.evidence)).toEqual([
            `supplemental-original-booking-expired-pending:${window}`,
          ]);
          expect(transitions(h.evidence)).toContain("ack-rejected");
          expect(transitions(h.evidence)).not.toContain("ack-durable");
          expect(h.controlledOrderIds).toEqual([]);
          expect(h.routes()).toBe(1);
          expect(h.counts).toMatchObject({
            fetches: 1,
            fulfills: 1,
            network: 0,
            unroutes: 0,
            offs: 1,
          });
          const before = phaseEvidence(h.evidence);
          const frozen = h.operations[0]!.phases();
          expect(frozen.frozenBy).toBe("expired");
          expect(frozen.pending).toEqual([window]);
          expect(JSON.stringify(before)).not.toMatch(
            /private-refusal-payload|private-malformed-payload/,
          );
          late.resolve();
          await turns();
          await h.post(raw, "extra-key");
          await turns();
          expect(phaseEvidence(h.evidence)).toEqual(before);
          expect(h.operations[0]!.phases()).toEqual(frozen);
          expect(h.counts).toMatchObject({
            fetches: 1,
            network: 0,
            aborts: 2,
          });
          expect(vi.getTimerCount()).toBe(0);
        });
        expect(unhandled).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("supplemental: the recorded phase order follows the actual helpers and stays credential-free", async () => {
    budgetClock();
    try {
      const { h } = await expireAfterDurableAck("click");
      expect(transitions(h.evidence)).toEqual([
        "armed",
        "ack-durable",
        "release-completed",
        "dispose-completed",
        "handler-finished",
      ]);
      const unrouted = await expireAfterDurableAck("unroute");
      // The click settled first (it only emits the POST), then the route.
      expect(transitions(unrouted.h.evidence)).toEqual([
        "armed",
        "click-settled",
        "ack-durable",
        "release-completed",
        "dispose-completed",
        "handler-finished",
        "join-completed",
        "drain-started",
      ]);
      for (const event of phaseEvidence(unrouted.h.evidence)) {
        expect(Object.keys(event).sort()).toEqual(
          event.stage.includes("-phase:")
            ? ["phaseElapsedMs", "result", "stage"]
            : ["stage"],
        );
        if (event.phaseElapsedMs !== undefined) {
          expect(Number.isInteger(event.phaseElapsedMs)).toBe(true);
          expect(event.phaseElapsedMs).toBeGreaterThanOrEqual(0);
          expect(event.phaseElapsedMs).toBeLessThanOrEqual(3_600_000);
        }
      }
      const serialized = JSON.stringify(phaseEvidence(unrouted.h.evidence));
      for (const secret of [
        "order-extra",
        "extra-key",
        "quote-extra",
        bookingUrl,
        passengerName,
        phone,
        pickupAddress,
      ])
        expect(serialized).not.toContain(secret);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supplemental: a completed click/ACK/drain returns with no false timeout or phase failure evidence", async () => {
    budgetClock();
    try {
      const h = supplementalHarness();
      h.setResponder(async () => ack("order-extra", "quote-extra"));
      h.setClick(async () => {
        h.quoteResponse(Promise.resolve({ data: proposal("quote-extra") }));
        void h.post(h.raw("quote-extra", "extra-key"), "extra-key");
      });
      const booked = await h.book("reservation-2");
      expect(booked).toMatchObject({
        orderId: "order-extra",
        actions: ["booking"],
      });
      expect(h.controlledOrderIds).toEqual(["order-extra"]);
      expect(phaseEvidence(h.evidence)).toEqual([]);
      const phases = h.operations[0]!.phases();
      expect(phases.frozenBy).toBe("closed");
      expect(phases.pending).toEqual([]);
      expect(phases.transitions.map((t) => t.transition)).toEqual([
        "armed",
        "click-settled",
        "ack-durable",
        "release-completed",
        "dispose-completed",
        "handler-finished",
        "join-completed",
        "drain-started",
        "unroute-completed",
        "quote-drain-completed",
        "drain-completed",
      ]);
      expect(h.counts).toMatchObject({ fetches: 1, fulfills: 1, unroutes: 1 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supplemental: a failing phase clock or evidence sink never changes the original outcome", async () => {
    budgetClock();
    try {
      const clocked = await expireAfterDurableAck("click", {
        clock: () => {
          throw new Error("private clock failure");
        },
      });
      expect((clocked.error as JourneyFailure).stage).toBe(
        "supplemental-original-booking-timeout",
      );
      expect(pendingStages(clocked.h.evidence)).toEqual([
        "supplemental-original-booking-expired-pending:click",
      ]);
      expect(
        phaseEvidence(clocked.h.evidence).every(
          (e) => e.phaseElapsedMs === undefined,
        ),
      ).toBe(true);
      // The existing ACK evidence still records; only phase events refuse.
      const refusing = new Evidence();
      const record = refusing.record.bind(refusing);
      refusing.record = (event) => {
        if (/-(phase|pending):/.test(event.stage))
          throw new JourneyFailure("evidence field not allowlisted");
        record(event);
      };
      const unhandled = await collectUnhandled(async () => {
        const sunk = await expireAfterDurableAck("release", {
          evidence: refusing,
        });
        expect((sunk.error as JourneyFailure).stage).toBe(
          "supplemental-original-booking-timeout",
        );
        expect(sunk.h.operations[0]!.phases().pending).toEqual(["release"]);
        expect(phaseEvidence(refusing)).toEqual([]);
        expect(refusing.events.map((e) => e.stage)).toContain(
          "booking-ack-durable",
        );
        expect(sunk.h.counts.fetches).toBe(1);
      });
      expect(unhandled).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supplemental: a setup failure before the 25s arm exits with pending quote json", async () => {
    budgetClock();
    try {
      const h = supplementalHarness();
      const failure = new JourneyFailure("synthetic toBeEnabled refusal");
      h.failures.toBeEnabled = failure;
      // A quote response observed during form filling never finishes.
      h.page.locator = ((original) => (selector: string) => {
        const locator = original(selector);
        return {
          ...locator,
          fill: async () => {
            h.quoteResponse(new Promise(() => undefined));
            return undefined;
          },
        };
      })(h.page.locator);
      await expect(h.book("reservation-1")).rejects.toBe(failure);
      expect(h.routes()).toBe(0);
      expect(h.counts).toMatchObject({ offs: 1, unroutes: 0, network: 0 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

describe("original booking operation phase trace is bounded and observational", () => {
  it("freezes at the deadline with bounded elapsed ms and drops later transitions", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let now = 1_000;
      const operation = new OriginalBookingOperation(
        "supplemental-original-booking",
        () => now,
      );
      operation.arm(25_000);
      now += 40;
      operation.mark("ack-durable");
      operation.mark("ack-durable"); // first occurrence only
      now += 3_600_001;
      operation.mark("click-settled"); // beyond the bound: no elapsed kept
      vi.advanceTimersByTime(25_000);
      expect(operation.open).toBe(false);
      operation.mark("release-completed");
      operation.close();
      expect(operation.phases()).toEqual({
        frozenBy: "expired",
        transitions: [
          { transition: "armed", elapsedMs: 0 },
          { transition: "ack-durable", elapsedMs: 40 },
          { transition: "click-settled" },
        ],
        pending: ["release"],
      });
      const evidence = new Evidence();
      for (const event of operation.phaseEvents()) evidence.record(event);
      expect(evidence.events.map((e) => e.stage)).toEqual([
        "supplemental-original-booking-phase:armed",
        "supplemental-original-booking-phase:ack-durable",
        "supplemental-original-booking-phase:click-settled",
        "supplemental-original-booking-expired-pending:release",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps each helper outcome when its phase observer throws", async () => {
    const throwing = () => {
      throw new Error("observer failure");
    };
    const s = await setup();
    const bytes = Buffer.from(JSON.stringify(s.body));
    const release = vi.fn(async () => undefined);
    await expect(
      settleRoutedOriginalBookingAck(
        { ...s.response, body: async () => bytes },
        s.response.request(),
        (original) => s.observe(Promise.resolve(original)),
        release,
        throwing,
      ),
    ).resolves.toEqual({ orderId: "order-own", quoteId: "quote-own" });
    expect(release).toHaveBeenCalledTimes(1);
    expect(s.journal.current?.state).toBe("acknowledged");
    await expect(
      clickAndSettleOriginalBookingAck(
        async () => undefined,
        Promise.resolve("joined"),
        undefined,
        throwing,
      ),
    ).resolves.toBe("joined");
    const clickFailure = new JourneyFailure("booking-ui-click:Error");
    await expect(
      clickAndSettleOriginalBookingAck(
        async () => {
          throw clickFailure;
        },
        Promise.resolve("joined"),
        undefined,
        throwing,
      ),
    ).rejects.toBe(clickFailure);
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
