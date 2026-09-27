import { cleanup } from "@testing-library/react";
import { act } from "@testing-library/react";
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
            retryDisposition: "configuration_blocked",
            payload: { partnerNotification: {} },
          },
        ],
        pageInfo: { totalItems: 1 },
      }),
      createPartnerEntryNotificationBinding: vi
        .fn()
        .mockResolvedValue({ version: 1, state: "disabled" }),
      updatePartnerEntryNotificationBinding: vi
        .fn()
        .mockResolvedValue({ version: 2, state: "disabled" }),
      testPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        kind: "accepted",
        ack: {
          notificationId: "n-1",
          deliveryId: "d-1",
          partnerEntrySlug: "test",
          status: "accepted",
          receiptId: "ack-1",
        },
      }),
      enablePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        version: 2,
        state: "ready",
        validatedAt: "2026-09-24T12:00:00Z",
      }),
      retryPartnerNotificationDelivery: vi
        .fn()
        .mockResolvedValue({ kind: "requeued" }),
      getList: vi.fn().mockImplementation((url) => {
        if (url === "/api/tenant/webhooks") {
          return Promise.resolve([
            { webhookId: "test-webhook", url: "https://example.com" },
            {
              webhookId: "different-webhook",
              url: "https://different.example.com",
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };
    (usePlatformAdminClient as any).mockReturnValue(mockClient);
  });

  it("renders PartnerNotificationPanel and exercises interactions", async () => {
    render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
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
    cleanup();
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
      ).toHaveBeenCalledWith(
        "test-entry",
        expect.objectContaining({
          webhookId: "test-webhook",
          expectedVersion: 1,
        }),
      );
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

    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[4]);

    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    await waitFor(() =>
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith(
        "test-entry",
        expect.objectContaining({
          webhookId: "different-webhook",
          eventTypes: ["eta_changed", "receipt_ready"],
          expectedVersion: 1,
        }),
      );
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

    const selectAfter = await screen.findByRole("combobox");
    expect((selectAfter as HTMLSelectElement).value).toBe("test-webhook");

    const receiptReadyCheckbox = await screen.findByLabelText(/receipt_ready/i); // Matches "receipt_ready" or "收據就緒" depending on DOM, usually the checkbox label text contains the translation.
    fireEvent.click(receiptReadyCheckbox);

    // Resubmit
    mockClient.updatePartnerEntryNotificationBinding.mockResolvedValueOnce({});
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith(
        "test-entry",
        expect.objectContaining({
          webhookId: "test-webhook",
          expectedVersion: 2,
          eventTypes: ["eta_changed", "receipt_ready"],
        }),
      );
    });
  });

  it("creation/resume/test/enable and typed failure paths", async () => {
    // 1. Creation - starts with 404
    mockClient.getPartnerEntryNotificationBinding.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { statusCode: 404 }),
    );
    const { rerender } = render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
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

    // Ensure eta_changed is selected
    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    await waitFor(() =>
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(
        mockClient.updatePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith(
        "test-entry",
        expect.objectContaining({
          webhookId: "test-webhook",
          eventTypes: ["eta_changed"],
          expectedVersion: 0,
        }),
      ),
    );

    // 2. Resume - test a stale validation sequencing
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "disabled", // but with fingerprint mismatch => stale
      webhookId: "wh_1",
      eventTypes: ["eta_changed"],
      version: 1,
      endpointFingerprint: "fp1",
      validatedEndpointFingerprint: "fp-old", // stale test
      validatedAt: new Date().toISOString(),
    });
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry-2"
        tenantId="test-tenant"
        canWriteBinding={true}
        canWriteBinding={true}
        canReadWebhooks={true}
        canWriteWebhooks={true}
      />,
    );

    mockClient.testPartnerEntryNotificationBinding.mockResolvedValueOnce({
      kind: "accepted",
      ack: {
        notificationId: "n-1",
        deliveryId: "d-1",
        partnerEntrySlug: "test-entry",
        status: "accepted",
        receiptId: "ack-1",
      },
    });
    // It should demand a re-test, not just enable. We must click Resume!
    const staleTestBtn = await screen.findByRole("button", { name: /恢復/i });
    fireEvent.click(staleTestBtn);
    await waitFor(() =>
      expect(
        mockClient.testPartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith("test-entry-2"),
    );
    expect(
      mockClient.enablePartnerEntryNotificationBinding,
    ).toHaveBeenCalledWith("test-entry-2", 1);

    // 3. Test failed path with contract-valid error code
    mockClient.enablePartnerEntryNotificationBinding.mockClear();
    mockClient.testPartnerEntryNotificationBinding.mockResolvedValueOnce({
      kind: "failed",
      failure: {
        failureReason: "provider_transient_error",
        retryDisposition: "automatic",
        suggestedNextAttemptAt: new Date().toISOString(),
        detail: "Transient failure testing",
      },
    });

    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "test_pending",
      webhookId: "wh_1",
      eventTypes: ["eta_changed"],
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
        canReadWebhooks={true}
      />,
    );

    const testBtn = await screen.findByRole("button", {
      name: /發送測試事件/i,
    });
    fireEvent.click(testBtn);

    // Assert invocation and visible failure
    await waitFor(() =>
      expect(mockClient.testPartnerEntryNotificationBinding).toHaveBeenCalledWith("test-entry-3")
    );
    expect(mockClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();

    // Assert visible failure
    await waitFor(() => {
      expect(screen.queryByText(/Transient failure testing/)).not.toBeNull();
    });

    // 4. Test rejected path (actual Promise rejection, not just a failed result)
    mockClient.testPartnerEntryNotificationBinding.mockRejectedValueOnce(
      new Error("Network Error"),
    );
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(mockClient.testPartnerEntryNotificationBinding).toHaveBeenCalledTimes(3);
    });
    expect(mockClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();

    // Assert visible failure for rejection
    await waitFor(() => {
      expect(screen.queryByText(/Network Error/)).not.toBeNull();
    });

    // 5. Enable - starts test_pending and passed_current
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      state: "test_pending",
      webhookId: "wh_1",
      eventTypes: ["eta_changed"],
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
        canWriteBinding={true}
      />,
    );

    const enableBtn = await screen.findByRole("button", { name: /enable/i });
    fireEvent.click(enableBtn);
    await waitFor(() =>
      expect(
        mockClient.enablePartnerEntryNotificationBinding,
      ).toHaveBeenCalledWith("test-entry-4", 1),
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
        canWriteBinding={true}
        canWriteBinding={false}
      />,
    );
    expect(
      await screen.findByText(/partnerNotification\.scopeDeniedTitle/i),
    ).toBeDefined();

    // No permission for binding and NO permission for webhooks
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
        canWriteBinding={true}
        canWriteBinding={false}
        canWriteWebhooks={false}
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
    const disabledWebhookLinks = await screen.findAllByText(
      /partnerNotification\.webhookHelp/i,
    );
    expect(disabledWebhookLinks.length).toBeGreaterThan(0);
    // Button should be disabled because canWriteWebhooks is false
    expect(disabledWebhookLinks[0].closest("button")?.disabled).toBe(true);

    cleanup();
  });

  it("management links are rendered properly when enabled", async () => {
    mockClient.getPartnerEntryNotificationBinding.mockResolvedValueOnce({
      version: 1,
      webhookId: "test-webhook",
      eventTypes: ["eta_changed"],
      state: "ready",
      validatedAt: "2026-09-24T12:00:00Z",
    });
    render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canWriteBinding={true}
        canWriteWebhooks={true}
        canReadWebhooks={true}
      />,
    );

    // Edit link when reading
    const extLinks = await screen.findAllByRole("link");
    expect(extLinks.length).toBeGreaterThan(0);
    const loginHref = extLinks[0].getAttribute("href");
    expect(loginHref).toBe(
      "/_apps/tenant-console/api/auth/tenant/login?tenant_id=test-tenant&redirect_uri=%2Fwebhooks",
    );

    // Click edit to check the other link
    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    fireEvent.click(editBtn);

    const extLinksEdit = await screen.findAllByRole("link");
    expect(extLinksEdit.length).toBeGreaterThan(0);
    const loginHrefEdit = extLinksEdit[0].getAttribute("href");
    expect(loginHrefEdit).toBe(
      "/_apps/tenant-console/api/auth/tenant/login?tenant_id=test-tenant&redirect_uri=%2Fwebhooks",
    );
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
      webhookId: "old-webhook",
      eventTypes: ["eta_changed"],
      state: "disabled",
    });

    const { rerender } = render(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={true}
        canReadWebhooks={true}
      />,
    );

    const editBtn = await screen.findByRole("button", {
      name: /partnerNotification\.edit/i,
    });
    fireEvent.click(editBtn);

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "different-webhook" } });

    const saveBtn = await screen.findByRole("button", { name: /儲存/i });
    await waitFor(() =>
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveBtn);

    // now we have a pending mutation.

    // 1. Change ONLY authority while mounted
    mockClient.getPartnerEntryNotificationBinding.mockClear();
    rerender(
      <PartnerNotificationPanel
        entrySlug="test-entry"
        tenantId="test-tenant"
        canWriteBinding={false} // ONLY authority changes
        canReadWebhooks={true}
      />,
    );

    await act(async () => {
      resolveMutation({
        version: 2,
        state: "disabled",
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Old mutation resolution should not trigger reload or GET because authority changed
    expect(
      mockClient.getPartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();

    // 2. Setup another pending mutation (Test) to test client/account transition
    let resolveTest2: any;
    mockClient.testPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveTest2 = resolve;
      }),
    );

    // Give authority back to click Test
    await act(async () => {
      rerender(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    // Exit edit mode if stuck
    const cancelBtn = screen.queryByRole("button", { name: /取消|partnerNotification\.cancel/i });
    if (cancelBtn) {
      fireEvent.click(cancelBtn);
    }

    const testBtn2 = await screen.findByRole("button", {
      name: /發送測試事件/i,
    });
    fireEvent.click(testBtn2);

    // Simulate account/client transition by changing the mocked client returned
    const newMockClient = {
      ...mockClient,
      getPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        version: 1,
        webhookId: "new-webhook",
        eventTypes: ["eta_changed"],
        state: "disabled",
      }),
      testPartnerEntryNotificationBinding: vi.fn(),
      enablePartnerEntryNotificationBinding: vi.fn(),
      updatePartnerEntryNotificationBinding: vi.fn(),
      listPartnerNotificationDeliveries: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
    };
    (usePlatformAdminClient as any).mockReturnValue(newMockClient);

    // Change ONLY client (keep entrySlug, tenantId, canWriteBinding the same)
    await act(async () => {
      rerender(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    // new client should have exactly ONE GET for the initial load of test-entry
    expect(
      newMockClient.getPartnerEntryNotificationBinding,
    ).toHaveBeenCalledTimes(1);
    expect(
      newMockClient.getPartnerEntryNotificationBinding,
    ).toHaveBeenCalledWith("test-entry");

    // Delivery GET should also be called
    expect(
      newMockClient.listPartnerNotificationDeliveries,
    ).toHaveBeenCalledTimes(1);

    newMockClient.getPartnerEntryNotificationBinding.mockClear();
    newMockClient.listPartnerNotificationDeliveries.mockClear();
    newMockClient.enablePartnerEntryNotificationBinding.mockClear();
    mockClient.enablePartnerEntryNotificationBinding.mockClear();

    // Settle the old pending test mutation
    await act(async () => {
      resolveTest2({
        kind: "accepted",
        ack: {
          notificationId: "n-2",
          deliveryId: "d-2",
          partnerEntrySlug: "test-entry",
          status: "accepted",
          receiptId: "ack-2",
        },
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // ensure no follow-on state update/GET call on the new client, or enable call on either client
    expect(
      newMockClient.enablePartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();
    expect(
      newMockClient.getPartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();
    expect(
      mockClient.enablePartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();
    expect(
      mockClient.getPartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();

    // 3. Setup a pending Resume mutation, client change and settle with rejection
    let resolveResume: any;
    newMockClient.testPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveResume = resolve;
      }),
    );

    const resumeBtn = await screen.findByRole("button", {
      name: /恢復/i,
    });
    fireEvent.click(resumeBtn);

    // Simulate ANOTHER account/client transition before Resume test completes
    const newerMockClient = {
      ...newMockClient,
      getPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        version: 1,
        webhookId: "new-webhook",
        eventTypes: ["eta_changed"],
        state: "disabled",
      }),
      testPartnerEntryNotificationBinding: vi.fn(),
      enablePartnerEntryNotificationBinding: vi.fn(),
      listPartnerNotificationDeliveries: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
    };
    (usePlatformAdminClient as any).mockReturnValue(newerMockClient);

    await act(async () => {
      rerender(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    newerMockClient.getPartnerEntryNotificationBinding.mockClear();
    newerMockClient.listPartnerNotificationDeliveries.mockClear();

    await act(async () => {
      // test with rejection using valid typed failure
      resolveResume({
        kind: "failed",
        failure: {
          failureReason: "endpoint_unavailable",
          detail: "Cannot reach partner",
          retryDisposition: "configuration_blocked",
          suggestedNextAttemptAt: new Date(Date.now() + 60000).toISOString()
        }
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Should not call enable on ANY client
    expect(
      newerMockClient.enablePartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();
    expect(
      newMockClient.enablePartnerEntryNotificationBinding,
    ).not.toHaveBeenCalled();

    // ensure GETs are not called due to the stale failure
    expect(newerMockClient.getPartnerEntryNotificationBinding).not.toHaveBeenCalled();
    expect(newerMockClient.listPartnerNotificationDeliveries).not.toHaveBeenCalled();

    // ensure no error message is displayed on new client because it's a stale failure
    expect(screen.queryByText(/Cannot reach partner/)).toBeNull();

    // 4. Genuine pending Resume across client transition with accepted result
    let resolveResumeAccept: any;
    newerMockClient.testPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveResumeAccept = resolve;
      }),
    );

    const resumeBtn2 = await screen.findByRole("button", {
      name: /恢復/i,
    });
    fireEvent.click(resumeBtn2);

    const evenNewerMockClient = {
      ...newerMockClient,
      getPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        version: 1,
        webhookId: "even-newer-webhook",
        eventTypes: ["eta_changed"],
        state: "disabled",
      }),
      testPartnerEntryNotificationBinding: vi.fn(),
      enablePartnerEntryNotificationBinding: vi.fn(),
      listPartnerNotificationDeliveries: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
    };
    (usePlatformAdminClient as any).mockReturnValue(evenNewerMockClient);

    await act(async () => {
      rerender(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    evenNewerMockClient.getPartnerEntryNotificationBinding.mockClear();
    evenNewerMockClient.listPartnerNotificationDeliveries.mockClear();

    await act(async () => {
      resolveResumeAccept({
        kind: "accepted",
        ack: {
          notificationId: "n-3",
          deliveryId: "d-3",
          partnerEntrySlug: "test-entry",
          status: "accepted",
          receiptId: "ack-3",
        },
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(evenNewerMockClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();
    expect(newerMockClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();

    // 5. Current-validation direct Resume (successful)
    const validClient = {
      ...evenNewerMockClient,
      getPartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        version: 1,
        webhookId: "even-newer-webhook",
        eventTypes: ["eta_changed"],
        state: "disabled",
        validatedAt: new Date().toISOString(),
        validatedEndpointFingerprint: "fingerprint-123",
        endpointFingerprint: "fingerprint-123",
      }),
      testPartnerEntryNotificationBinding: vi.fn(),
      enablePartnerEntryNotificationBinding: vi.fn().mockResolvedValue({
        version: 2,
        webhookId: "even-newer-webhook",
        eventTypes: ["eta_changed"],
        state: "ready",
      }),
    };
    (usePlatformAdminClient as any).mockReturnValue(validClient);

    await act(async () => {
      rerender(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    const resumeBtn3 = await screen.findByRole("button", {
      name: /恢復/i,
    });

    await act(async () => {
      fireEvent.click(resumeBtn3);
      await new Promise((r) => setTimeout(r, 10));
    });

    // Zero test calls, directly enable
    expect(validClient.testPartnerEntryNotificationBinding).not.toHaveBeenCalled();
    expect(validClient.enablePartnerEntryNotificationBinding).toHaveBeenCalledTimes(1);

    // 6. Genuine pending Resume across authority-only transition
    cleanup();

    validClient.getPartnerEntryNotificationBinding.mockClear();
    validClient.listPartnerNotificationDeliveries.mockClear();
    validClient.testPartnerEntryNotificationBinding.mockClear();
    validClient.enablePartnerEntryNotificationBinding.mockClear();

    let resolveResumeAuth: any;
    validClient.testPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveResumeAuth = resolve;
      }),
    );

    // Make it stale to force a test
    validClient.getPartnerEntryNotificationBinding.mockResolvedValue({
        version: 2,
        webhookId: "even-newer-webhook",
        eventTypes: ["eta_changed"],
        state: "disabled",
        // no validatedAt -> stale
    });

    let renderAuth: any;
    await act(async () => {
      renderAuth = render(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    const getCountsBefore = validClient.getPartnerEntryNotificationBinding.mock.calls.length;

    const resumeBtnAuth = await screen.findByRole("button", {
      name: /恢復/i,
    });
    fireEvent.click(resumeBtnAuth);

    // Assert test invocation before authority-only change
    expect(validClient.testPartnerEntryNotificationBinding).toHaveBeenCalledTimes(1);

    // Authority transition (mounted)
    await act(async () => {
      renderAuth.rerender(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={false}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      resolveResumeAuth({
        kind: "accepted",
        ack: {
          notificationId: "n-auth",
          deliveryId: "d-auth",
          partnerEntrySlug: "test-entry",
          status: "accepted",
          receiptId: "ack-auth",
        },
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(validClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();
    expect(validClient.getPartnerEntryNotificationBinding).toHaveBeenCalledTimes(getCountsBefore);

    // 7. Actual pending Resume -> unmount -> settlement
    renderAuth.unmount();

    validClient.testPartnerEntryNotificationBinding.mockClear();
    validClient.enablePartnerEntryNotificationBinding.mockClear();
    validClient.getPartnerEntryNotificationBinding.mockClear();

    let resolveResumeUnmount: any;
    validClient.testPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveResumeUnmount = resolve;
      }),
    );

    let renderUnmount: any;
    await act(async () => {
      renderUnmount = render(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    const resumeBtnUnmount = await screen.findByRole("button", {
      name: /恢復/i,
    });
    fireEvent.click(resumeBtnUnmount);

    expect(validClient.testPartnerEntryNotificationBinding).toHaveBeenCalledTimes(1);

    // Unmount before settlement
    renderUnmount.unmount();

    await act(async () => {
      resolveResumeUnmount({
        kind: "accepted",
        ack: {
          notificationId: "n-unmount",
          deliveryId: "d-unmount",
          partnerEntrySlug: "test-entry",
          status: "accepted",
          receiptId: "ack-unmount",
        },
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Assert no stale enable
    expect(validClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();

    // 8. Genuine pending Resume across entry-only transition
    validClient.testPartnerEntryNotificationBinding.mockClear();
    validClient.enablePartnerEntryNotificationBinding.mockClear();
    validClient.getPartnerEntryNotificationBinding.mockClear();
    validClient.listPartnerNotificationDeliveries.mockClear();

    let resolveResumeEntry: any;
    validClient.testPartnerEntryNotificationBinding.mockReturnValue(
      new Promise((resolve) => {
        resolveResumeEntry = resolve;
      }),
    );

    let renderEntry: any;
    await act(async () => {
      renderEntry = render(
        <PartnerNotificationPanel
          entrySlug="test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    const resumeBtnEntry = await screen.findByRole("button", {
      name: /恢復/i,
    });
    fireEvent.click(resumeBtnEntry);

    expect(validClient.testPartnerEntryNotificationBinding).toHaveBeenCalledTimes(1);

    // Entry transition (mounted) changing ONLY entrySlug
    const getCountsBeforeEntry = validClient.getPartnerEntryNotificationBinding.mock.calls.length;
    const listCountsBeforeEntry = validClient.listPartnerNotificationDeliveries.mock.calls.length;

    validClient.listPartnerNotificationDeliveries.mockResolvedValueOnce({
      items: [{ outboxId: "new-entry-delivery-123", status: "failed", eventType: "eta_changed" }],
      total: 1,
    });

    await act(async () => {
      renderEntry.rerender(
        <PartnerNotificationPanel
          entrySlug="new-test-entry"
          tenantId="test-tenant"
          canWriteBinding={true}
          canReadWebhooks={true}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    // Assert exact initial binding AND delivery GET counts/arguments for the new entry
    expect(validClient.getPartnerEntryNotificationBinding).toHaveBeenCalledTimes(getCountsBeforeEntry + 1);
    expect(validClient.getPartnerEntryNotificationBinding).toHaveBeenLastCalledWith("new-test-entry");
    expect(validClient.listPartnerNotificationDeliveries).toHaveBeenCalledTimes(listCountsBeforeEntry + 1);
    expect(validClient.listPartnerNotificationDeliveries).toHaveBeenLastCalledWith("new-test-entry", { page: 1, pageSize: 50 });

    const getCountsAfterEntryTransition = validClient.getPartnerEntryNotificationBinding.mock.calls.length;
    const listCountsAfterEntryTransition = validClient.listPartnerNotificationDeliveries.mock.calls.length;

    // Settle old request
    await act(async () => {
      resolveResumeEntry({
        kind: "accepted",
        ack: {
          notificationId: "n-entry",
          deliveryId: "d-entry",
          partnerEntrySlug: "test-entry",
          status: "accepted",
          receiptId: "ack-entry",
        },
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Assert no extra GETs or enable after old settlement
    expect(validClient.enablePartnerEntryNotificationBinding).not.toHaveBeenCalled();
    expect(validClient.getPartnerEntryNotificationBinding).toHaveBeenCalledTimes(getCountsAfterEntryTransition);
    expect(validClient.listPartnerNotificationDeliveries).toHaveBeenCalledTimes(listCountsAfterEntryTransition);

    // Visible current-entry data 
    expect(await screen.findByText("new-entry-delivery-123")).toBeDefined();
  });
});
