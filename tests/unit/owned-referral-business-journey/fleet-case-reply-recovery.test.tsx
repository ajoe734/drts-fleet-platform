// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import * as primitives from "../../../packages/ui-web/src/canvas-primitives";
import { buildCanvasTheme } from "../../../packages/ui-web/src/canvas-tokens";
const canvas = {
  buildCanvasTheme,
  CanvasCard: primitives.Card,
  CanvasBanner: primitives.Banner,
  CanvasField: primitives.Field,
  CanvasBtn: primitives.Btn,
  CanvasIcon: primitives.CanvasIcon,
};
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

type CaseItem = {
  id: string;
  fleetPartnerId: string;
  status: string;
  [key: string]: unknown;
};
type ReplyCommand = {
  content: string;
  idempotencyKey: string;
  attachmentIds: string[];
};
type Service = {
  getCaseDetail(
    fleet: string,
    caseId: string,
  ): Promise<{ caseDetail: CaseItem }>;
  submitReply(
    fleet: string,
    caseId: string,
    actor: string,
    command: ReplyCommand,
  ): Promise<unknown>;
};
function actualService() {
  const notes: string[] = [];
  const load = createUiModuleLoader(resolve("apps/api"), {
    "./fleet-document-storage.service": {
      FleetDocumentStorageService: class {},
      MAX_FLEET_DOCUMENT_BYTES: 25 * 1024 * 1024,
    },
  });
  const { FleetPartnerCaseService } = load<{
    FleetPartnerCaseService: new (...args: unknown[]) => Service;
  }>(
    resolve("apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts"),
  );
  const complaintIO = {
    refreshSettlementCases: async () => {},
    addComplaintCaseNote: async (
      _caseNo: string,
      command: { note: string },
    ) => {
      notes.push(command.note);
    },
    awaitSettlementPersistence: async () => {},
    getComplaintTimeline: () =>
      notes.map((note, index) => ({ entryId: `actual-note-${index}`, note })),
  };
  const storageIO = { getCaseRecords: async () => [] };
  return {
    service: new FleetPartnerCaseService(
      complaintIO,
      undefined,
      undefined,
      storageIO,
    ),
    notes,
  };
}
function mount(caseDetail: CaseItem, initialAttachments: unknown[] = []) {
  const refresh = vi.fn();
  const load = createUiModuleLoader(resolve("apps/fleet-partner-portal-web"), {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "next/navigation": { useRouter: () => ({ refresh }) },
  });
  const { CaseReplyComposer } = load<{
    CaseReplyComposer: React.ComponentType<{
      caseDetail: CaseItem;
      initialAttachments: unknown[];
    }>;
  }>(
    resolve(
      "apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx",
    ),
  );
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children: React.ReactNode;
      defaultLocale: "en";
    }>;
  }>(resolve("apps/fleet-partner-portal-web/lib/i18n.tsx"));
  const view = render(
    <LanguageProvider defaultLocale="en">
      <CaseReplyComposer
        caseDetail={caseDetail}
        initialAttachments={initialAttachments}
      />
    </LanguageProvider>,
  );
  return {
    refresh,
    rerenderCase: (nextCase: CaseItem) =>
      view.rerender(
        <LanguageProvider defaultLocale="en">
          <CaseReplyComposer caseDetail={nextCase} initialAttachments={[]} />
        </LanguageProvider>,
      ),
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("C067 actual immutable reply recovery and closed display", () => {
  it("a committed reply followed by a lost ACK retries the identical operation and leaves one canonical note", async () => {
    const { service, notes } = actualService();
    const { caseDetail } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_0908",
    );
    const bodies: ReplyCommand[] = [];
    const requests = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as ReplyCommand;
      bodies.push(body);
      const reply = await service.submitReply(
        "METRO_FLEET",
        caseDetail.id,
        "original-fleet-actor",
        body,
      );
      if (bodies.length === 1)
        throw new TypeError("ACK lost after committed reply");
      return Response.json({ data: reply });
    });
    vi.stubGlobal("fetch", requests);
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const h = mount(caseDetail);
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Same-case real reply content" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("ACK lost after committed reply");
    expect(h.refresh).not.toHaveBeenCalled();
    expect(notes).toHaveLength(1);
    now = 2000;
    fireEvent.click(screen.getByRole("button", { name: "重試送出" }));
    await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
    expect(requests).toHaveBeenCalledTimes(2);
    expect.soft(bodies[1]).toEqual(bodies[0]);
    expect.soft(notes).toHaveLength(1);
  });
  it("an existing closed case does not invent a training/attachment reply as though it had been submitted", async () => {
    const { service } = actualService();
    const { caseDetail } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_closed_001",
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    mount(caseDetail);
    expect(screen.queryByRole("textbox", { name: "Reply content" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。",
      ),
    ).toBeNull();
  });

  it("retries the frozen original body and attachments after the editable draft and confirmed attachment list change", async () => {
    const { service } = actualService();
    const { caseDetail } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_0908",
    );
    const attachment = (id: string) => ({
      attachmentId: id,
      caseId: caseDetail.id,
      fleetPartnerId: "METRO_FLEET",
      name: `${id}.txt`,
      size: "3 B",
      fileSize: 3,
      contentType: "text/plain",
      state: "done",
      uploadedAt: "2026-10-29T00:00:00Z",
      uploadedBy: "unit-actor",
      objectKey: `${caseDetail.id}/${id}.txt`,
    });
    const bodies: ReplyCommand[] = [];
    const requests = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/reply")) {
        const body = JSON.parse(String(init.body)) as ReplyCommand;
        bodies.push(body);
        expect(new Headers(init.headers).get("idempotency-key")).toBe(
          body.idempotencyKey,
        );
        if (bodies.length === 1)
          throw new TypeError("original reply ACK unknown");
        return Response.json({
          data: { ...body, caseId: caseDetail.id, replyId: "unit-reply" },
        });
      }
      if (url.endsWith("/attachments/upload-url"))
        return Response.json({
          data: {
            attachmentId: "unit-B",
            objectKey: `${caseDetail.id}/unit-B.txt`,
            method: "PUT",
            headers: {},
            uploadUrl: `/api/fleet-partner/cases/${caseDetail.id}/attachments/content?objectKey=unit-B`,
          },
        });
      if (url.includes("/attachments/content?"))
        return Response.json({ data: { uploaded: true } });
      if (url.endsWith("/attachments/confirm"))
        return Response.json({ data: attachment("unit-B") });
      throw new Error(`Unexpected I/O: ${url}`);
    });
    vi.stubGlobal("fetch", requests);
    mount(caseDetail, [attachment("unit-A")]);
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Original operation body" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("original reply ACK unknown");
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Edited draft is not the pending operation" },
    });
    fireEvent.change(screen.getByLabelText("File name"), {
      target: {
        files: [new File(["abc"], "unit-B.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("unit-B.txt");
    // The normal upload path must finish its real confirm handler before retry.
    await vi.waitFor(() => expect(screen.queryByText("上傳中")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "重試送出" }));
    await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.attachmentIds).toEqual(["unit-A"]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(screen.getByText("Original operation body")).toBeTruthy();
    expect(
      screen.queryByText("Edited draft is not the pending operation"),
    ).toBeNull();
  });
  it("a successful receipt releases the old intent so a legal additional reply receives a fresh key", async () => {
    const { service, notes } = actualService();
    const { caseDetail } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_0908",
    );
    const bodies: ReplyCommand[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as ReplyCommand;
        bodies.push(body);
        return Response.json({
          data: await service.submitReply(
            "METRO_FLEET",
            caseDetail.id,
            "original-fleet-actor",
            body,
          ),
        });
      }),
    );
    vi.spyOn(Date, "now").mockReturnValue(1000);
    mount(caseDetail);
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "First acknowledged reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
    fireEvent.click(screen.getByRole("button", { name: "Respond" }));
    expect(
      screen.getByRole("textbox", { name: "Reply content" }),
    ).toHaveProperty("value", "");
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Second legal additional reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.idempotencyKey).not.toBe(bodies[0]?.idempotencyKey);
    expect(bodies[1]?.content).toBe("Second legal additional reply");
    expect(notes).toHaveLength(2);
  });
  it("changing case clears the old pending intent and a late old ACK cannot replace the new case's reply", async () => {
    const { service } = actualService();
    const { caseDetail } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_0908",
    );
    let finishOld: (response: Response) => void = () => {
      throw new Error("Old request was not started");
    };
    const bodies: ReplyCommand[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as ReplyCommand);
        if (bodies.length === 1)
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        return Response.json({ data: { replyId: "new-case-reply" } });
      }),
    );
    const h = mount(caseDetail);
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Old-case pending body" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    h.rerenderCase({
      ...caseDetail,
      id: "unit-other-case",
      caseNo: "unit-other-case",
    });
    expect(
      screen.getByRole("textbox", { name: "Reply content" }),
    ).toHaveProperty("value", "");
    await act(async () => {
      finishOld(Response.json({ data: { replyId: "late-old-reply" } }));
    });
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: /送出回覆/ })).toHaveProperty(
        "disabled",
        true,
      ),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "New-case distinct reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.content).toBe("New-case distinct reply");
    expect(bodies[1]?.idempotencyKey).toContain("unit-other-case");
    expect(screen.queryByText("Old-case pending body")).toBeNull();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it("keeps an acknowledged reply successful when refreshing its readback throws", async () => {
    const { service, notes } = actualService();
    const { caseDetail } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_0908",
    );
    const requests = vi.fn(async (_url: string, init: RequestInit) =>
      Response.json({
        data: await service.submitReply(
          "METRO_FLEET",
          caseDetail.id,
          "original-fleet-actor",
          JSON.parse(String(init.body)) as ReplyCommand,
        ),
      }),
    );
    vi.stubGlobal("fetch", requests);
    const h = mount(caseDetail);
    h.refresh.mockImplementation(() => {
      throw new Error("readback refresh unavailable after ACK");
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Already acknowledged reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
    expect(screen.queryByRole("button", { name: "重試送出" })).toBeNull();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(notes).toHaveLength(1);
  });
  it("the actual service already deduplicates an unchanged explicit operation key", async () => {
    const { service, notes } = actualService();
    const command = {
      content: "Preserve the existing backend deduplication",
      idempotencyKey: "same-original-key",
      attachmentIds: [],
    };
    const first = await service.submitReply(
      "METRO_FLEET",
      "cmp_0908",
      "original-fleet-actor",
      command,
    );
    const second = await service.submitReply(
      "METRO_FLEET",
      "cmp_0908",
      "original-fleet-actor",
      command,
    );
    expect(second).toEqual({ ...(first as object), deduplicated: true });
    expect(notes).toHaveLength(1);
  });
});
