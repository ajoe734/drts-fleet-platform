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
            retryDisposition: "automatic",
            payload: { partnerNotification: {} },
          },
        ],
        pageInfo: { totalItems: 1 },
      }),
      createPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      updatePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      testPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      enablePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({}),
      retryPartnerNotificationDelivery: vi.fn().mockResolvedValue({}),
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
      name: /重送/i,
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
        statusCode: 409,
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
    await waitFor(() => {
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith("test-entry", expect.objectContaining({
        webhookId: "test-webhook",
        expectedVersion: 1
      }));
    });

    const conflictBanner = await screen.findByText(/綁定已被他人更新/);
    expect(conflictBanner).toBeDefined();

    const reloadBtn = await screen.findByRole("button", {
      name: /partnerNotification.reload/i,
    });
    fireEvent.click(reloadBtn);

    await waitFor(() => {
      // 1 initial fetch + 1 from reload
      expect(
        mockClient.getPartnerEntryNotificationBinding,
      ).toHaveBeenCalledTimes(2);
    });
  });
  it("editable webhook/event selection with expectedVersion payload assertion", async () => {
    render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canWriteWebhooks={true}
        canReadWebhooks={true}
      />,
    );
    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    fireEvent.click(editBtn);

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "test-webhook" } });

    // Click receipt_ready checkbox
    const checkboxes = await screen.findAllByRole("checkbox");
    // Find the one for receipt_ready which is likely the third or fourth, or we can just click the last one
    if (checkboxes.length > 0 && !checkboxes[checkboxes.length - 1].checked) {
      fireEvent.click(checkboxes[checkboxes.length - 1]);
    }

    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    await waitFor(() =>
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith("test-entry", expect.objectContaining({
        webhookId: "test-webhook",
        expectedVersion: 1
      }));
    });
  });

  it("newer-version reload/resubmit preserving draft", async () => {
    // 409 conflict scenario
    mockClient.updatePartnerEntryNotificationBinding.mockRejectedValueOnce(
      Object.assign(new Error("Conflict"), {
        statusCode: 409,
        code: "PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT",
      }),
    );

    render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canReadWebhooks={true}
        canWriteWebhooks={true}
      />,
    );
    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    fireEvent.click(editBtn);

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "test-webhook" } });

    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    fireEvent.click(saveBtn);

    const reloadBtn = await screen.findByRole("button", {
      name: /partnerNotification\.reload/i,
    });
    expect(reloadBtn).toBeDefined();

    // We simulate the reload returning a newer version
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "ready",
      webhookId: "old-webhook",
      eventTypes: ["eta_changed"],
      version: 2,
    });

    // Click reload
    fireEvent.click(reloadBtn);

    // We expect fetchState to have been called again (in addition to initial load)
    await waitFor(() => {
      expect(
        mockClient.getPartnerEntryNotificationBinding,
      ).toHaveBeenCalledTimes(2);
    });
    
    // Draft should be preserved
    const selectAfter = await screen.findByRole("combobox");
    expect((selectAfter as HTMLSelectElement).value).toBe("test-webhook");
    
    // Resubmit
    mockClient.updatePartnerEntryNotificationBinding.mockResolvedValueOnce({});
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith("test-entry", expect.objectContaining({
        webhookId: "test-webhook",
        expectedVersion: 2
      }));
    });
  });

  it("creation/resume/test/enable", async () => {
    // 1. Creation - starts with 404
    mockClient.getPartnerEntryNotificationBinding.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { statusCode: 404 }),
    );
    const { rerender } = render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canReadWebhooks={true}
        canWriteWebhooks={true}
      />,
    );

    const createBtn = await screen.findByRole("button", {
      name: /partnerNotification\.createBinding/i,
    });
    fireEvent.click(createBtn);

    // Select webhook to enable save button
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "test-webhook" } });

    const checkboxes = await screen.findAllByRole("checkbox");
    if (checkboxes.length > 0 && !checkboxes[checkboxes.length - 1].checked) {
      fireEvent.click(checkboxes[checkboxes.length - 1]);
    }

    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    await waitFor(() =>
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalled(),
    );

    // 2. Resume - starts disabled
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "disabled",
      webhookId: "wh_1",
      eventTypes: [],
      version: 1,
      endpointFingerprint: "fp1",
      validatedEndpointFingerprint: "fp1",
      validatedAt: new Date().toISOString(),
    });
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry-2"
        tenantId="test-tenant"
        canWriteBinding={true}
        canReadWebhooks={true}
        canWriteWebhooks={true}
      />,
    );

    const resumeBtn = await screen.findByRole("button", { name: /resume/i });
    fireEvent.click(resumeBtn);
    await waitFor(() =>
      expect(
        mockClient.enablePartnerEntryNotificationBinding,
      ).toHaveBeenCalledTimes(1),
    );
    mockClient.enablePartnerEntryNotificationBinding.mockClear();

    // 3. Test - starts test_pending
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "test_pending",
      webhookId: "wh_1",
      eventTypes: [],
      version: 1,
      endpointFingerprint: "fp1",
      validatedEndpointFingerprint: "fp2",
      validatedAt: new Date().toISOString(),
    });
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry-3"
        tenantId="test-tenant"
        canWriteBinding={true}
      />,
    );

    const testBtn = await screen.findByRole("button", { name: /test/i });
    fireEvent.click(testBtn);
    await waitFor(() =>
      expect(mockClient.testPartnerEntryNotificationBinding).toHaveBeenCalled(),
    );

    // 4. Enable - starts test_pending and passed_current
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "test_pending",
      webhookId: "wh_1",
      eventTypes: [],
      version: 1,
      endpointFingerprint: "fp1",
      validatedEndpointFingerprint: "fp1",
      validatedAt: new Date().toISOString(),
    });
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry-4"
        tenantId="test-tenant"
        canWriteBinding={true}
      />,
    );

    const enableBtn = await screen.findByRole("button", { name: /enable/i });
    fireEvent.click(enableBtn);
    await waitFor(() =>
      expect(
        mockClient.enablePartnerEntryNotificationBinding,
      ).toHaveBeenCalled(),
    );
  });

  it("both management destinations plus authority denial", async () => {
    // 403 error
    mockClient.getPartnerEntryNotificationBinding.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );
    const { rerender } = render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={false}
      />,
    );
    expect(
      await screen.findByText(/partnerNotification\.scopeDeniedTitle/i),
    ).toBeDefined();

    // No permission for binding but YES permission for webhooks
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "ready",
      webhookId: "wh_1",
      eventTypes: [],
      version: 1,
    });
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={false}
        canWriteWebhooks={true}
        canReadWebhooks={true}
      />,
    );

    expect(
      await screen.findByText(/partnerNotification\.permissionDenied/i),
    ).toBeDefined();

    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    expect((editBtn as HTMLButtonElement).disabled).toBe(true);

    // Management links should be available if canWriteWebhooks=true
    const extLinks = await screen.findAllByRole("link");
    expect(extLinks.length).toBeGreaterThan(0);
    const loginHref = extLinks[0].getAttribute("href");
    expect(loginHref).toBe("/_apps/tenant-console/api/auth/tenant/login?tenant_id=test-tenant&redirect_uri=%2Fwebhooks");
  });

  it("pending mutation across entry/client/account/permission/unmount changes", async () => {
    let resolvePromise: any;
    mockClient.getPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { unmount, rerender } = render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        canWriteBinding={true}
      />,
    );

    // change props while pending
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry-new"
        canWriteBinding={false}
      />,
    );
    
    unmount();

    resolvePromise({
      state: "ready",
      webhookId: "wh_1",
      eventTypes: [],
      version: 1,
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockClient.getPartnerEntryNotificationBinding).toHaveBeenCalledTimes(2);
  });
});
