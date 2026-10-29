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
// The real API route policy matcher (with its own path normalization); only
// proof issuance/storage around it is faked.
import { resolveRouteStepUpPolicy } from "../../../apps/api/src/common/auth/step-up.policy";

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
type SubmissionRow = {
  submission: {
    submissionId: string;
    fleetPartnerId: string;
    submissionType: string;
    status: string;
    revisionNo: number;
    canonicalDriverId: string | null;
    canonicalVehicleId: string | null;
  };
  driverDraft: ObjectData | null;
  vehicleDraft: ObjectData | null;
  // Fields only the detail read returns differently from its list row.
  detail?: Partial<SubmissionRow["submission"]>;
};
const FLEET = "fleet-demo-001";
const ADMIN_SESSION = "sess_synthetic_own_admin";
const driverSubmission = (
  submissionId: string,
  nonce: string,
  patch: Partial<SubmissionRow["submission"]> = {},
  draft: ObjectData = {},
): SubmissionRow => ({
  submission: {
    submissionId,
    fleetPartnerId: FLEET,
    submissionType: "driver_onboarding",
    status: "approved",
    revisionNo: 3,
    canonicalDriverId: null,
    canonicalVehicleId: null,
    ...patch,
  },
  driverDraft: {
    name: `合成測試司機 ${nonce.slice(-12)}`,
    mobile: "synthetic-not-a-phone",
    professionalDriverLicenseNo: `SIM-DL-${nonce}`,
    taxiDriverRegistrationNo: `SIM-REG-${nonce}`,
    ...draft,
  },
  vehicleDraft: null,
});
const vehicleSubmission = (
  submissionId: string,
  currentDriverSubmissionId: string,
  canonicalVehicleId: string | null,
): SubmissionRow => ({
  submission: {
    submissionId,
    fleetPartnerId: FLEET,
    submissionType: "vehicle_onboarding",
    status: canonicalVehicleId ? "approved" : "draft",
    revisionNo: 3,
    canonicalDriverId: null,
    canonicalVehicleId,
  },
  driverDraft: null,
  vehicleDraft: { plateNo: "SIM-SYNTHETIC", currentDriverSubmissionId },
});

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
  const vehicles: { vehicleId: string }[] = [
    { vehicleId: FULL.firstSupply.vehicleId },
  ];
  // The original first pair's own submissions and a foreign Fleet's; no
  // second-supply source exists unless a test adds it.
  const submissions: SubmissionRow[] = [
    driverSubmission("sub_first_driver", FULL.nonce, {
      canonicalDriverId: FULL.firstSupply.driverId,
    }),
    vehicleSubmission(
      "sub_first_vehicle",
      "sub_first_driver",
      FULL.firstSupply.vehicleId,
    ),
    driverSubmission(
      "sub_foreign_fleet",
      FULL.secondSupply.nonce,
      { fleetPartnerId: "fleet-demo-002" },
      {},
    ),
  ];
  let listedTotal: number | null = null;
  // Fake proof issuance/storage; the action is decided by the real matcher.
  const admin = { sessionId: ADMIN_SESSION, realm: "platform" as const };
  const proofs = new Map<string, { actionId: string; sessionId: string }>();
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
    adminSessionId: ADMIN_SESSION,
    readAdminSession: vi.fn(async () => {
      log.push("read:admin-session");
      return {
        active: true,
        identity: {
          realm: admin.realm,
          actorType: "platform_admin",
          authMode: "jwt_bearer",
          sessionId: admin.sessionId,
        },
      };
    }),
    // Same contract as the spec's existing stepUp helper: the proof request
    // names {POST, path}; `required` and the exact action are then required.
    stepUp: vi.fn(async (proofPath: string, actionId: string) => {
      log.push(`proof:${proofPath}`);
      const policy = resolveRouteStepUpPolicy("POST", proofPath, admin.realm);
      if (!policy || policy.actionId !== actionId)
        throw new JourneyFailure("exact same-session action proof");
      const reference = `stepup_synthetic_${proofs.size + 1}`;
      proofs.set(reference, {
        actionId: policy.actionId,
        sessionId: admin.sessionId,
      });
      return reference;
    }),
    revokeBinding: vi.fn(
      async (bindingId: string, deviceId: string, reference: string) => {
        log.push(`write:revoke:${bindingId}:${deviceId}`);
        // The API guard: the real route policy, then the proof's own action
        // and session. The fake 403 is this fake's, not an observed status.
        const policy = resolveRouteStepUpPolicy(
          recovery.EXACT_SEVEN_REVOKE_ROUTE.method,
          recovery.EXACT_SEVEN_REVOKE_ROUTE.path,
          admin.realm,
        );
        const proof = proofs.get(reference);
        if (
          policy &&
          !(
            proof &&
            proof.actionId === policy.actionId &&
            proof.sessionId === admin.sessionId
          )
        )
          throw new JourneyFailure("api:request", 403);
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
      },
    ),
    fleetPartnerId: FLEET,
    readSupplySubmissions: vi.fn(async () => {
      log.push("read:submissions");
      return {
        items: submissions.map((row) => structuredClone(row.submission)),
        pageInfo: { totalItems: listedTotal ?? submissions.length },
      };
    }),
    readSupplySubmission: vi.fn(async (submissionId: string) => {
      log.push(`read:submission:${submissionId}`);
      const row = submissions.find(
        (item) => item.submission.submissionId === submissionId,
      )!;
      // The API detail shape: { submission, ...submission, drafts }.
      const submission = structuredClone({ ...row.submission, ...row.detail });
      return {
        ...submission,
        submission,
        driverDraft: structuredClone(row.driverDraft),
        vehicleDraft: structuredClone(row.vehicleDraft),
      };
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
    vehicles,
    submissions,
    admin,
    proofs,
    ports,
    persisted,
    setActive: (value: unknown) => {
      active = value;
    },
    setListedTotal: (value: number) => {
      listedTotal = value;
    },
    writes: () => log.filter((entry) => entry.startsWith("write:")),
    proofRequests: () => log.filter((entry) => entry.startsWith("proof:")),
  };
}

/** The original provisionSupply chain for `${nonce}-second`, as stored. */
function addSecond(
  w: ReturnType<typeof world>,
  options: {
    approved?: boolean;
    binding?: boolean;
    vehicle?: boolean;
    workState?: string;
  } = {},
) {
  const { approved = true, binding = true, vehicle = true } = options;
  w.submissions.push(
    driverSubmission("sub_second_driver", FULL.secondSupply.nonce, {
      status: approved ? "approved" : "draft",
      canonicalDriverId: approved ? "drv_second_own" : null,
    }),
  );
  if (vehicle) {
    w.submissions.push(
      vehicleSubmission(
        "sub_second_vehicle",
        "sub_second_driver",
        approved ? "veh_second_own" : null,
      ),
    );
    if (approved) w.vehicles.push({ vehicleId: "veh_second_own" });
  }
  if (approved)
    w.drivers.push({
      driverId: "drv_second_own",
      workState: options.workState ?? "available",
      deviceBindings: binding
        ? [
            {
              bindingId: "drvbind_second",
              deviceId: FULL.secondSupply.deviceId,
              status: "active",
            },
          ]
        : [],
    });
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
    // Exactly one fresh proof, for the exact revoke route.
    expect(w.proofRequests()).toEqual([
      `proof:${recovery.EXACT_SEVEN_REVOKE_ROUTE.path}`,
    ]);
    // No exact original second source exists: unknown, not absent.
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

  it("cleans a second supply only through its exact original source chain", async () => {
    const w = world();
    addSecond(w);
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
    expect(w.proofRequests()).toHaveLength(2);
    expect(state.supply[1]).toMatchObject({
      qualification: "qualified",
      driverId: "drv_second_own",
      vehicleId: "veh_second_own",
      bindingId: "drvbind_second",
      offline: "offline-verified",
      binding: "revoked-verified",
      sourceReadback: {
        registryDeviceMatches: 1,
        exactDriverSubmissions: 1,
        exactVehicleSubmissions: 1,
        driverSubmissionId: "sub_second_driver",
      },
    });
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
      // Durable order: (the revoke's proof request,) attempted before the
      // write, ACK checkpoint after it.
      expect(supplyAt(w, part === "offline" ? 0 : 1)).toEqual([
        ...(part === "revoke" ? ["step-up-proof-requested"] : []),
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
      expect(w.proofRequests()).toEqual([]);
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

  // R4: same device, but the readback carries a different bindingId; the
  // original ACKed binding is absent and must never read as revoked.
  async function revokeActor(actorName: "first" | "second") {
    const w = world();
    addSecond(w, { workState: "offline" });
    const { state } = await gated(w);
    if (actorName === "second")
      expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
        true,
      );
    const index = actorName === "first" ? 0 : 2;
    const deviceId =
      actorName === "first"
        ? FULL.firstSupply.deviceId
        : FULL.secondSupply.deviceId;
    const bindingId =
      actorName === "first" ? "drvbind_first" : "drvbind_second";
    w.log.length = 0;
    w.persisted.length = 0;
    return { w, state, index, deviceId, bindingId };
  }
  const bindingAt = (w: ReturnType<typeof world>, actor: number) =>
    w.persisted.map(
      (facts) => (facts.supply as ObjectData[])[actor === 0 ? 0 : 1]!.binding,
    );

  it.each(["first", "second"] as const)(
    "%s revoke readback with the same device but another bindingId is readback-missing",
    async (actorName) => {
      const { w, state, index, deviceId, bindingId } =
        await revokeActor(actorName);
      readbackThen((world) =>
        Promise.resolve({
          items: [
            {
              ...structuredClone(world.drivers[index]!),
              deviceBindings: [
                { bindingId: "drvbind_other", deviceId, status: "revoked" },
              ],
            },
          ],
        }),
      )(w);
      await expect(
        recovery.cleanExactSevenSupply(state, actorName, "revoke", w.ports),
      ).rejects.toThrow(`${actorName}-revoke-readback-missing`);
      const actor = state.supply[index === 0 ? 0 : 1]!;
      expect(actor).toMatchObject({ bindingId, binding: "readback-missing" });
      expect(bindingAt(w, index)).toEqual([
        "step-up-proof-requested",
        "attempted",
        "acknowledged-readback-pending",
        "readback-missing",
      ]);
      expect(w.writes()).toEqual([`write:revoke:${bindingId}:${deviceId}`]);
      await expect(
        recovery.cleanExactSevenSupply(state, actorName, "revoke", w.ports),
      ).rejects.toThrow("at-most-once-after-orders");
      expect(w.ports.revokeBinding).toHaveBeenCalledOnce();
    },
  );

  it.each(["first", "second"] as const)(
    "%s revoke readback of the same bindingId revoked is verified",
    async (actorName) => {
      const { w, state, index, deviceId, bindingId } =
        await revokeActor(actorName);
      await recovery.cleanExactSevenSupply(state, actorName, "revoke", w.ports);
      expect(state.supply[index === 0 ? 0 : 1]!.binding).toBe(
        "revoked-verified",
      );
      expect(bindingAt(w, index)).toEqual([
        "step-up-proof-requested",
        "attempted",
        "acknowledged-readback-pending",
        "revoked-verified",
      ]);
      expect(w.writes()).toEqual([`write:revoke:${bindingId}:${deviceId}`]);
    },
  );

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

// Before-evidence only: 40818721320 recorded the proofless revoke as a 4xx
// write-denied without an exact status/code. These controls never stand in
// for that live denial's status or for a live product proof.
describe("R5: remote revoke carries a fresh same-session Admin step-up proof", () => {
  async function gated(w = world()) {
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    await recovery.verifyExactSevenFinalActive(state, w.ports);
    await recovery.cleanExactSevenSupply(state, "first", "offline", w.ports);
    w.log.length = 0;
    w.persisted.length = 0;
    return { w, state };
  }
  const revoke = (
    state: ExactSevenRecoveryState,
    w: ReturnType<typeof world>,
  ) => recovery.cleanExactSevenSupply(state, "first", "revoke", w.ports);

  it("names a route the real API policy matcher binds to the exact action", () => {
    const route = recovery.EXACT_SEVEN_REVOKE_ROUTE;
    expect(
      resolveRouteStepUpPolicy(route.method, route.path, "platform")?.actionId,
    ).toBe(route.actionId);
    // The API normalizes the /api prefix; another method or path is unbound.
    expect(
      resolveRouteStepUpPolicy("POST", "auth/driver/device/revoke", "platform")
        ?.actionId,
    ).toBe(route.actionId);
    expect(resolveRouteStepUpPolicy("GET", route.path, "platform")).toBeNull();
    expect(
      resolveRouteStepUpPolicy(
        "POST",
        "/api/auth/driver/device/invite/revoke",
        "platform",
      ),
    ).toBeNull();
    // The proofless caller's realm is enforced; a Driver's own revoke is not.
    expect(resolveRouteStepUpPolicy("POST", route.path, "driver")).toBeNull();
  });

  it("is refused without a proof and accepted with the same session's proof", async () => {
    const { w, state } = await gated();
    const first = FULL.firstSupply;
    // The original proofless request shape against the same fake guard.
    await expect(
      w.ports.revokeBinding("drvbind_first", first.deviceId, ""),
    ).rejects.toMatchObject({ stage: "api:request", status: 403 });
    w.log.length = 0;
    await revoke(state, w);
    expect(w.log.filter((entry) => !entry.startsWith("persist"))).toEqual([
      "read:drivers",
      "read:vehicles",
      "read:admin-session",
      `proof:${recovery.EXACT_SEVEN_REVOKE_ROUTE.path}`,
      `write:revoke:drvbind_first:${first.deviceId}`,
      "read:drivers",
    ]);
    expect(w.ports.stepUp).toHaveBeenCalledWith(
      recovery.EXACT_SEVEN_REVOKE_ROUTE.path,
      "ops:driver-device:revoke",
    );
    expect(w.ports.revokeBinding).toHaveBeenLastCalledWith(
      "drvbind_first",
      first.deviceId,
      "stepup_synthetic_1",
    );
    expect(state.supply[0]).toMatchObject({
      binding: "revoked-verified",
      bindingId: "drvbind_first",
    });
    // The proof reference is never custody.
    expect(JSON.stringify(w.persisted)).not.toContain("stepup_synthetic");
  });

  it.each([
    [
      "an Admin session other than the issued one",
      (w: ReturnType<typeof world>) =>
        vi.mocked(w.ports.readAdminSession).mockResolvedValueOnce({
          active: true,
          identity: {
            realm: "platform",
            actorType: "platform_admin",
            sessionId: "sess_other",
          },
        }),
      "step-up-session-unverified",
    ],
    [
      "a non-platform caller identity",
      (w: ReturnType<typeof world>) =>
        vi.mocked(w.ports.readAdminSession).mockResolvedValueOnce({
          active: true,
          identity: {
            realm: "driver",
            actorType: "driver",
            sessionId: ADMIN_SESSION,
          },
        }),
      "step-up-session-unverified",
    ],
    [
      "an unreadable session",
      (w: ReturnType<typeof world>) =>
        vi
          .mocked(w.ports.readAdminSession)
          .mockRejectedValueOnce(new JourneyFailure("api:transport")),
      "step-up-session-unverified",
    ],
    [
      "a proof for another action",
      (w: ReturnType<typeof world>) =>
        vi
          .mocked(w.ports.stepUp)
          .mockRejectedValueOnce(
            new JourneyFailure("exact same-session action proof"),
          ),
      "step-up-proof-unknown",
    ],
    [
      "a refused proof request",
      (w: ReturnType<typeof world>) =>
        vi
          .mocked(w.ports.stepUp)
          .mockRejectedValueOnce(new JourneyFailure("admin:request", 403)),
      "step-up-proof-denied",
    ],
    [
      "a lost proof response",
      (w: ReturnType<typeof world>) =>
        vi
          .mocked(w.ports.stepUp)
          .mockRejectedValueOnce(new JourneyFailure("admin:transport")),
      "step-up-proof-unknown",
    ],
    [
      "an empty reference",
      (w: ReturnType<typeof world>) =>
        vi.mocked(w.ports.stepUp).mockResolvedValueOnce(""),
      "step-up-proof-unknown",
    ],
  ] as const)(
    "sends no revoke for %s, records it, and never retries",
    async (_label, fail, binding) => {
      const { w, state } = await gated();
      fail(w);
      await expect(revoke(state, w)).rejects.toThrow(
        /first-revoke-step-up-(session-unverified|proof-(denied|unknown)-preserved)/,
      );
      expect(w.ports.revokeBinding).not.toHaveBeenCalled();
      expect(state.supply[0]!.binding).toBe(binding);
      expect(w.persisted.at(-1)).toMatchObject({
        supply: [expect.objectContaining({ binding }), expect.anything()],
      });
      if (binding === "step-up-proof-denied")
        expect(state.supply[0]!.denial).toEqual({
          stage: "step-up-proof",
          httpStatus: 403,
        });
      else expect(state.supply[0]!.denial).toBeUndefined();
      await expect(revoke(state, w)).rejects.toThrow(
        "at-most-once-after-orders",
      );
      expect(w.ports.revokeBinding).not.toHaveBeenCalled();
      expect(w.ports.stepUp).toHaveBeenCalledTimes(
        binding === "step-up-session-unverified" ? 0 : 1,
      );
    },
  );

  it("records a denied revoke with its typed status only, never retried", async () => {
    const { w, state } = await gated();
    vi.mocked(w.ports.revokeBinding).mockRejectedValueOnce(
      new JourneyFailure("api:request", 409, "CONFLICT"),
    );
    await expect(revoke(state, w)).rejects.toThrow(
      "first-revoke-write-denied-preserved",
    );
    expect(state.supply[0]).toMatchObject({
      binding: "write-denied",
      denial: { stage: "revoke", httpStatus: 409, code: "CONFLICT" },
    });
    await expect(revoke(state, w)).rejects.toThrow("at-most-once-after-orders");
    expect(w.ports.revokeBinding).toHaveBeenCalledOnce();
    expect(w.ports.stepUp).toHaveBeenCalledOnce();
  });

  it("is refused when the proof belongs to another session at the guard", async () => {
    const { w, state } = await gated();
    vi.mocked(w.ports.stepUp).mockImplementationOnce(async () => {
      w.proofs.set("stepup_foreign", {
        actionId: "ops:driver-device:revoke",
        sessionId: "sess_other",
      });
      return "stepup_foreign";
    });
    await expect(revoke(state, w)).rejects.toThrow(
      "first-revoke-write-denied-preserved",
    );
    expect(state.supply[0]!.binding).toBe("write-denied");
    expect(w.drivers[0]!.deviceBindings[0]!.status).toBe("active");
  });

  it("does not issue a proof before the whole own set is terminal and read back", async () => {
    // A live own order: no proof until it is terminal and the set read back.
    const w = world({ main: { status: "created" } });
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    await expect(revoke(state, w)).rejects.toThrow("at-most-once-after-orders");
    expect(w.ports.readAdminSession).not.toHaveBeenCalled();
    expect(w.proofRequests()).toEqual([]);
    // A retained in-trip own order keeps every supply step closed.
    const retained = world({ main: { status: "on_trip" } });
    const retainedState = createExactSevenRecoveryState();
    await precheckExactSevenOrders(retainedState, retained.ports);
    await finalize(retained, retainedState);
    expect(retained.proofRequests()).toEqual([]);
    expect(retained.ports.readAdminSession).not.toHaveBeenCalled();
    expect(retained.ports.revokeBinding).not.toHaveBeenCalled();
  });

  it("does not issue a proof for a binding that no longer matches", async () => {
    const { w, state } = await gated();
    w.drivers[0]!.deviceBindings[0]!.bindingId = "drvbind_replaced";
    await expect(revoke(state, w)).rejects.toThrow("binding-changed");
    expect(w.proofRequests()).toEqual([]);
    expect(w.ports.revokeBinding).not.toHaveBeenCalled();
  });

  it("issues nothing for an already revoked binding", async () => {
    const { w, state } = await gated();
    w.drivers[0]!.deviceBindings[0]!.status = "revoked";
    await revoke(state, w);
    expect(state.supply[0]!.binding).toBe("already-revoked");
    expect(w.proofRequests()).toEqual([]);
    expect(w.ports.readAdminSession).not.toHaveBeenCalled();
  });

  it("keeps a revoke ACK from another binding unverified", async () => {
    const { w, state } = await gated();
    vi.mocked(w.ports.revokeBinding).mockResolvedValueOnce({
      bindingId: "drvbind_foreign",
      deviceId: "foreign",
      driverId: "drv_foreign_shared_fixture",
    });
    await expect(revoke(state, w)).rejects.toThrow(
      "first-revoke-readback-missing",
    );
    expect(state.supply[0]!.binding).toBe("readback-missing");
  });

  it.each([
    ["proof request", "stepUp", "step-up-proof-requested"],
    ["revoke ACK", "revokeBinding", "attempted"],
  ] as const)(
    "keeps a delayed %s unknown at the finalizer budget, unretried",
    async (_label, port, binding) => {
      const w = world();
      w.drivers[0]!.workState = "offline";
      vi.mocked(w.ports[port]).mockImplementationOnce(
        () => new Promise(() => undefined),
      );
      const state = createExactSevenRecoveryState();
      await precheckExactSevenOrders(state, w.ports);
      const { result } = await finalize(w, state, 300);
      expect(
        result.steps.find(
          (step) => step.stage === "exact-seven-first-own-binding-revoked",
        )?.outcome,
      ).toBe("unknown-budget-exhausted");
      expect(state.supply[0]!.binding).toBe(binding);
      expect(w.ports.stepUp).toHaveBeenCalledOnce();
      expect(w.ports.revokeBinding).toHaveBeenCalledTimes(
        port === "stepUp" ? 0 : 1,
      );
      expect(result.wholeRunPassed).toBe(false);
    },
  );
});

describe("R6: second supply exact read-only source qualification", () => {
  async function gated(w = world()) {
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    await recovery.verifyExactSevenFinalActive(state, w.ports);
    w.log.length = 0;
    return { w, state };
  }
  // For the actual finalizer plan, which runs the final readback itself.
  async function prechecked(w: ReturnType<typeof world>) {
    const state = createExactSevenRecoveryState();
    await precheckExactSevenOrders(state, w.ports);
    return { state };
  }
  const second = (state: ExactSevenRecoveryState) => state.supply[1]!;

  it("qualifies only the complete exact original driver/vehicle/binding chain", async () => {
    const w = world();
    addSecond(w);
    const { state } = await gated(w);
    expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
      true,
    );
    expect(second(state)).toMatchObject({
      qualification: "qualified",
      driverId: "drv_second_own",
      vehicleId: "veh_second_own",
      bindingId: "drvbind_second",
      sourceReadback: {
        registryDeviceMatches: 1,
        listComplete: true,
        exactDriverSubmissions: 1,
        partialFieldMatches: 0,
        exactVehicleSubmissions: 1,
        driverSubmissionStatus: "approved",
        refusal: null,
      },
    });
    // Read-only, and only the original Fleet's onboarding submissions.
    expect(w.writes()).toEqual([]);
    expect(w.proofRequests()).toEqual([]);
    expect(w.ports.readSupplySubmission).not.toHaveBeenCalledWith(
      "sub_foreign_fleet",
    );
    // No draft value (license, phone, name) enters custody.
    const custody = JSON.stringify(w.persisted);
    expect(custody).not.toContain("SIM-DL-");
    expect(custody).not.toContain("synthetic-not-a-phone");
    expect(custody).not.toContain("合成測試司機");
  });

  it("keeps a complete listing with no exact source unknown, never absent", async () => {
    const { w, state } = await gated();
    expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
      false,
    );
    expect(second(state)).toMatchObject({
      qualification: "not-observed-unknown",
      sourceReadback: {
        registryDeviceMatches: 0,
        listComplete: true,
        candidates: 2,
        candidatesRead: 2,
        exactDriverSubmissions: 0,
        absence: "not-claimed-authority-unattested",
        refusal: "no-exact-source-observed",
      },
    });
    expect(second(state).driverId).toBeUndefined();
  });

  it("distinguishes a created, never approved draft from absence", async () => {
    const w = world();
    addSecond(w, { approved: false });
    const { state } = await gated(w);
    expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
      false,
    );
    expect(second(state)).toMatchObject({
      qualification: "created-no-canonical-driver",
      sourceReadback: {
        driverSubmissionId: "sub_second_driver",
        driverSubmissionStatus: "draft",
      },
    });
  });

  it("distinguishes an approved Driver without the exact device binding", async () => {
    const w = world();
    addSecond(w, { binding: false });
    const { state } = await prechecked(w);
    const { cleanupErrors } = await finalize(w, state);
    expect(second(state)).toMatchObject({
      qualification: "created-binding-not-observed-unknown",
      driverId: "drv_second_own",
      offline: "pending",
      binding: "pending",
    });
    expect(w.writes()).not.toContain("write:offline:drv_second_own");
    expect(cleanupErrors).toEqual([
      "exact-seven-second-supply-created-binding-not-observed-unknown",
    ]);
  });

  it.each([
    [
      "a partial listing",
      (w: ReturnType<typeof world>) => w.setListedTotal(99),
      "qualification-unknown",
      "submission-list-partial",
    ],
    [
      "a foreign prefix of the exact fields",
      (w: ReturnType<typeof world>) =>
        w.submissions.push(
          driverSubmission(
            "sub_prefix",
            `${FULL.secondSupply.nonce}-x`,
            {},
            {},
          ),
        ),
      "not-observed-unknown",
      "no-exact-source-observed",
    ],
    [
      "only one exact field",
      (w: ReturnType<typeof world>) =>
        w.submissions.push(
          driverSubmission(
            "sub_half",
            FULL.secondSupply.nonce,
            {},
            { taxiDriverRegistrationNo: "SIM-REG-other" },
          ),
        ),
      "ambiguous-unknown",
      "second-source-not-unique",
    ],
    [
      "two exact sources",
      (w: ReturnType<typeof world>) => {
        addSecond(w);
        w.submissions.push(
          driverSubmission("sub_second_again", FULL.secondSupply.nonce),
        );
      },
      "ambiguous-unknown",
      "second-source-not-unique",
    ],
    [
      "an exact device binding without its exact source",
      (w: ReturnType<typeof world>) =>
        w.drivers.push({
          driverId: "drv_unsourced",
          workState: "available",
          deviceBindings: [
            {
              bindingId: "drvbind_unsourced",
              deviceId: FULL.secondSupply.deviceId,
              status: "active",
            },
          ],
        }),
      "mismatch-preserved",
      "device-binding-without-exact-source-submission",
    ],
    [
      "a source naming another canonical Driver",
      (w: ReturnType<typeof world>) => {
        addSecond(w);
        w.submissions.find(
          (row) => row.submission.submissionId === "sub_second_driver",
        )!.submission.canonicalDriverId = "drv_someone_else";
      },
      "mismatch-preserved",
      "source-driver-or-vehicle-chain-mismatch",
    ],
    [
      "no exact vehicle of the source",
      (w: ReturnType<typeof world>) => addSecond(w, { vehicle: false }),
      "mismatch-preserved",
      "source-driver-or-vehicle-chain-mismatch",
    ],
  ] as const)(
    "refuses %s without any write",
    async (_label, arrange, qualification, refusal) => {
      const w = world();
      arrange(w);
      const { state } = await prechecked(w);
      const { cleanupErrors } = await finalize(w, state);
      expect(second(state)).toMatchObject({
        qualification,
        sourceReadback: { refusal },
      });
      // Only the first supply's own offline and revoke were sent.
      expect(w.writes()).toEqual([
        `write:offline:${FULL.firstSupply.driverId}`,
        `write:revoke:drvbind_first:${FULL.firstSupply.deviceId}`,
      ]);
      expect(w.proofRequests()).toHaveLength(1);
      expect(cleanupErrors).toEqual([
        `exact-seven-second-supply-${qualification}`,
      ]);
      if (refusal === "submission-list-partial")
        expect(w.ports.readSupplySubmission).not.toHaveBeenCalled();
    },
  );

  // R1 (Codex REOPEN): the exact license/registration fields alone never
  // authorize; each detail must still be the listed Fleet onboarding row at
  // its listed status and revision, and the chain must be approved.
  const secondRow = (w: ReturnType<typeof world>, id: string) =>
    w.submissions.find((row) => row.submission.submissionId === id)!;
  it.each([
    [
      "a detail of another Fleet than its list row",
      (w: ReturnType<typeof world>) =>
        (secondRow(w, "sub_second_driver").detail = {
          fleetPartnerId: "fleet-demo-002",
        }),
      "submission-detail-diverged-from-list",
    ],
    [
      "a detail that is not an onboarding submission",
      (w: ReturnType<typeof world>) =>
        (secondRow(w, "sub_second_driver").detail = {
          submissionType: "profile_correction",
        }),
      "submission-detail-diverged-from-list",
    ],
    [
      "an unapproved detail at a newer revision than its list row",
      (w: ReturnType<typeof world>) =>
        (secondRow(w, "sub_second_driver").detail = {
          status: "revision_requested",
          revisionNo: 4,
        }),
      "submission-detail-diverged-from-list",
    ],
    [
      "a vehicle detail of another Fleet",
      (w: ReturnType<typeof world>) =>
        (secondRow(w, "sub_second_vehicle").detail = {
          fleetPartnerId: "fleet-demo-002",
        }),
      "submission-detail-diverged-from-list",
    ],
    [
      "a consistent but not approved driver source",
      (w: ReturnType<typeof world>) => {
        const row = secondRow(w, "sub_second_driver");
        row.submission.status = "needs_revision";
      },
      "source-chain-not-approved",
    ],
  ] as const)(
    "refuses %s with no second offline, proof or revoke",
    async (_label, arrange, refusal) => {
      const w = world();
      addSecond(w);
      arrange(w);
      const { state } = await gated(w);
      expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
        false,
      );
      expect(second(state).qualification).not.toBe("qualified");
      expect(second(state)).toMatchObject({
        qualification: "mismatch-preserved",
        sourceReadback: { refusal },
      });
      expect(second(state).driverId).toBeUndefined();
      expect(second(state).bindingId).toBeUndefined();
      await expect(
        recovery.cleanExactSevenSupply(state, "second", "offline", w.ports),
      ).rejects.toThrow("second-supply-not-qualified");
      await expect(
        recovery.cleanExactSevenSupply(state, "second", "revoke", w.ports),
      ).rejects.toThrow("second-supply-not-qualified");
      expect(w.writes()).toEqual([]);
      expect(w.proofRequests()).toEqual([]);
      expect(w.ports.setOffline).not.toHaveBeenCalled();
      expect(w.ports.readAdminSession).not.toHaveBeenCalled();
      expect(w.ports.revokeBinding).not.toHaveBeenCalled();
    },
  );

  it("still qualifies the same chain when every detail equals its list row", async () => {
    const w = world();
    addSecond(w);
    for (const id of ["sub_second_driver", "sub_second_vehicle"])
      secondRow(w, id).detail = {
        fleetPartnerId: FLEET,
        status: "approved",
        revisionNo: 3,
      };
    const { state } = await gated(w);
    expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
      true,
    );
    await recovery.cleanExactSevenSupply(state, "second", "offline", w.ports);
    await recovery.cleanExactSevenSupply(state, "second", "revoke", w.ports);
    expect(second(state)).toMatchObject({
      qualification: "qualified",
      offline: "offline-verified",
      binding: "revoked-verified",
    });
    expect(w.writes()).toEqual([
      "write:offline:drv_second_own",
      `write:revoke:drvbind_second:${FULL.secondSupply.deviceId}`,
    ]);
    expect(w.proofRequests()).toHaveLength(1);
  });

  it("keeps a failed detail read unknown with only the partial counts", async () => {
    const w = world();
    addSecond(w);
    const { state } = await gated(w);
    const real = vi
      .mocked(w.ports.readSupplySubmission)
      .getMockImplementation()!;
    vi.mocked(w.ports.readSupplySubmission)
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new JourneyFailure("admin:transport"));
    await expect(
      recovery.qualifyExactSevenSecondSupply(state, w.ports),
    ).rejects.toThrow("admin:transport");
    expect(second(state)).toMatchObject({
      qualification: "qualification-unknown",
      sourceReadback: { candidatesRead: 1, exactDriverSubmissions: null },
    });
    expect(second(state).driverId).toBeUndefined();
    expect(w.persisted.at(-1)).toMatchObject({
      supply: [
        expect.anything(),
        expect.objectContaining({ qualification: "qualification-unknown" }),
      ],
    });
  });

  it("refuses more candidates than the bounded read budget", async () => {
    const w = world();
    for (let index = 0; index < 200; index += 1)
      w.submissions.push(
        driverSubmission(`sub_bulk_${index}`, `synthetic-bulk-${index}`),
      );
    const { state } = await gated(w);
    expect(await recovery.qualifyExactSevenSecondSupply(state, w.ports)).toBe(
      false,
    );
    expect(second(state)).toMatchObject({
      qualification: "qualification-unknown",
      sourceReadback: { refusal: "submission-candidates-over-bound" },
    });
    expect(w.ports.readSupplySubmission).not.toHaveBeenCalled();
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

  it("wires the revoke to the existing stepUp helper and the exact route", () => {
    const ports = find(
      (node) =>
        ts.isBinaryExpression(node) &&
        node.left.getText(source) === "exactSevenPorts" &&
        ts.isObjectLiteralExpression(node.right),
    )[0] as ts.BinaryExpression;
    const property = (name: string) =>
      (ports.right as ts.ObjectLiteralExpression).properties
        .find((item) => item.name?.getText(source) === name)!
        .getText(source);
    // The original helper: same Admin token, POST step-up-proofs {method,path}.
    expect(property("stepUp")).toBe("stepUp");
    const helper = find(
      (node) =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(source) === "stepUp",
    )[0]!.getText(source);
    expect(helper).toContain('"/control-plane-proxy/identity/step-up-proofs"');
    expect(helper).toContain('body: { method: "POST", path }');
    expect(helper).toContain("mask(reference)");
    expect(helper).toContain("proof.actionId === actionId");
    const revokeCall = property("revokeBinding");
    expect(revokeCall).toContain('call("api", EXACT_SEVEN_REVOKE_ROUTE.path');
    expect(revokeCall).toContain("method: EXACT_SEVEN_REVOKE_ROUTE.method");
    expect(revokeCall).toContain('"x-drts-step-up-reference": stepUpReference');
    expect(property("readAdminSession")).toContain(
      'call("api", "/api/auth/session")',
    );
    expect(property("adminSessionId")).toContain("text(adminSessionId)");
    expect(property("fleetPartnerId")).toContain("FLEET");
    // The supply-review reads are GET only; no driver token is ever used.
    for (const name of ["readSupplySubmissions", "readSupplySubmission"]) {
      expect(property(name)).toContain(
        "/control-plane-proxy/admin/supply-review/submissions",
      );
      expect(property(name)).not.toMatch(/method|body/);
    }
    expect(ports.right.getText(source)).not.toMatch(/"driver"|setSession/);
  });
});
