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
import { putFleetDocument } from "../../apps/fleet-partner-portal-web/lib/fleet-document-upload";

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
    completeScan(Response.json({ data: { scan_state: "clean" } }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
      attachmentId: "att-1",
      objectKey: "key-1",
      fileName: "evidence.pdf",
      fileSize: 8,
    });
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());
  });

  it("keeps a failed scan out of confirmation and retries the actual selected bytes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(apiIntent())
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "scanner unavailable" } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(apiIntent())
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
    fireEvent.click(screen.getByText("重試"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(fetcher.mock.calls[3][1].body).toBe(file);
    await waitFor(() => expect(screen.getByText("已上傳")).toBeDefined());
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
});
