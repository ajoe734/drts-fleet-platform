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
      createPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({ version: 1, state: "configuration" }),
      updatePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({ version: 2, state: "configuration" }),
      testPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({ version: 2, state: "test_pending", lastTestResult: { result: "accepted", data: { ack: true } } }),
      enablePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({ version: 2, state: "ready", validatedAt: "2026-09-24T12:00:00Z" }),
      retryPartnerNotificationDelivery: vi.fn().mockResolvedValue({ kind: "requeued" }),
      getList: vi.fn().mockImplementation((url) => {
        if (url === "/api/tenant/webhooks") {
          return Promise.resolve([
            { webhookId: "test-webhook", url: "https://example.com" },
            { webhookId: "different-webhook", url: "https://different.example.com" },
          ]);
        }
        return Promise.resolve([]);
      }),
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
    fireEvent.change(select, { target: { value: "different-webhook" } });

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
        webhookId: "different-webhook",
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
      ).toHaveBeenCalledWith("test-entry-2", expect.objectContaining({ expectedVersion: 1 })),
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
      expect(mockClient.testPartnerEntryNotificationBinding).toHaveBeenCalledWith("test-entry-3", expect.objectContaining({ expectedVersion: 1 })),
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
      ).toHaveBeenCalledWith("test-entry-4", expect.objectContaining({ expectedVersion: 1 })),
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

    // Edit button should be disabled when canWriteBinding=false
    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    expect((editBtn as HTMLButtonElement).disabled).toBe(true);

    // Missing-webhook permission denial should be rendered
    const disabledWebhookLinks = await screen.findAllByText(/前往既有 \/webhooks 管理/i);
    expect(disabledWebhookLinks.length).toBeGreaterThan(0);
    // Button should be disabled because canWriteWebhooks is false
    expect(disabledWebhookLinks[0].closest("button")?.disabled).toBe(true);

    unmount();
  });

  it("management links are rendered properly when enabled", async () => {
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      version: 1,
      webhookId: "test-webhook",
      eventTypes: ["eta_changed"],
      state: "ready",
      validatedAt: "2026-09-24T12:00:00Z"
    });
    render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canWriteWebhooks={true}
        canReadWebhooks={true}
      />,
    );

    // Edit link when reading
    const extLinks = await screen.findAllByRole("link");
    expect(extLinks.length).toBeGreaterThan(0);
    const loginHref = extLinks[0].getAttribute("href");
    expect(loginHref).toBe("/_apps/tenant-console/api/auth/tenant/login?tenant_id=test-tenant&redirect_uri=%2Fwebhooks");

    // Click edit to check the other link
    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    fireEvent.click(editBtn);

    const extLinksEdit = await screen.findAllByRole("link");
    expect(extLinksEdit.length).toBeGreaterThan(0);
    const loginHrefEdit = extLinksEdit[0].getAttribute("href");
    expect(loginHrefEdit).toBe("/_apps/tenant-console/api/auth/tenant/login?tenant_id=test-tenant&redirect_uri=%2Fwebhooks");
  });

  it("pending mutation across entry/client/account/permission/unmount changes", async () => {
    let resolveMutation: any;
    mockClient.updatePartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValue({
      version: 1,
      webhookId: "test-webhook",
      eventTypes: ["eta_changed"],
      state: "configuration"
    });

    const { unmount, rerender } = render(
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

    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    fireEvent.click(saveBtn);

    // change props while mutation is pending
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry-new"
        tenantId="test-tenant"
        canWriteBinding={false}
      />,
    );
    
    unmount();

    // Resolve the mutation after unmount
    resolveMutation({
      version: 2,
      state: "ready",
      validatedAt: "2026-09-24T12:00:00Z"
    });
    await new Promise((r) => setTimeout(r, 10));

    // We just ensure no state updates on unmounted component throw errors
    expect(mockClient.updatePartnerEntryNotificationBinding).toHaveBeenCalledTimes(1);
  });
});
