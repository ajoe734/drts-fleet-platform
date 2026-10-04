// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiClientError } from "@drts/api-client";
import { InvoiceMailPanel } from "../../../apps/tenant-console-web/app/invoices/invoice-mail-panel";

const api = vi.hoisted(() => ({
  listInvoiceMailDeliveries: vi.fn(),
  sendInvoiceMail: vi.fn(),
}));
vi.mock("../../../apps/tenant-console-web/lib/browser-api-client", () => ({
  createBrowserApiClient: () => api,
}));
const receipt = {
  deliveryId: "delivery-1",
  status: "sent",
  queuedAt: "2026-10-04T10:00:00Z",
  sentAt: "2026-10-04T10:00:01Z",
  nextAttemptAt: null,
  attempts: [],
};
beforeEach(() => {
  api.listInvoiceMailDeliveries.mockReset().mockResolvedValue([]);
  api.sendInvoiceMail.mockReset().mockResolvedValue(receipt);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Invoice mail controls (DOM only, no browser server)", () => {
  it("sends only invoice id and operation key; states provider acceptance, not inbox delivery", async () => {
    render(<InvoiceMailPanel invoiceId="invoice-a" locale="zh" />);
    await waitFor(() =>
      expect(api.listInvoiceMailDeliveries).toHaveBeenCalledWith("invoice-a"),
    );
    fireEvent.click(screen.getByRole("button", { name: "寄送帳單通知" }));
    await screen.findByText(/郵件供應商已接受/);
    expect(api.sendInvoiceMail).toHaveBeenCalledTimes(1);
    expect(api.sendInvoiceMail.mock.calls[0]).toEqual([
      "invoice-a",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    expect(screen.getByText(/供應商接受不代表收件匣已收到/)).toBeTruthy();
  });

  it("reuses the same key on an ambiguous network retry and prevents double clicks", async () => {
    api.sendInvoiceMail.mockRejectedValueOnce(new Error("network"));
    render(<InvoiceMailPanel invoiceId="invoice-a" locale="en" />);
    await waitFor(() =>
      expect(api.listInvoiceMailDeliveries).toHaveBeenCalled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send invoice notice" }),
    );
    await screen.findByRole("button", { name: "Retry the same send" });
    const retry = screen.getByRole("button", { name: "Retry the same send" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await screen.findByText(/Accepted by mail provider/);
    expect(api.sendInvoiceMail).toHaveBeenCalledTimes(2);
    expect(api.sendInvoiceMail.mock.calls[1]).toEqual(
      api.sendInvoiceMail.mock.calls[0],
    );
  });

  it("requires confirmation for a deliberate resend and reports scheduled retry", async () => {
    api.listInvoiceMailDeliveries.mockResolvedValue([
      {
        ...receipt,
        status: "failed",
        sentAt: null,
        nextAttemptAt: "2026-10-04T10:01:00Z",
        attempts: [
          { attemptNo: 1, errorCode: "smtp_timeout", retryable: true },
        ],
      },
    ]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<InvoiceMailPanel invoiceId="invoice-a" locale="en" />);
    const button = await screen.findByRole("button", {
      name: "Send another invoice notice",
    });
    expect(screen.getByText(/smtp_timeout/)).toBeTruthy();
    fireEvent.click(button);
    expect(api.sendInvoiceMail).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(api.sendInvoiceMail).toHaveBeenCalledTimes(1));
  });

  it("distinguishes definitive permission rejection from an unknown send", async () => {
    api.sendInvoiceMail.mockRejectedValueOnce(
      new ApiClientError({
        statusCode: 403,
        code: "AUTH_SCOPE_DENIED",
        message: "denied",
        retryable: false,
        rawBody: "do-not-expose",
      }),
    );
    render(<InvoiceMailPanel invoiceId="invoice-a" locale="en" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Send invoice notice" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check billing permission",
    );
    expect(screen.queryByText(/do-not-expose/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Retry the same send" }),
    ).toBeNull();
  });
});
