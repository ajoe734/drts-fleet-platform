import { describe, expect, it, vi } from "vitest";
import {
  R08Callcenter,
  type R08Canonical,
  type R08Command,
  type R08Custody,
  type R08OpsProof,
  type R08Ports,
} from "../../e2e/owned-referral-business-journey/r08-callcenter";
import {
  object,
  type CallResult,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";

// SIM ONLY: socket-free external UI/BFF/canonical/persistence ports. These
// tests exercise the real orchestration; they grant no Ops/hosted/media credit.
const SHA = "6".repeat(40);
const ORIGIN = "https://ops.sim.invalid";
const BASE = "/control-plane-proxy";
const PATH = `${BASE}/callcenter/sessions/SIM-call`;
const intent = {
  category: "other" as const,
  severity: "normal" as const,
  description: "SIM controlled index only",
  relatedOrderId: "SIM-order",
};
// Whitespace/property order deliberately differ from JSON.stringify(intent).
const RAW =
  '{ "relatedOrderId":"SIM-order", "description":"SIM controlled index only", "severity":"normal", "category":"other" }';
const close = {
  resolutionCode: "resolved_other" as const,
  closingNote: "SIM owned index cleanup",
};
const clone = <T>(value: T): T => structuredClone(value);
// SIM wire fixture matches the global SnakeCaseInterceptor response boundary.
const wire = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        wire(item),
      ]),
    );
  return value;
};

function harness() {
  const proof = {
    origin: ORIGIN,
    runtimeSha: SHA,
    controlRole: "ops",
    bffStatus: 200,
    callcenterPageStatus: 200,
    active: true,
    identity: {
      realm: "ops",
      actorType: "ops_user",
      authMode: "jwt_bearer",
      actorId: "SIM-ops",
      principalId: "SIM-ops",
      membershipId: "SIM-membership",
      sessionId: "SIM-session",
    },
  } as R08OpsProof;
  Object.assign(proof, {
    callcenterServedSha: SHA,
    transportRuntimeSha: SHA,
    browser: { runtimeSha: SHA, active: true, identity: clone(proof.identity) },
  });
  const canonical: R08Canonical = {
    order: {
      orderId: "SIM-order",
      status: "completed",
      passenger: { passengerId: "SIM-pax" },
    },
    supply: {
      driverId: "SIM-driver",
      vehicleId: "SIM-vehicle",
      known: true,
      bindingId: "SIM-binding",
    },
  };
  const callback: ObjectData = {
    callbackTaskId: "SIM-callback",
    callId: "SIM-call",
    linkedOrderId: "SIM-order",
    linkedCaseNo: null,
    status: "pending",
  };
  const session: ObjectData = {
    callId: "SIM-call",
    recordingId: "SIM-index",
    recordingState: "ready",
    linkedOrderId: "SIM-order",
    linkedCaseNo: null,
    status: "active",
    callbackTask: callback,
  };
  const complaint: ObjectData = {
    ...intent,
    caseNo: "SIM-case",
    caseSource: "phone",
    relatedCallId: "SIM-call",
    status: "new",
  };
  const cases = [
    complaint,
    {
      caseNo: "SIM-rating",
      caseSource: "app",
      relatedOrderId: "SIM-order",
      relatedCallId: null,
    },
  ];
  const checkpoints: R08Custody[] = [];
  const commands: R08Command[] = [];
  const events: string[] = [];
  const result = (data: unknown, status = 200, sha = SHA): CallResult => ({
    status,
    headers: new Headers({ "x-drts-candidate-sha": sha }),
    data: clone(data),
    bytes: new Uint8Array(),
  });
  const ports: R08Ports = {
    proof: vi.fn(async () => clone(proof)),
    canonical: vi.fn(async () => clone(canonical)),
    checkpoint: vi.fn(async (value) => {
      checkpoints.push(clone(value));
      events.push("checkpoint");
    }),
    get: vi.fn(async (path) => {
      events.push(`GET ${path}`);
      if (path === PATH) return result(session);
      if (path === `${BASE}/callcenter/callbacks`)
        return result({ items: [callback] });
      if (path === `${BASE}/complaints`) return result({ items: cases });
      if (path === `${BASE}/complaints/SIM-case`) return result(complaint);
      throw new Error("SIM unexpected GET");
    }),
    postRaw: vi.fn(async (command) => {
      commands.push(clone(command));
      events.push(`POST ${command.path}`);
      if (command.path === `${PATH}/transfer-to-complaint`) {
        // SIM server-side effect; orchestration checks the returned identities.
        if (session.linkedCaseNo === null) session.linkedCaseNo = "SIM-case";
        if (callback.linkedCaseNo === null) callback.linkedCaseNo = "SIM-case";
        return result({ session, complaintCase: complaint }, 201);
      }
      if (command.path === `${BASE}/callcenter/callbacks/SIM-callback/cancel`) {
        callback.status = "cancelled";
        return result(callback, 201);
      }
      if (command.path === `${BASE}/complaints/SIM-case/close`) {
        complaint.status = "closed";
        return result(complaint, 201);
      }
      if (command.path === `${PATH}/close`) {
        session.status = "closed";
        return result(session, 201);
      }
      throw new Error("SIM unexpected POST");
    }),
  };
  const expected = {
    proof: clone(proof),
    canonical: clone(canonical),
    intent: clone(intent),
    owned: {
      callId: "SIM-call",
      recordingId: "SIM-index",
      callbackTaskId: "SIM-callback",
      orderId: "SIM-order",
    },
  };
  const helper = new R08Callcenter(expected, ports);
  const response = {
    url: () => `${ORIGIN}${PATH}/transfer-to-complaint`,
    status: () => 201,
    headers: () => ({ "x-drts-candidate-sha": SHA }),
    body: async () =>
      Buffer.from(
        JSON.stringify(wire({ data: { session, complaintCase: complaint } })),
      ),
  };
  const request = {
    method: () => "POST",
    url: response.url,
    postData: () => RAW,
    // Auth values must never be copied into checkpoints/commands.
    headers: () => ({
      "content-type": "application/json",
      "x-drts-authorization": "SIM-SECRET",
      cookie: "SIM-COOKIE",
    }),
  };
  const route = {
    request: () => request,
    fetch: vi.fn(async () => {
      events.push("UI forwarded");
      session.linkedCaseNo = "SIM-case";
      callback.linkedCaseNo = "SIM-case";
      return response;
    }),
    fulfill: vi.fn(async () => {
      events.push("UI ACK released");
    }),
  };
  return {
    helper,
    ports,
    proof,
    canonical,
    callback,
    session,
    complaint,
    cases,
    checkpoints,
    commands,
    events,
    expected,
    route,
    request,
    response,
    result,
  };
}

describe("R08 original UI replay orchestration (SIM ports, no hosted acceptance)", () => {
  it.each(["page SHA", "browser session", "transport runtime"])(
    "rejects independent observed %s mismatch even in initial expectations",
    (fault) => {
      const h = harness();
      Object.assign(h.expected.proof, {
        callcenterServedSha: fault === "page SHA" ? "7".repeat(40) : SHA,
        browser: {
          runtimeSha: SHA,
          active: true,
          identity: {
            ...h.proof.identity,
            sessionId:
              fault === "browser session"
                ? "SIM-other"
                : h.proof.identity.sessionId,
          },
        },
        transportRuntimeSha:
          fault === "transport runtime" ? "7".repeat(40) : SHA,
      });
      expect(() => new R08Callcenter(h.expected, h.ports)).toThrow(
        "r08-same-canonical-ops-first-party-bff-runtime",
      );
    },
  );

  it("checkpoints raw command before forward and successful IDs before navigation; replays bytes once", async () => {
    const h = harness();
    await h.helper.capture(h.route);
    expect(h.events.slice(1, 5)).toEqual([
      "checkpoint",
      "UI forwarded",
      "checkpoint",
      "UI ACK released",
    ]);
    expect(h.checkpoints[0]).toMatchObject({
      transfer: "ack-unknown",
      callId: "SIM-call",
      command: { rawBody: RAW },
    });
    expect(h.checkpoints[1]).toMatchObject({
      transfer: "acknowledged",
      caseNo: "SIM-case",
    });
    expect(h.route.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
    });
    expect(h.route.fulfill).toHaveBeenCalledTimes(1);
    await h.helper.replay();
    expect(h.commands).toHaveLength(1);
    expect(h.commands[0]).toEqual(h.checkpoints[0]!.command);
    expect(h.commands[0]!.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(h.commands[0]!.rawBody).toBe(RAW);
    expect(h.helper.snapshot()).toMatchObject({
      replay: "verified",
      unresolved: [],
      cleanup: "not-attempted",
    });
    await expect(h.helper.replay()).rejects.toThrow(
      "r08-one-original-replay-only",
    );
    await expect(h.helper.capture(h.route)).rejects.toThrow(
      "r08-no-second-ui-command",
    );
    expect(h.commands).toHaveLength(1);
    expect(JSON.stringify(h.checkpoints)).not.toMatch(/SIM-SECRET|SIM-COOKIE/);
  });

  it.each([
    ["description", { ...intent, description: "changed intent" }],
    ["order", { ...intent, relatedOrderId: "SIM-other-order" }],
    ["extra key", { ...intent, idempotencyKey: "replacement" }],
  ])("rejects altered original %s before forwarding", async (_name, body) => {
    const h = harness();
    h.request.postData = () => JSON.stringify(body);
    await expect(h.helper.capture(h.route)).rejects.toThrow(
      "r08-original-ui-intent",
    );
    expect(h.route.fetch).not.toHaveBeenCalled();
    expect(h.commands).toEqual([]);
  });

  it.each(["omitted", "null"])(
    "preserves %s relatedOrderId bytes and checks canonical effective order",
    async (mode) => {
      const h = harness();
      const command = {
        category: intent.category,
        severity: intent.severity,
        description: intent.description,
        ...(mode === "null" ? { relatedOrderId: null } : {}),
      };
      const helper = new R08Callcenter(
        { ...h.expected, intent: command },
        h.ports,
      );
      const raw = JSON.stringify(command);
      h.request.postData = () => raw;
      await helper.capture(h.route);
      await helper.replay();
      expect(h.commands[0]!.rawBody).toBe(raw);
      expect(helper.snapshot().replay).toBe("verified");
    },
  );

  it("rejects any explicit key, including an empty header", async () => {
    const h = harness();
    h.request.headers = () => ({
      "content-type": "application/json",
      "Idempotency-Key": "",
      "x-drts-authorization": "SIM-SECRET",
      cookie: "SIM-COOKIE",
    });
    await expect(h.helper.capture(h.route)).rejects.toThrow(
      "r08-exact-original-ui-post-absent-key",
    );
    expect(h.route.fetch).not.toHaveBeenCalled();
  });

  it.each(["wrong origin", "wrong call", "wrong method"])(
    "rejects %s",
    async (fault) => {
      const h = harness();
      if (fault === "wrong origin")
        h.request.url = () =>
          `https://api.sim.invalid${PATH}/transfer-to-complaint`;
      if (fault === "wrong call")
        h.request.url = () =>
          `${ORIGIN}${BASE}/callcenter/sessions/SIM-other/transfer-to-complaint`;
      if (fault === "wrong method") h.request.method = () => "GET";
      await expect(h.helper.capture(h.route)).rejects.toThrow(
        "r08-exact-original-ui-post-absent-key",
      );
      expect(h.route.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "linked order",
    "pending recording",
    "existing case",
    "callback order",
    "closed call",
  ])("rejects canonical producer %s drift before forwarding", async (fault) => {
    const h = harness();
    if (fault === "linked order") h.session.linkedOrderId = "SIM-other";
    if (fault === "pending recording") h.session.recordingState = "pending";
    if (fault === "existing case") h.session.linkedCaseNo = "SIM-other";
    if (fault === "callback order") h.callback.linkedOrderId = "SIM-other";
    if (fault === "closed call") h.session.status = "closed";
    await expect(h.helper.capture(h.route)).rejects.toThrow();
    expect(h.route.fetch).not.toHaveBeenCalled();
    expect(h.commands).toEqual([]);
  });

  it.each([
    "admin",
    "system",
    "fake mode",
    "session",
    "membership",
    "runtime",
    "BFF403",
    "page403",
    "direct API",
    "inactive",
  ])("blocks %s with no alternate authority or command", async (fault) => {
    const h = harness();
    await h.helper.capture(h.route);
    if (fault === "admin") h.proof.identity.realm = "platform";
    if (fault === "system") h.proof.identity.actorType = "system";
    if (fault === "fake mode") h.proof.identity.authMode = "test";
    if (fault === "session") h.proof.identity.sessionId = "SIM-other";
    if (fault === "membership") h.proof.identity.membershipId = "SIM-other";
    if (fault === "runtime") h.proof.runtimeSha = "7".repeat(40);
    if (fault === "BFF403") h.proof.bffStatus = 403;
    if (fault === "page403") h.proof.callcenterPageStatus = 403;
    if (fault === "direct API") h.proof.controlRole = "opsApi";
    if (fault === "inactive") h.proof.active = false;
    await expect(h.helper.replay()).rejects.toThrow(
      "r08-same-canonical-ops-first-party-bff-runtime",
    );
    expect(h.commands).toEqual([]);
  });

  it.each(["page SHA", "browser", "transport SHA"])(
    "fails missing observed %s before forwarding",
    async (fault) => {
      const h = harness();
      if (fault === "page SHA") h.proof.callcenterServedSha = "";
      if (fault === "transport SHA") h.proof.transportRuntimeSha = "";
      if (fault === "browser") Object.assign(h.proof, { browser: undefined });
      await expect(h.helper.capture(h.route)).rejects.toThrow(
        "r08-same-canonical-ops-first-party-bff-runtime",
      );
      expect(h.route.fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects counterfeit initial proof instead of accepting matching fake expectations", () => {
    const h = harness();
    h.expected.proof.identity.actorType = "system";
    expect(() => new R08Callcenter(h.expected, h.ports)).toThrow(
      "r08-same-canonical-ops-first-party-bff-runtime",
    );
  });

  it.each(["BFF403", "runtime"])(
    "known original UI %s blocks replay even with an older successful proof",
    async (fault) => {
      const h = harness();
      if (fault === "BFF403") h.response.status = () => 403;
      else
        h.response.headers = () => ({ "x-drts-candidate-sha": "7".repeat(40) });
      await expect(h.helper.capture(h.route)).rejects.toThrow(
        "r08-original-ui-bff-denial-or-runtime",
      );
      await expect(h.helper.replay()).rejects.toThrow(
        "r08-one-original-replay-only",
      );
      expect(h.commands).toEqual([]);
      expect(h.route.fulfill).not.toHaveBeenCalled();
      expect(h.helper.snapshot().command!.rawBody).toBe(RAW);
    },
  );

  it.each(["runtime", "403", "case", "recording", "order", "callback"])(
    "rejects replay response %s drift",
    async (fault) => {
      const h = harness();
      await h.helper.capture(h.route);
      if (fault === "runtime")
        h.ports.postRaw = vi.fn(async () =>
          h.result(
            { session: h.session, complaintCase: h.complaint },
            200,
            "7".repeat(40),
          ),
        );
      if (fault === "403")
        h.ports.postRaw = vi.fn(async () => h.result({}, 403));
      if (fault === "case") h.complaint.caseNo = "SIM-other-case";
      if (fault === "recording") h.session.recordingId = "SIM-other-recording";
      if (fault === "order") h.session.linkedOrderId = "SIM-other-order";
      if (fault === "callback") h.callback.linkedCaseNo = "SIM-other-case";
      await expect(h.helper.replay()).rejects.toThrow();
      expect(h.helper.snapshot()).toMatchObject({
        replay: "ack-unknown",
        unresolved: ["original-replay-unverified"],
      });
      await expect(h.helper.replay()).rejects.toThrow(
        "r08-one-original-replay-only",
      );
    },
  );

  it("rejects duplicate PHONE cases for this call while preserving the separate rating case", async () => {
    const h = harness();
    await h.helper.capture(h.route);
    h.cases.push({ ...h.complaint, caseNo: "SIM-duplicate" });
    await expect(h.helper.replay()).rejects.toThrow(
      "r08-exactly-one-phone-case-for-call",
    );
    expect(h.helper.snapshot().replay).toBe("ack-unknown");
  });

  it.each([
    "order status",
    "order identity",
    "passenger",
    "supply unknown",
    "supply identity",
  ])("blocks canonical %s drift", async (fault) => {
    const h = harness();
    await h.helper.capture(h.route);
    if (fault === "order status") h.canonical.order.status = "confirmed";
    if (fault === "order identity") h.canonical.order.orderId = "SIM-other";
    if (fault === "passenger")
      h.canonical.order.passenger = { passengerId: "SIM-other" };
    if (fault === "supply unknown") h.canonical.supply.known = false;
    if (fault === "supply identity") h.canonical.supply.driverId = "SIM-other";
    await expect(h.helper.replay()).rejects.toThrow(
      "r08-completed-order-or-supply-drift",
    );
    expect(h.commands).toEqual([]);
  });

  it("detects order drift caused during a transfer even with a successful response", async () => {
    const h = harness();
    h.route.fulfill = vi.fn(async () => {
      h.canonical.order.status = "confirmed";
    });
    await expect(h.helper.capture(h.route)).rejects.toThrow(
      "r08-completed-order-or-supply-drift",
    );
    expect(h.helper.snapshot()).toMatchObject({
      caseNo: "SIM-case",
      unresolved: ["original-ui-transfer-unverified"],
    });
  });

  it("retains exact intent/known IDs on original ACK loss, then recovers only by original replay", async () => {
    const h = harness();
    h.route.fetch = vi.fn(async () => {
      throw new Error("SIM ACK lost");
    });
    await expect(h.helper.capture(h.route)).rejects.toThrow("SIM ACK lost");
    expect(h.helper.snapshot()).toMatchObject({
      transfer: "ack-unknown",
      callId: "SIM-call",
      recordingId: "SIM-index",
      command: { rawBody: RAW },
    });
    await h.helper.replay();
    expect(h.commands).toHaveLength(1);
    expect(h.helper.snapshot()).toMatchObject({
      caseNo: "SIM-case",
      replay: "verified",
      unresolved: [],
    });
    expect(h.route.fulfill).not.toHaveBeenCalled();
  });

  it("never replaces or retries a replay with an unknown ACK", async () => {
    const h = harness();
    await h.helper.capture(h.route);
    h.ports.postRaw = vi.fn(async (command) => {
      h.commands.push(clone(command));
      throw new Error("SIM replay ACK lost");
    });
    await expect(h.helper.replay()).rejects.toThrow("SIM replay ACK lost");
    const retained = h.helper.snapshot();
    expect(retained).toMatchObject({
      caseNo: "SIM-case",
      replay: "ack-unknown",
      command: { rawBody: RAW },
    });
    // Mutating an evidence/snapshot copy cannot change the original command.
    retained.command!.rawBody = "{}";
    expect(h.helper.snapshot().command!.rawBody).toBe(RAW);
    await expect(h.helper.replay()).rejects.toThrow(
      "r08-one-original-replay-only",
    );
    expect(h.commands).toHaveLength(1);
  });

  it("does not forward when the pre-command checkpoint cannot persist", async () => {
    const h = harness();
    h.ports.checkpoint = vi.fn(async () => {
      throw new Error("SIM disk");
    });
    await expect(h.helper.capture(h.route)).rejects.toThrow("SIM disk");
    expect(h.route.fetch).not.toHaveBeenCalled();
    expect(h.helper.snapshot().command!.rawBody).toBe(RAW);
  });

  it("does not release navigation when success checkpoint fails; keeps known IDs", async () => {
    const h = harness();
    vi.mocked(h.ports.checkpoint)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error("SIM disk");
      });
    await expect(h.helper.capture(h.route)).rejects.toThrow("SIM disk");
    expect(h.route.fulfill).not.toHaveBeenCalled();
    expect(h.helper.snapshot().caseNo).toBe("SIM-case");
  });

  it("normal callback/case/call close and readbacks precede any later caller revoke; queue retained", async () => {
    const h = harness();
    await h.helper.capture(h.route);
    await h.helper.replay();
    h.events.length = 0;
    await h.helper.cleanup(close);
    expect(h.commands.slice(1).map((command) => command.path)).toEqual([
      `${BASE}/callcenter/callbacks/SIM-callback/cancel`,
      `${BASE}/complaints/SIM-case/close`,
      `${PATH}/close`,
    ]);
    expect(
      h.commands.slice(1).map((command) => JSON.parse(command.rawBody)),
    ).toEqual([{ reason: close.closingNote }, close, {}]);
    for (const command of h.commands.slice(1)) {
      const index = h.events.indexOf(`POST ${command.path}`);
      expect(h.events[index - 1]).toBe("checkpoint");
    }
    expect(h.helper.snapshot()).toMatchObject({
      cleanup: "verified",
      unresolved: [],
      recording: "synthetic-index-only",
      finalizeRecording: {
        dedupeKey: "finalize_recording:call:SIM-call",
        status: "unobserved-retained",
      },
    });
    await expect(h.helper.cleanup(close)).rejects.toThrow(
      "r08-cleanup-at-most-once",
    );
    expect(h.commands).toHaveLength(4);
  });

  it.each([
    "cancel ACK lost",
    "cancel readback",
    "case readback",
    "call readback",
    "order drift",
  ])("cleanup %s never returns false green", async (fault) => {
    const h = harness();
    await h.helper.capture(h.route);
    await h.helper.replay();
    const original = h.ports.postRaw;
    h.ports.postRaw = vi.fn(async (command) => {
      const result = await original(command);
      if (command.path.endsWith("/cancel")) {
        if (fault === "cancel ACK lost")
          throw new Error("SIM cleanup ACK lost");
        if (fault === "cancel readback") h.callback.status = "pending";
        if (fault === "order drift") h.canonical.order.status = "confirmed";
      }
      if (command.path.includes("/complaints/") && fault === "case readback")
        h.complaint.status = "new";
      if (command.path === `${PATH}/close` && fault === "call readback")
        h.session.status = "active";
      return result;
    });
    await expect(h.helper.cleanup(close)).rejects.toThrow();
    expect(h.helper.snapshot()).toMatchObject({
      cleanup: "unknown",
      unresolved: ["normal-owned-cleanup-unverified"],
    });
    const count = h.commands.length;
    await expect(h.helper.cleanup(close)).rejects.toThrow(
      "r08-cleanup-at-most-once",
    );
    expect(h.commands).toHaveLength(count);
  });

  it("unknown case ID blocks all cleanup writes", async () => {
    const h = harness();
    h.route.fetch = vi.fn(async () => {
      throw new Error("SIM unknown ACK");
    });
    await expect(h.helper.capture(h.route)).rejects.toThrow();
    await expect(h.helper.cleanup(close)).rejects.toThrow(
      "r08-known-own-case-valid-close",
    );
    expect(h.commands).toEqual([]);
    expect(h.helper.snapshot().cleanup).toBe("unknown");
  });
});

// Playwright boundary only is simulated. R08ExistingFull, R08Callcenter,
// NativeTransport and RunFinalizer execute without a browser/server on this VM.
async function fullHarness(fault = "") {
  const h = harness();
  const writes: { path: string; raw: string }[] = [];
  const disk: unknown[] = [];
  const { RunFinalizer } =
    await import("../../e2e/owned-referral-business-journey/run-finalization");
  const { NativeTransport } =
    await import("../../e2e/owned-referral-business-journey/protocol");
  const { R08ExistingFull } =
    await import("../../e2e/owned-referral-business-journey/r08-callcenter");
  let stopped = false;
  let routeHandler!: (route: unknown) => Promise<void>;
  let liveCall = false;
  let liveCallback = false;
  let recordingId = "";
  let description = "";
  let actorId = "";
  let due = "";
  let note = "";
  let selectedOrder = "";
  let complete = false;
  const identity = h.proof.identity;
  const session = h.session;
  const callback = h.callback;
  const complaint = h.complaint;
  session.callerPhone = "0900000000";
  session.agentIdentityAnnounced = true;
  session.agentId = identity.actorId;
  session.linkedOrderId = null;
  session.recordingId = null;
  session.recordingState = "pending";
  session.callbackTask = null;
  callback.linkedOrderId = null;
  const response = (
    url: string,
    data: unknown,
    status = 200,
    sha = SHA,
    raw = false,
  ) => ({
    url: () => url,
    status: () => status,
    headers: () => ({
      "x-drts-candidate-sha": sha,
      "content-type": raw ? "text/html" : "application/json",
    }),
    body: async () =>
      Buffer.from(raw ? "<html>SIM</html>" : JSON.stringify(wire({ data }))),
    dispose: async () => undefined,
  });
  const serve = async (url: string, method = "GET", raw?: string) => {
    const path = new URL(url).pathname;
    h.events.push(`${method} ${path}`);
    if (path === "/callcenter")
      return response(
        url,
        null,
        200,
        fault === "served SHA" ? "7".repeat(40) : SHA,
        true,
      );
    if (path.endsWith("/auth/session"))
      return response(
        url,
        { active: true, identity },
        fault === "BFF403" && path.startsWith(BASE) ? 403 : 200,
      );
    if (method === "POST") {
      writes.push({ path, raw: raw! });
      const body = object(JSON.parse(raw!));
      if (path === `${BASE}/callcenter/sessions`) {
        liveCall = true;
        session.callType = body.callType;
        session.agentId = body.agentId;
      } else if (path.endsWith("/recording-callback")) {
        session.recordingId = body.recordingId;
        session.recordingState = "ready";
      } else if (path.endsWith("/link-order"))
        session.linkedOrderId = body.orderId;
      else if (path.endsWith("/callbacks")) {
        liveCallback = true;
        Object.assign(callback, {
          note: body.note,
          dueAt: body.dueAt,
          linkedOrderId: session.linkedOrderId,
        });
        session.callbackTask = callback;
      } else if (path.endsWith("/transfer-to-complaint")) {
        if (fault === "transfer ACK unknown no case")
          throw new Error("SIM transfer ACK unknown");
        Object.assign(complaint, body);
        session.linkedCaseNo = complaint.caseNo;
        callback.linkedCaseNo = complaint.caseNo;
      } else if (path.endsWith("/cancel")) callback.status = "cancelled";
      else if (path === `${BASE}/complaints/SIM-case/close`)
        complaint.status = "closed";
      else if (path === `${PATH}/close`) session.status = "closed";
      else throw new Error(`SIM unexpected write ${path}`);
      if (
        ["open ACK lost", "ambiguous open ACK lost"].includes(fault) &&
        writes.length === 1
      )
        throw new Error("SIM producer ACK lost");
      if (
        fault === "recording ACK lost" &&
        path.endsWith("/recording-callback")
      )
        throw new Error("SIM index ACK lost");
      if (fault === "link ACK lost" && path.endsWith("/link-order"))
        throw new Error("SIM link ACK lost");
      if (fault === "callback ACK lost" && path.endsWith("/callbacks"))
        throw new Error("SIM callback ACK lost");
      if (
        fault === "transfer ACK lost" &&
        path.endsWith("/transfer-to-complaint") &&
        writes.filter((w) => w.path === path).length === 1
      )
        throw new Error("SIM original ACK lost");
      if (fault === "cleanup ACK lost" && path.endsWith("/cancel"))
        throw new Error("SIM cancel ACK lost");
      if (path.endsWith("/transfer-to-complaint"))
        return response(url, { session, complaintCase: complaint }, 201);
      if (path.endsWith("/callbacks") || path.endsWith("/cancel"))
        return response(url, callback, 201);
      if (path.includes("/complaints/")) return response(url, complaint, 201);
      return response(url, session, 201);
    }
    if (path === `${BASE}/callcenter/sessions`)
      return response(url, {
        items: liveCall
          ? fault === "ambiguous open ACK lost"
            ? [session, { ...session, callId: "SIM-ambiguous" }]
            : [session]
          : [],
      });
    if (path === PATH) return response(url, session);
    if (path === `${BASE}/callcenter/callbacks`)
      return response(url, { items: liveCallback ? [callback] : [] });
    if (path === `${BASE}/complaints`)
      return response(url, { items: session.linkedCaseNo ? [complaint] : [] });
    if (path === `${BASE}/complaints/SIM-case`) return response(url, complaint);
    throw new Error(`SIM unexpected read ${path}`);
  };
  const tx = new NativeTransport(
    {
      api: "https://api.sim.invalid",
      admin: "https://admin.sim.invalid",
      ops: ORIGIN,
      referral: "https://referral.sim.invalid",
      fleet: "https://fleet.sim.invalid",
    },
    SHA,
    {},
    (async (input) => {
      const res = await serve(String(input));
      return new Response(await res.body(), {
        status: res.status(),
        headers: res.headers(),
      });
    }) as typeof fetch,
  );
  tx.setSession("ops", "SIM-NORMAL-OPS-TOKEN");
  tx.setSession("opsApi", "SIM-NORMAL-OPS-TOKEN");
  const finalizer: InstanceType<typeof RunFinalizer> = new RunFinalizer({
    definitionSha: SHA,
    runtimeSha: SHA,
    nonce: "SIM-full",
    checkpointFile: "/SIM/cancellations/run-finalization-facts.json",
    custody: () => ({
      orders: [],
      supply: [],
      sessions: [],
      r08: run?.snapshot(),
    }),
    secrets: () => ["SIM-NORMAL-OPS-TOKEN"],
    persist: async (_path, value) => {
      disk.push(clone(value));
    },
    onCleaned: () => undefined,
    onFailed: () => undefined,
    stopInterruptedBody: async () => {
      await run.stop();
    },
    plan: async (step) => {
      await step("own-R08-callcenter-normal-terminalization", () =>
        run.cleanup(),
      );
      await step("own-Ops-session-self-revoked", async () => {
        h.events.push("Ops revoked");
      });
    },
    artifacts: [],
  });
  class Locator {
    constructor(
      readonly selector: string,
      readonly form = "",
      readonly index = 0,
    ) {}
    filter(options: { has: Locator }) {
      const key = options.has.selector;
      const form = key.includes("checkbox")
        ? "intake"
        : key.includes("datetime-local")
          ? "callback"
          : key.includes("attach recording")
            ? "recording"
            : key.includes("Link existing")
              ? "link"
              : "transfer";
      return new Locator(this.selector, form);
    }
    locator(selector: string) {
      return new Locator(selector, this.form);
    }
    nth(index: number) {
      return new Locator(this.selector, this.form, index);
    }
    first() {
      return this;
    }
    async fill(value: string) {
      if (this.form === "intake" && this.index === 1) actorId = value;
      if (this.form === "recording") recordingId = value;
      if (this.form === "link") selectedOrder = value;
      if (this.form === "callback" && this.selector.includes("datetime"))
        due = value;
      if (this.form === "callback" && this.selector === "textarea")
        note = value;
      if (this.form === "transfer") description = value;
    }
    async selectOption(value: string) {
      if (this.form === "transfer" && fault === "before transfer capture")
        throw new Error("SIM interrupted before transfer capture");
      void value; // external DOM form
    }
    async check() {
      /* external DOM checkbox */
    }
    async click() {
      if (!this.form) return;
      let path = `${BASE}/callcenter/sessions`,
        body: unknown;
      if (this.form === "intake")
        body = {
          callType: "complaint",
          callerPhone: "0900000000",
          agentId: actorId,
          agentIdentityAnnounced: true,
        };
      if (this.form === "recording") {
        path = `${PATH}/recording-callback`;
        body = {
          recordingId,
          providerRecordingRef: "",
          recordingUrl: "",
          agentId: "AGENT-OPS-001",
        };
      }
      if (this.form === "link") {
        path = `${PATH}/link-order`;
        body = { orderId: selectedOrder };
      }
      if (this.form === "callback") {
        path = `${PATH}/callbacks`;
        body = { dueAt: new Date(due).toISOString(), note };
      }
      if (this.form === "transfer") {
        path = `${PATH}/transfer-to-complaint`;
        body = {
          category: "other",
          severity: "normal",
          description,
          relatedOrderId: "SIM-order",
        };
      }
      const raw =
        this.form === "transfer"
          ? ` ${JSON.stringify(body)} `
          : JSON.stringify(body);
      await routeHandler({
        request: () => ({
          url: () => `${ORIGIN}${path}`,
          method: () => "POST",
          postData: () => raw,
          headers: () => ({ "content-type": "application/json" }),
        }),
        fetch: async (options: { headers: Record<string, string> }) => {
          expect(options.headers["x-drts-authorization"]).toBe(
            "Bearer SIM-NORMAL-OPS-TOKEN",
          );
          return serve(`${ORIGIN}${path}`, "POST", raw);
        },
        fulfill: async () => undefined,
        abort: async () => undefined,
      });
    }
  }
  const page = {
    on: () => undefined,
    route: async (_matcher: string, handler: typeof routeHandler) => {
      routeHandler = handler;
    },
    goto: async (url: string) => serve(url),
    evaluate: async (_fn: unknown, value?: string) =>
      value
        ? new Date(value).toISOString()
        : {
            status: 200,
            sha: SHA,
            body: JSON.stringify(
              wire({
                data: {
                  active: true,
                  identity:
                    fault === "browser session"
                      ? { ...identity, sessionId: "SIM-other" }
                      : identity,
                },
              }),
            ),
          },
    locator: (selector: string) => new Locator(selector),
    getByRole: (_role: string, options: { name: RegExp }) =>
      new Locator(options.name.source),
    close: async () => {
      stopped = true;
    },
  };
  const context = {
    newPage: async () => page,
    request: {
      fetch: async (
        url: string,
        options: {
          method: string;
          data?: Buffer;
          headers: Record<string, string>;
          timeout: number;
          maxRetries: number;
          maxRedirects: number;
        },
      ) => {
        expect(options.headers["x-drts-authorization"]).toBe(
          "Bearer SIM-NORMAL-OPS-TOKEN",
        );
        expect([
          options.timeout,
          options.maxRetries,
          options.maxRedirects,
        ]).toEqual([15000, 0, 0]);
        return serve(url, options.method, options.data?.toString("utf8"));
      },
    },
  };
  const run: InstanceType<typeof R08ExistingFull> = new R08ExistingFull({
    context: context as unknown as import("@playwright/test").BrowserContext,
    tx,
    finalizer,
    origin: ORIGIN,
    runtimeSha: SHA,
    controlRole: fault === "direct API" ? "opsApi" : "ops",
    orderId: "SIM-order",
    phone: "0900000000",
    nonce: "SIM-full",
    canonical: async () => clone(h.canonical),
  });
  return {
    run,
    finalizer,
    writes,
    disk,
    h,
    isStopped: () => stopped,
    route: () => routeHandler,
    finish: async (reason: "completed" | "runner-interrupted") => {
      complete = true;
      return finalizer.run(reason);
    },
    isComplete: () => complete,
  };
}

describe("R08 original FULL integration (SIM browser/HTTP, actual orchestration/finalizer)", () => {
  it("runs forms in source producer order, one original-byte replay, then own terminalization before Ops revoke", async () => {
    const f = await fullHarness();
    await f.run.run();
    expect(f.writes.map((w) => w.path)).toEqual([
      `${BASE}/callcenter/sessions`,
      `${PATH}/recording-callback`,
      `${PATH}/link-order`,
      `${PATH}/callbacks`,
      `${PATH}/transfer-to-complaint`,
      `${PATH}/transfer-to-complaint`,
    ]);
    expect(f.writes[5]!.raw).toBe(f.writes[4]!.raw);
    expect(f.isStopped()).toBe(true);
    const result = await f.finish("completed");
    expect(result.wholeRunPassed).toBe(true);
    expect(f.run.snapshot()).toMatchObject({
      result: "verified",
      cleanup: "verified",
      transfer: { replay: "verified", cleanup: "verified" },
    });
    expect(result.steps.map((s) => s.stage)).toEqual([
      "own-R08-callcenter-normal-terminalization",
      "own-Ops-session-self-revoked",
    ]);
    expect(f.writes.slice(-3).map((w) => w.path)).toEqual([
      `${BASE}/callcenter/callbacks/SIM-callback/cancel`,
      `${BASE}/complaints/SIM-case/close`,
      `${PATH}/close`,
    ]);
    expect(JSON.stringify(f.disk)).not.toContain("SIM-NORMAL-OPS-TOKEN");
  });
  it.each(["served SHA", "browser session", "direct API", "BFF403"])(
    "blocks %s before producers or replay",
    async (fault) => {
      const f = await fullHarness(fault);
      await expect(f.run.run()).rejects.toThrow();
      expect(f.writes).toEqual([]);
      expect((await f.finish("completed")).wholeRunPassed).toBe(false);
    },
  );
  it("retains original producer bytes/unknown ACK then reconciles only unique own call and closes it", async () => {
    const f = await fullHarness("open ACK lost");
    await expect(f.run.run()).rejects.toThrow();
    const before = f.run.snapshot();
    expect(before).toMatchObject({
      producers: [
        {
          ack: "ack-unknown",
          command: { path: `${BASE}/callcenter/sessions` },
        },
      ],
      result: "failed",
    });
    expect(
      f.disk.some((item) => JSON.stringify(item).includes('"ack-unknown"')),
    ).toBe(true);
    const result = await f.finish("runner-interrupted");
    expect(result.wholeRunPassed).toBe(false);
    expect(f.run.snapshot()).toMatchObject({
      callId: "SIM-call",
      cleanup: "verified",
      producers: [{ ack: "acknowledged" }],
    });
    expect(f.writes.map((w) => w.path)).toEqual([
      `${BASE}/callcenter/sessions`,
      `${PATH}/close`,
    ]);
  });
  it("interrupted original transfer is reconciled read-only for cleanup; no replay/pass is fabricated", async () => {
    const f = await fullHarness("transfer ACK lost");
    await expect(f.run.run()).rejects.toThrow();
    const result = await f.finish("runner-interrupted");
    expect(
      f.writes.filter((w) => w.path.endsWith("/transfer-to-complaint")),
    ).toHaveLength(1);
    expect(f.run.snapshot()).toMatchObject({
      cleanup: "verified",
      transfer: {
        caseNo: "SIM-case",
        replay: "not-attempted",
        cleanup: "verified",
      },
    });
    expect(result.wholeRunPassed).toBe(false);
  });
  it("cleans known callback and call before Ops revoke when interrupted after helper allocation but before transfer capture", async () => {
    const f = await fullHarness("before transfer capture");
    await expect(f.run.run()).rejects.toThrow(
      "SIM interrupted before transfer capture",
    );
    expect(f.run.snapshot()).toMatchObject({
      callId: "SIM-call",
      callbackTaskId: "SIM-callback",
      result: "failed",
      transfer: { transfer: "not-captured", replay: "not-attempted" },
    });
    expect(f.run.snapshot().transfer!.command).toBeUndefined();
    expect(f.run.snapshot().transfer!.caseNo).toBeUndefined();
    expect(f.writes.map((w) => w.path)).toEqual([
      `${BASE}/callcenter/sessions`,
      `${PATH}/recording-callback`,
      `${PATH}/link-order`,
      `${PATH}/callbacks`,
    ]);
    const result = await f.finish("runner-interrupted");
    expect(f.run.snapshot().cleanup).toBe("verified");
    expect(f.writes.slice(4).map((w) => w.path)).toEqual([
      `${BASE}/callcenter/callbacks/SIM-callback/cancel`,
      `${PATH}/close`,
    ]);
    const events = f.h.events;
    const cancel = events.indexOf(
      `POST ${BASE}/callcenter/callbacks/SIM-callback/cancel`,
    );
    const queue = events.indexOf(`GET ${BASE}/callcenter/callbacks`, cancel);
    const close = events.indexOf(`POST ${PATH}/close`, queue);
    const readback = events.indexOf(`GET ${PATH}`, close);
    expect(cancel).toBeGreaterThan(-1);
    expect(queue).toBeGreaterThan(cancel);
    expect(close).toBeGreaterThan(queue);
    expect(readback).toBeGreaterThan(close);
    expect(events.indexOf("Ops revoked")).toBeGreaterThan(readback);
    expect(f.h.callback.status).toBe("cancelled");
    expect(f.h.session.status).toBe("closed");
    expect(result.wholeRunPassed).toBe(false);
    await expect(f.run.cleanup()).rejects.toThrow(
      "r08-own-run-cleanup-at-most-once",
    );
    await f.finalizer.run("runner-interrupted");
    expect(f.writes).toHaveLength(6);
  });
  it("retains an unexpected case without cleanup writes when transfer was never captured", async () => {
    const f = await fullHarness("before transfer capture");
    await expect(f.run.run()).rejects.toThrow();
    f.h.session.linkedCaseNo = "SIM-unowned-case";
    const result = await f.finish("runner-interrupted");
    expect(f.run.snapshot().cleanup).toBe("unknown");
    expect(f.writes).toHaveLength(4);
    expect(result.wholeRunPassed).toBe(false);
  });
  it("retains ambiguous transfer custody without partial cleanup or replacement when ACK and case are unknown", async () => {
    const f = await fullHarness("transfer ACK unknown no case");
    await expect(f.run.run()).rejects.toThrow("SIM transfer ACK unknown");
    expect(f.run.snapshot().transfer).toMatchObject({
      transfer: "ack-unknown",
      command: { path: `${PATH}/transfer-to-complaint` },
    });
    const result = await f.finish("runner-interrupted");
    expect(f.run.snapshot().cleanup).toBe("unknown");
    expect(f.writes).toHaveLength(5);
    expect(f.h.callback.status).toBe("pending");
    expect(f.h.session.status).toBe("active");
    expect(result.wholeRunPassed).toBe(false);
  });
  it.each(["recording ACK lost", "link ACK lost", "callback ACK lost"])(
    "%s is reconciled by exact own readback without another producer write",
    async (fault) => {
      const f = await fullHarness(fault);
      await expect(f.run.run()).rejects.toThrow();
      const original = f.writes.length;
      const result = await f.finish("runner-interrupted");
      expect(f.run.snapshot().cleanup).toBe("verified");
      expect(
        f.run.snapshot().producers.every((p) => p.ack === "acknowledged"),
      ).toBe(true);
      expect(
        f.writes
          .slice(original)
          .every(
            (w) => w.path.endsWith("/cancel") || w.path.endsWith("/close"),
          ),
      ).toBe(true);
      expect(result.wholeRunPassed).toBe(false);
      expect(f.run.snapshot().finalizeRecording).toEqual({
        dedupeKey: "finalize_recording:call:SIM-call",
        status: "unobserved-retained",
      });
    },
  );
  it("ambiguous open ACK keeps the original command and sends no cleanup/replacement writes", async () => {
    const f = await fullHarness("ambiguous open ACK lost");
    await expect(f.run.run()).rejects.toThrow();
    const result = await f.finish("runner-interrupted");
    expect(f.writes).toHaveLength(1);
    expect(f.run.snapshot()).toMatchObject({
      cleanup: "unknown",
      producers: [{ ack: "ack-unknown" }],
    });
    expect(result.wholeRunPassed).toBe(false);
  });
  it("never adds normal Ops credentials to a third-party browser request", async () => {
    const f = await fullHarness();
    await f.run.run();
    const forward = vi.fn(async () => undefined);
    await f.route()({
      request: () => ({ url: () => "https://third-party.sim.invalid/image" }),
      continue: forward,
    });
    expect(forward).toHaveBeenCalledExactlyOnceWith();
    await f.finish("completed");
  });
  it("cleanup ACK loss stays unresolved and is never written twice", async () => {
    const f = await fullHarness("cleanup ACK lost");
    await f.run.run();
    const result = await f.finish("completed");
    expect(result.wholeRunPassed).toBe(false);
    expect(f.run.snapshot().cleanup).toBe("unknown");
    const count = f.writes.length;
    await expect(f.run.cleanup()).rejects.toThrow(
      "r08-own-run-cleanup-at-most-once",
    );
    await f.finalizer.run("completed");
    expect(f.writes).toHaveLength(count);
  });
});
