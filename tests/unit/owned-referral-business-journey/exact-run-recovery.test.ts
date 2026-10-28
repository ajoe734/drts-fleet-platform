import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as recovery from "../../e2e/owned-referral-business-journey/exact-run-recovery";
import {
  FULL406892_EXACT_SEVEN_ACK as FULL,
  createExactSevenRecoveryState,
  expectedExactSevenManifest,
  parseExactSevenAckManifest,
  precheckExactSevenOrders,
  selectsExactSevenProfile,
  terminalizeExactSevenOrder,
  type ExactSevenPorts,
  type ExactSevenRecoveryState,
  type ExactSevenSlot,
} from "../../e2e/owned-referral-business-journey/exact-run-recovery";
import {
  Evidence,
  JourneyFailure,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";
import {
  RunFinalizer,
  type StepRunner,
} from "../../e2e/owned-referral-business-journey/run-finalization";
import { ORIGINAL_UNKNOWN_BOOKING } from "../../e2e/owned-referral-business-journey/original-journal-recovery";

const ROOT = process.cwd();
const SPEC = path.join(
  ROOT,
  "tests/e2e/owned-referral-business-journey/owned-business.spec.ts",
);
const LOADER = path.join(
  ROOT,
  "tests/e2e/owned-referral-business-journey/retained-journal.py",
);
const PASSENGER = "synthetic-fixed-demo-passenger";
const NOW = Date.parse("2026-10-28T15:00:00.000Z");
const FUTURE = "2026-10-30T15:00:00.000Z";
const PAST = "2026-10-28T12:00:00.000Z";
const slotOrder = (slot: ExactSevenSlot) =>
  FULL.journals.find((journal) => journal.slot === slot)!;
const manifestBytes = (value: unknown = expectedExactSevenManifest()) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

type OrderRow = {
  orderId: string;
  partnerEntrySlug: string;
  passenger: { passengerId: string };
  referralPassengerLifecycle: { quote: { quoteId: string } };
  status: string;
  reservationHoldStatus: string | null;
  cancelableUntil: string | null;
};
type DriverRow = {
  driverId: string;
  workState: string;
  deviceBindings: { bindingId: string; deviceId: string; status: string }[];
};

/** External API/IO fake ports only; the decision logic is the real adapter. */
function world(
  statuses: Partial<Record<ExactSevenSlot, Partial<OrderRow>>> = {},
) {
  const log: string[] = [];
  const orders = new Map<string, OrderRow>();
  for (const journal of FULL.journals)
    orders.set(journal.orderId, {
      orderId: journal.orderId,
      partnerEntrySlug: FULL.entrySlug,
      passenger: { passengerId: PASSENGER },
      referralPassengerLifecycle: { quote: { quoteId: journal.quoteId } },
      status: "completed",
      reservationHoldStatus: null,
      cancelableUntil: journal.scheduled ? FUTURE : PAST,
      ...statuses[journal.slot],
    });
  // Older terminal orders of the same fixed Demo subject are preserved data.
  const others: { orderId: string; status: string; quoteId: string }[] = [
    { orderId: "historic-terminal", status: "completed", quoteId: "q-old" },
  ];
  let active: unknown = { active: false, trip: null };
  const drivers: DriverRow[] = [
    {
      driverId: FULL.firstSupply.driverId,
      workState: "available",
      deviceBindings: [
        {
          bindingId: "drvbind_first",
          deviceId: FULL.firstSupply.deviceId,
          status: "active",
        },
      ],
    },
    {
      driverId: "drv_foreign_shared_fixture",
      workState: "available",
      deviceBindings: [
        { bindingId: "drvbind_foreign", deviceId: "foreign", status: "active" },
      ],
    },
  ];
  const vehicles = [{ vehicleId: FULL.firstSupply.vehicleId }];
  const history = () => ({
    items: [
      ...[...orders.values()].map((order) => ({
        orderId: order.orderId,
        status: order.status,
        quote: order.referralPassengerLifecycle.quote,
      })),
      ...others.map((item) => ({
        orderId: item.orderId,
        status: item.status,
        quote: { quoteId: item.quoteId },
      })),
    ],
  });
  const persisted: ObjectData[] = [];
  const ports: ExactSevenPorts = {
    passengerId: PASSENGER,
    readHistoryList: vi.fn(async () => {
      log.push("read:history-list");
      return history();
    }),
    readHistory: vi.fn(async (orderId: string) => {
      log.push(`read:history:${orderId}`);
      const order = orders.get(orderId)!;
      return {
        orderId,
        status: order.status,
        quote: order.referralPassengerLifecycle.quote,
      };
    }),
    readActive: vi.fn(async () => {
      log.push("read:active");
      return active;
    }),
    readOrder: vi.fn(async (orderId: string) => {
      log.push(`read:order:${orderId}`);
      return structuredClone(orders.get(orderId));
    }),
    cancel: vi.fn(async (orderId: string) => {
      log.push(`write:cancel:${orderId}`);
      orders.get(orderId)!.status = "cancelled";
      return { orderId, status: "cancelled" };
    }),
    resolveHold: vi.fn(async (orderId: string, traceId: string) => {
      log.push(`write:resolve:${orderId}:${traceId}`);
      Object.assign(orders.get(orderId)!, {
        status: "cancelled",
        reservationHoldStatus: "cancelled",
      });
      return { orderId, status: "cancelled" };
    }),
    readDrivers: vi.fn(async () => {
      log.push("read:drivers");
      return { items: structuredClone(drivers) };
    }),
    readVehicles: vi.fn(async () => {
      log.push("read:vehicles");
      return { items: vehicles };
    }),
    setOffline: vi.fn(async (driverId: string) => {
      log.push(`write:offline:${driverId}`);
      const driver = drivers.find((item) => item.driverId === driverId)!;
      driver.workState = "offline";
      return { driverId, workState: "offline" };
    }),
    revokeBinding: vi.fn(async (bindingId: string, deviceId: string) => {
      log.push(`write:revoke:${bindingId}:${deviceId}`);
      for (const driver of drivers)
        for (const binding of driver.deviceBindings)
          if (binding.bindingId === bindingId) {
            binding.status = "revoked";
            return {
              bindingId,
              deviceId: binding.deviceId,
              driverId: driver.driverId,
              revokedAt: "2026-10-28T15:01:00.000Z",
            };
          }
      throw new JourneyFailure("api:request", 404, "NOT_FOUND");
    }),
    persist: vi.fn(async (facts: ObjectData) => {
      log.push("persist");
      persisted.push(structuredClone(facts));
    }),
    now: () => NOW,
    evidence: new Evidence(),
  };
  return {
    log,
    orders,
    others,
    drivers,
    ports,
    persisted,
    setActive: (value: unknown) => {
      active = value;
    },
    writes: () => log.filter((entry) => entry.startsWith("write:")),
  };
}

const order = (state: ExactSevenRecoveryState, slot: ExactSevenSlot) =>
  state.orders.find((item) => item.slot === slot)!;

describe("FULL 40689200536 exact seven-ACK source manifest", () => {
  it("is selected only by the existing expected runtime 1a3f", () => {
    expect(selectsExactSevenProfile(FULL.runtimeSha)).toBe(true);
    expect(selectsExactSevenProfile(ORIGINAL_UNKNOWN_BOOKING.runtimeSha)).toBe(
      false,
    );
    expect(selectsExactSevenProfile(FULL.definitionSha)).toBe(false);
  });

  it("accepts only the compiled profile and returns it, never the file", () => {
    const profile = parseExactSevenAckManifest(
      manifestBytes(),
      FULL.runtimeSha,
    );
    expect(profile).toBe(FULL);
    expect(FULL.journals.map((journal) => journal.slot)).toEqual([
      "main",
      "unassigned",
      "assigned-not-arrived",
      "arrived-not-started",
      "on-trip",
      "reservation-1",
      "reservation-2",
    ]);
    expect(new Set(FULL.journals.map((journal) => journal.orderId)).size).toBe(
      7,
    );
  });

  it.each([
    ["run", (m: ObjectData) => (m.run = 39445009990)],
    ["artifact", (m: ObjectData) => (m.artifact = 1)],
    ["digest", (m: ObjectData) => (m.digest = `sha256:${"0".repeat(64)}`)],
    ["runtime", (m: ObjectData) => (m.runtimeSha = FULL.definitionSha)],
    ["unverified", (m: ObjectData) => (m.officialArtifactVerified = false)],
    [
      "journal hash",
      (m: ObjectData) =>
        ((m.journals as ObjectData[])[3]!.sha256 = "0".repeat(64)),
    ],
    [
      "caller order selector",
      (m: ObjectData) =>
        ((m.journals as ObjectData[])[0]!.orderId = "caller-supplied"),
    ],
    [
      "eighth journal",
      (m: ObjectData) =>
        (m.journals as ObjectData[]).push({
          ...(m.journals as ObjectData[])[0]!,
          slot: "redispatched",
        }),
    ],
    [
      "raw body",
      (m: ObjectData) => ((m.journals as ObjectData[])[0]!.body = "{}"),
    ],
    [
      "first device",
      (m: ObjectData) =>
        ((m.firstSupply as ObjectData).deviceId = "owned-referral-other"),
    ],
  ])("rejects a changed %s", (_label, mutate) => {
    const manifest = expectedExactSevenManifest();
    mutate(manifest);
    expect(() =>
      parseExactSevenAckManifest(manifestBytes(manifest), FULL.runtimeSha),
    ).toThrow("official-source-manifest-mismatch");
  });

  it("rejects wrong runtime, oversize and non-JSON input", () => {
    expect(() =>
      parseExactSevenAckManifest(
        manifestBytes(),
        ORIGINAL_UNKNOWN_BOOKING.runtimeSha,
      ),
    ).toThrow("runtime-profile-required");
    expect(() =>
      parseExactSevenAckManifest(Buffer.alloc(16385, 32), FULL.runtimeSha),
    ).toThrow("bounded-source-manifest-required");
    expect(() =>
      parseExactSevenAckManifest(Buffer.from("{"), FULL.runtimeSha),
    ).toThrow("source-manifest-json-required");
  });

  it("equals what the actual hosted Python loader writes", () => {
    const run = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import importlib.util, json, sys",
          "spec = importlib.util.spec_from_file_location('loader', sys.argv[1])",
          "module = importlib.util.module_from_spec(spec)",
          "spec.loader.exec_module(module)",
          "print(json.dumps(module.full406892_manifest(), indent=2))",
        ].join("\n"),
        LOADER,
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(run.status).toBe(0);
    expect(
      parseExactSevenAckManifest(
        Buffer.from(run.stdout, "utf8"),
        FULL.runtimeSha,
      ),
    ).toBe(FULL);
  });
});

describe("FULL 40689200536 read-only own-set precheck", () => {
  it("verifies all seven already terminal orders read-only", async () => {
    const w = world({ main: { status: "cancelled" } });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    expect(state.phase).toBe("prechecked");
    expect(state.orders.every((item) => item.terminalVerified)).toBe(true);
    expect(order(state, "main").outcome).toBe("already-terminal");
    expect(w.writes()).toEqual([]);
    expect(w.ports.persist).toHaveBeenCalledOnce();
    const facts = JSON.stringify(w.persisted);
    expect(facts).not.toMatch(/idempotencyKey|passengerPhone|"body"/);
    expect(w.ports.readOrder).toHaveBeenCalledTimes(7);
    expect(w.ports.readHistory).toHaveBeenCalledTimes(7);
  });

  it.each([
    [
      "foreign live order",
      (w: ReturnType<typeof world>) =>
        w.others.push({
          orderId: "foreign-live",
          status: "created",
          quoteId: "q",
        }),
    ],
    [
      "foreign active trip",
      (w: ReturnType<typeof world>) =>
        w.setActive({ active: true, trip: { orderId: "foreign-live" } }),
    ],
    [
      "changed passenger",
      (w: ReturnType<typeof world>) =>
        (w.orders.get(slotOrder("on-trip").orderId)!.passenger.passengerId =
          "other-passenger"),
    ],
    [
      "changed quote",
      (w: ReturnType<typeof world>) =>
        (w.orders.get(
          slotOrder("reservation-2").orderId,
        )!.referralPassengerLifecycle.quote.quoteId = "other-quote"),
    ],
    [
      "changed entry",
      (w: ReturnType<typeof world>) =>
        (w.orders.get(slotOrder("main").orderId)!.partnerEntrySlug = "other"),
    ],
  ])(
    "refuses a %s before any write or custody claim",
    async (_label, change) => {
      const w = world({ main: { status: "created" } });
      change(w);
      const state = createExactSevenRecoveryState();
      await expect(
        precheckExactSevenOrders(state, w.ports),
      ).rejects.toBeInstanceOf(JourneyFailure);
      expect(state.phase).toBe("precheck-refused");
      expect(state.orders.some((item) => item.decision)).toBe(false);
      expect(w.writes()).toEqual([]);
      expect(w.ports.persist).not.toHaveBeenCalled();
    },
  );

  it("refuses a missing own history row before any write", async () => {
    const w = world();
    const read = w.ports.readHistoryList;
    w.ports.readHistoryList = async () => {
      const list = (await read()) as { items: ObjectData[] };
      return {
        items: list.items.filter(
          (item) => item.orderId !== slotOrder("unassigned").orderId,
        ),
      };
    };
    await expect(
      precheckExactSevenOrders(createExactSevenRecoveryState(), w.ports),
    ).rejects.toThrow("unassigned-history-row-required");
    expect(w.writes()).toEqual([]);
  });

  it("accepts another member of the fixed own set as the active trip", async () => {
    const w = world({
      "reservation-1": { status: "created" },
      "reservation-2": { status: "created" },
    });
    w.setActive({
      active: true,
      trip: {
        orderId: slotOrder("reservation-2").orderId,
        cancellationWindow: { canCancel: true, cancelableUntil: FUTURE },
      },
    });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    expect(order(state, "reservation-1").decision).toBe("cancel");
    expect(order(state, "reservation-2").decision).toBe("cancel");
  });

  it("classifies each live state by the original normal policy only", async () => {
    const w = world({
      main: { status: "created" },
      unassigned: {
        status: "exception_hold",
        reservationHoldStatus: "exception_hold",
      },
      "assigned-not-arrived": { status: "driver_accepted" },
      "arrived-not-started": { status: "exception_hold" },
      "on-trip": { status: "on_trip" },
      "reservation-1": { status: "created", cancelableUntil: PAST },
      "reservation-2": { status: "dispatch_failed" },
    });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    expect(
      state.orders.map((item) => [item.slot, item.decision, item.outcome]),
    ).toEqual([
      ["main", "cancel", "pending"],
      ["unassigned", "resolve-hold", "pending"],
      ["assigned-not-arrived", "retain", "retained-in-trip-or-assigned"],
      // A status-only hold is not the genuine double hold.
      ["arrived-not-started", "retain", "retained-in-trip-or-assigned"],
      ["on-trip", "retain", "retained-in-trip-or-assigned"],
      ["reservation-1", "retain", "retained-window-closed"],
      ["reservation-2", "retain", "retained-unsupported-state"],
    ]);
    expect(w.writes()).toEqual([]);
  });

  it("keeps a future reservation whose actual window is closed", async () => {
    const w = world({ "reservation-1": { status: "created" } });
    w.setActive({
      active: true,
      trip: {
        orderId: slotOrder("reservation-1").orderId,
        cancellationWindow: { canCancel: false, cancelableUntil: FUTURE },
      },
    });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    expect(order(state, "reservation-1").outcome).toBe(
      "retained-window-closed",
    );
  });
});

describe("FULL 40689200536 single normal terminal write per order", () => {
  async function prepared(
    statuses: Parameters<typeof world>[0] = { main: { status: "created" } },
  ) {
    const w = world(statuses);
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    w.log.length = 0;
    return { w, state };
  }

  it("persists intent before the cancel, ACK after it, then reads back terminal", async () => {
    const { w, state } = await prepared();
    await terminalizeExactSevenOrder(state, "main", w.ports);
    const id = slotOrder("main").orderId;
    expect(w.log).toEqual([
      `read:order:${id}`,
      "persist",
      `write:cancel:${id}`,
      "persist",
      `read:order:${id}`,
      `read:history:${id}`,
      "persist",
    ]);
    expect(order(state, "main")).toMatchObject({
      outcome: "normal-passenger-cancel",
      terminalStatus: "cancelled",
      terminalVerified: true,
      write: { action: "cancel", acknowledged: true },
    });
    await expect(
      terminalizeExactSevenOrder(state, "main", w.ports),
    ).rejects.toThrow("terminalization-at-most-once");
    expect(w.ports.cancel).toHaveBeenCalledOnce();
  });

  it("resolves only a genuine hold with the exact own trace", async () => {
    const { w, state } = await prepared({
      "reservation-2": {
        status: "exception_hold",
        reservationHoldStatus: "exception_hold",
      },
    });
    await terminalizeExactSevenOrder(state, "reservation-2", w.ports);
    const id = slotOrder("reservation-2").orderId;
    expect(w.writes()).toEqual([
      `write:resolve:${id}:owned-referral-recovery:40689200536:${id}:cancel`,
    ]);
    expect(order(state, "reservation-2").outcome).toBe(
      "existing-hold-resolved",
    );
  });

  it("never writes to a retained or terminal order", async () => {
    const { w, state } = await prepared({ "on-trip": { status: "on_trip" } });
    for (const slot of ["on-trip", "assigned-not-arrived"] as const)
      await expect(
        terminalizeExactSevenOrder(state, slot, w.ports),
      ).rejects.toThrow("terminalization-at-most-once");
    expect(w.writes()).toEqual([]);
  });

  it("preserves an order whose state changed after the precheck", async () => {
    const { w, state } = await prepared();
    w.orders.get(slotOrder("main").orderId)!.status = "driver_accepted";
    await expect(
      terminalizeExactSevenOrder(state, "main", w.ports),
    ).rejects.toThrow("changed-before-write-preserved");
    expect(w.writes()).toEqual([]);
    expect(order(state, "main").outcome).toBe("retained-changed-before-write");
  });

  it("sends nothing when the durable intent cannot be written", async () => {
    const { w, state } = await prepared();
    vi.mocked(w.ports.persist).mockRejectedValueOnce(new Error("disk"));
    await expect(
      terminalizeExactSevenOrder(state, "main", w.ports),
    ).rejects.toThrow("disk");
    expect(w.writes()).toEqual([]);
    await expect(
      terminalizeExactSevenOrder(state, "main", w.ports),
    ).rejects.toThrow("terminalization-at-most-once");
  });

  it.each([
    [
      new JourneyFailure("referral:request", 409, "ORDER_NOT_CANCELABLE"),
      "write-denied",
      { httpStatus: 409, code: "ORDER_NOT_CANCELABLE" },
    ],
    [new JourneyFailure("referral:transport"), "write-ack-unknown", {}],
    [new JourneyFailure("referral:request", 502), "write-ack-unknown", {}],
    [
      new JourneyFailure("referral:runtime SHA mismatch"),
      "write-ack-unknown",
      {},
    ],
  ])(
    "records %s without retry, dispatch or a terminal claim",
    async (error, outcome, write) => {
      const { w, state } = await prepared();
      vi.mocked(w.ports.cancel).mockRejectedValueOnce(error);
      await expect(
        terminalizeExactSevenOrder(state, "main", w.ports),
      ).rejects.toThrow(`${outcome}-preserved`);
      expect(w.ports.cancel).toHaveBeenCalledOnce();
      expect(order(state, "main")).toMatchObject({
        outcome,
        terminalVerified: false,
        write: { action: "cancel", acknowledged: false, ...write },
      });
      expect(w.persisted.at(-1)).toMatchObject({
        orders: expect.arrayContaining([
          expect.objectContaining({ slot: "main", outcome }),
        ]),
      });
    },
  );

  it("does not treat a cancellation ACK alone as terminal", async () => {
    const { w, state } = await prepared();
    vi.mocked(w.ports.cancel).mockResolvedValueOnce({
      orderId: slotOrder("main").orderId,
      status: "cancelled",
    });
    await expect(
      terminalizeExactSevenOrder(state, "main", w.ports),
    ).rejects.toThrow("terminal-readback-missing");
    expect(order(state, "main").terminalVerified).toBe(false);
  });
});

// The real `exactSevenPlan` closure of the hosted consumer, extracted from its
// AST (the spec registers a Playwright test at import and cannot run here).
function actualExactSevenPlan(deps: {
  exactSevenPorts: ExactSevenPorts;
  cleanupErrors: string[];
  evidence: Evidence;
  persistPrivateJson: (path: string, value: unknown) => Promise<void>;
}) {
  const source = ts.createSourceFile(
    SPEC,
    readFileSync(SPEC, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let declaration: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (
      !declaration &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "exactSevenPlan"
    )
      declaration = node;
    else ts.forEachChild(node, visit);
  };
  visit(source);
  if (!declaration) throw new Error("Actual exactSevenPlan is missing");
  const { outputText } = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  // Every runtime export the spec imports from the adapter, plus its closures.
  const names = {
    ...recovery,
    ...deps,
    DIRECTORY: ".artifacts/owned-referral-business-journey",
  };
  return new Function(
    ...Object.keys(names),
    `${outputText}\nreturn exactSevenPlan;`,
  )(...Object.values(names)) as (
    cleanup: StepRunner,
    state: ExactSevenRecoveryState,
  ) => Promise<void>;
}

async function finalize(
  w: ReturnType<typeof world>,
  state: ExactSevenRecoveryState,
  budgetMs = 60_000,
) {
  const cleanupErrors: string[] = [];
  const files = new Map<string, unknown>();
  const persistPrivateJson = async (file: string, value: unknown) => {
    files.set(file, structuredClone(value));
  };
  const plan = actualExactSevenPlan({
    exactSevenPorts: w.ports,
    cleanupErrors,
    evidence: w.ports.evidence,
    persistPrivateJson,
  });
  const finalizer = new RunFinalizer({
    definitionSha: "d".repeat(40),
    runtimeSha: FULL.runtimeSha,
    nonce: "owned-referral-recovery-synthetic",
    checkpointFile:
      ".artifacts/owned-referral-business-journey/cancellations/run-finalization-facts.json",
    persist: persistPrivateJson,
    custody: () => ({
      orders: state.orders.map((item) => ({
        slot: `exact-seven-${item.slot}`,
        orderId: item.orderId,
        journalState: "acknowledged",
        ownerTerminal: item.terminalVerified && !item.finalLive,
        ownerRecovery: item.outcome,
      })),
      supply: [],
      sessions: [],
    }),
    secrets: () => [],
    onCleaned: () => undefined,
    onFailed: (stage) => cleanupErrors.push(stage),
    plan: (cleanup) => plan(cleanup, state),
    artifacts: [],
    budgetMs,
    writeBudgetMs: 1_000,
  });
  const result = await finalizer.run("completed");
  return { result, cleanupErrors, files };
}

describe("FULL 40689200536 recovery under the actual finalizer plan", () => {
  it("terminalizes, then offlines and revokes only the qualified first supply", async () => {
    const w = world({
      main: { status: "created" },
      "reservation-1": { status: "created" },
    });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    const { result, cleanupErrors } = await finalize(w, state);
    const first = FULL.firstSupply;
    expect(w.writes()).toEqual([
      `write:cancel:${slotOrder("main").orderId}`,
      `write:cancel:${slotOrder("reservation-1").orderId}`,
      `write:offline:${first.driverId}`,
      `write:revoke:drvbind_first:${first.deviceId}`,
    ]);
    expect(state.supply[0]).toMatchObject({
      qualification: "qualified",
      offline: "offline-verified",
      binding: "revoked-verified",
      bindingId: "drvbind_first",
    });
    // No exact original second device binding exists: unknown, not absent.
    expect(state.supply[1]!.qualification).toBe("not-observed-unknown");
    expect(cleanupErrors).toEqual([
      "exact-seven-second-supply-not-observed-unknown",
    ]);
    expect(result.steps.map((step) => [step.stage, step.outcome])).toEqual([
      ["exact-seven-main-normal-terminalization", "cleaned"],
      ["exact-seven-reservation-1-normal-terminalization", "cleaned"],
      ["exact-seven-final-own-set-readback", "cleaned"],
      ["exact-seven-first-own-driver-offline", "cleaned"],
      ["exact-seven-first-own-binding-revoked", "cleaned"],
      ["exact-seven-second-supply-qualification", "cleaned"],
      ["exact-seven-recovery-facts-persist", "cleaned"],
    ]);
    expect(
      w.drivers.find((d) => d.driverId === "drv_foreign_shared_fixture"),
    ).toMatchObject({
      workState: "available",
      deviceBindings: [{ status: "active" }],
    });
  });

  it("cleans a second supply only through its exact original device binding", async () => {
    const w = world();
    w.drivers.push({
      driverId: "drv_second_own",
      workState: "available",
      deviceBindings: [
        {
          bindingId: "drvbind_second",
          deviceId: FULL.secondSupply.deviceId,
          status: "active",
        },
      ],
    });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    const { cleanupErrors } = await finalize(w, state);
    expect(cleanupErrors).toEqual([]);
    expect(w.writes()).toEqual([
      `write:offline:${FULL.firstSupply.driverId}`,
      `write:revoke:drvbind_first:${FULL.firstSupply.deviceId}`,
      "write:offline:drv_second_own",
      `write:revoke:drvbind_second:${FULL.secondSupply.deviceId}`,
    ]);
  });

  it("keeps partial cleanup durable when one write's ACK is lost", async () => {
    const w = world({
      main: { status: "created" },
      unassigned: { status: "created" },
      "reservation-1": {
        status: "exception_hold",
        reservationHoldStatus: "exception_hold",
      },
    });
    vi.mocked(w.ports.cancel).mockImplementationOnce(async () => {
      throw new JourneyFailure("referral:transport");
    });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    const { result, cleanupErrors, files } = await finalize(w, state);
    expect(w.ports.cancel).toHaveBeenCalledTimes(2);
    expect(w.ports.resolveHold).toHaveBeenCalledOnce();
    expect(order(state, "main").outcome).toBe("write-ack-unknown");
    expect(order(state, "unassigned").terminalVerified).toBe(true);
    expect(order(state, "reservation-1").terminalVerified).toBe(true);
    // Supply stays untouched while any own order is unresolved.
    expect(w.ports.setOffline).not.toHaveBeenCalled();
    expect(w.ports.revokeBinding).not.toHaveBeenCalled();
    expect(cleanupErrors).toEqual(
      expect.arrayContaining([
        "exact-seven-main-normal-terminalization",
        "exact-seven-main-write-ack-unknown",
        "exact-seven-supply-retained-orders-unresolved",
      ]),
    );
    expect(result.wholeRunPassed).toBe(false);
    expect(result.unresolved).toContain(
      "exact-seven-main-owned-order-terminal-not-observed",
    );
    const facts = files.get(
      `.artifacts/owned-referral-business-journey/${recovery.EXACT_SEVEN_RECOVERY_FACTS}`,
    ) as ObjectData;
    expect(facts.supply).toEqual([
      expect.objectContaining({ qualification: "blocked-orders-unresolved" }),
      expect.objectContaining({ qualification: "blocked-orders-unresolved" }),
    ]);
  });

  it("refuses a first Driver whose registry binding is not the exact original device", async () => {
    const w = world();
    w.drivers[0]!.deviceBindings[0]!.deviceId = `${FULL.nonce}-device-other`;
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    const { cleanupErrors } = await finalize(w, state);
    expect(w.writes()).toEqual([]);
    expect(state.supply[0]!.qualification).toBe("mismatch-preserved");
    expect(cleanupErrors).toEqual(
      expect.arrayContaining([
        "exact-seven-first-own-driver-offline",
        "exact-seven-first-own-binding-revoked",
      ]),
    );
  });

  it("does not offline or revoke when the first registry Driver is absent", async () => {
    const w = world();
    w.drivers.shift();
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    await finalize(w, state);
    expect(w.writes()).toEqual([]);
  });

  it("reads already offline/revoked own supply without writing", async () => {
    const w = world();
    w.drivers[0]!.workState = "offline";
    w.drivers[0]!.deviceBindings[0]!.status = "revoked";
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    await finalize(w, state);
    expect(w.writes()).toEqual([]);
    expect(state.supply[0]).toMatchObject({
      offline: "already-offline",
      binding: "already-revoked",
    });
  });

  it("records the API revoke as unknown without retrying it", async () => {
    const w = world();
    vi.mocked(w.ports.revokeBinding).mockRejectedValueOnce(
      new JourneyFailure("api:transport"),
    );
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    const { cleanupErrors } = await finalize(w, state);
    expect(w.ports.revokeBinding).toHaveBeenCalledOnce();
    expect(state.supply[0]!.binding).toBe("write-ack-unknown");
    expect(cleanupErrors).toContain("exact-seven-first-own-binding-revoked");
  });

  it("stops at the finalizer budget, attempting each write at most once", async () => {
    const w = world({
      main: { status: "created" },
      unassigned: { status: "created" },
    });
    vi.mocked(w.ports.cancel).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    const { result } = await finalize(w, state, 200);
    expect(w.ports.cancel).toHaveBeenCalledOnce();
    expect(result.steps[0]).toEqual({
      stage: "exact-seven-main-normal-terminalization",
      outcome: "unknown-budget-exhausted",
    });
    expect(result.steps[1]).toEqual({
      stage: "exact-seven-unassigned-normal-terminalization",
      outcome: "not-attempted-budget-exhausted",
    });
    expect(result.wholeRunPassed).toBe(false);
  });

  it("records an unverified precheck without any product write", async () => {
    const w = world();
    const state = createExactSevenRecoveryState();
    const { cleanupErrors, files } = await finalize(w, state);
    expect(w.log.filter((entry) => !entry.startsWith("persist"))).toEqual([]);
    expect(cleanupErrors).toEqual([
      "exact-seven-precheck-not-completed-no-writes",
    ]);
    expect(
      files.get(
        `.artifacts/owned-referral-business-journey/${recovery.EXACT_SEVEN_RECOVERY_FACTS}`,
      ),
    ).toMatchObject({ phase: "unverified", fullJourneyClaimed: false });
  });
});

describe("R1: the final own-set readback gates every supply write", () => {
  const live = (w: ReturnType<typeof world>) =>
    vi.mocked(w.ports.readHistoryList);
  async function prechecked(w = world()) {
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    return { w, state };
  }

  it.each([
    [
      "transport failure",
      (w: ReturnType<typeof world>) =>
        live(w).mockRejectedValueOnce(new JourneyFailure("referral:transport")),
      "failed",
    ],
    [
      "shape mismatch",
      (w: ReturnType<typeof world>) =>
        live(w).mockResolvedValueOnce({ items: "not-a-list" }),
      "failed",
    ],
    [
      "missing own row",
      (w: ReturnType<typeof world>) =>
        live(w).mockResolvedValueOnce({
          items: FULL.journals
            .filter((journal) => journal.slot !== "on-trip")
            .map((journal) => ({
              orderId: journal.orderId,
              status: "completed",
            })),
        }),
      "own-row-missing",
    ],
    [
      "own order live again",
      (w: ReturnType<typeof world>) =>
        live(w).mockResolvedValueOnce({
          items: FULL.journals.map((journal) => ({
            orderId: journal.orderId,
            status: journal.slot === "main" ? "created" : "completed",
          })),
        }),
      "own-still-live",
    ],
  ])(
    "preserves supply after a final readback %s, keeping per-order terminal evidence",
    async (_label, fail, status) => {
      const { w, state } = await prechecked();
      fail(w);
      const { result, cleanupErrors } = await finalize(w, state);
      expect(w.writes()).toEqual([]);
      expect(w.ports.setOffline).not.toHaveBeenCalled();
      expect(w.ports.revokeBinding).not.toHaveBeenCalled();
      expect(state.finalReadback).toBe(status);
      expect(recovery.exactSevenSupplyGate(state)).toBe(false);
      // Each order's own earlier terminal readback stays recorded.
      expect(state.orders.every((item) => item.terminalVerified)).toBe(true);
      expect(
        state.orders.every((item) => item.outcome === "already-terminal"),
      ).toBe(true);
      expect(order(state, "main").finalLive === true).toBe(
        status === "own-still-live",
      );
      expect(cleanupErrors).toEqual(
        expect.arrayContaining([
          "exact-seven-final-own-set-readback",
          `exact-seven-supply-retained-final-readback-${status}`,
        ]),
      );
      expect(state.supply.map((actor) => actor.qualification)).toEqual([
        "blocked-final-readback-unqualified",
        "blocked-final-readback-unqualified",
      ]);
      // Later safe finalization (facts persistence) still runs.
      expect(result.steps.map((step) => [step.stage, step.outcome])).toEqual([
        ["exact-seven-final-own-set-readback", "failed"],
        ["exact-seven-recovery-facts-persist", "cleaned"],
      ]);
      expect(result.wholeRunPassed).toBe(false);
    },
  );

  it("opens the supply gate only after a successful complete final readback", async () => {
    const { w, state } = await prechecked();
    expect(recovery.exactSevenSupplyGate(state)).toBe(false);
    await expect(
      recovery.cleanExactSevenSupply(state, "first", "offline", w.ports),
    ).rejects.toThrow("at-most-once-after-orders");
    await recovery.verifyExactSevenFinalActive(state, w.ports);
    expect(state.finalReadback).toBe("verified");
    expect(recovery.exactSevenSupplyGate(state)).toBe(true);
    expect(w.persisted.at(-1)).toMatchObject({ finalReadback: "verified" });
    await expect(
      recovery.verifyExactSevenFinalActive(state, w.ports),
    ).rejects.toThrow("final-readback-once");
  });

  it("does not open the gate when the verified result cannot be persisted", async () => {
    const { w, state } = await prechecked();
    vi.mocked(w.ports.persist).mockRejectedValueOnce(new Error("disk"));
    await expect(
      recovery.verifyExactSevenFinalActive(state, w.ports),
    ).rejects.toThrow("disk");
    expect(state.finalReadback).toBe("failed");
    expect(recovery.exactSevenSupplyGate(state)).toBe(false);
  });
});

describe("R2: supply writes keep durable attempted/ACK custody", () => {
  async function gated(w = world()) {
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    await recovery.verifyExactSevenFinalActive(state, w.ports);
    w.log.length = 0;
    w.persisted.length = 0;
    return { w, state };
  }
  const supplyAt = (w: ReturnType<typeof world>, index: number) =>
    w.persisted.map(
      (facts) =>
        (facts.supply as ObjectData[])[0]![index === 0 ? "offline" : "binding"],
    );
  // The second registry read is the post-ACK readback; the first qualifies.
  const readbackThen =
    (next: (w: ReturnType<typeof world>) => Promise<unknown>) =>
    (w: ReturnType<typeof world>) => {
      const real = vi.mocked(w.ports.readDrivers).getMockImplementation()!;
      let calls = 0;
      vi.mocked(w.ports.readDrivers).mockImplementation(async () => {
        if (++calls !== 2) return real();
        w.log.push("read:drivers");
        return next(w);
      });
    };
  const own = (patch: Partial<DriverRow>) => (w: ReturnType<typeof world>) =>
    Promise.resolve({
      items: [{ ...structuredClone(w.drivers[0]!), ...patch }],
    });
  const readbackFailures = [
    [
      "offline",
      "transport failure",
      readbackThen(() => Promise.reject(new JourneyFailure("api:transport"))),
    ],
    [
      "revoke",
      "transport failure",
      readbackThen(() => Promise.reject(new JourneyFailure("api:transport"))),
    ],
    [
      "offline",
      "missing driver",
      readbackThen(() => Promise.resolve({ items: [] })),
    ],
    [
      "revoke",
      "missing driver",
      readbackThen(() => Promise.resolve({ items: [] })),
    ],
    [
      "offline",
      "malformed registry",
      readbackThen(() => Promise.resolve({ items: "x" })),
    ],
    [
      "offline",
      "still available",
      readbackThen(own({ workState: "available" })),
    ],
    [
      "revoke",
      "binding mismatch",
      readbackThen(
        own({
          deviceBindings: [
            {
              bindingId: "drvbind_first",
              deviceId: `${FULL.firstSupply.deviceId}-other`,
              status: "revoked",
            },
          ],
        }),
      ),
    ],
    [
      "revoke",
      "binding still active",
      readbackThen(
        own({
          deviceBindings: [
            {
              bindingId: "drvbind_first",
              deviceId: FULL.firstSupply.deviceId,
              status: "active",
            },
          ],
        }),
      ),
    ],
  ] as const;

  it.each(readbackFailures)(
    "%s ACK followed by readback %s is recorded readback-missing, never pending",
    async (part, _label, fail) => {
      const { w, state } = await gated();
      fail(w);
      const write =
        part === "offline" ? w.ports.setOffline : w.ports.revokeBinding;
      await expect(
        recovery.cleanExactSevenSupply(state, "first", part, w.ports),
      ).rejects.toThrow(`first-${part}-readback-missing`);
      const field = part === "offline" ? "offline" : "binding";
      expect(write).toHaveBeenCalledOnce();
      expect(state.supply[0]![field]).toBe("readback-missing");
      // Durable order: attempted before the write, ACK checkpoint after it.
      expect(supplyAt(w, part === "offline" ? 0 : 1)).toEqual([
        "attempted",
        "acknowledged-readback-pending",
        "readback-missing",
      ]);
      const sent = w.log.indexOf(
        w.log.find((entry) => entry.startsWith("write:"))!,
      );
      expect(w.log.slice(sent - 1, sent + 3)).toEqual([
        "persist",
        w.log[sent],
        "persist",
        "read:drivers",
      ]);
      await expect(
        recovery.cleanExactSevenSupply(state, "first", part, w.ports),
      ).rejects.toThrow("at-most-once-after-orders");
      expect(write).toHaveBeenCalledOnce();
    },
  );

  it.each(["offline", "revoke"] as const)(
    "sends no %s when the attempted intent cannot be persisted",
    async (part) => {
      const { w, state } = await gated();
      vi.mocked(w.ports.persist).mockRejectedValueOnce(new Error("disk"));
      await expect(
        recovery.cleanExactSevenSupply(state, "first", part, w.ports),
      ).rejects.toThrow("disk");
      expect(w.writes()).toEqual([]);
      expect(state.supply[0]![part === "offline" ? "offline" : "binding"]).toBe(
        "intent-not-durable-not-sent",
      );
      await expect(
        recovery.cleanExactSevenSupply(state, "first", part, w.ports),
      ).rejects.toThrow("at-most-once-after-orders");
      expect(w.writes()).toEqual([]);
    },
  );

  it("keeps an ACKed write as acknowledged when the ACK checkpoint fails", async () => {
    const { w, state } = await gated();
    vi.mocked(w.ports.persist)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk"));
    await expect(
      recovery.cleanExactSevenSupply(state, "first", "offline", w.ports),
    ).rejects.toThrow("disk");
    expect(w.ports.setOffline).toHaveBeenCalledOnce();
    expect(state.supply[0]!.offline).toBe("acknowledged-readback-pending");
  });

  it("classifies a pre-write registry transport failure as unknown, not mismatch", async () => {
    const { w, state } = await gated();
    vi.mocked(w.ports.readDrivers).mockRejectedValueOnce(
      new JourneyFailure("api:transport"),
    );
    await expect(
      recovery.cleanExactSevenSupply(state, "first", "offline", w.ports),
    ).rejects.toThrow("api:transport");
    expect(w.writes()).toEqual([]);
    expect(state.supply[0]!.qualification).toBe("qualification-unknown");
    expect(w.persisted.at(-1)).toMatchObject({
      supply: [
        expect.objectContaining({ qualification: "qualification-unknown" }),
        expect.anything(),
      ],
    });
  });

  it("records a verified offline and revoke with both checkpoints", async () => {
    const { w, state } = await gated();
    await recovery.cleanExactSevenSupply(state, "first", "offline", w.ports);
    await recovery.cleanExactSevenSupply(state, "first", "revoke", w.ports);
    expect(supplyAt(w, 0).slice(0, 3)).toEqual([
      "attempted",
      "acknowledged-readback-pending",
      "offline-verified",
    ]);
    expect(state.supply[0]).toMatchObject({
      offline: "offline-verified",
      binding: "revoked-verified",
    });
  });
});

describe("actual hosted consumer wiring", () => {
  const sourceText = readFileSync(SPEC, "utf8");
  const source = ts.createSourceFile(
    SPEC,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const find = (predicate: (node: ts.Node) => boolean) => {
    const found: ts.Node[] = [];
    const visit = (node: ts.Node) => {
      if (predicate(node)) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };
  const calls = (name: string) =>
    find(
      (node) =>
        ts.isCallExpression(node) && node.expression.getText(source) === name,
    );

  it("verifies the manifest before the finalizer and any product request", () => {
    const [parse] = calls("parseExactSevenAckManifest");
    const finalizer = find(
      (node) =>
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "RunFinalizer",
    )[0];
    const firstRequest = calls("tx.call")[0];
    expect(parse && finalizer && firstRequest).toBeTruthy();
    expect(parse!.getStart()).toBeLessThan(finalizer!.getStart());
    expect(finalizer!.getStart()).toBeLessThan(firstRequest!.getStart());
  });

  it("keeps the seven-ACK branch free of booking, replay, supply and dispatch", () => {
    const branch = find(
      (node) =>
        ts.isIfStatement(node) &&
        node.expression.getText(source) === "exactSevenState" &&
        ts.isBlock(node.thenStatement) &&
        node.thenStatement.getText(source).includes("precheckExactSevenOrders"),
    );
    expect(branch).toHaveLength(1);
    const statement = branch[0] as ts.IfStatement;
    const text = statement.thenStatement.getText(source);
    for (const forbidden of [
      "/api/referral/booking",
      "/api/referral/quote",
      "recoverOriginalUnknownBookingAck",
      "recoverRetainedReferralOrder",
      "assertNoForeignActive",
      "/dispatch",
      "page.",
      "provisionSupply",
      "supply-submissions",
      "device/invite",
      "device/register",
    ])
      expect(text).not.toContain(forbidden);
    // The original 39445009990 recovery remains the only else branch.
    const original = statement.elseStatement!.getText(source);
    expect(original).toContain("recoverOriginalUnknownBookingAck");
    expect(original).toContain("recoverRetainedReferralOrder");
    const plan = find(
      (node) =>
        ts.isFunctionDeclaration(node) && node.name?.text === "exactSevenPlan",
    )[0]!.getText(source);
    expect(plan).not.toMatch(/booking|\/dispatch|sessions\/revoke/);
  });
});
