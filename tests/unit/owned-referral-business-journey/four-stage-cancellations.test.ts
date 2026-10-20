import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cancellationResults,
  runFourStageOwnedCancellations,
} from "../../e2e/owned-referral-business-journey/four-stage-cancellations";
import {
  Evidence,
  JourneyFailure,
  hash,
  object,
  requireFact,
  type CallOptions,
  type CallResult,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";

type Ports = Parameters<typeof runFourStageOwnedCancellations>[0];
type Order = ObjectData & {
  orderId: string;
  status: string;
  partnerEntrySlug: string;
  passenger: { passengerId: string };
  createdAt: string;
  cancelableUntil: string;
};
type Task = ObjectData & {
  taskId: string;
  orderId: string;
  driverId: string;
  vehicleId: string;
  assignmentId: string;
  dispatchJobId: string;
  status: string;
};
type Options = {
  foreignActive?: boolean;
  unknownBookingAck?: boolean;
  wrongBookingQuote?: boolean;
  wrongOwner?: boolean;
  ineligible?: boolean;
  lostAssignmentAck?: boolean;
  mutateDenial?: boolean;
  unexpectedCancelSuccess?: boolean;
  completionUnavailable?: boolean;
  repeatedOrderId?: boolean;
  quoteDelta?: ObjectData;
};

/** Stateful external ports only. The complete real helper and protocol/journal
 * execute unchanged; no product, HTTP, PG, physical Driver or browser runs. */
async function fixture(options: Options = {}) {
  const parent =
    process.env.C6_UNIT_OUTPUT ?? join(process.cwd(), ".local/c6-unit-output");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "four-stages-"));
  const evidence = new Evidence();
  const events: Array<{ rail: string; path: string; body?: unknown }> = [];
  const orders = new Map<string, Order>();
  const tasks = new Map<string, Task>();
  const quotes: string[] = [];
  const bookingCommands: ObjectData[] = [];
  let active: string | null = null;
  const results = cancellationResults();
  const passengerId = "controlled-passenger";
  const driverId = "controlled-driver";
  const vehicleId = "controlled-vehicle";
  const entrySlug = "controlled-entry";
  const pickupAddress = "合成上車地址";
  const dropoffAddress = "合成下車地址";
  const clone = <T>(value: T): T => structuredClone(value);
  const get = (id: string) => {
    const row = orders.get(id);
    requireFact(row, "unit actual order required");
    return row;
  };
  const response = (data: unknown, status = 200): CallResult => ({
    status,
    data: clone(data),
    headers: new Headers({ "x-drts-candidate-sha": "b".repeat(40) }),
    bytes: Buffer.from(JSON.stringify(data)),
  });
  const event = (rail: string, path: string, call: CallOptions = {}) => {
    events.push({
      rail,
      path,
      ...(call.body ? { body: clone(call.body) } : {}),
    });
  };
  const cancel = (id: string) => {
    const order = get(id);
    if (order.status !== "cancelled") {
      order.status = "cancelled";
      order.cancelledAt = new Date().toISOString();
    }
    if (active === id) active = null;
    return {
      orderId: id,
      status: order.status,
      cancelledAt: order.cancelledAt,
    };
  };
  const adminControl: Ports["adminControl"] = async (path, call = {}) => {
    event("admin", path, call);
    requireFact(
      path === `/regulatory-registry/drivers/${driverId}/work-state`,
      "unit Admin supply domain only",
    );
    return { driverId, workState: "available" };
  };
  const opsControl: Ports["opsControl"] = async (path, call = {}) => {
    event("ops", path, call);
    if (path.startsWith("/regulatory-registry/"))
      throw new JourneyFailure("unit-existing-Ops-supply-denial", 403);
    let match = /^\/orders\/([^/]+)$/.exec(path);
    if (match) return clone(get(match[1]!));
    match = /^\/orders\/([^/]+)\/dispatch$/.exec(path);
    if (match) return { dispatchJobId: `dispatch-${match[1]}` };
    match =
      /^\/dispatch\/tasks\/([^/]+)\/candidates\?includeIneligible=true$/.exec(
        path,
      );
    if (match)
      return {
        items: [
          {
            driverId,
            vehicleId,
            serviceBuckets: ["business_dispatch"],
            eligibilityDecision: options.ineligible ? "ineligible" : "eligible",
            hardReasonCodes: options.ineligible
              ? ["controlled-unavailable"]
              : [],
            etaMinutes: 2,
          },
        ],
      };
    if (path === "/dispatch/assign") {
      const body = object(call.body),
        job = String(body.dispatchJobId),
        id = job.slice("dispatch-".length);
      requireFact(
        body.driverId === driverId && body.vehicleId === vehicleId,
        "unit same issued pair required",
      );
      const order = get(id);
      order.status = "assigned";
      const task: Task = {
        taskId: `task-${id}`,
        orderId: id,
        driverId,
        vehicleId,
        assignmentId: `assignment-${id}`,
        dispatchJobId: job,
        status: "pending_acceptance",
      };
      tasks.set(task.taskId, task);
      if (options.lostAssignmentAck)
        throw new JourneyFailure("unit-assignment-ACK-lost");
      return { ...clone(task), status: "assigned" };
    }
    throw new JourneyFailure("unit-unexpected-Ops-route");
  };
  const driver: Ports["driver"] = async (path, call = {}) => {
    event("driver", path, call);
    if (path === "/api/driver/tasks")
      return { items: clone([...tasks.values()]) };
    const match = /^\/api\/driver\/tasks\/([^/]+)(?:\/(\w+))?$/.exec(path);
    requireFact(match, "unit normal bound Driver route required");
    const task = tasks.get(match[1]!);
    requireFact(task, "unit actual bound task required");
    const action = match[2];
    if (!action) return clone(task);
    const transition: Record<string, [string, string, string, string]> = {
      accept: [
        "pending_acceptance",
        "accepted",
        "driver_accepted",
        "acceptedAt",
      ],
      depart: ["accepted", "enroute_pickup", "enroute_pickup", "departedAt"],
      arrived_pickup: [
        "enroute_pickup",
        "arrived_pickup",
        "arrived_pickup",
        "arrivedPickupAt",
      ],
      start: ["arrived_pickup", "on_trip", "on_trip", "startedAt"],
      complete: ["on_trip", "completed", "completed", "completedAt"],
    };
    const next = transition[action];
    requireFact(
      next && task.status === next[0],
      "unit ordinary Driver transition required",
    );
    if (action === "complete" && options.completionUnavailable)
      throw new JourneyFailure("unit-completion-unavailable", 503);
    task.status = next[1];
    task[next[3]] = new Date().toISOString();
    const order = get(task.orderId);
    order.status = next[2];
    if (action === "complete") {
      Object.assign(task, object(call.body));
      order.completedAt = task.completedAt;
      if (active === task.orderId) active = null;
    }
    return clone(task);
  };
  const referral: Ports["referral"] = async (path, call = {}) => {
    event("referral", path, call);
    if (path === "/api/referral/active") {
      if (options.foreignActive)
        return response({ active: true, trip: { orderId: "unrelated-order" } });
      return response(
        active
          ? { active: true, trip: clone(get(active)) }
          : { active: false, trip: null },
      );
    }
    if (path === "/api/referral/quote") {
      const id = randomUUID();
      quotes.push(id);
      return response({
        quoteId: id,
        fixedPrice: false,
        isGuaranteed: false,
        timingMode: "immediate",
        requestedScheduledAt: null,
        pickupAddress,
        dropoffAddress,
        ...options.quoteDelta,
      });
    }
    if (path === "/api/referral/booking") {
      const body = object(call.body);
      bookingCommands.push(clone(body));
      requireFact(
        call.headers?.["Idempotency-Key"] === body.idempotencyKey,
        "unit actual original body/header key required",
      );
      const previous = [...orders.keys()][0];
      const id = options.repeatedOrderId && previous ? previous : randomUUID();
      if (!orders.has(id))
        orders.set(id, {
          orderId: id,
          status: "created",
          partnerEntrySlug: entrySlug,
          passenger: {
            passengerId: options.wrongOwner
              ? "unrelated-passenger"
              : passengerId,
          },
          createdAt: new Date().toISOString(),
          cancelableUntil: new Date(Date.now() - 60_000).toISOString(),
          dispatchSemantics: "reservation",
          serviceBucket: "business_dispatch",
          serviceProductCode: null,
          businessDispatchSubtype: "enterprise_dispatch",
          referralPassengerLifecycle: {
            quote: {
              quoteId: body.quoteId,
              serviceProductCode: "enterprise_dispatch",
              businessDispatchSubtype: "enterprise_dispatch",
            },
          },
          fixedPrice: false,
          proofRequirements: { minPhotoCount: 1 },
        });
      active = get(id).status === "created" ? id : null;
      if (options.unknownBookingAck)
        throw new JourneyFailure("unit-booking-response-lost");
      return response({
        orderId: id,
        quote: {
          quoteId: options.wrongBookingQuote ? "different-quote" : body.quoteId,
        },
      });
    }
    let match = /^\/api\/referral\/cancel\/([^/]+)$/.exec(path);
    if (match) {
      const order = get(match[1]!);
      if (!["created", "cancelled"].includes(order.status))
        throw new JourneyFailure(
          "unit-real-policy-denial",
          409,
          "ORDER_NOT_CANCELABLE",
        );
      return response(cancel(order.orderId));
    }
    match = /^\/api\/referral\/history\/([^/]+)$/.exec(path);
    if (match) return response(get(match[1]!));
    if (path === "/api/referral/history")
      return response({
        items: [...orders.values()].filter((row) =>
          ["cancelled", "completed"].includes(row.status),
        ),
      });
    throw new JourneyFailure("unit-unexpected-Referral-route");
  };
  const ports: Ports & { control: Ports["opsControl"] } = {
    definitionSha: "a".repeat(40),
    runtimeSha: "b".repeat(40),
    directory,
    nonce: `controlled-${randomUUID()}`,
    entrySlug,
    partnerUserRef: "controlled-subject",
    passengerId,
    completedMainOrderId: "00000000-0000-4000-8000-000000000001",
    driverId,
    vehicleId,
    pickupAddress,
    dropoffAddress,
    pickup: { latitude: 25, longitude: 121 },
    passengerName: "合成測試乘客",
    passengerPhone: "0900000000",
    photoDataUrl: "data:image/png;base64,c3ludGhldGlj",
    evidence,
    referral,
    adminControl,
    opsControl,
    control: opsControl,
    driver,
    heartbeat: async (taskId, workState) => {
      events.push({
        rail: "heartbeat",
        path: String(taskId),
        body: { workState },
      });
    },
    capture: async (name, orderId, screen) => {
      events.push({
        rail: "controlled-capture",
        path: name,
        body: { orderId, screen },
      });
      return {
        file: `${directory}/${name}.png`,
        bytes: 0,
        sha256: hash(Buffer.from(name)),
      };
    },
    cancelFromActualUI: async (id, expectedRefusal) => {
      events.push({ rail: "controlled-UI", path: id });
      const command = { idempotencyKey: `controlled-cancel-${id}` };
      if (!expectedRefusal || options.unexpectedCancelSuccess)
        return {
          ...response(cancel(id)),
          command,
          requestSource: "actual-ui",
          uiDisabled: false,
        };
      if (options.mutateDenial) get(id).updatedAt = new Date().toISOString();
      return {
        ...response(
          { ok: false, error: { code: "ORDER_NOT_CANCELABLE" } },
          409,
        ),
        command,
        requestSource: "passenger-api-policy-probe",
        uiDisabled: true,
      };
    },
  };
  return {
    ports,
    results,
    events,
    orders,
    tasks,
    quotes,
    bookingCommands,
    run: () => runFourStageOwnedCancellations(ports, results),
    facts: async (stage: string) =>
      JSON.parse(
        await readFile(
          join(directory, "cancellations", `${stage}-facts.json`),
          "utf8",
        ),
      ),
  };
}

describe("whole four-stage consumer on original separate Admin/Ops/Driver/Referral ports", () => {
  it("completes all four same-subject observations with Admin supply and Ops business calls", async () => {
    const f = await fixture();
    await f.run();
    expect(f.results.map((row) => row.result)).toEqual([
      "observed",
      "observed",
      "observed",
      "observed",
    ]);
    expect(f.results.map((row) => row.actualHttpStatus)).toEqual([
      200, 409, 409, 409,
    ]);
    expect(new Set(f.results.map((row) => row.orderId)).size).toBe(4);
    expect(
      f.results.every((row) => row.orderId !== f.ports.completedMainOrderId),
    ).toBe(true);
    expect([...f.orders.values()].map((row) => row.status)).toEqual([
      "cancelled",
      "completed",
      "completed",
      "completed",
    ]);
    expect(f.events.filter((e) => e.rail === "admin")).toHaveLength(4);
    expect(
      f.events
        .filter((e) => e.path.startsWith("/regulatory-registry/"))
        .every((e) => e.rail === "admin"),
    ).toBe(true);
    expect(
      f.events
        .filter(
          (e) =>
            e.path.startsWith("/orders/") || e.path.startsWith("/dispatch/"),
        )
        .every((e) => e.rail === "ops"),
    ).toBe(true);
    for (const stage of f.results) {
      const facts = await f.facts(stage.stage);
      expect(facts.result.orderId).toBe(stage.orderId);
      expect(facts.result.journalState).toBe("acknowledged");
      expect(facts.finalHistory.status).toBe(
        stage.stage === "unassigned" ? "cancelled" : "completed",
      );
    }
  });
  it("finishes each exact owned task before booking the next independent case", async () => {
    const f = await fixture();
    await f.run();
    const bookingPositions = f.events.flatMap((e, i) =>
      e.path === "/api/referral/booking" ? [i] : [],
    );
    for (let i = 1; i < f.results.length - 1; i++) {
      const taskId = f.results[i]!.taskId!;
      const completed = f.events.findIndex(
        (e) => e.path === `/api/driver/tasks/${taskId}/complete`,
      );
      expect(completed).toBeGreaterThan(bookingPositions[i]!);
      expect(completed).toBeLessThan(bookingPositions[i + 1]!);
    }
    const refusal = await f.facts("assigned-not-arrived");
    expect(refusal.cancelResponse.requestSource).toBe(
      "passenger-api-policy-probe",
    );
    expect(refusal.cancelResponse.uiDisabled).toBe(true);
    expect(refusal.before).toEqual(refusal.after);
  });
  it.each([
    { fixedPrice: true },
    { timingMode: "scheduled" },
    { pickupAddress: "different original intent" },
  ])(
    "retains an unsupported actual quote without sending a booking: %j",
    async (quoteDelta) => {
      const f = await fixture({ quoteDelta });
      await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
      expect(f.bookingCommands).toHaveLength(0);
      expect(f.results[0]!.result).toBe("failed");
      expect(
        f.results.slice(1).every((row) => row.result === "unexecuted"),
      ).toBe(true);
    },
  );
  it("does not touch an unrelated active passenger order", async () => {
    const f = await fixture({ foreignActive: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.quotes).toHaveLength(0);
    expect(
      f.events.some(
        (e) => e.rail === "admin" || e.rail === "ops" || e.rail === "driver",
      ),
    ).toBe(false);
  });
  it("retains a committed unknown booking ACK and stops without inventing an owned ID or another command", async () => {
    const f = await fixture({ unknownBookingAck: true });
    await expect(f.run()).rejects.toThrow("unit-booking-response-lost");
    expect(f.bookingCommands).toHaveLength(1);
    expect(f.quotes).toHaveLength(1);
    expect(f.results[0]).toMatchObject({
      result: "failed",
      journalState: "ack_unknown",
      recovery: "retained-unresolved",
    });
    expect(f.results[0]!.orderId).toBeUndefined();
    expect([...f.orders.values()][0]!.status).toBe("created");
    expect(
      f.events.some((e) => e.path.startsWith("/api/referral/cancel/")),
    ).toBe(false);
    const facts = await f.facts("unassigned");
    expect(facts.bookingJournal.bodySha256).toBe(
      hash(Buffer.from(JSON.stringify(f.bookingCommands[0]))),
    );
  });
  it("does not claim or clean an ACK bound to a different quote", async () => {
    const f = await fixture({ wrongBookingQuote: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.results[0]!.orderId).toBeUndefined();
    expect(f.results[0]!.journalState).toBe("ack_unknown");
    expect(f.bookingCommands).toHaveLength(1);
  });
  it("preserves a received ID whose canonical passenger binding does not match", async () => {
    const f = await fixture({ wrongOwner: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.results[0]).toMatchObject({
      result: "failed",
      recovery: "retained-unresolved",
    });
    expect(
      f.events.some(
        (e) =>
          e.rail === "controlled-UI" ||
          e.path.startsWith("/api/referral/cancel/"),
      ),
    ).toBe(false);
    expect(f.bookingCommands).toHaveLength(1);
  });
  it("does not bypass an ineligible pair and normally cancels only its fresh created order", async () => {
    const f = await fixture({ ineligible: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.events.some((e) => e.path === "/dispatch/assign")).toBe(false);
    expect(f.bookingCommands).toHaveLength(2);
    expect(
      [...f.orders.values()].every((row) => row.status === "cancelled"),
    ).toBe(true);
    expect(f.results[1]).toMatchObject({
      result: "failed",
      recovery: "normal-passenger-cancel",
    });
  });
  it("recovers only the existing bound task after a lost assignment ACK and preserves the failure", async () => {
    const f = await fixture({ lostAssignmentAck: true });
    await expect(f.run()).rejects.toThrow("unit-assignment-ACK-lost");
    expect(f.bookingCommands).toHaveLength(2);
    expect(f.results[1]).toMatchObject({
      result: "failed",
      recovery: "normal-driver-completion",
    });
    expect([...f.orders.values()][1]!.status).toBe("completed");
    expect(f.results[1]!.taskId).toBe([...f.tasks.keys()][0]);
    const facts = await f.facts("assigned-not-arrived");
    expect(facts.cleanupRecoveredTaskFromBoundDriverList).toBe(true);
  });
  it("a denial that changed canonical lifecycle facts fails even after normal own completion cleanup", async () => {
    const f = await fixture({ mutateDenial: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.results[1]).toMatchObject({
      result: "failed",
      actualHttpStatus: 409,
      recovery: "normal-driver-completion",
    });
    expect(f.bookingCommands).toHaveLength(2);
  });
  it("records unexpected policy success as failure rather than borrowing a 409 outcome", async () => {
    const f = await fixture({ unexpectedCancelSuccess: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.results[1]).toMatchObject({
      result: "failed",
      actualHttpStatus: 200,
    });
    expect(f.results[1]!.actualCode).toBeUndefined();
    expect(f.bookingCommands).toHaveLength(2);
  });
  it("retains failed normal Driver completion and never starts the following case", async () => {
    const f = await fixture({ completionUnavailable: true });
    await expect(f.run()).rejects.toThrow("unit-completion-unavailable");
    expect(f.results[1]).toMatchObject({
      result: "failed",
      recovery: "retained-unresolved",
    });
    expect([...f.orders.values()][1]!.status).toBe("on_trip");
    expect(f.bookingCommands).toHaveLength(2);
    expect(f.results[2]!.result).toBe("unexecuted");
  });
  it("refuses an order UUID reused by a different cancellation case", async () => {
    const f = await fixture({ repeatedOrderId: true });
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.bookingCommands).toHaveLength(2);
    expect(f.orders.size).toBe(1);
    expect(f.results[1]!.result).toBe("failed");
    expect(f.results[2]!.result).toBe("unexecuted");
  });
});
