import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

// Observe the existing application's singleton, never substitute a storage or
// guard. Only this disposable hosted acceptance app installs these hooks. No
// global timers, policy, request headers, counters or return values are changed.
export function observeCapacityThrottle(storage, runTag, maxEvents = 100000) {
  if (
    !(storage?.storage instanceof Map) ||
    typeof storage.increment !== "function" ||
    typeof runTag !== "string" ||
    !runTag ||
    !Number.isSafeInteger(maxEvents) ||
    maxEvents < 1 ||
    maxEvents > 100000
  )
    throw new Error("Unsupported capacity throttle observation boundary");
  const entries = storage.storage;
  const context = new AsyncLocalStorage();
  const start = performance.now();
  const events = [];
  const restores = [];
  const watched = new WeakSet();
  let generation = 0;
  let calls = 0;
  let inboundRequests = 0;
  let completedResponses = 0;
  let correlatedCalls = 0;
  let dropped = 0;
  let recordingFailures = 0;
  let restorationFailures = 0;
  let depth = 0;
  let stopped = false;
  const hash = (value) =>
    createHash("sha256").update(`${runTag}:${value}`).digest("hex");
  const requestContext = () => {
    const incoming = context.getStore();
    if (!incoming) return null;
    const identity = incoming.request.identity;
    return {
      requestId: incoming.requestId,
      inboundMs: incoming.inboundMs,
      route: incoming.route,
      identityHash: identity
        ? hash(
            JSON.stringify([
              identity.realm,
              identity.actorType,
              identity.actorId,
              identity.tenantId,
            ]),
          )
        : null,
    };
  };
  // A diagnostic fault must not overwrite an application's result or rejection.
  const record = (makeEvent) => {
    if (stopped) return;
    if (events.length >= maxEvents) {
      dropped++;
      return;
    }
    try {
      events.push({
        observedMs: performance.now() - start,
        observedAt: new Date().toISOString(),
        ...makeEvent(),
      });
    } catch {
      recordingFailures++;
    }
  };
  const replace = (target, name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
    restores.push(() => {
      if (target[name] !== value)
        throw new Error(
          `Capacity observer hook changed before restore: ${name}`,
        );
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else if (!Reflect.deleteProperty(target, name))
        throw new Error(`Capacity observer could not restore ${name}`);
    });
  };
  const state = (key, name) => {
    const entry = entries.get(key);
    return entry
      ? {
          totalHits: entry.totalHits.get(name),
          expiresAt: entry.expiresAt,
          blockExpiresAt: entry.blockExpiresAt,
          isBlocked: entry.isBlocked,
        }
      : null;
  };
  const watch = (key, entry) => {
    if (watched.has(entry.totalHits)) return;
    // Bound both the trace and the number of installed hooks. A truncated trace
    // remains a failed diagnostic, never a complete causal observation.
    if (generation >= 12000) {
      dropped++;
      return;
    }
    const entryGeneration = ++generation;
    const originalSet = entry.totalHits.set;
    replace(entry.totalHits, "set", function (name, hits) {
      const previous = this.get(name);
      const result = originalSet.call(this, name, hits);
      record(() => ({
        kind: "capacity_throttle_hits",
        keyHash: hash(key),
        name,
        generation: entryGeneration,
        currentEntry: entries.get(key) === entry,
        previous,
        totalHits: hits,
        cause:
          depth > 0
            ? hits === 0 && previous > 0
              ? "block_reset"
              : "increment"
            : hits === previous - 1
              ? "expiration"
              : "outside_increment",
        context: requestContext(),
      }));
      return result;
    });
    watched.add(entry.totalHits);
  };
  const originalEntrySet = entries.set;
  const originalIncrement = storage.increment;
  try {
    for (const [key, entry] of entries) watch(key, entry);
    replace(entries, "set", function (key, entry) {
      // Observe only after the actual write succeeds; instrumentation cannot
      // turn a successful storage write into a thrown application failure.
      const result = originalEntrySet.call(this, key, entry);
      try {
        watch(key, entry);
      } catch {
        recordingFailures++;
      }
      return result;
    });
    replace(storage, "increment", function (...args) {
      const [key, ttl, limit, blockDuration, name] = args;
      const call = ++calls;
      if (context.getStore()) correlatedCalls++;
      record(() => ({
        kind: "capacity_throttle_call",
        call,
        keyHash: hash(key),
        ttl,
        limit,
        blockDuration,
        name,
        before: state(key, name),
        context: requestContext(),
      }));
      let result;
      depth++;
      try {
        result = originalIncrement.apply(this, args);
      } catch (error) {
        record(() => ({ kind: "capacity_throttle_throw", call }));
        throw error;
      } finally {
        depth--;
      }
      record(() => ({
        kind: "capacity_throttle_return",
        call,
        afterCall: state(key, name),
      }));
      // Preserve the exact original promise and rejection. The tap has no
      // asynchronous work, no new timer, and cannot throw into the application.
      try {
        result.then(
          (value) =>
            record(() => ({
              kind: "capacity_throttle_result",
              call,
              result: {
                totalHits: value.totalHits,
                timeToExpire: value.timeToExpire,
                isBlocked: value.isBlocked,
                timeToBlockExpire: value.timeToBlockExpire,
              },
              atSettlement: state(key, name),
            })),
          () => record(() => ({ kind: "capacity_throttle_rejection", call })),
        );
      } catch {
        recordingFailures++;
      }
      return result;
    });
  } catch (error) {
    const failures = [error];
    for (const restore of restores.reverse()) {
      try {
        restore();
      } catch (restoreError) {
        failures.push(restoreError);
      }
    }
    context.disable();
    throw new AggregateError(failures, "Capacity observer setup failed");
  }
  const summary = () => ({
    storageType: storage.constructor.name,
    calls,
    inboundRequests,
    completedResponses,
    correlatedCalls,
    events: events.length,
    observedEntries: generation,
    dropped,
    recordingFailures,
    restorationFailures,
    stopped,
    complete:
      stopped &&
      calls > 0 &&
      dropped === 0 &&
      recordingFailures === 0 &&
      restorationFailures === 0,
    scope:
      "Actual singleton calls and hit mutations; owned inbound requests only. No historical 429 inference or capacity credit.",
  });
  return {
    middleware(request, response, next) {
      const requestId = request.headers?.["x-request-id"];
      if (
        stopped ||
        typeof requestId !== "string" ||
        !requestId.startsWith(`${runTag}-`) ||
        requestId.length > 200
      )
        return next();
      inboundRequests++;
      const route = (request.url ?? "").split("?")[0];
      const incoming = {
        request,
        requestId,
        inboundMs: performance.now() - start,
        route: /^\/api\/orders\/[^/]+\/dispatch$/.test(route)
          ? "/api/orders/{orderId}/dispatch"
          : [
                "/api/orders",
                "/api/tenant/bookings",
                "/api/reports/jobs",
              ].includes(route)
            ? route
            : "other",
      };
      return context.run(incoming, () => {
        record(() => ({ kind: "capacity_inbound", context: requestContext() }));
        response.once("finish", () => {
          if (!stopped) completedResponses++;
          record(() => ({
            kind: "capacity_response",
            requestId,
            httpStatus: response.statusCode,
          }));
        });
        return next();
      });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const failures = [];
      for (const restore of restores.reverse()) {
        try {
          restore();
        } catch (error) {
          restorationFailures++;
          failures.push(error);
        }
      }
      context.disable();
      if (failures.length)
        throw new AggregateError(
          failures,
          "Capacity observer restoration failed",
        );
    },
    assertComplete({ requireOwnedTraffic = false } = {}) {
      if (
        !summary().complete ||
        (requireOwnedTraffic &&
          (inboundRequests === 0 ||
            correlatedCalls === 0 ||
            completedResponses !== inboundRequests))
      )
        throw new Error("Capacity throttle observation incomplete");
    },
    summary,
    snapshot: () => ({ ...summary(), trace: events.slice() }),
  };
}
