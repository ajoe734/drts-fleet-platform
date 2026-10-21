import { describe, expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePdf } from "../billing-pdf-chinese-printable-content-20261016/pdf-parser";

import {
  Evidence,
  consumeNativeReceiptPdfDownload,
  captureOriginalUiCancellation,
  validateActualReceiptPdfBytes,
  JourneyFailure,
  NativeTransport,
  assertNoForeignActive,
  assertOwnPair,
  assertRatingReplay,
  assertTask,
  camelWire,
  hash,
  origin,
  simulationCompletion,
  terminalizeOwnOrder,
  requireFact,
  type Origins,
} from "../../e2e/owned-referral-business-journey/protocol";

const SHA = "a".repeat(40);
const origins: Origins = {
  api: "https://api.example.test",
  admin: "https://admin.example.test",
  ops: "https://ops.example.test",
  fleet: "https://fleet.example.test",
  referral: "https://referral.example.test",
};
function response(data: unknown, status = 200, sha = SHA) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "x-drts-candidate-sha": sha },
  });
}
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  requireFact(item !== undefined, "observed mock call/header required");
  return item;
}
function setup() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => response({ accepted: true }));
  const fleetHeaders = vi.fn(() => ({
    "x-drts-authorization": "Bearer genuine-fleet",
    "X-Serverless-Authorization": "Bearer cloud-fleet",
  }));
  const tx = new NativeTransport(
    origins,
    SHA,
    { api: "cloud-api", admin: "cloud-admin", ops: "cloud-ops" },
    fetcher,
    fleetHeaders,
  );
  return { tx, fetcher, fleetHeaders };
}

describe("owned hosted journey transport", () => {
  it.each(["admin", "ops"] as const)(
    "accepts the real top-level %s auth ACK only at the exact POST exchange",
    async (role) => {
      const { tx, fetcher } = setup();
      const ack = {
        token: "synthetic-platform",
        sessionId: "synthetic-sid",
        expiresIn: 300,
      };
      const topLevel = () =>
        new Response(JSON.stringify(ack), {
          headers: { "x-drts-candidate-sha": SHA },
        });
      fetcher.mockImplementation(async () => topLevel());
      expect(
        (
          await tx.call(role, "/control-plane-proxy/auth/token", {
            method: "POST",
            body: {},
          })
        ).data,
      ).toEqual(ack);
      for (const [invalidRole, path, method] of [
        ["api", "/control-plane-proxy/auth/token", "POST"],
        ["opsApi", "/control-plane-proxy/auth/token", "POST"],
        [role, "/control-plane-proxy/other", "POST"],
        [role, "/control-plane-proxy/auth/token", "GET"],
      ] as const)
        await expect(tx.call(invalidRole, path, { method })).rejects.toThrow(
          "response envelope",
        );
      fetcher.mockResolvedValueOnce(
        new Response(JSON.stringify({ ...ack, sessionId: "" }), {
          headers: { "x-drts-candidate-sha": SHA },
        }),
      );
      await expect(
        tx.call(role, "/control-plane-proxy/auth/token", { method: "POST" }),
      ).rejects.toThrow("response envelope");
    },
  );

  it("keeps distinct Ops and Admin sessions with the API invocation proof", async () => {
    const { tx, fetcher } = setup();
    tx.setSession("api", "synthetic-admin");
    tx.setSession("opsApi", "synthetic-ops");
    tx.setSession("ops", "synthetic-ops");
    await tx.call("api", "/api/auth/session");
    await tx.call("opsApi", "/api/auth/session");
    await tx.call("ops", "/control-plane-proxy/auth/session");
    const headers = fetcher.mock.calls.map(
      ([, options]) => new Headers(options?.headers),
    );
    expect(at(headers, 0).get("authorization")).toBe("Bearer synthetic-admin");
    expect(at(headers, 1).get("authorization")).toBe("Bearer synthetic-ops");
    expect(at(headers, 0).get("x-serverless-authorization")).toBe(
      "Bearer cloud-api",
    );
    expect(at(headers, 1).get("x-serverless-authorization")).toBe(
      "Bearer cloud-api",
    );
    expect(at(headers, 1).has("x-drts-authorization")).toBe(false);
    expect(at(headers, 2).get("x-drts-authorization")).toBe(
      "Bearer synthetic-ops",
    );
    expect(at(headers, 2).get("x-serverless-authorization")).toBe(
      "Bearer cloud-ops",
    );
    expect(() => tx.headers("opsApi", `${origins.ops}/api/orders/own`)).toThrow(
      "role origin isolation",
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("starts a fresh Ops exchange without carrying a supplied Admin identity", async () => {
    const { tx, fetcher } = setup();
    tx.setSession("api", "synthetic-admin");
    tx.setSession("admin", "synthetic-admin");
    const ack = { token: "synthetic-ops", sessionId: "synthetic-ops-sid" };
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify(ack), {
        headers: { "x-drts-candidate-sha": SHA },
      }),
    );
    expect(
      (
        await tx.call("ops", "/control-plane-proxy/auth/token", {
          method: "POST",
          body: {},
        })
      ).data,
    ).toEqual(ack);
    const headers = new Headers(at(fetcher.mock.calls, 0)[1]?.headers);
    expect(headers.has("x-drts-authorization")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("x-serverless-authorization")).toBe("Bearer cloud-ops");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the own Partner bearer on canonical API without borrowing Admin or public authority", async () => {
    const { tx, fetcher } = setup();
    tx.setSession("api", "synthetic-admin");
    tx.setSession("referralApi", "synthetic-partner");
    await tx.call("referralApi", "/api/auth/session");
    await tx.call("api", "/api/auth/session");
    await tx.call("publicApi", "/api/partner/ingress/referral-embed-handoff");
    const headers = fetcher.mock.calls.map(
      ([, options]) => new Headers(options?.headers),
    );
    expect(at(headers, 0).get("authorization")).toBe(
      "Bearer synthetic-partner",
    );
    expect(at(headers, 0).get("x-serverless-authorization")).toBe(
      "Bearer cloud-api",
    );
    expect(at(headers, 1).get("authorization")).toBe("Bearer synthetic-admin");
    expect(at(headers, 2).get("authorization")).toBeNull();
  });

  it("does not export arbitrary uppercase server strings as diagnostic codes", async () => {
    const { tx, fetcher } = setup();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "SYNTHETIC_PRIVATE_CREDENTIAL" } }),
        { status: 403 },
      ),
    );
    const error = await tx.call("api", "/api/denied").catch((error) => error);
    expect(error).toBeInstanceOf(JourneyFailure);
    expect(error.status).toBe(403);
    expect(error.code).toBeUndefined();
    expect(String(error)).not.toContain("SYNTHETIC_PRIVATE_CREDENTIAL");
  });
  it("normalizes wire keys once without changing opaque token and identifier values", () => {
    expect(
      camelWire({
        access_token: "opaque_a_b.Case",
        item_ids: ["ID_a_b"],
        nested_value: { session_id: "sid_x_y" },
      }),
    ).toEqual({
      accessToken: "opaque_a_b.Case",
      itemIds: ["ID_a_b"],
      nestedValue: { sessionId: "sid_x_y" },
    });
  });

  it("keeps genuine inner application sessions separate from each Cloud Run audience", async () => {
    const { tx, fetcher } = setup();
    tx.setSession("api", "canonical-platform");
    tx.setSession("admin", "canonical-platform");
    tx.setSession("ops", "canonical-platform");
    tx.setSession("driver", "bound-driver");
    for (const role of ["api", "admin", "ops", "driver"] as const)
      await tx.call(role, "/actual-route");
    const sent = fetcher.mock.calls.map(
      ([, options]) => new Headers(options?.headers),
    );
    expect(at(sent, 0).get("authorization")).toBe("Bearer canonical-platform");
    expect(at(sent, 0).get("x-serverless-authorization")).toBe(
      "Bearer cloud-api",
    );
    expect(at(sent, 1).get("x-drts-authorization")).toBe(
      "Bearer canonical-platform",
    );
    expect(at(sent, 1).get("x-serverless-authorization")).toBe(
      "Bearer cloud-admin",
    );
    expect(at(sent, 2).get("x-drts-authorization")).toBe(
      "Bearer canonical-platform",
    );
    expect(at(sent, 2).get("x-serverless-authorization")).toBe(
      "Bearer cloud-ops",
    );
    expect(at(sent, 3).get("authorization")).toBe("Bearer bound-driver");
    expect(at(sent, 3).get("x-serverless-authorization")).toBe(
      "Bearer cloud-api",
    );
    expect(
      fetcher.mock.calls.every(
        ([, options]) =>
          options?.redirect === "manual" &&
          options.signal instanceof AbortSignal,
      ),
    ).toBe(true);
  });

  it("does not mix an Admin session into public handoff or Driver registration", async () => {
    const { tx, fetcher } = setup();
    tx.setSession("api", "canonical-platform");
    await tx.call("publicApi", "/api/partner/ingress/referral-embed-handoff", {
      method: "POST",
      body: { entrySlug: "yuhe-residence" },
      headers: { "x-drts-google-id-token": "purpose-bound-proof" },
    });
    const sent = new Headers(at(fetcher.mock.calls, 0)[1]?.headers);
    expect(sent.get("authorization")).toBeNull();
    expect(sent.get("x-drts-authorization")).toBeNull();
    expect(sent.get("x-serverless-authorization")).toBe("Bearer cloud-api");
    expect(sent.get("x-drts-google-id-token")).toBe("purpose-bound-proof");
    expect(() => tx.setSession("publicApi", "not-public")).toThrow(
      JourneyFailure,
    );
  });

  it("sends the real same-origin browser Origin and cookie only to Referral", async () => {
    const { tx, fetcher } = setup();
    await tx.call("referral", "/api/referral/session", {
      method: "POST",
      body: { action: "exchange" },
      headers: { Cookie: "drts_referral_embed_session=private" },
    });
    const sent = new Headers(at(fetcher.mock.calls, 0)[1]?.headers);
    expect(sent.get("origin")).toBe(origins.referral);
    expect(sent.get("cookie")).toBe("drts_referral_embed_session=private");
    expect(sent.get("authorization")).toBeNull();
    await expect(
      tx.call("api", "/api/auth/session", { headers: { Cookie: "private" } }),
    ).rejects.toThrow("cookie stays");
    await expect(
      tx.call("referral", "/api/referral/session", {
        headers: { Origin: "https://foreign.test" },
      }),
    ).rejects.toThrow("cannot replace browser origin");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects foreign origins and caller-injected authority before any transport", async () => {
    const { tx, fetcher, fleetHeaders } = setup();
    await expect(
      tx.call("admin", "https://foreign.test/api/entry"),
    ).rejects.toThrow("role origin isolation");
    for (const header of [
      "Authorization",
      "x-drts-authorization",
      "X-Serverless-Authorization",
      "x-actor-id",
      "x-roles",
      "x-scopes",
      "x-realm",
      "x-fleet-partner-id",
    ]) {
      await expect(
        tx.call("api", "/api/entry", { headers: { [header]: "replacement" } }),
      ).rejects.toThrow("cannot replace authority");
    }
    await expect(
      tx.call("fleet", "https://foreign.test/upload"),
    ).rejects.toThrow("role origin isolation");
    expect(fetcher).not.toHaveBeenCalled();
    expect(fleetHeaders).not.toHaveBeenCalled();
  });

  it("delegates only the exact Fleet origin to the existing lawful helper", async () => {
    const { tx, fetcher, fleetHeaders } = setup();
    await tx.call("fleet", "/control-plane-proxy/fleet-partner/self");
    expect(fleetHeaders).toHaveBeenCalledWith(
      `${origins.fleet}/control-plane-proxy/fleet-partner/self`,
    );
    expect(
      new Headers(at(fetcher.mock.calls, 0)[1]?.headers).get(
        "x-drts-authorization",
      ),
    ).toBe("Bearer genuine-fleet");
  });

  it.each([
    "SCOPE_REQUIRED",
    "AUTH_REALM_DENIED",
    "AUTH_SCOPE_DENIED",
    "DEV_WORKFORCE_SESSION_EXCHANGE_DENIED",
  ])(
    "preserves genuine denial %s without exporting secret response bodies",
    async (code) => {
      const { tx, fetcher } = setup();
      fetcher.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code, message: "secret_token" },
          }),
          { status: 403 },
        ),
      );
      const failure = await tx
        .call("ops", "/control-plane-proxy/dispatch/assign")
        .catch((error) => error);
      expect(failure).toBeInstanceOf(JourneyFailure);
      expect(failure.status).toBe(403);
      expect(failure.code).toBe(code);
      expect(String(failure)).not.toContain("secret_token");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("requires the served runtime SHA even on explicitly expected conflicts", async () => {
    const { tx, fetcher } = setup();
    fetcher.mockResolvedValueOnce(
      response({ accepted: true }, 200, "b".repeat(40)),
    );
    await expect(tx.call("api", "/api/entry")).rejects.toThrow(
      "runtime SHA mismatch",
    );
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "CONFLICT" } }), {
        status: 409,
        headers: { "x-drts-candidate-sha": SHA },
      }),
    );
    expect(
      (
        await tx.call("referral", "/api/referral/rating/own", {
          expected: [409],
        })
      ).status,
    ).toBe(409);
  });

  it.each([SHA, "b".repeat(40), undefined])(
    "trusts the cancellation denial for recovery only from its exact served runtime (%s)",
    async (served) => {
      const { tx, fetcher } = setup();
      fetcher.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "ORDER_NOT_CANCELABLE", message: "private detail" },
          }),
          {
            status: 409,
            headers: served ? { "x-drts-candidate-sha": served } : {},
          },
        ),
      );
      const failure = await tx
        .call("api", "/api/passenger/orders/own/cancel", {
          method: "POST",
          body: { reason: "synthetic own cleanup" },
        })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(JourneyFailure);
      if (served === SHA)
        expect(failure).toMatchObject({
          status: 409,
          code: "ORDER_NOT_CANCELABLE",
        });
      else
        expect(failure).toMatchObject({
          stage: "api:runtime SHA mismatch",
          code: undefined,
        });
      expect(String(failure)).not.toContain("private detail");
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("rejects redirects and oversized responses without retrying", async () => {
    const { tx, fetcher } = setup();
    fetcher.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://foreign.test" },
      }),
    );
    await expect(
      tx.call("admin", "/control-plane-proxy/private"),
    ).rejects.toMatchObject({ status: 302 });
    fetcher.mockResolvedValueOnce(
      new Response("x".repeat(1024 * 1024 + 1), {
        headers: { "x-drts-candidate-sha": SHA },
      }),
    );
    await expect(tx.call("api", "/api/oversized")).rejects.toThrow(
      "bounded response exceeded",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("owned identity and actual evidence invariants", () => {
  it("stops before supply writes for an inherited fixed-subject active order", () => {
    expect(() =>
      assertNoForeignActive({ active: false, trip: null }),
    ).not.toThrow();
    expect(() =>
      assertNoForeignActive({ active: true, trip: { orderId: "foreign" } }),
    ).toThrow("preserve it");
    expect(() =>
      assertNoForeignActive({ active: true, trip: { orderId: "own" } }, "own"),
    ).not.toThrow();
    expect(() =>
      assertNoForeignActive(
        { active: true, trip: { orderId: "foreign" } },
        "own",
      ),
    ).toThrow();
  });

  it("requires the exact approved business pair, normal eligibility and real ETA", () => {
    const candidate = {
      driverId: "own-driver",
      vehicleId: "own-vehicle",
      serviceBuckets: ["business_dispatch"],
      eligibilityDecision: "eligible",
      hardReasonCodes: [],
      etaMinutes: 2,
    };
    const own = { driverId: "own-driver", vehicleId: "own-vehicle" };
    expect(() => assertOwnPair(candidate, own)).not.toThrow();
    for (const patch of [
      { driverId: "foreign" },
      { vehicleId: "foreign" },
      { serviceBuckets: ["taxi_realtime"] },
      { eligibilityDecision: "ineligible" },
      { hardReasonCodes: ["EXCLUSIVITY_REQUIRED"] },
      { etaMinutes: null },
    ])
      expect(() => assertOwnPair({ ...candidate, ...patch }, own)).toThrow();
  });

  it("retains task, order, Driver and vehicle identity across all Driver actions", () => {
    const own = {
      taskId: "task",
      orderId: "order",
      driverId: "driver",
      vehicleId: "vehicle",
    };
    expect(() => assertTask({ ...own }, own)).not.toThrow();
    for (const key of Object.keys(own))
      expect(() => assertTask({ ...own, [key]: "foreign" }, own)).toThrow();
  });

  it("terminalizes only the acknowledged own order through its normal permitted branch", async () => {
    const readOwn = vi
      .fn()
      .mockResolvedValueOnce({ orderId: "own", status: "exception_hold" })
      .mockResolvedValueOnce({ orderId: "own", status: "cancelled" });
    const terminate = vi.fn().mockResolvedValue({ accepted: true });
    await terminalizeOwnOrder("own", readOwn, terminate);
    expect(terminate).toHaveBeenCalledExactlyOnceWith("resolve-exception-hold");
    expect(readOwn).toHaveBeenCalledTimes(2);
    const foreign = vi
      .fn()
      .mockResolvedValue({ orderId: "foreign", status: "created" });
    terminate.mockClear();
    await expect(
      terminalizeOwnOrder("own", foreign, terminate),
    ).rejects.toThrow("owned order binding");
    expect(terminate).not.toHaveBeenCalled();
  });

  it("does not force a denied cleanup, retry it, or mutate an already terminal order", async () => {
    const readOwn = vi
      .fn()
      .mockResolvedValue({ orderId: "own", status: "on_trip" });
    const denied = vi
      .fn()
      .mockRejectedValue(
        new JourneyFailure(
          "api:request",
          409,
          "ON_TRIP_CANCELLATION_FORBIDDEN",
        ),
      );
    await expect(
      terminalizeOwnOrder("own", readOwn, denied),
    ).rejects.toMatchObject({ status: 409 });
    expect(denied).toHaveBeenCalledExactlyOnceWith("cancel");
    expect(readOwn).toHaveBeenCalledTimes(1);
    denied.mockClear();
    readOwn.mockResolvedValue({ orderId: "own", status: "completed" });
    await terminalizeOwnOrder("own", readOwn, denied);
    expect(denied).not.toHaveBeenCalled();
  });

  it("requires one canonical low-score case while retaining contactfalse", () => {
    const first = {
      orderId: "own",
      complaintCaseNo: "case-1",
      contactRequested: false,
    };
    expect(() => assertRatingReplay(first, { ...first }, "own")).not.toThrow();
    for (const patch of [
      { orderId: "foreign" },
      { complaintCaseNo: "case-2" },
      { complaintCaseNo: "" },
      { contactRequested: true },
    ])
      expect(() =>
        assertRatingReplay(first, { ...first, ...patch }, "own"),
      ).toThrow();
  });

  it("uses explicitly reported synthetic actual fare rather than treating the estimate as payment", () => {
    const order = {
      fixedPrice: false,
      quotedFare: { currency: "TWD", amountMinor: 150000 },
      proofRequirements: {
        minPhotoCount: 1,
        signoffRequired: false,
        expenseProofRequired: false,
      },
    };
    const completion = simulationCompletion(
      order,
      "data:image/png;base64,actual-tracked-bytes",
    );
    expect(completion.fare.amountMinor).toBe(12000);
    expect(
      Object.values(completion.actualFareBreakdown).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBe(12000);
    expect(completion.proof.photos).toHaveLength(1);
    for (const patch of [
      { minPhotoCount: 2 },
      { minPhotoCount: -1 },
      { signoffRequired: true },
      { expenseProofRequired: true },
    ])
      expect(() =>
        simulationCompletion(
          {
            ...order,
            proofRequirements: { ...order.proofRequirements, ...patch },
          },
          "data:image/png;base64,actual",
        ),
      ).toThrow();
    expect(() =>
      simulationCompletion(
        { ...order, fixedPrice: true },
        "data:image/png;base64,actual",
      ),
    ).toThrow();
  });

  it("restricts persistent evidence to safe facts and hashes actual bytes", () => {
    const evidence = new Evidence();
    expect(() =>
      evidence.record({
        stage: "own-event",
        token: "secret",
      } as unknown as Parameters<Evidence["record"]>[0]),
    ).toThrow("not allowlisted");
    evidence.failure(
      new JourneyFailure("api:request failure", 403, "SCOPE_REQUIRED"),
    );
    expect(evidence.events).toEqual([
      {
        stage: "api:request-failure",
        status: 403,
        code: "SCOPE_REQUIRED",
        result: "failed",
      },
    ]);
    expect(hash(Buffer.from("real bytes"))).toMatch(/^[a-f0-9]{64}$/);
    expect(hash(Buffer.from("real bytes"))).not.toBe(
      hash(Buffer.from("other bytes")),
    );
    expect(() => origin("https://user:secret@api.example.test")).toThrow();
    expect(() => origin("https://api.example.test/path")).toThrow();
  });
});

describe("native fetch failure diagnostics", () => {
  it("retains a native connect code and root context without exposing authority or retrying", async () => {
    const { tx, fetcher } = setup();
    const privateValue = "synthetic-private-url-body-header";
    fetcher.mockRejectedValueOnce(
      new TypeError(privateValue, {
        cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: privateValue },
      }),
    );
    const failure = await tx
      .call("fleet", "/", { raw: true })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JourneyFailure);
    const evidence = new Evidence();
    evidence.failure(failure);
    expect(evidence.events).toEqual([
      expect.objectContaining({
        stage: "fleet:transport",
        result: "failed",
        nativeFailureClass: "TypeError",
        nativeCauseCode: "UND_ERR_CONNECT_TIMEOUT",
        requestAborted: false,
        requestMethod: "GET",
        requestRoute: "/",
      }),
    ]);
    const event = at(evidence.events, 0);
    expect(event.requestDurationMs).toBeGreaterThanOrEqual(0);
    expect(event.status).toBeUndefined();
    expect(event.code).toBeUndefined();
    expect(JSON.stringify(evidence.events)).not.toContain(privateValue);
    expect(JSON.stringify(failure)).not.toContain(privateValue);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(at(fetcher.mock.calls, 0)[1]).toMatchObject({
      method: "GET",
      redirect: "manual",
    });
    expect(
      new Headers(at(fetcher.mock.calls, 0)[1]?.headers).get(
        "x-drts-authorization",
      ),
    ).toBe("Bearer genuine-fleet");
  });

  it.each(["AbortError", "TimeoutError"])(
    "keeps observed %s and the original 15s signal without inferring an HTTP status",
    async (name) => {
      const { tx, fetcher } = setup();
      const controller = new AbortController();
      const timeout = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValueOnce(controller.signal);
      try {
        fetcher.mockImplementationOnce(async (_url, options) => {
          expect(options?.signal).toBe(controller.signal);
          controller.abort(
            new DOMException("synthetic-sensitive-reason", name),
          );
          throw new DOMException("synthetic-sensitive-message", name);
        });
        const failure = await tx
          .call("fleet", "/")
          .catch((error: unknown) => error);
        const evidence = new Evidence();
        evidence.failure(failure);
        expect(evidence.events).toEqual([
          expect.objectContaining({
            stage: "fleet:transport",
            nativeFailureClass: name,
            nativeCauseCode: "UNKNOWN",
            requestAborted: true,
            requestMethod: "GET",
            requestRoute: "/",
            result: "failed",
          }),
        ]);
        expect(timeout).toHaveBeenCalledExactlyOnceWith(15_000);
        expect(at(evidence.events, 0).status).toBeUndefined();
        expect(JSON.stringify(evidence.events)).not.toContain(
          "synthetic-sensitive",
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
      } finally {
        timeout.mockRestore();
      }
    },
  );

  it("keeps unknown class/code and nonroot path private while preserving the original POST body", async () => {
    const { tx, fetcher } = setup();
    const privateValue = "synthetic-secret-payload-and-path";
    const error = Object.assign(new Error(privateValue), {
      name: privateValue,
      cause: { code: privateValue },
    });
    fetcher.mockRejectedValueOnce(error);
    const body = { originalIntent: privateValue };
    const failure = await tx
      .call("fleet", `/private/${privateValue}?key=${privateValue}`, {
        method: "POST",
        body,
      })
      .catch((error: unknown) => error);
    const evidence = new Evidence();
    evidence.failure(failure);
    expect(evidence.events).toEqual([
      expect.objectContaining({
        stage: "fleet:transport",
        nativeFailureClass: "UNKNOWN",
        nativeCauseCode: "UNKNOWN",
        requestMethod: "POST",
        requestRoute: "OTHER",
        requestAborted: false,
      }),
    ]);
    expect(at(fetcher.mock.calls, 0)[1]?.body).toBe(JSON.stringify(body));
    expect(JSON.stringify(evidence.events)).not.toContain(privateValue);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not replace the original transport failure when native metadata accessors throw", async () => {
    const { tx, fetcher } = setup();
    const native = Object.defineProperties(
      {},
      {
        name: {
          get() {
            throw new Error("synthetic-private-name-getter");
          },
        },
        cause: {
          get() {
            throw new Error("synthetic-private-cause-getter");
          },
        },
      },
    );
    fetcher.mockRejectedValueOnce(native);
    const failure = await tx
      .call("fleet", "/")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JourneyFailure);
    const evidence = new Evidence();
    evidence.failure(failure);
    expect(evidence.events).toEqual([
      expect.objectContaining({
        stage: "fleet:transport",
        result: "failed",
        nativeFailureClass: "UNKNOWN",
        nativeCauseCode: "UNKNOWN",
      }),
    ]);
    expect(JSON.stringify(evidence.events)).not.toContain("synthetic-private");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses elapsed monotonic time and leaves HTTP response failures on their original rail", async () => {
    const { tx, fetcher } = setup();
    const clock = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(137.9);
    try {
      fetcher.mockRejectedValueOnce(
        new TypeError("synthetic-sensitive-message", {
          cause: { code: "ECONNRESET" },
        }),
      );
      const evidence = new Evidence();
      evidence.failure(
        await tx.call("fleet", "/").catch((error: unknown) => error),
      );
      expect(at(evidence.events, 0)).toMatchObject({
        requestDurationMs: 37,
        nativeCauseCode: "ECONNRESET",
      });
    } finally {
      clock.mockRestore();
    }
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE" } }), {
        status: 503,
      }),
    );
    const failure = await tx
      .call("fleet", "/")
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      stage: "fleet:request",
      status: 503,
      code: undefined,
    });
    expect((failure as JourneyFailure).transportFacts).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("actual native receipt PDF bytes without user routing", () => {
  const orderId = "synthetic-completed-order";
  const expected = {
    url: `https://referral.example.test/api/referral/receipt/${orderId}/pdf`,
    filename: `receipt-${orderId}.pdf`,
  };
  const expectedText = [
    "乘車明細（非正式稅務憑證）",
    `行程 ID：${orderId}`,
    "訂單編號：R-TEST-1",
    "新北市板橋區縣民大道二段7號",
    "臺北市信義區市府路1號",
    "實際車資合計：NT$ 120",
    "起步價：NT$ 85",
    "里程費：NT$ 20",
    "時間費：NT$ 10",
    "夜間費：NT$ 5",
    "付款及結算狀態未提供",
    "02-2944-0985",
    "1999",
  ];
  async function realPdf(lines = expectedText): Promise<Buffer> {
    const doc = new PDFDocument({ compress: false });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.font(path.resolve("apps/api/assets/fonts/NotoSansCJKtc-Regular.otf"));
    doc.fontSize(12).text(lines.join("\n"));
    doc.end();
    return complete;
  }
  async function fixture(bytes: Buffer) {
    const dir = await mkdtemp(path.join(tmpdir(), "owned-native-pdf-"));
    const file = path.join(dir, "actual-downloaded-file.pdf");
    await writeFile(file, bytes);
    let release!: (value: {
      url(): string;
      suggestedFilename(): string;
      failure(): Promise<string | null>;
      path(): Promise<string | null>;
    }) => void;
    const pending = new Promise<Parameters<typeof release>[0]>((resolve) => {
      release = resolve;
    });
    const download = {
      url: () => expected.url,
      suggestedFilename: () => expected.filename,
      failure: async (): Promise<string | null> => null,
      path: async (): Promise<string | null> => file,
    };
    const actions: string[] = [];
    const ports = {
      waitForDownload: vi.fn(() => {
        actions.push("wait");
        return pending;
      }),
      click: vi.fn(async () => {
        actions.push("click");
        // Simulate the native Download event, with no userRoute callback at all.
        release(download);
      }),
      readFile: vi.fn((filePath: string) => readFile(filePath)),
    };
    return {
      ports,
      download,
      actions,
      file,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }
  const validate = (bytes: Buffer) =>
    validateActualReceiptPdfBytes(bytes, expectedText, parsePdf);

  it("consumes the real downloaded file when native download bypasses userRoute", async () => {
    const bytes = await realPdf();
    const f = await fixture(bytes);
    try {
      const actual = await consumeNativeReceiptPdfDownload(
        f.ports,
        expected,
        validate,
      );
      expect(f.actions).toEqual(["wait", "click"]);
      expect(f.ports.readFile).toHaveBeenCalledExactlyOnceWith(f.file);
      expect(actual).toEqual(bytes);
      expect(hash(actual)).toBe(hash(bytes));
      // The independent real parser, including Chinese font text, is the gate.
      expect((await parsePdf(actual)).text).toContain(orderId);
    } finally {
      await f.cleanup();
    }
  });

  it.each(["order", "fare", "nonPDF"] as const)(
    "rejects a downloaded %s mismatch using its actual bytes",
    async (mismatch) => {
      const lines = expectedText.map((line) =>
        mismatch === "order"
          ? line.replace(orderId, "foreign-order")
          : line.replace("實際車資合計：NT$ 120", "實際車資合計：NT$ 999"),
      );
      const bytes =
        mismatch === "nonPDF" ? Buffer.from("not a PDF") : await realPdf(lines);
      const f = await fixture(bytes);
      try {
        await expect(
          consumeNativeReceiptPdfDownload(f.ports, expected, validate),
        ).rejects.toBeInstanceOf(JourneyFailure);
        expect(f.ports.readFile).toHaveBeenCalledExactlyOnceWith(f.file);
      } finally {
        await f.cleanup();
      }
    },
  );

  it.each(["url", "filename", "failure", "path"] as const)(
    "rejects native Download %s mismatch without accepting bytes",
    async (mismatch) => {
      const f = await fixture(await realPdf());
      if (mismatch === "url") f.download.url = () => expected.url + "-foreign";
      if (mismatch === "filename")
        f.download.suggestedFilename = () => "foreign.pdf";
      if (mismatch === "failure") f.download.failure = async () => "synthetic";
      if (mismatch === "path") f.download.path = async () => null;
      try {
        await expect(
          consumeNativeReceiptPdfDownload(f.ports, expected, validate),
        ).rejects.toBeInstanceOf(JourneyFailure);
        expect(f.ports.readFile).not.toHaveBeenCalled();
      } finally {
        await f.cleanup();
      }
    },
  );
});

describe("original UI cancellation response capture before navigation release", () => {
  const expected = {
    url: "https://referral.example.test/api/referral/cancel/owned-case",
    orderId: "owned-case",
    runtime: SHA,
  };
  function fixture() {
    let released = false;
    const readBeforeRelease = () => {
      if (released) throw new Error("synthetic response resource released");
    };
    const command: Record<string, unknown> = {
      idempotencyKey: "synthetic-key",
    };
    const payload = {
      ok: true,
      data: {
        orderId: expected.orderId,
        status: "cancelled",
        cancelledAt: "2026-10-21T01:00:00.000Z",
      },
    };
    let bytes: Buffer = Buffer.from(JSON.stringify(payload));
    const response = {
      url: vi.fn(() => {
        readBeforeRelease();
        return expected.url;
      }),
      status: vi.fn(() => {
        readBeforeRelease();
        return 200;
      }),
      headers: vi.fn(() => {
        readBeforeRelease();
        return {
          "x-drts-candidate-sha": SHA,
          "content-type": "application/json",
        };
      }),
      body: vi.fn(async () => {
        readBeforeRelease();
        return bytes;
      }),
    };
    const request = {
      method: () => "POST",
      url: () => expected.url,
      postDataJSON: vi.fn(() => {
        readBeforeRelease();
        return command;
      }),
    };
    const route = {
      request: () => request,
      fetch: vi.fn(async () => response),
      fulfill: vi.fn(
        async (options: { response: typeof response; body: Buffer }) => {
          expect(options.response).toBe(response);
          expect(options.body).toBe(bytes);
          released = true;
        },
      ),
    };
    return {
      route,
      response,
      request,
      payload,
      command,
      setBytes: (value: Buffer) => {
        bytes = value;
      },
      get bytes() {
        return bytes;
      },
    };
  }

  it("reads the one original POST bytes, headers and command before unchanged fulfill", async () => {
    const f = fixture();
    const snapshot = await captureOriginalUiCancellation(f.route, expected);
    expect(f.route.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
    });
    expect(f.route.fulfill).toHaveBeenCalledTimes(1);
    expect(f.response.body).toHaveBeenCalledTimes(1);
    expect(f.request.postDataJSON).toHaveBeenCalledTimes(1);
    expect(snapshot.bytes).toBe(f.bytes);
    expect(snapshot.command).toBe(f.command);
    expect(snapshot.status).toBe(200);
    expect(snapshot.data).toEqual(f.payload.data);
    expect(snapshot.headers.get("x-drts-candidate-sha")).toBe(SHA);
    // A post-release body read really fails; the returned original RAM bytes work.
    await expect(f.response.body()).rejects.toThrow(
      "synthetic response resource released",
    );
    expect(JSON.parse(Buffer.from(snapshot.bytes).toString("utf8"))).toEqual(
      f.payload,
    );
  });

  it.each([
    "order",
    "runtime",
    "responseURL",
    "oversize",
    "JSON",
    "command",
  ] as const)(
    "rejects a %s mismatch before release and never sends a second POST",
    async (mismatch) => {
      const f = fixture();
      if (mismatch === "order") f.payload.data.orderId = "foreign-case";
      if (mismatch === "runtime")
        f.response.headers.mockReturnValue({
          "x-drts-candidate-sha": "b".repeat(40),
          "content-type": "application/json",
        });
      if (mismatch === "responseURL")
        f.response.url.mockReturnValue(expected.url + "-foreign");
      if (mismatch === "oversize") f.setBytes(Buffer.alloc(1024 * 1024 + 1));
      if (mismatch === "JSON") f.setBytes(Buffer.from("invalid JSON"));
      if (mismatch === "command") delete f.command.idempotencyKey;
      if (mismatch === "order")
        f.setBytes(Buffer.from(JSON.stringify(f.payload)));
      await expect(
        captureOriginalUiCancellation(f.route, expected),
      ).rejects.toBeInstanceOf(Error);
      expect(f.route.fetch).toHaveBeenCalledTimes(
        mismatch === "command" ? 0 : 1,
      );
      expect(f.route.fulfill).not.toHaveBeenCalled();
    },
  );

  it("keeps a real 409 denial status, code and original body independent from successful cancellation", async () => {
    const f = fixture();
    const payload = { ok: false, error: { code: "ORDER_NOT_CANCELABLE" } };
    f.setBytes(Buffer.from(JSON.stringify(payload)));
    f.response.status.mockReturnValue(409);
    const snapshot = await captureOriginalUiCancellation(f.route, expected);
    expect(snapshot.status).toBe(409);
    expect(snapshot.data).toEqual(payload);
    expect(snapshot.bytes).toBe(f.bytes);
    expect(f.route.fetch).toHaveBeenCalledTimes(1);
    expect(f.route.fulfill).toHaveBeenCalledTimes(1);
  });

  it.each(["fetch", "fulfill"] as const)(
    "rethrows the original %s failure without retry or a fabricated ACK",
    async (phase) => {
      const f = fixture();
      const failure = new TypeError("synthetic controlled failure");
      if (phase === "fetch") f.route.fetch.mockRejectedValue(failure);
      else f.route.fulfill.mockRejectedValue(failure);
      await expect(
        captureOriginalUiCancellation(f.route, expected),
      ).rejects.toBe(failure);
      expect(f.route.fetch).toHaveBeenCalledTimes(1);
      expect(f.route.fulfill).toHaveBeenCalledTimes(phase === "fetch" ? 0 : 1);
    },
  );
});
