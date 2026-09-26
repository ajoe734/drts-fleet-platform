import { describe, it, expect, vi, afterEach } from "vitest";
import { createPlatformAdminClient } from "../../../../packages/api-client/src/index";

describe("SR-PARTNER-NOTIFY-UI-20260917 API client contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("api client update binding sends expectedVersion and exact eventTypes, and throws 409 ApiClientError", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          error: "version_conflict",
          message: "Version mismatch",
        }),
    });
    global.fetch = fetchMock as any;

    const client = createPlatformAdminClient("http://localhost", "admin-1");
    const payload = {
      webhookId: "w",
      expectedVersion: 2,
      eventTypes: ["eta_changed", "assignment_replaced"] as any,
    };

    let error: any;
    try {
      await client.updatePartnerEntryNotificationBinding("entry-1", payload);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(409);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost/api/platform-admin/partner-entries/entry-1/notification-binding",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("api client get binding handles 404 gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          error: "not_found",
          message: "Not found",
        }),
    });
    global.fetch = fetchMock as any;

    const client = createPlatformAdminClient("http://localhost", "admin-1");

    let error: any;
    try {
      await client.getPartnerEntryNotificationBinding("entry-404");
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });

  it("api client retry sends correct request and returns structured RequeueOutcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { kind: "requeued" } }),
    });
    global.fetch = fetchMock as any;

    const client = createPlatformAdminClient("http://localhost", "admin-1");
    const res = await client.retryPartnerNotificationDelivery(
      "entry-2",
      "outbox-123",
    );

    expect(res).toEqual({ kind: "requeued" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost/api/platform-admin/partner-entries/entry-2/notification-deliveries/outbox-123/retry",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
