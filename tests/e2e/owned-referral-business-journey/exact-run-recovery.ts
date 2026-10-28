import {
  JourneyFailure,
  object,
  records,
  requireFact,
  text,
  type Evidence,
  type ObjectData,
} from "./protocol";

// One explicitly fixed failed run: FULL 40689200536 (job 122819370750,
// definition cb0e, runtime 1a3f) acknowledged seven own synthetic bookings and
// lost its final custody. The original 39445009990 single-unknown recovery in
// original-journal-recovery.ts / retained-order-recovery.ts is separate and
// unchanged. Nothing here creates a booking, quote, consent, supply or
// dispatch, and no acknowledged command is ever sent again.
const NONCE = "owned-referral-40689200536-a1f1be78-03c1-455e-ab89-ff1a4b577447";
const journal = (
  member: string,
  slot: ExactSevenSlot,
  scheduled: boolean,
  bytes: number,
  sha256: string,
  orderId: string,
  quoteId: string,
  bodySha256: string,
  keySha256: string,
) =>
  Object.freeze({
    member,
    slot,
    scheduled,
    bytes,
    sha256,
    orderId,
    quoteId,
    nonce: slot === "main" ? NONCE : `${NONCE}-${slot}`,
    bodySha256,
    keySha256,
  });

export type ExactSevenSlot =
  | "main"
  | "unassigned"
  | "assigned-not-arrived"
  | "arrived-not-started"
  | "on-trip"
  | "reservation-1"
  | "reservation-2";

export const FULL406892_EXACT_SEVEN_ACK = Object.freeze({
  profile: "full406892-exact-seven-ack",
  repository: "ajoe734/drts-fleet-platform",
  run: 40689200536,
  artifact: 12816544475,
  definitionSha: "cb0e0cf004cf40a0bbdde797937527f59521e54c",
  runtimeSha: "1a3fbf8bca9e607085eb0c2e670b46763331f1da",
  branch: "qa/referral-owned-lowrating-cb0-runtime-1a3-20261028T123548Z",
  name: "owned-referral-business-1a3fbf8bca9e607085eb0c2e670b46763331f1da-40689200536",
  digest:
    "sha256:3821a749170b574721f6b29bcbaaf4ffa13fc7aee1eeb4577e7977cd1f0362f8",
  bytes: 1927299,
  members: 34,
  nonce: NONCE,
  entrySlug: "yuhe-residence",
  partnerUserRef: "referral-demo-yuhe-residence",
  journals: Object.freeze([
    journal(
      "booking-write-journal.json",
      "main",
      false,
      1365,
      "0591dbfe27f06c0e9f0838645e7d75c05e27d59ea013f83eae9b6bc5bea7d2b8",
      "ffbf57f4-e3a3-482f-9fdf-69e69b758581",
      "34037bee-6ac7-43f9-9b28-a71e560caa88",
      "6daa2285debe4837ccede32e66d9d256cf57313005c4d91522a078acc4948773",
      "0f978daebec7086c3cc2139665f2bcab6847d9b215d07edf1d96adec2dba5959",
    ),
    journal(
      "cancellations/unassigned-booking-write-journal.json",
      "unassigned",
      false,
      1468,
      "f4934d2229ef906ffc4eac97579196dd3546de6d149acb0ed97b7defda5d1e64",
      "30a6d31b-c065-483c-8988-efe9d1d63954",
      "c91abb0f-ea87-4f03-967d-57af584a38bc",
      "bee9b4ce686debc41d34fa7713136dc9d58c0dd5363b213b58a8d16bc959af5f",
      "6fc42d136fd60deb5774a71ff7d0a98144880e74a0f335247ddc5ca2bfae7609",
    ),
    journal(
      "cancellations/assigned-not-arrived-booking-write-journal.json",
      "assigned-not-arrived",
      false,
      1498,
      "52211674d13be2c3794223b13aec44fdb42a834babbf874e5a61b1c581d85689",
      "399db561-e7b0-4c2c-8550-12b431e5a8af",
      "95a57d8a-71db-4173-9927-4e40e74f05b6",
      "a13b38e0ef791ef2aa9ba432a0bf4a3abb2928b0389ff29cef856817056cf200",
      "7d3201bc9bb4b7860b0edebfeb28a40808631b95b90dfb58f97acf7f6dc195e3",
    ),
    journal(
      "cancellations/arrived-not-started-booking-write-journal.json",
      "arrived-not-started",
      false,
      1495,
      "46765f8c1ba2f69d43f4fd5c36e1d11ad5a17198f501910dc04fea31f834a78c",
      "fd9f1453-1d54-45a8-943b-ede32fa6eca4",
      "c26d1d0f-8b69-43e2-8235-350774b7ae36",
      "d87841b1be1a5858e9a7419117d1a7d6a85cc88317c7d2b2a3583eb8656eebed",
      "f2a59169b875464a50145c84bd3a9ad4ad3c7f41f543cfa4fcbde924f707a4c5",
    ),
    journal(
      "cancellations/on-trip-booking-write-journal.json",
      "on-trip",
      false,
      1459,
      "ea56a3c1342209d8e5ec42738804753672f787330fd0a2be7a15015f486164de",
      "351fafb4-a909-4fa0-baad-3815b1a28060",
      "0949e9e2-4baa-4295-8460-0439cd12cf84",
      "7f6d23be61d18f84d8ab323f5d1ae75667c545855e5b289739d04fa9c3455392",
      "7d209b52d9d8afe6abd3855e4e46d3c8a5d765e5d25bf1c54270a7a0a50ce8e3",
    ),
    journal(
      "TEN03-06/reservation-1/booking-write-journal.json",
      "reservation-1",
      true,
      1424,
      "c317c2acde40d058747450c5b3c2ec631ba7d8106dca78d34a203fb0ab81f45b",
      "caf161fb-38cf-4d25-9e18-46d85f95a7ed",
      "f480ed48-35a6-4812-aede-232455b86b1b",
      "60429a9a830a6dd11b96d1994306bd4ba2a047c36dc7aa858f22d5443e91e2da",
      "45896a5ac2e9435d5cd0408385e76a6f57074b032cd839b93ca0a36777c0b1f5",
    ),
    journal(
      "TEN03-06/reservation-2/booking-write-journal.json",
      "reservation-2",
      true,
      1424,
      "6d120c8373e0fba9de7eef2c3be2849d53e2e9acb98a396db898a6ce3f4c1b45",
      "848de867-6e77-432e-acc9-5fc41580c259",
      "baadf7e9-5b25-4e54-bb7e-99ee87e8f654",
      "101541c6628914ea10065b3b0e25980f5d96bb7fa8ccbb17b1d3e99674fbd3ad",
      "0260198793d89cf9f596b599faf059bbb6151584053a4cce0dbea35e7aca32c7",
    ),
  ]),
  // Original C2-C4 task facts bind this pair; the device is the original
  // provisionSupply `${nonce}-device`. Its bindingId is not in the artifact.
  firstSupply: Object.freeze({
    driverId: "drv_e2375f97-02fc-40cc-97b3-6ddd7b94c661",
    vehicleId: "veh_aabf1431-6ec1-42a1-92fb-34c9bad437fd",
    deviceId: `${NONCE}-device`,
    taskFacts: Object.freeze([
      "cancellations/assigned-not-arrived-facts.json",
      "cancellations/arrived-not-started-facts.json",
      "cancellations/on-trip-facts.json",
    ]),
  }),
  // No ID of a second supply exists in the artifact; only its deterministic
  // original device identity, which must be observed before any action.
  secondSupply: Object.freeze({
    nonce: `${NONCE}-second`,
    deviceId: `${NONCE}-second-device`,
  }),
});

const FULL = FULL406892_EXACT_SEVEN_ACK;
// Both paths match the existing `cancellations/*-facts.json` upload allowlist.
export const EXACT_SEVEN_SOURCE_FACTS =
  "cancellations/exact-seven-ack-source-facts.json";
export const EXACT_SEVEN_RECOVERY_FACTS =
  "cancellations/exact-seven-ack-recovery-facts.json";
const MANIFEST_MAX_BYTES = 16384;

/** The existing expected runtime alone selects this profile; no other input. */
export function selectsExactSevenProfile(runtimeSha: string) {
  return runtimeSha === FULL.runtimeSha;
}

/** What retained-journal.py writes after verifying the official artifact. */
export function expectedExactSevenManifest(): ObjectData {
  return {
    version: 1,
    profile: FULL.profile,
    officialArtifactVerified: true,
    repository: FULL.repository,
    run: FULL.run,
    artifact: FULL.artifact,
    definitionSha: FULL.definitionSha,
    runtimeSha: FULL.runtimeSha,
    branch: FULL.branch,
    name: FULL.name,
    digest: FULL.digest,
    bytes: FULL.bytes,
    members: FULL.members,
    nonce: FULL.nonce,
    entrySlug: FULL.entrySlug,
    partnerUserRef: FULL.partnerUserRef,
    journals: FULL.journals.map((item) => ({ ...item })),
    firstSupply: {
      ...FULL.firstSupply,
      taskFacts: [...FULL.firstSupply.taskFacts],
    },
    secondSupply: { ...FULL.secondSupply },
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as ObjectData)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * The loader's file only attests that this job verified the official artifact.
 * It must equal the compiled profile exactly; the profile, never the file, is
 * returned as authority.
 */
export function parseExactSevenAckManifest(
  bytes: Uint8Array,
  runtimeSha: string,
): typeof FULL406892_EXACT_SEVEN_ACK {
  requireFact(
    selectsExactSevenProfile(runtimeSha),
    "exact-seven:runtime-profile-required",
  );
  requireFact(
    bytes.length > 0 && bytes.length <= MANIFEST_MAX_BYTES,
    "exact-seven:bounded-source-manifest-required",
  );
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new JourneyFailure("exact-seven:source-manifest-json-required");
  }
  requireFact(
    canonical(value) === canonical(expectedExactSevenManifest()),
    "exact-seven:official-source-manifest-mismatch",
  );
  return FULL;
}

const TERMINAL = new Set(["cancelled", "completed"]);
// Statuses the product's own active lookup treats as not live.
const NOT_LIVE = new Set([
  "cancelled",
  "completed",
  "dispatch_failed",
  "dispatch_timeout",
  "no_supply",
]);

export type ExactOrderOutcome =
  | "pending"
  | "already-terminal"
  | "normal-passenger-cancel"
  | "existing-hold-resolved"
  | "retained-window-closed"
  | "retained-in-trip-or-assigned"
  | "retained-unsupported-state"
  | "retained-changed-before-write"
  | "write-denied"
  | "write-ack-unknown"
  | "terminal-readback-missing";
export type ExactOrderState = {
  slot: ExactSevenSlot;
  orderId: string;
  quoteId: string;
  bodySha256: string;
  scheduled: boolean;
  before?: {
    status: string;
    reservationHoldStatus: string | null;
    cancelableUntil: string | null;
  };
  decision?: "readonly" | "cancel" | "resolve-hold" | "retain";
  outcome: ExactOrderOutcome;
  terminalStatus?: "cancelled" | "completed";
  terminalVerified: boolean;
  write?: {
    action: "cancel" | "resolve-hold";
    acknowledged: boolean;
    httpStatus?: number;
    code?: string;
  };
};
export type ExactSupplyState = {
  actor: "first" | "second";
  driverId?: string;
  vehicleId?: string;
  deviceId: string;
  bindingId?: string;
  qualification:
    | "pending"
    | "qualified"
    | "not-observed-unknown"
    | "ambiguous-unknown"
    | "mismatch-preserved"
    | "blocked-orders-unresolved";
  offline:
    | "pending"
    | "already-offline"
    | "offline-verified"
    | "write-denied"
    | "write-ack-unknown"
    | "readback-missing";
  binding:
    | "pending"
    | "already-revoked"
    | "revoked-verified"
    | "write-denied"
    | "write-ack-unknown"
    | "readback-missing";
};
export type ExactSevenRecoveryState = {
  profile: string;
  phase: "unverified" | "prechecked" | "precheck-refused";
  orders: ExactOrderState[];
  supply: ExactSupplyState[];
  foreignLiveAfter: number | null;
};

export function createExactSevenRecoveryState(): ExactSevenRecoveryState {
  return {
    profile: FULL.profile,
    phase: "unverified",
    orders: FULL.journals.map((item) => ({
      slot: item.slot,
      orderId: item.orderId,
      quoteId: item.quoteId,
      bodySha256: item.bodySha256,
      scheduled: item.scheduled,
      outcome: "pending",
      terminalVerified: false,
    })),
    supply: [
      {
        actor: "first",
        driverId: FULL.firstSupply.driverId,
        vehicleId: FULL.firstSupply.vehicleId,
        deviceId: FULL.firstSupply.deviceId,
        qualification: "pending",
        offline: "pending",
        binding: "pending",
      },
      {
        actor: "second",
        deviceId: FULL.secondSupply.deviceId,
        qualification: "pending",
        offline: "pending",
        binding: "pending",
      },
    ],
    foreignLiveAfter: null,
  };
}

export type ExactSevenPorts = {
  passengerId: string;
  readHistoryList: () => Promise<unknown>;
  readHistory: (orderId: string) => Promise<unknown>;
  readActive: () => Promise<unknown>;
  readOrder: (orderId: string) => Promise<unknown>;
  cancel: (orderId: string) => Promise<unknown>;
  resolveHold: (orderId: string, traceId: string) => Promise<unknown>;
  readDrivers: () => Promise<unknown>;
  readVehicles: () => Promise<unknown>;
  setOffline: (driverId: string) => Promise<unknown>;
  revokeBinding: (bindingId: string, deviceId: string) => Promise<unknown>;
  // Durable minimal typed facts; called before every write and after its ACK.
  persist: (facts: ObjectData) => Promise<void>;
  now: () => number;
  evidence: Evidence;
};

/** Safe typed custody only: no body, key, token, phone or provider error. */
export function exactSevenFacts(state: ExactSevenRecoveryState): ObjectData {
  return {
    profile: state.profile,
    run: FULL.run,
    artifact: FULL.artifact,
    definitionSha: FULL.definitionSha,
    runtimeSha: FULL.runtimeSha,
    recoveryOnly: true,
    fullJourneyClaimed: false,
    phase: state.phase,
    orders: state.orders.map((order) => ({
      slot: order.slot,
      orderId: order.orderId,
      quoteId: order.quoteId,
      bodySha256: order.bodySha256,
      before: order.before ?? null,
      decision: order.decision ?? null,
      outcome: order.outcome,
      terminalStatus: order.terminalStatus ?? null,
      terminalVerified: order.terminalVerified,
      write: order.write ?? null,
    })),
    supply: state.supply.map((actor) => ({ ...actor })),
    foreignLiveAfter: state.foreignLiveAfter,
  };
}

const slotOf = (state: ExactSevenRecoveryState, slot: ExactSevenSlot) => {
  const order = state.orders.find((item) => item.slot === slot);
  requireFact(order, "exact-seven:fixed-slot-required");
  return order;
};
const isOwnId = (state: ExactSevenRecoveryState, orderId: unknown) =>
  state.orders.some((order) => order.orderId === orderId);
const nullableText = (value: unknown) =>
  typeof value === "string" ? value : null;

// A typed 4xx is an explicit application refusal. Every other failure after
// the request left (transport, 5xx, edge/runtime/envelope) may have written.
function writeFailure(error: unknown) {
  if (
    error instanceof JourneyFailure &&
    error.stage.endsWith(":request") &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  )
    return {
      outcome: "write-denied" as const,
      httpStatus: error.status,
      ...(error.code ? { code: error.code } : {}),
    };
  return { outcome: "write-ack-unknown" as const };
}

function ownCanonical(
  ports: ExactSevenPorts,
  order: ExactOrderState,
  value: unknown,
) {
  const canonicalOrder = object(value);
  requireFact(
    canonicalOrder.orderId === order.orderId &&
      canonicalOrder.partnerEntrySlug === FULL.entrySlug &&
      object(canonicalOrder.passenger).passengerId === ports.passengerId &&
      object(object(canonicalOrder.referralPassengerLifecycle).quote)
        .quoteId === order.quoteId,
    `exact-seven:${order.slot}-canonical-owner-or-quote-mismatch`,
  );
  return canonicalOrder;
}

function ownHistory(order: ExactOrderState, value: unknown) {
  const history = object(value);
  requireFact(
    history.orderId === order.orderId &&
      object(history.quote).quoteId === order.quoteId,
    `exact-seven:${order.slot}-history-quote-mismatch`,
  );
  return history;
}

function liveIds(value: unknown) {
  return records(object(value).items)
    .filter((item) => !NOT_LIVE.has(String(item.status)))
    .map((item) => text(item.orderId));
}

function activeOrderId(value: unknown): string | null {
  if (value === null) return null;
  const active = object(value);
  if (active.active === false && active.trip === null) return null;
  requireFact(active.active === true, "exact-seven:active-readback-shape");
  return text(object(active.trip).orderId);
}

/**
 * Read-only qualification of the whole fixed own set before any write: every
 * live order of this subject must be one of the seven, and each of the seven
 * must keep its original entry, passenger and quote. A refusal issues nothing.
 */
export async function precheckExactSevenOrders(
  state: ExactSevenRecoveryState,
  ports: ExactSevenPorts,
) {
  requireFact(state.phase === "unverified", "exact-seven:precheck-once");
  text(ports.passengerId, "exact-seven:passenger-required");
  state.phase = "precheck-refused";
  const list = await ports.readHistoryList();
  const listed = records(object(list).items);
  const foreign = liveIds(list).filter((id) => !isOwnId(state, id));
  const activeValue = await ports.readActive();
  const activeId = activeOrderId(activeValue);
  requireFact(
    foreign.length === 0 && (activeId === null || isOwnId(state, activeId)),
    "exact-seven:foreign-live-order-preserved",
  );
  const active = activeId === null ? null : object(object(activeValue).trip);
  for (const order of state.orders) {
    const rows = listed.filter((item) => item.orderId === order.orderId);
    requireFact(
      rows.length === 1,
      `exact-seven:${order.slot}-history-row-required`,
    );
    const history = ownHistory(order, await ports.readHistory(order.orderId));
    const canonicalOrder = ownCanonical(
      ports,
      order,
      await ports.readOrder(order.orderId),
    );
    const status = text(canonicalOrder.status);
    requireFact(
      history.status === status && rows[0]!.status === status,
      `exact-seven:${order.slot}-canonical-history-status-diverged`,
    );
    order.before = {
      status,
      reservationHoldStatus: nullableText(canonicalOrder.reservationHoldStatus),
      cancelableUntil: nullableText(canonicalOrder.cancelableUntil),
    };
  }
  // Decisions only after the whole set qualified.
  for (const order of state.orders) {
    const before = order.before!;
    if (TERMINAL.has(before.status)) {
      order.decision = "readonly";
      order.outcome = "already-terminal";
      order.terminalStatus = before.status as "cancelled" | "completed";
      order.terminalVerified = true;
    } else if (
      before.status === "exception_hold" &&
      before.reservationHoldStatus === "exception_hold"
    ) {
      order.decision = "resolve-hold";
    } else if (before.status === "created" && !order.scheduled) {
      order.decision = "cancel";
    } else if (before.status === "created") {
      // A future reservation is cancelled only inside its real window; it is
      // never completed, dispatched or clock-shifted to make it cancellable.
      const window =
        active?.orderId === order.orderId && active.cancellationWindow
          ? object(active.cancellationWindow)
          : null;
      const open =
        before.cancelableUntil !== null &&
        Date.parse(before.cancelableUntil) > ports.now() &&
        (window === null ||
          (window.canCancel === true &&
            window.cancelableUntil === before.cancelableUntil));
      order.decision = open ? "cancel" : "retain";
      if (!open) order.outcome = "retained-window-closed";
    } else {
      order.decision = "retain";
      order.outcome = NOT_LIVE.has(before.status)
        ? "retained-unsupported-state"
        : "retained-in-trip-or-assigned";
    }
  }
  state.phase = "prechecked";
  await ports.persist(exactSevenFacts(state));
  ports.evidence.record({
    stage: "exact-seven-ACK-own-set-prechecked",
    result: "observed",
  });
}

/** One normal terminal write for one fixed order; never retried. */
export async function terminalizeExactSevenOrder(
  state: ExactSevenRecoveryState,
  slot: ExactSevenSlot,
  ports: ExactSevenPorts,
) {
  const order = slotOf(state, slot);
  requireFact(
    state.phase === "prechecked" &&
      (order.decision === "cancel" || order.decision === "resolve-hold") &&
      order.outcome === "pending" &&
      order.write === undefined,
    `exact-seven:${slot}-terminalization-at-most-once`,
  );
  const action = order.decision;
  const current = ownCanonical(
    ports,
    order,
    await ports.readOrder(order.orderId),
  );
  if (
    current.status !== order.before!.status ||
    nullableText(current.reservationHoldStatus) !==
      order.before!.reservationHoldStatus ||
    nullableText(current.cancelableUntil) !== order.before!.cancelableUntil
  ) {
    order.outcome = "retained-changed-before-write";
    await ports.persist(exactSevenFacts(state));
    throw new JourneyFailure(
      `exact-seven:${slot}-changed-before-write-preserved`,
    );
  }
  // The durable intent precedes the request; a failed persist sends nothing
  // and the at-most-once guard keeps this order from any later attempt.
  order.write = { action, acknowledged: false };
  await ports.persist(exactSevenFacts(state));
  try {
    const ack =
      action === "cancel"
        ? object(await ports.cancel(order.orderId))
        : object(
            await ports.resolveHold(
              order.orderId,
              `owned-referral-recovery:${FULL.run}:${order.orderId}:cancel`,
            ),
          );
    requireFact(
      ack.orderId === undefined || ack.orderId === order.orderId,
      `exact-seven:${slot}-ack-order-binding`,
    );
  } catch (error) {
    const failure = writeFailure(error);
    order.outcome = failure.outcome;
    if (failure.outcome === "write-denied") {
      order.write.httpStatus = failure.httpStatus;
      if (failure.code) order.write.code = failure.code;
    }
    await ports.persist(exactSevenFacts(state));
    throw new JourneyFailure(
      `exact-seven:${slot}-${failure.outcome}-preserved`,
    );
  }
  order.write.acknowledged = true;
  await ports.persist(exactSevenFacts(state));
  const after = ownCanonical(
    ports,
    order,
    await ports.readOrder(order.orderId),
  );
  const history = ownHistory(order, await ports.readHistory(order.orderId));
  if (
    !(TERMINAL.has(String(after.status)) && history.status === after.status)
  ) {
    order.outcome = "terminal-readback-missing";
    await ports.persist(exactSevenFacts(state));
    throw new JourneyFailure(`exact-seven:${slot}-terminal-readback-missing`);
  }
  order.terminalStatus = after.status as "cancelled" | "completed";
  order.terminalVerified = true;
  order.outcome =
    action === "cancel" ? "normal-passenger-cancel" : "existing-hold-resolved";
  await ports.persist(exactSevenFacts(state));
  ports.evidence.record({
    stage: `exact-seven-${slot}-terminal-readback`,
    orderId: order.orderId,
    result: "observed",
  });
}

export function exactSevenOrdersAllTerminal(state: ExactSevenRecoveryState) {
  return (
    state.phase === "prechecked" &&
    state.orders.every((order) => order.terminalVerified)
  );
}

/** Read-only: verified own orders stay not live; later foreign ones are kept. */
export async function verifyExactSevenFinalActive(
  state: ExactSevenRecoveryState,
  ports: ExactSevenPorts,
) {
  requireFact(state.phase === "prechecked", "exact-seven:precheck-required");
  const live = liveIds(await ports.readHistoryList());
  const stillLive = state.orders.filter(
    (order) => order.terminalVerified && live.includes(order.orderId),
  );
  state.foreignLiveAfter = live.filter((id) => !isOwnId(state, id)).length;
  if (stillLive.length) {
    for (const order of stillLive) {
      order.terminalVerified = false;
      order.outcome = "terminal-readback-missing";
    }
    await ports.persist(exactSevenFacts(state));
    throw new JourneyFailure("exact-seven:verified-own-order-still-live");
  }
  await ports.persist(exactSevenFacts(state));
}

function driverRecord(value: unknown, driverId: string) {
  const matches = records(object(value).items).filter(
    (driver) => driver.driverId === driverId,
  );
  requireFact(matches.length === 1, "exact-seven:driver-registry-readback");
  return matches[0]!;
}

function deviceBinding(driver: ObjectData, deviceId: string) {
  const bindings = records(driver.deviceBindings ?? []).filter(
    (binding) => binding.deviceId === deviceId,
  );
  requireFact(
    bindings.length === 1 &&
      typeof bindings[0]!.bindingId === "string" &&
      (bindings[0]!.status === "active" || bindings[0]!.status === "revoked"),
    "exact-seven:exact-device-binding-required",
  );
  return bindings[0]!;
}

/**
 * Second supply: the artifact holds no ID. Only a single registry driver that
 * already carries the exact original deterministic device binding qualifies;
 * zero or several matches stay unknown, and nothing is acted on.
 */
export async function qualifyExactSevenSecondSupply(
  state: ExactSevenRecoveryState,
  ports: ExactSevenPorts,
) {
  const actor = state.supply.find((item) => item.actor === "second")!;
  requireFact(
    exactSevenOrdersAllTerminal(state) && actor.qualification === "pending",
    "exact-seven:second-supply-qualification-once-after-orders",
  );
  const matches = records(object(await ports.readDrivers()).items).filter(
    (driver) =>
      Array.isArray(driver.deviceBindings) &&
      records(driver.deviceBindings).some(
        (binding) => binding.deviceId === actor.deviceId,
      ),
  );
  if (matches.length !== 1) {
    actor.qualification = matches.length
      ? "ambiguous-unknown"
      : "not-observed-unknown";
    await ports.persist(exactSevenFacts(state));
    return false;
  }
  const binding = deviceBinding(matches[0]!, actor.deviceId);
  actor.driverId = text(matches[0]!.driverId);
  actor.bindingId = text(binding.bindingId);
  actor.qualification = "qualified";
  await ports.persist(exactSevenFacts(state));
  return true;
}

/**
 * Normal Admin offline or binding revoke for one qualified own actor. The exact
 * driver/device/binding (and the first vehicle) are requalified from live
 * registry fields before the write; the write is never retried.
 */
export async function cleanExactSevenSupply(
  state: ExactSevenRecoveryState,
  actorName: "first" | "second",
  part: "offline" | "revoke",
  ports: ExactSevenPorts,
) {
  const actor = state.supply.find((item) => item.actor === actorName)!;
  requireFact(
    exactSevenOrdersAllTerminal(state) &&
      actor[part === "offline" ? "offline" : "binding"] === "pending",
    `exact-seven:${actorName}-${part}-at-most-once-after-orders`,
  );
  requireFact(
    actor.qualification === "qualified" ||
      (actorName === "first" && actor.qualification === "pending"),
    `exact-seven:${actorName}-supply-not-qualified`,
  );
  const driverId = text(actor.driverId);
  let driver: ObjectData;
  let binding: ObjectData;
  try {
    driver = driverRecord(await ports.readDrivers(), driverId);
    binding = deviceBinding(driver, actor.deviceId);
    requireFact(
      actor.bindingId === undefined || binding.bindingId === actor.bindingId,
      "exact-seven:binding-changed",
    );
    if (actorName === "first")
      requireFact(
        records(object(await ports.readVehicles()).items).filter(
          (vehicle) => vehicle.vehicleId === actor.vehicleId,
        ).length === 1,
        "exact-seven:first-vehicle-registry-readback",
      );
  } catch (error) {
    actor.qualification = "mismatch-preserved";
    await ports.persist(exactSevenFacts(state));
    throw error;
  }
  actor.bindingId = text(binding.bindingId);
  actor.qualification = "qualified";
  const field = part === "offline" ? "offline" : "binding";
  if (part === "offline" && driver.workState === "offline") {
    actor.offline = "already-offline";
    await ports.persist(exactSevenFacts(state));
    return;
  }
  if (part === "revoke" && binding.status === "revoked") {
    actor.binding = "already-revoked";
    await ports.persist(exactSevenFacts(state));
    return;
  }
  await ports.persist(exactSevenFacts(state));
  let ack: ObjectData;
  try {
    ack = object(
      part === "offline"
        ? await ports.setOffline(driverId)
        : await ports.revokeBinding(actor.bindingId, actor.deviceId),
    );
  } catch (error) {
    actor[field] = writeFailure(error).outcome;
    await ports.persist(exactSevenFacts(state));
    throw new JourneyFailure(
      `exact-seven:${actorName}-${part}-${actor[field]}-preserved`,
    );
  }
  const readback = driverRecord(await ports.readDrivers(), driverId);
  const verified =
    part === "offline"
      ? (ack.driverId === undefined || ack.driverId === driverId) &&
        readback.workState === "offline"
      : ack.bindingId === actor.bindingId &&
        ack.deviceId === actor.deviceId &&
        ack.driverId === driverId &&
        deviceBinding(readback, actor.deviceId).status === "revoked";
  if (part === "offline")
    actor.offline = verified ? "offline-verified" : "readback-missing";
  else actor.binding = verified ? "revoked-verified" : "readback-missing";
  await ports.persist(exactSevenFacts(state));
  requireFact(verified, `exact-seven:${actorName}-${part}-readback-missing`);
}
