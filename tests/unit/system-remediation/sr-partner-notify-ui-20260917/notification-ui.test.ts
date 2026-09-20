import { describe, it, expect, vi, afterEach } from "vitest";
import { createPlatformAdminClient } from "../../../../packages/api-client/src/index";

describe("SR-PARTNER-NOTIFY-UI-20260917 Component & API cases", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("api client expectedVersion signature matches 409 requirements", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          error: "version_conflict",
          message: "Version mismatch",
        }),
    });
    global.fetch = fetchMock;

    const client = createPlatformAdminClient("http://localhost", "admin-1");
    const payload = {
      webhookId: "w",
      expectedVersion: 2,
      eventTypes: ["eta_changed"] as any,
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
});
