import { describe, expect, it, vi } from "vitest";
import {
  R08Callcenter,
  type R08Canonical,
  type R08Command,
  type R08Custody,
  type R08OpsProof,
  type R08Ports,
} from "../../e2e/owned-referral-business-journey/r08-callcenter";
import type {
  CallResult,
  ObjectData,
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
  const proof: R08OpsProof = {
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
  };
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
