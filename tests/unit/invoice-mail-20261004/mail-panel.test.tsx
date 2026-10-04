// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantInvoiceMailView } from "@drts/contracts";
import { InvoiceMailPanel } from "../../../apps/tenant-console-web/app/invoices/mail-panel";
import {
  readInvoiceMail,
  sendInvoiceMail,
} from "../../../apps/tenant-console-web/app/invoices/mail-actions";

vi.mock("../../../apps/tenant-console-web/app/invoices/mail-actions", () => ({
  readInvoiceMail: vi.fn(),
  sendInvoiceMail: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
const view: TenantInvoiceMailView = {
  invoiceId: "invoice-1",
  canSend: true,
  deliveryId: null,
  status: "not_requested",
  queuedAt: null,
  sentAt: null,
  nextAttemptAt: null,
  attempts: [],
  deliveries: [],
};

describe("invoice mail controls", () => {
  it("fences double clicks, reuses an ambiguous request key and confirms a new copy", async () => {
    vi.mocked(readInvoiceMail).mockResolvedValue({ ok: true, view });
    let resolveSend!: (value: { ok: false }) => void;
    vi.mocked(sendInvoiceMail).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    const accepted = { ...view, status: "sent" as const, deliveryId: "sent-1" };
    vi.mocked(sendInvoiceMail).mockResolvedValue({ ok: true, view: accepted });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<InvoiceMailPanel invoiceId="invoice-1" locale="en" />);
    await screen.findByText("Not requested");
    const send = screen.getByRole("button", { name: "Send invoice email" });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(sendInvoiceMail).toHaveBeenCalledTimes(1);
    resolveSend({ ok: false });
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry pending delivery" }),
    );
    await screen.findByText(
      "Accepted by mail provider; mailbox receipt is not confirmed",
    );
    expect(vi.mocked(sendInvoiceMail).mock.calls[1]).toEqual(
      vi.mocked(sendInvoiceMail).mock.calls[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Send another copy" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(sendInvoiceMail).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Send another copy" }));
    await waitFor(() => expect(sendInvoiceMail).toHaveBeenCalledTimes(3));
    expect(vi.mocked(sendInvoiceMail).mock.calls[2]![1]).not.toBe(
      vi.mocked(sendInvoiceMail).mock.calls[0]![1],
    );
  });

  it("shows previous failures after an intentional resend without exposing mail payloads", async () => {
    vi.mocked(readInvoiceMail).mockResolvedValue({
      ok: true,
      view: {
        ...view,
        status: "sent",
        deliveries: [
          {
            ...view,
            deliveryId: "failed-first",
            status: "failed",
            attempts: [
              {
                attemptNo: 1,
                startedAt: "2026-10-04T10:00:00Z",
                finishedAt: "2026-10-04T10:00:01Z",
                outcome: "failed",
                errorCode: "recipient_rejected",
                retryable: false,
                acceptedAt: null,
              },
            ],
          },
        ],
      },
    });
    render(<InvoiceMailPanel invoiceId="invoice-1" locale="en" />);
    await screen.findByText(/recipient_rejected/);
    expect(screen.getByText("Recent delivery history")).toBeTruthy();
  });
  it("submits the selected invoice without arbitrary recipient and shows provider acceptance", async () => {
    vi.mocked(readInvoiceMail).mockResolvedValue({ ok: true, view });
    vi.mocked(sendInvoiceMail).mockResolvedValue({
      ok: true,
      view: {
        ...view,
        status: "sent",
        deliveryId: "delivery-1",
        sentAt: "2026-10-04T10:00:00Z",
      },
    });
    render(<InvoiceMailPanel invoiceId="invoice-1" locale="en" />);
    await screen.findByText("Not requested");
    fireEvent.click(screen.getByRole("button", { name: "Send invoice email" }));
    await screen.findByText(
      "Accepted by mail provider; mailbox receipt is not confirmed",
    );
    expect(sendInvoiceMail).toHaveBeenCalledExactlyOnceWith(
      "invoice-1",
      expect.any(String),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Send another copy",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("keeps read-only users from sending, and refreshes actual failure history", async () => {
    vi.mocked(readInvoiceMail)
      .mockResolvedValueOnce({ ok: true, view: { ...view, canSend: false } })
      .mockResolvedValueOnce({
        ok: true,
        view: {
          ...view,
          canSend: false,
          status: "failed",
          nextAttemptAt: "2026-10-04T10:00:01Z",
          attempts: [
            {
              attemptNo: 1,
              startedAt: "2026-10-04T10:00:00Z",
              finishedAt: "2026-10-04T10:00:00Z",
              outcome: "failed",
              errorCode: "provider_unavailable",
              retryable: true,
              acceptedAt: null,
            },
          ],
        },
      });
    render(<InvoiceMailPanel invoiceId="invoice-1" locale="zh" />);
    await screen.findByText("尚未要求寄送");
    expect(
      (
        screen.getByRole("button", {
          name: "寄送帳單信件",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "更新寄送狀態" }));
    await screen.findByText("寄送嘗試失敗");
    expect(screen.getByText(/provider_unavailable/)).toBeTruthy();
    expect(sendInvoiceMail).not.toHaveBeenCalled();
  });
  it("shows an error instead of inventing a sent receipt", async () => {
    vi.mocked(readInvoiceMail).mockResolvedValue({ ok: true, view });
    vi.mocked(sendInvoiceMail).mockResolvedValue({ ok: false });
    render(<InvoiceMailPanel invoiceId="invoice-1" locale="en" />);
    await screen.findByText("Not requested");
    fireEvent.click(screen.getByRole("button", { name: "Send invoice email" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toBe("Not requested");
  });
  it("ignores a stale read when switching to another invoice", async () => {
    let resolveFirst!: (result: {
      ok: true;
      view: TenantInvoiceMailView;
    }) => void;
    vi.mocked(readInvoiceMail)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        view: { ...view, invoiceId: "invoice-2" },
      });
    const { rerender } = render(
      <InvoiceMailPanel invoiceId="invoice-1" locale="en" />,
    );
    rerender(<InvoiceMailPanel invoiceId="invoice-2" locale="en" />);
    await screen.findByText("Not requested");
    resolveFirst({ ok: true, view: { ...view, status: "sent" } });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Not requested"),
    );
  });
});
