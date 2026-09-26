// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PartnerNotificationPanel } from "../../../../apps/platform-admin-web/components/partner-notification-panel";
import { usePlatformAdminClient } from "@/lib/admin-client";

// Mock dependencies
vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("PartnerNotificationPanel", () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        state: "ready",
        webhookId: "test-webhook",
        eventTypes: ["eta_changed"],
        version: 1,
      }),
      listPartnerNotificationDeliveries: vi.fn().mockResolvedValue({
        items: [
          {
            outboxId: "outbox-1",
            status: "failed",
            eventType: "eta_changed",
            attemptCount: 1,
            createdAt: new Date().toISOString(),
            nextAttemptAt: new Date().toISOString(),
            assignmentVersion: 1,
            payload: { partnerNotification: { retryDisposition: "automatic" } },
          },
        ],
        pageInfo: { totalItems: 1 },
      }),
      createPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      updatePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      testPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      getList: vi.fn().mockImplementation((url) => {
        if (url === "/api/tenant/webhooks") {
          return Promise.resolve([
            { webhookId: "test-webhook", url: "https://example.com" },
          ]);
        }
        return Promise.resolve([]);
      }),
      retryPartnerNotificationDelivery: vi
        .fn()
        .mockResolvedValue({ kind: "requeued" }),
    };
    (usePlatformAdminClient as any).mockReturnValue(mockClient);
  });

  it("renders PartnerNotificationPanel and exercises interactions", async () => {
    const { unmount } = render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canReadWebhooks={true}
        canWriteWebhooks={true}
      />,
    );

    // Wait for the binding loading to finish by waiting for the edit button
    await screen.findByRole("button", { name: /partnerNotification\.edit/i });

    // Verify management link
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const webhookLink = links.find((l) => {
        const href = (l as HTMLAnchorElement).getAttribute("href");
        return href && href.includes("webhooks");
      });
      expect(webhookLink).toBeDefined();
    });

    // Verify retry interaction
    const retryBtn = await screen.findByRole("button", {
      name: /partnerNotification.retryDelivery/i,
    });
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(mockClient.retryPartnerNotificationDelivery).toHaveBeenCalledWith(
        "test-entry",
        "outbox-1",
      );
    });

    // Unmount check
    unmount();
  });

  it("exercises 409 recovery on update", async () => {
    mockClient.updatePartnerEntryNotificationBinding.mockRejectedValueOnce(
      Object.assign(new Error("Conflict"), {
        kind: "409",
        code: "PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT",
      }),
    );
    mockClient.updatePartnerEntryNotificationBinding.mockResolvedValueOnce({});

    render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canReadWebhooks={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("partnerNotification.binding.title"),
      ).toBeDefined();
    });

    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    fireEvent.click(editBtn);

    // After clicking edit, wait for save button to appear
    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    // Also we need to make sure the save button is not disabled
    await waitFor(() => {
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(saveBtn);

    // The component should catch 409 and potentially reload or retry
    // In our test, just ensuring the 409 branch doesn't crash the UI and the mock was called
    await waitFor(() => {
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalled();
    });
  });
});
