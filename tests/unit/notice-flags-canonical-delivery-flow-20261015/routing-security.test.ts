import { postNoticeFlagsWithStepUp } from "../../../apps/platform-admin-web/lib/notice-flags-canonical-flow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wireHarness, principal } from "./wire-harness";
import type { RecipientNotice } from "../../../apps/api/src/modules/platform-admin/platform-notice-lifecycle";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "notice-unit-secret-at-least-thirty-two-characters");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("real guarded commands, wire casing and scoped notification production", () => {
  it("selected admin A query and typed own-tenant projection use the same flags authority", async () => {
    const h = wireHarness();
    const admin = h.client(principal("platform"));
    await postNoticeFlagsWithStepUp(
      admin,
      "/api/admin/flags/tenant-portal.booking/tenant-overrides?tenantId=A",
      { enabled: false },
    );
    expect(
      (await admin.getFeatureFlags({ tenantId: "A" })).flags.find(
        (f) => f.key === "tenant-portal.booking",
      ),
    ).toMatchObject({ enabled: false, tenantId: "A" });
    const tenantA = h.client(principal("tenant", "alice", "A"));
    const own = await tenantA.getTenantFeatureFlags();
    expect(
      own.items.find((f) => f.key === "tenant-portal.booking"),
    ).toMatchObject({
      enabled: false,
      scope: "tenant_override",
      availableActions: [],
    });
    expect(own.availableActions).toEqual([]);
    expect(
      (
        await h.client(principal("tenant", "bob", "B")).listTenantFeatureFlags()
      ).flags.find((f) => f.key === "tenant-portal.booking"),
    ).toMatchObject({ enabled: true, scope: "global_default" });
    await expect(
      tenantA.get("/api/tenant/feature-flags?tenantId=B"),
    ).rejects.toThrow();
    await expect(
      tenantA.get("/api/tenant/feature-flags", {
        headers: { "x-tenant-id": "B" },
      }),
    ).rejects.toThrow();
    await expect(
      tenantA.updateFeatureFlag("tenant-portal.booking", true),
    ).rejects.toThrow();
    await expect(
      h.client(principal("driver")).getTenantFeatureFlags(),
    ).rejects.toThrow();
    await expect(h.client(null).getTenantFeatureFlags()).rejects.toThrow();
    expect(JSON.stringify(h.wireBodies)).toContain("tenant_override");
    expect(JSON.stringify(h.wireBodies)).toContain("available_actions");
  });
  it.each(["ops", "tenants", "drivers", "all"] as const)(
    "routes %s only to selected verified resources and records distinct available/read receipts",
    async (audience) => {
      const h = wireHarness();
      const created = h.service.createPlatformNotice({
        title: `Selected ${audience}`,
        body: "Critical body",
        severity: "critical",
        targetAudience: audience,
        reason: "Incident",
        confirmed: true,
      });
      expect(
        created.outcomes.every(
          (o) => o.state === "routed" && o.notificationId === null,
        ),
      ).toBe(true);
      for (const [selected, realm, path] of [
        ["ops", "ops", "/api/ops/platform-notices"],
        ["tenants", "tenant", "/api/tenant/notifications/platform-notices"],
        ["drivers", "driver", "/api/driver/platform-notices"],
      ] as const) {
        const client = h.client(
          principal(realm, `${realm}-alice`, realm === "tenant" ? "A" : null),
        );
        const items = await client.getList<RecipientNotice>(path);
        const own = items.find((n) => n.noticeId === created.noticeId);
        if (audience !== "all" && audience !== selected) {
          expect(own).toBeUndefined();
          continue;
        }
        expect(own?.outcome.state).toBe("available");
        const notification = h.audit
          .listNotifications()
          .find((n) => n.notificationId === own!.outcome.notificationId);
        expect(notification).toMatchObject({
          recipientUserId: `${realm}-alice`,
          tenantId: realm === "tenant" ? "A" : null,
          message: "Critical body",
        });
        const second = await client.getList<RecipientNotice>(path);
        expect(
          second.find((n) => n.noticeId === created.noticeId)?.outcome
            .outcomeId,
        ).toBe(own!.outcome.outcomeId);
        await expect(
          h
            .client(
              principal(realm, `${realm}-bob`, realm === "tenant" ? "B" : null),
            )
            .post(`${path}/${created.noticeId}/read`, {
              body: { outcomeId: own!.outcome.outcomeId },
            }),
        ).rejects.toThrow();
        const ack = await client.post<{ readAt: string }>(
          `${path}/${created.noticeId}/read`,
          { body: { outcomeId: own!.outcome.outcomeId } },
        );
        expect(ack.readAt).toBeTruthy();
        expect(
          h.service
            .listPlatformNotices()
            .find((n) => n.noticeId === created.noticeId)
            ?.outcomes.find((o) => o.outcomeId === own!.outcome.outcomeId)
            ?.state,
        ).toBe("read");
      }
      expect(JSON.stringify(h.wireBodies)).toContain("notification_id");
    },
  );
  it("denies missing, wrong-audience, wrong-tenant and readonly principals; global notifications remain denied to driver/tenant", async () => {
    const h = wireHarness();
    for (const who of [
      null,
      principal("tenant", "a", "A"),
      principal("platform"),
      principal("driver", "a", null, []),
    ]) {
      await expect(
        h.client(who).getList("/api/driver/platform-notices"),
      ).rejects.toThrow();
    }
    await expect(
      h
        .client(principal("tenant", "a", "A"))
        .get("/api/tenant/notifications/platform-notices?tenantId=B"),
    ).rejects.toThrow();
    for (const realm of ["driver", "tenant"] as const) {
      const c = h.client(
        principal(realm, "a", realm === "tenant" ? "A" : null),
      );
      await expect(c.listNotifications()).rejects.toThrow();
      await expect(
        c.post("/api/platform-admin/notices", {
          body: {
            title: "forged",
            body: "x",
            severity: "info",
            targetAudience: "all",
          },
        }),
      ).rejects.toThrow();
    }
    await expect(
      h
        .client(principal("platform", "readonly", null, ["foundation:read"]))
        .updateFeatureFlag("tenant-portal.booking", false),
    ).rejects.toThrow();
    await expect(
      h
        .client(principal("platform"))
        .post("/api/platform-admin/maintenance-mode", {
          body: { enabled: true, reason: "without step-up" },
        }),
    ).rejects.toThrow();
  });
  it("scheduled delivery stays unavailable, appears at boundary, then expires without losing real history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    const h = wireHarness();
    const driver = h.client(principal("driver"));
    const n = h.service.createPlatformNotice({
      title: "Timed",
      body: "Clock",
      severity: "maintenance",
      confirmed: true,
      reason: "Upgrade",
      targetAudience: "drivers",
      scheduledAt: "2026-10-16T10:00:00Z",
      expiresAt: "2026-10-16T11:00:00Z",
    });
    expect(
      (
        await driver.getList<RecipientNotice>("/api/driver/platform-notices")
      ).some((i) => i.noticeId === n.noticeId),
    ).toBe(false);
    vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
    expect(
      (
        await driver.getList<RecipientNotice>("/api/driver/platform-notices")
      ).find((i) => i.noticeId === n.noticeId)?.outcome.state,
    ).toBe("available");
    vi.setSystemTime(new Date("2026-10-16T11:00:00Z"));
    expect(
      (
        await driver.getList<RecipientNotice>("/api/driver/platform-notices")
      ).some((i) => i.noticeId === n.noticeId),
    ).toBe(false);
    expect(
      h.service.listPlatformNotices().find((i) => i.noticeId === n.noticeId),
    ).toMatchObject({ status: "resolved", downlistedReason: "expired" });
  });
  it("actual notification insertion failure records failed outcome and returns failure, then retries truthfully", () => {
    const h = wireHarness();
    const n = h.service.createPlatformNotice({
      title: "Failure",
      body: "Retry",
      severity: "info",
      targetAudience: "drivers",
    });
    const spy = vi
      .spyOn(h.audit, "recordNotification")
      .mockImplementationOnce(() => {
        throw new Error("insertion failed");
      });
    expect(() => h.recipients.driver(principal("driver"))).toThrow();
    expect(
      h.service
        .listPlatformNotices()
        .find((i) => i.noticeId === n.noticeId)
        ?.outcomes.some((o) => o.state === "failed" && !o.notificationId),
    ).toBe(true);
    expect(
      h.recipients
        .driver(principal("driver"))
        .data.items.find((i) => i.noticeId === n.noticeId)?.outcome.state,
    ).toBe("available");
    spy.mockRestore();
  });
});
