// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { CaseReplyComposer } from "../../apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer";
import type { FleetCaseItem } from "../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server";
import {
  fleetDocumentRequest,
  putFleetDocument,
} from "../../apps/fleet-partner-portal-web/lib/fleet-document-upload";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@drts/ui-web", () => ({
  CanvasCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CanvasField: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CanvasBanner: ({ body }: { body: string }) => <div>{body}</div>,
  CanvasIcon: () => null,
  CanvasBtn: ({
    children,
    onClick,
    label,
  }: {
    children: ReactNode;
    onClick: () => void;
    label?: string;
  }) => (
    <button onClick={onClick}>
      {label}
      {children}
    </button>
  ),
}));
vi.mock("../../apps/fleet-partner-portal-web/lib/fleet-portal-theme", () => ({
  buildFleetTheme: () => ({}),
}));
vi.mock(
  "../../apps/fleet-partner-portal-web/components/fleet-action-button",
  () => ({
    FleetActionButton: ({
      label,
      onClick,
    }: {
      label: string;
      onClick: () => void;
    }) => <button onClick={onClick}>{label}</button>,
  }),
);

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});
const caseDetail = {
  id: "case-1",
  fleetPartnerId: "fleet-1",
  status: "open",
  responsibility: "fleet",
} as FleetCaseItem;
const path =
  "/api/fleet-partner/cases/case-1/attachments/content?objectKey=key-1";
const intent = {
  uploadUrl: path,
  method: "PUT",
  headers: { "content-type": "application/octet-stream" },
};
const record = {
  attachment_id: "att-1",
  case_id: "case-1",
  fleet_partner_id: "fleet-1",
  name: "evidence.pdf",
  size: "8 B",
  file_size: 8,
  content_type: "application/pdf",
  state: "done",
  object_key: "key-1",
};

function apiIntent() {
  return Response.json({
    data: {
      upload_url: path,
      method: "PUT",
      headers: intent.headers,
      attachment_id: "att-1",
      object_key: "key-1",
    },
  });
}

describe("C125 actual portal file interactions", () => {
  it("sends selected File bytes and waits for scan success before confirmation", async () => {
    let completeScan!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(apiIntent())
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            completeScan = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ data: record }));
    vi.stubGlobal("fetch", fetcher);
    render(
      <CaseReplyComposer caseDetail={caseDetail} initialAttachments={[]} />,
    );
    const file = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[1]).toEqual([
      path.replace("/api/", "/control-plane-proxy/"),
      { method: "PUT", headers: intent.headers, body: file },
    ]);
    expect(screen.getByText("上傳中")).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
    completeScan(Response.json({ data: { scan_state: "clean" } }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
      attachmentId: "att-1",
      objectKey: "key-1",
      fileName: "evidence.pdf",
      fileSize: 8,
    });
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed scan out of confirmation and retries the actual selected bytes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(apiIntent())
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "DOCUMENT_SCANNER_UNAVAILABLE",
              message: "scanner unavailable",
            },
          },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ data: { scan_state: "clean" } }))
      .mockResolvedValueOnce(Response.json({ data: record }));
    vi.stubGlobal("fetch", fetcher);
    render(
      <CaseReplyComposer caseDetail={caseDetail} initialAttachments={[]} />,
    );
    const file = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(fetcher.mock.calls[2]).toEqual([
      path.replace("/api/", "/control-plane-proxy/"),
      { method: "PUT", headers: intent.headers, body: file },
    ]);
    expect(JSON.parse(fetcher.mock.calls[3][1].body)).toMatchObject({
      attachmentId: "att-1",
      objectKey: "key-1",
      fileName: "evidence.pdf",
      fileSize: 8,
    });
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the uploaded attachment cannot be confirmed", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(apiIntent())
      .mockResolvedValueOnce(Response.json({ data: { scan_state: "clean" } }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "confirmation unavailable" } },
          { status: 503 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    render(
      <CaseReplyComposer caseDetail={caseDetail} initialAttachments={[]} />,
    );
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: {
        files: [
          new File(["evidence"], "evidence.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shared supply/case PUT helper rejects invalid paths and oversized files before transmission", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      putFleetDocument(
        { ...intent, uploadUrl: "https://uploads.drts.example/file" },
        new File(["x"], "x"),
      ),
    ).rejects.toThrow();
    await expect(
      putFleetDocument(
        intent,
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big"),
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resumes confirmation after PUT succeeded by checking canonical case GET first and reconciling without duplicate PUT or duplicate attachment", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(apiIntent())
      .mockResolvedValueOnce(Response.json({ data: { scan_state: "clean" } }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "confirmation unavailable" } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { case_detail: caseDetail, attachments: [] },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: record }))
      .mockResolvedValueOnce(
        Response.json({
          data: { case_detail: caseDetail, attachments: [] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { case_detail: caseDetail, attachments: [record] },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(
      <CaseReplyComposer caseDetail={caseDetail} initialAttachments={[]} />,
    );
    const file = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();

    // Retry 1: GET sees attachment not yet confirmed, resumes only confirm, but refresh fails.
    refresh.mockImplementationOnce(() => {
      throw new Error("refresh failed");
    });
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(fetcher.mock.calls[3][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    expect(fetcher.mock.calls[4][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1/attachments/confirm",
    );
    expect(screen.queryByText("已上傳")).toBeNull();
    expect(screen.getByText("上傳失敗")).toBeDefined();

    // Retry 2: confirm already succeeded; GET without matching canonical attachment cannot claim success.
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6));
    expect(fetcher.mock.calls[5][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    expect(screen.queryByText("已上傳")).toBeNull();
    expect(screen.getByText("上傳失敗")).toBeDefined();

    // Retry 3: GET returns the canonical confirmed attachment; readback reconciles without re-POSTing confirm.
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(7));
    expect(fetcher.mock.calls[6][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());
    expect(screen.getAllByText("evidence.pdf")).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("preserves HTTP status/code on helper errors, deduplicates in-flight retries, invalidates on new File/clear/closed case, and checks canonical GET on expired intent before explicit rebuild", async () => {
    const secondPath =
      "/api/fleet-partner/cases/case-1/attachments/content?objectKey=key-2";
    const secondRecord = {
      ...record,
      attachment_id: "att-2",
      object_key: "key-2",
    };
    let resolveExpiredPut!: (value: Response) => void;
    let resolveClosedPut!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "DOCUMENT_SCAN_REJECTED",
              message: "malware detected",
            },
          },
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { status: "down", error: "upstream unavailable" },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(apiIntent())
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "DOCUMENT_SCANNER_UNAVAILABLE",
              message: "scanner unavailable",
            },
          },
          { status: 503 },
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveExpiredPut = resolve;
          }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { case_detail: caseDetail, attachments: [] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            upload_url: secondPath,
            method: "PUT",
            headers: intent.headers,
            attachment_id: "att-2",
            object_key: "key-2",
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: { scan_state: "clean" } }))
      .mockResolvedValueOnce(Response.json({ data: secondRecord }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            upload_url:
              "/api/fleet-partner/cases/case-1/attachments/content?objectKey=key-3",
            method: "PUT",
            headers: intent.headers,
            attachment_id: "att-3",
            object_key: "key-3",
          },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveClosedPut = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      putFleetDocument(intent, new File(["bad"], "bad.pdf")),
    ).rejects.toMatchObject({
      message: "malware detected",
      status: 422,
      code: "DOCUMENT_SCAN_REJECTED",
    });
    await expect(
      fleetDocumentRequest("/api/fleet-partner/cases/case-1"),
    ).rejects.toMatchObject({
      message: "upstream unavailable",
      status: 503,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    const { rerender } = render(
      <CaseReplyComposer caseDetail={caseDetail} initialAttachments={[]} />,
    );
    const fileA = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [fileA] },
    });
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());
    expect(fetcher).toHaveBeenCalledTimes(4);

    // Double-click retry while in-flight: only one PUT request is issued.
    const retryButton = screen.getByText("重試");
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(fetcher.mock.calls[4][0]).toBe(
      path.replace("/api/", "/control-plane-proxy/"),
    );

    // Intent expired (409 UPLOAD_URL_INVALID): checks canonical GET first, then surfaces 409 without auto-retry.
    resolveExpiredPut(
      Response.json(
        {
          error: {
            code: "UPLOAD_URL_INVALID",
            message:
              "Upload intent is missing, expired or outside this resource scope.",
          },
        },
        { status: 409 },
      ),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6));
    expect(fetcher.mock.calls[5][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());

    // Explicit new retry after expiry issues a fresh upload-url intent, scans and confirms.
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(9));
    expect(fetcher.mock.calls[6][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1/attachments/upload-url",
    );
    expect(fetcher.mock.calls[7][0]).toBe(
      secondPath.replace("/api/", "/control-plane-proxy/"),
    );
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());

    // New same-name same-size File starts a new intent; closing the case while PUT is in-flight stops before confirm.
    const fileB = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [fileB] },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(11));
    rerender(
      <CaseReplyComposer
        caseDetail={{ ...caseDetail, status: "closed" }}
        initialAttachments={[]}
      />,
    );
    resolveClosedPut(Response.json({ data: { scan_state: "clean" } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).toHaveBeenCalledTimes(11);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
