import { afterEach, describe, expect, it, vi } from "vitest";
import { availablePort, harness, identity, tenantId } from "./fixture";

afterEach(() => vi.unstubAllEnvs());
describe("tenant contact actual canonical Controller/Service/Repository", () => {
  it("returns an available controlled proxy for the same actual enterprise booking and assignment", async () => {
    const port = availablePort();
    const x = harness(port);
    const result = await x.invoke();
    expect(result.data).toMatchObject({
      bookingId: "contact-booking",
      orderId: "contact-order",
      assignmentId: "contact-assignment",
      mode: "masked_call",
      contactUri: "tel:+886200000001,,123",
      unavailableReason: null,
    });
    expect(result.meta.requestId).toBe("contact-request");
    expect(port.createSession).toHaveBeenCalledWith(
      {
        orderId: "contact-order",
        assignmentId: "contact-assignment",
        driverId: "contact-driver",
        passengerSubjectRef: `tenant:${tenantId}:${identity.actorId}`,
      },
      { requestId: "contact-request" },
    );
    expect(JSON.stringify(result)).not.toContain("0911000222");
    expect(x.queries.some((sql) => sql.includes("jsonb_build_object"))).toBe(
      true,
    );
    expect(x.queries.some((sql) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(
      false,
    );
  });
  it.each(["assigned", "accepted"] as const)(
    "uses current generic %s assignment without any multi-taxi disclosure",
    async (status) => {
      const port = availablePort();
      const x = harness(port);
      x.assignments[0]!.status = status;
      expect((await x.invoke()).data.mode).toBe("masked_call");
    },
  );
  it("preserves supported noDB contact behavior", async () => {
    const x = harness(availablePort(), false);
    expect((await x.invoke()).data.mode).toBe("masked_call");
    expect(x.queries).toHaveLength(0);
  });
  it.each([null, { ...identity, actorId: null }])(
    "refuses missing principal",
    async (actor) => {
      const x = harness(availablePort());
      await expect(
        Promise.resolve().then(() => x.invoke(actor)),
      ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    },
  );
  it.each(["platform", "system"] as const)(
    "retains the legitimate existing %s scope exception",
    async (realm) => {
      const x = harness(availablePort());
      expect(
        (
          await x.invoke({
            ...identity,
            realm,
            actorType: realm === "system" ? "system" : "platform_admin",
            tenantId: null,
          })
        ).data.mode,
      ).toBe("masked_call");
    },
  );
  it("rechecks noDB replacement and terminal state through existing active-assignment accessor", async () => {
    const port = availablePort();
    const x = harness(port, false);
    x.assignments = [
      {
        ...x.assignments[0]!,
        assignmentId: "noDB-new",
        driverId: "noDB-driver",
      },
    ];
    expect((await x.invoke()).data.assignmentId).toBe("noDB-new");
    x.order!.status = "completed";
    await expect(x.invoke()).rejects.toMatchObject({
      code: "TENANT_DRIVER_CONTACT_NOT_AVAILABLE",
    });
    expect(port.createSession).toHaveBeenCalledOnce();
  });
  it("refuses cross-tenant before contacting any driver", async () => {
    const port = availablePort();
    const x = harness(port);
    await expect(
      x.invoke({ ...identity, tenantId: "other" }),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" });
    expect(port.createSession).not.toHaveBeenCalled();
  });
  it("refuses nonexistent booking and durable misses rather than reviving a cached order", async () => {
    const x = harness(availablePort());
    await expect(x.invoke(identity, "missing")).rejects.toMatchObject({
      code: "BOOKING_NOT_FOUND",
    });
    x.order = null;
    await expect(x.invoke()).rejects.toMatchObject({
      code: "BOOKING_NOT_FOUND",
    });
  });
  it.each(["completed", "cancelled"] as const)(
    "refuses %s booking before provider",
    async (status) => {
      const port = availablePort();
      const x = harness(port);
      x.order!.status = status;
      await expect(x.invoke()).rejects.toMatchObject({
        code: "TENANT_DRIVER_CONTACT_NOT_AVAILABLE",
      });
      expect(port.createSession).not.toHaveBeenCalled();
    },
  );
  it("refuses unassigned and superseded assignments, then returns the actual replacement", async () => {
    const port = availablePort();
    const x = harness(port);
    const first = x.assignments[0]!;
    x.assignments = [];
    await expect(x.invoke()).rejects.toMatchObject({
      code: "TENANT_DRIVER_CONTACT_NOT_AVAILABLE",
    });
    x.assignments = [{ ...first, status: "cancelled" }];
    await expect(x.invoke()).rejects.toMatchObject({
      code: "TENANT_DRIVER_CONTACT_NOT_AVAILABLE",
    });
    x.assignments = [
      {
        ...first,
        assignmentId: "replacement",
        driverId: "replacement-driver",
        status: "accepted",
      },
      ...x.assignments,
    ];
    expect((await x.invoke()).data.assignmentId).toBe("replacement");
    expect(port.createSession.mock.calls.at(-1)?.[0]).toMatchObject({
      driverId: "replacement-driver",
      assignmentId: "replacement",
    });
  });
  it("does not return a stale driver's option if reassignment occurs during provider await", async () => {
    const port = availablePort();
    const x = harness(port);
    port.createSession.mockImplementationOnce(async () => {
      x.assignments = [
        {
          ...x.assignments[0]!,
          assignmentId: "replacement",
          driverId: "replacement-driver",
        },
      ];
      return {
        contactUri: "tel:+886200000001,,old",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        providerName: "SIM",
      };
    });
    await expect(x.invoke()).rejects.toMatchObject({
      code: "TENANT_DRIVER_CONTACT_NOT_AVAILABLE",
    });
    expect((await x.invoke()).data.assignmentId).toBe("replacement");
  });
  it("rechecks terminal state after provider await", async () => {
    const port = availablePort();
    const x = harness(port);
    port.createSession.mockImplementationOnce(async () => {
      x.order!.status = "cancelled";
      return {
        contactUri: "tel:+886200000001",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        providerName: "SIM",
      };
    });
    await expect(x.invoke()).rejects.toMatchObject({
      code: "TENANT_DRIVER_CONTACT_NOT_AVAILABLE",
    });
  });
  it("reports absent provider honestly and only uses the existing configured support destination", async () => {
    const x = harness();
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
    expect((await x.invoke()).data).toMatchObject({
      mode: "unavailable",
      contactUri: null,
      unavailableReason: "masked_call_provider_not_configured",
    });
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "tel:+886200000099");
    expect((await x.invoke()).data).toMatchObject({
      mode: "support_fallback",
      contactUri: "tel:+886200000099",
      expiresAt: null,
      unavailableReason: "masked_call_provider_not_configured",
    });
  });
  it("hides provider payload/errors and refuses expired options without false success", async () => {
    const port = availablePort();
    const x = harness(port);
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
    port.createSession.mockRejectedValueOnce(
      new Error("raw-driver-phone-must-never-leak"),
    );
    const result = await x.invoke();
    expect(result.data).toMatchObject({
      mode: "unavailable",
      unavailableReason: "masked_call_provider_error",
    });
    expect(JSON.stringify(result)).not.toContain("raw-driver-phone");
    port.createSession.mockResolvedValueOnce({
      contactUri: "tel:+886200000001",
      expiresAt: "2000-01-01T00:00:00Z",
      providerName: "SIM",
    });
    expect((await x.invoke()).data).toMatchObject({
      mode: "unavailable",
      unavailableReason: "masked_call_provider_error",
    });
  });
});
