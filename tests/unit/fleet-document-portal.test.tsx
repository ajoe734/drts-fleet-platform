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

    // Intent expired (409 UPLOAD_URL_INVALID): when canonical GET fails with 503 first, retains session and surfaces 503;
    // next retry checks canonical GET first (without new upload-url or PUT), then surfaces 409 once GET confirms absence.
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

  it("retains staged session when canonical GET fails during invalid-intent reconciliation and resets target-owned state on same-instance case switch", async () => {
    let resolveCase1InFlightPut!: (value: Response) => void;
    const case2Detail = {
      id: "case-2",
      fleetPartnerId: "fleet-1",
      status: "open",
      responsibility: "fleet",
    } as FleetCaseItem;
    const case2InitialAttachment = {
      attachmentId: "att-case2-init",
      caseId: "case-2",
      fleetPartnerId: "fleet-1",
      name: "case2-existing.pdf",
      size: "12 B",
      fileSize: 12,
      contentType: "application/pdf",
      state: "done" as const,
      uploadedAt: "2026-10-21T00:00:00.000Z",
      uploadedBy: "actor-1",
      objectKey: "key-case2-init",
    };

    const fetcher = vi
      .fn()
      // 1. Initial upload-url for file1 on case-1
      .mockResolvedValueOnce(apiIntent())
      // 2. First PUT returns 409 UPLOAD_URL_INVALID
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "UPLOAD_URL_INVALID",
              message: "Upload intent is missing or expired.",
            },
          },
          { status: 409 },
        ),
      )
      // 3. Canonical GET during 409 handling fails with 503 -> must retain session & surface 503
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "READBACK_DOWN", message: "canonical GET 503" } },
          { status: 503 },
        ),
      )
      // 4. Retry 1: reconciles canonical GET first (without new upload-url or PUT) and finds committed record
      .mockResolvedValueOnce(
        Response.json({
          data: { case_detail: caseDetail, attachments: [record] },
        }),
      )
      // 5. Confirm invalid-intent path: upload-url + PUT clean + confirm 409 UPLOAD_URL_INVALID + canonical GET 503 -> retry reconciles via canonical GET
      .mockResolvedValueOnce(
        Response.json({
          data: {
            upload_url:
              "/api/fleet-partner/cases/case-1/attachments/content?objectKey=key-confirm-409",
            method: "PUT",
            headers: intent.headers,
            attachment_id: "att-confirm-409",
            object_key: "key-confirm-409",
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: { scan_state: "clean" } }))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "UPLOAD_URL_INVALID",
              message: "Upload intent already consumed or expired on confirm.",
            },
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "READBACK_DOWN_ON_CONFIRM",
              message: "canonical GET 503 after confirm 409",
            },
          },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            case_detail: caseDetail,
            attachments: [
              record,
              {
                ...record,
                attachment_id: "att-confirm-409",
                object_key: "key-confirm-409",
                name: "confirm-409-recovered.pdf",
              },
            ],
          },
        }),
      )
      // 6. Third file on case-1 starts upload-url + deferred PUT before rerendering to case-2
      .mockResolvedValueOnce(
        Response.json({
          data: {
            upload_url:
              "/api/fleet-partner/cases/case-1/attachments/content?objectKey=key-case1-inflight",
            method: "PUT",
            headers: intent.headers,
            attachment_id: "att-case1-inflight",
            object_key: "key-case1-inflight",
          },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveCase1InFlightPut = resolve;
          }),
      )
      // 7. Submitting reply on case-2 must only include case-2's attachmentIds
      .mockResolvedValueOnce(Response.json({ data: { ok: true } }));

    vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(
      <CaseReplyComposer caseDetail={caseDetail} initialAttachments={[]} />,
    );

    const file1 = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [file1] },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[2][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());

    // Retry reconciles original intent via canonical GET first without creating a new upload-url intent.
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(fetcher.mock.calls[3][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());
    expect(screen.getByText("evidence.pdf")).toBeDefined();

    // Confirm invalid-intent path: PUT succeeds, confirm returns 409 UPLOAD_URL_INVALID, canonical GET fails with 503.
    const fileConfirm409 = new File(
      ["confirm409"],
      "confirm-409-recovered.pdf",
      {
        type: "application/pdf",
      },
    );
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [fileConfirm409] },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(8));
    expect(fetcher.mock.calls[6][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1/attachments/confirm",
    );
    expect(fetcher.mock.calls[7][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    await waitFor(() => expect(screen.getByText("上傳失敗")).toBeDefined());

    // Retry after confirm 409 + GET 503: calls canonical GET first (no new upload-url, PUT, or confirm) and reconciles.
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(9));
    expect(fetcher.mock.calls[8][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-1",
    );
    await waitFor(() =>
      expect(screen.getByText("confirm-409-recovered.pdf")).toBeDefined(),
    );
    expect(screen.getAllByText("已上傳")).toHaveLength(2);

    // Start another attachment upload on case-1 and hold its PUT in-flight.
    const file2 = new File(["inflight"], "case1-inflight.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("檔名"), {
      target: { files: [file2] },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(11));
    expect(screen.getByText("case1-inflight.pdf")).toBeDefined();

    // Rerender the SAME CaseReplyComposer instance to case-2 with case-2's initialAttachments.
    rerender(
      <CaseReplyComposer
        caseDetail={case2Detail}
        initialAttachments={[case2InitialAttachment]}
      />,
    );
    expect(screen.queryByText("evidence.pdf")).toBeNull();
    expect(screen.queryByText("confirm-409-recovered.pdf")).toBeNull();
    expect(screen.queryByText("case1-inflight.pdf")).toBeNull();
    expect(screen.getByText("case2-existing.pdf")).toBeDefined();

    // Release case-1's held PUT: must not confirm or write into case-2 state.
    resolveCase1InFlightPut(Response.json({ data: { scan_state: "clean" } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).toHaveBeenCalledTimes(11);
    expect(screen.queryByText("case1-inflight.pdf")).toBeNull();

    // Submitting a reply on case-2 sends only case-2's attachment IDs, never case-1's old completed IDs.
    fireEvent.change(screen.getByLabelText("回覆內容"), {
      target: { value: "Case 2 reply body" },
    });
    fireEvent.click(screen.getByText("送出回覆"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(12));
    expect(fetcher.mock.calls[11][0]).toBe(
      "/control-plane-proxy/fleet-partner/cases/case-2/reply",
    );
    expect(JSON.parse(fetcher.mock.calls[11][1].body)).toMatchObject({
      content: "Case 2 reply body",
      attachmentIds: ["att-case2-init"],
    });
  });
});
