// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, waitFor } from "@testing-library/dom";
import type { ReferralPassengerComplaintRecord } from "@drts/contracts";
import { ReferralComplaintPanel } from "../../../apps/referral-embed-web/components/referral-complaint-panel";

let root: Root | undefined;
afterEach(() => {
  if (root) flushSync(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it.each([
  ["under_investigation", "處理中"],
  ["in_progress", "處理中"],
  ["closed", "已結案"],
  ["future_unknown_status", "future_unknown_status"],
] as const)(
  "same-order list/detail GET renders %s as %s without a new complaint",
  async (status, expectedLabel) => {
    const original: ReferralPassengerComplaintRecord = {
      orderId: "synthetic-owned-order",
      caseNo: "PAX-synthetic-original-service",
      category: "service",
      content: "原合成服務申訴，沿原案查閱處理進度",
      lostItemDescription: null,
      contactRequested: false,
      idempotencyKey: "synthetic-original-manual-key",
      submittedAt: "2026-10-29T01:00:00.000Z",
      status,
      updatedAt: "2026-10-29T02:00:00.000Z",
      slaDueAt: "2026-11-01T01:00:00.000Z",
    };
    const endpoint = `/api/referral/complaints/${original.orderId}`;
    // Only the existing read I/O is doubled. The real mounted panel, state,
    // list/detail selection, actual translations and timestamp formatter run.
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      if (url === endpoint)
        return Response.json({
          ok: true,
          data: { orderId: original.orderId, items: [original] },
        });
      expect(url).toBe(`${endpoint}/${original.caseNo}`);
      return Response.json({ ok: true, data: original });
    });
    vi.stubGlobal("fetch", fetch);
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() =>
      root!.render(
        <ReferralComplaintPanel
          orderId={original.orderId}
          recoveryScope="synthetic-original-scope"
          accent="#123456"
        />,
      ),
    );
    flushSync(() =>
      fireEvent.click(getByRole(host, "button", { name: "行程申訴與遺失物" })),
    );
    await waitFor(() =>
      expect(
        getByRole(host, "button", { name: `查看案件 ${original.caseNo}` }),
      ).toBeTruthy(),
    );
    flushSync(() =>
      fireEvent.click(
        getByRole(host, "button", { name: `查看案件 ${original.caseNo}` }),
      ),
    );
    await waitFor(() => {
      const article = getByRole(host, "article", { name: "申訴案件詳情" });
      expect(article.textContent).toContain(`狀態：${expectedLabel}`);
      expect(article.textContent).toContain(original.caseNo);
      expect(article.textContent).toContain(original.content);
      expect(article.textContent).toContain("已記錄不需客服聯絡");
      expect(article.textContent).toContain(
        "案件更新：2026-10-29 10:00（臺北時間）",
      );
      if (status !== "closed")
        expect(article.textContent).not.toContain("狀態：已結案");
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      endpoint,
      `${endpoint}/${original.caseNo}`,
    ]);
    expect(sessionStorage.length).toBe(0);
  },
);
