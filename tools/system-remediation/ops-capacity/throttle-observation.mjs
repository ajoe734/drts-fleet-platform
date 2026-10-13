import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { BASELINE_PER_MINUTE } from "./plan-builder.mjs";

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
  const startedAt = new Date().toISOString();
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
  // Admission is opt-in for this hosted producer. Reservations represent HTTP
  // requests not yet counted by the genuine guard, not extra limiter tokens.
  // Read the actual singleton counters; only its own callbacks release hits.
  const admissions = new Map();
  const families = new Map();
  const waiters = new Map();
  let admissionFailure = null;
  const notifyAdmission = (key) => {
    for (const [name, family] of families)
      if (family.key === key) waiters.get(name)?.forEach((wake) => wake());
  };
  const failAdmission = (message) => {
    admissionFailure ??= `Capacity admission feedback: ${message}`;
  };
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
  const observeAdmission = (key, ttl, limit, name, guardMs, incoming) => {
    const receipt = admissions.get(incoming?.requestId);
    if (!receipt) {
      if ([...families.values()].some((family) => family.key === key))
        failAdmission("unreserved request reached a measured key");
      return;
    }
    const family = families.get(receipt.family);
    if (receipt.guardMs !== null) {
      failAdmission("request reached the guard more than once");
      return;
    }
    const identityHash = incoming.identityHash;
    if (
      ttl !== 60000 ||
      limit !== BASELINE_PER_MINUTE[receipt.family] ||
      name !== "default" ||
      !identityHash ||
      (family.key !== null &&
        (family.key !== key || family.identityHash !== identityHash)) ||
      [...families.values()].some(
        (other) => other !== family && other.key === key,
      )
    )
      failAdmission("measured key, identity or policy changed");
    family.key ??= key;
    family.identityHash ??= identityHash;
    family.pending--;
    family.guardTimes.push(guardMs);
    receipt.guardMs = guardMs;
    receipt.keyHash = hash(key);
    receipt.name = name;
    const actual = state(key, name);
    if (!actual || actual.isBlocked)
      failAdmission("actual measured key is blocked or absent");
    notifyAdmission(key);
  };
  const admission = {
    tryReserve(familyName, requestId) {
      if (stopped || dropped || recordingFailures)
        failAdmission("singleton observation stopped or incomplete");
      if (
        !Object.hasOwn(BASELINE_PER_MINUTE, familyName) ||
        typeof requestId !== "string" ||
        !requestId.startsWith(`${runTag}-`) ||
        requestId.length > 200 ||
        admissions.has(requestId)
      )
        failAdmission("invalid or reused reservation identity");
      if (admissionFailure) return { error: admissionFailure };
      let family = families.get(familyName);
      if (!family) {
        family = { key: null, identityHash: null, pending: 0, guardTimes: [] };
        families.set(familyName, family);
      }
      const now = performance.now();
      family.guardTimes = family.guardTimes.filter(
        (time) => now - time < 60000,
      );
      const actual = family.key === null ? null : state(family.key, "default");
      if (
        family.key !== null &&
        (!actual ||
          actual.isBlocked ||
          !Number.isSafeInteger(actual.totalHits) ||
          actual.totalHits < 0)
      ) {
        failAdmission("invalid or blocked actual counter");
        return { error: admissionFailure };
      }
      const limit = BASELINE_PER_MINUTE[familyName];
      if (
        (actual?.totalHits ?? 0) + family.pending >= limit ||
        family.guardTimes.length + family.pending >= limit
      )
        return {
          allowed: false,
          // At the observed rolling boundary, re-read the actual counter. A
          // delayed expiry still owns its slot even after60000ms have elapsed.
          waitMs:
            family.guardTimes.length + family.pending >= limit &&
            family.guardTimes.length
              ? 60000 - (now - family.guardTimes[0])
              : null,
        };
      const receipt = {
        family: familyName,
        reservedMs: now,
        guardMs: null,
        keyHash: null,
        name: null,
        result: null,
        settled: false,
      };
      family.pending++;
      admissions.set(requestId, receipt);
      record(() => ({
        kind: "capacity_admission_reserved",
        requestId,
        ...receipt,
        actualHits: actual?.totalHits ?? null,
        pending: family.pending,
      }));
      return { allowed: true, reservedMs: now };
    },
    waitForChange(familyName, timeoutMs) {
      // Wake on genuine counter/guard observation, or at the exact rolling or
      // admission deadline. No guessed ingress buffer or repeated polling.
      return new Promise((resolve) => {
        let listeners = waiters.get(familyName);
        if (!listeners) {
          listeners = new Set();
          waiters.set(familyName, listeners);
        }
        const wake = () => {
          clearTimeout(timer);
          listeners.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, Math.max(1, timeoutMs));
        listeners.add(wake);
      });
    },
    complete(requestId) {
      const receipt = admissions.get(requestId);
      if (
        !receipt ||
        receipt.settled ||
        receipt.guardMs === null ||
        !receipt.result
      )
        failAdmission("HTTP settled without one matching genuine guard result");
      if (receipt) receipt.settled = true;
      const feedback = { ...receipt, error: admissionFailure };
      record(() => ({
        kind: "capacity_admission_settled",
        requestId,
        ...feedback,
      }));
      // Missing feedback never releases a reservation: the request could still
      // arrive after a transport error. Preserve that error and fail closed.
      return feedback;
    },
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
      notifyAdmission(key);
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
      const guardMs = performance.now();
      let incoming = null;
      try {
        incoming = requestContext();
      } catch {
        recordingFailures++;
        failAdmission("could not correlate genuine guard identity");
      }
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
      try {
        observeAdmission(key, ttl, limit, name, guardMs, incoming);
      } catch {
        failAdmission("could not read genuine guard accounting");
      }
      // Preserve the exact original promise and rejection. The tap has no
      // asynchronous work, no new timer, and cannot throw into the application.
      try {
        result.then(
          (value) => {
            const receipt = admissions.get(incoming?.requestId);
            if (receipt) {
              try {
                receipt.result = {
                  totalHits: value.totalHits,
                  isBlocked: value.isBlocked,
                };
                if (value.isBlocked)
                  failAdmission("genuine guard rejected a measured request");
              } catch {
                failAdmission("could not observe genuine guard result");
              }
            }
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
            }));
          },
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
    clockOriginMs: start,
    startedAt,
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
    admissionFeedback: {
      reserved: admissions.size,
      guardObserved: [...admissions.values()].filter(
        (row) => row.guardMs !== null,
      ).length,
      settled: [...admissions.values()].filter((row) => row.settled).length,
      pending: [...families.values()].reduce(
        (count, family) => count + family.pending,
        0,
      ),
      error: admissionFailure,
    },
    scope:
      "Actual singleton calls and hit mutations; owned inbound requests only. No historical 429 inference or capacity credit.",
  });
  return {
    admission,
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
      for (const listeners of waiters.values())
        listeners.forEach((wake) => wake());
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
