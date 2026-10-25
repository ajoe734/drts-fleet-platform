// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

type CaseRecord = {
  id: string;
  status: string;
  responsibility: string;
  actionDescriptor: {
    action: string;
    enabled: boolean;
    disabledReasonCode?: string;
  };
  [key: string]: unknown;
};
function caseRecord(
  id: string,
  status = "reopened",
  responsibility = "fleet",
  enabled = true,
): CaseRecord {
  return {
    id,
    caseNo: `NO-${id}`,
    type: "complaint",
    cat: "driver_conduct",
    desc: "Test case description",
    driver: "Unit driver",
    driverId: "driver-unit",
    severity: "high",
    responsibility,
    fleetPartnerId: "fleet-unit",
    status,
    slaDueAt: "2026-10-14T00:00:00Z",
    slaBreachedAt: null,
    slaBreach: false,
    slaTone: "success",
    slaLabel: "on track",
    reopenCount: 1,
    relatedOrder: null,
    relatedCall: null,
    assignee: "Unit operator",
    openedAt: "2026-10-13T00:00:00Z",
    updatedAt: "2026-10-13T00:00:00Z",
    actionDescriptor: { action: "respond", enabled },
  };
}
function harness(
  records: CaseRecord[],
  failDetail = false,
  supplemental: {
    timeline?: Record<string, unknown>[];
    attachments?: Record<string, unknown>[];
  } = {},
) {
  const appRoot = resolve("apps/fleet-partner-portal-web");
  const refresh = vi.fn();
  const getList = vi.fn(async (path: string) =>
    path.endsWith("/timeline") ? (supplemental.timeline ?? []) : records,
  );
  const get = vi.fn(async (path: string) => {
    if (failDetail) throw new Error("upstream unavailable");
    return {
      caseDetail: records.find((record) => path.endsWith(`/${record.id}`)),
      attachments: supplemental.attachments ?? [],
    };
  });
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "server-only": {},
    "@/app/statements/actions": { submitStatementDecision: vi.fn() },
    "./api-client.server": {
      getServerFleetPartnerClient: async () => ({
        client: { getList, get },
        fleetPartnerId: "fleet-unit",
      }),
    },
    "@/lib/server-locale": { getServerLocale: async () => "en" },
    "next/navigation": {
      useRouter: () => ({ refresh }),
      notFound: () => {
        throw new Error("not_found");
      },
    },
  });
  const data = load<{
    loadCases: () => Promise<{ rows: CaseRecord[]; source: string }>;
  }>(resolve(appRoot, "lib/fleet-portal-data.server.ts"));
  const { CasesTable } = load<{
    CasesTable: React.ComponentType<{ rows: CaseRecord[] }>;
  }>(resolve(appRoot, "components/portal-tables.tsx"));
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children: React.ReactNode;
      defaultLocale: "en";
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));
  const wrap = (element: React.ReactElement) =>
    render(<LanguageProvider defaultLocale="en">{element}</LanguageProvider>);
  const detailPage = load<{
    default: (props: {
      params: Promise<{ caseId: string }>;
    }) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/cases/[caseId]/page.tsx")).default;
  const listPage = load<{
    default: (props: {
      searchParams?: Promise<{ tab: string }>;
    }) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/cases/page.tsx")).default;
  return {
    data,
    CasesTable,
    detailPage,
    listPage,
    wrap,
    get,
    getList,
    refresh,
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fleet cases: actual server mapping to real list/detail/reply actions", () => {
  it("keeps case IDs, terminal statuses and API availability through mapping into the table", async () => {
    const records = [
      caseRecord("case-real-open"),
      caseRecord("case-real-shared", "open", "shared"),
      caseRecord("case-real-resolved", "resolved", "fleet", true),
      caseRecord("case-platform", "open", "platform", false),
      caseRecord("case-closed", "closed", "fleet", true),
      caseRecord("case-resolved", "resolved", "fleet", false),
      caseRecord("case-unavailable", "open", "fleet", false),
    ];
    const { data, CasesTable, wrap, getList } = harness(records);
    const { rows } = await data.loadCases();
    expect(getList).toHaveBeenCalledWith("/api/fleet-partner/cases");
    expect(rows.map((row) => row.status)).toEqual(
      records.map((row) => row.status),
    );
    expect(rows.map((row) => row.actionDescriptor)).toEqual(
      records.map((row) => row.actionDescriptor),
    );
    wrap(<CasesTable rows={rows} />);
    for (const row of rows) {
      const link = screen.getByRole("link", { name: row.id, exact: true });
      expect(link.getAttribute("href")).toBe(
        `/cases/${encodeURIComponent(row.id)}`,
      );
      const renderedRow = within(link.closest("tr")!);
      if (
        ["case-real-open", "case-real-shared", "case-real-resolved"].includes(
          row.id,
        )
      ) {
        expect(
          renderedRow
            .getByRole("link", { name: "Respond", exact: true })
            .getAttribute("href"),
        ).toBe(`/cases/${row.id}#case-reply-content`);
      } else {
        expect(
          renderedRow.queryByRole("link", { name: "Respond", exact: true }),
        ).toBeNull();
        expect(
          renderedRow.getByRole("button", { name: /Respond/ }),
        ).toHaveProperty("disabled", true);
      }
    }
  });

  it("closed tab is driven by actual closed/resolved records and contains no fixed fixture shortcuts", async () => {
    const h = harness([
      caseRecord("case-open"),
      caseRecord("case-closed", "closed"),
      caseRecord("case-resolved", "resolved"),
    ]);
    h.wrap(
      await h.listPage({ searchParams: Promise.resolve({ tab: "closed" }) }),
    );
    expect(
      screen.queryByRole("link", { name: "case-open", exact: true }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "case-closed", exact: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "case-resolved", exact: true }),
    ).toBeTruthy();
    expect(document.querySelector('a[href="/cases/cmp_0908"]')).toBeNull();
    expect(document.querySelector('a[href="/cases/cmp_0912"]')).toBeNull();
    expect(
      document.querySelector('a[href="/cases/cmp_closed_001"]'),
    ).toBeNull();
  });

  it.each(["reopened", "resolved"])(
    "%s detail Respond focuses the existing composer and submits only the loaded real case ID",
    async (status) => {
      const h = harness([caseRecord("case-real-27", status, "fleet", true)]);
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        );
      vi.stubGlobal("fetch", fetch);
      h.wrap(
        await h.detailPage({
          params: Promise.resolve({ caseId: "case-real-27" }),
        }),
      );
      const input = screen.getByRole("textbox", { name: "Reply content" });
      const action = screen.getByRole("link", { name: "Respond", exact: true });
      expect(action.getAttribute("href")).toBe("#case-reply-content");
      fireEvent.click(action);
      expect(document.activeElement).toBe(input);
      expect(fetch).not.toHaveBeenCalled();
      fireEvent.change(input, {
        target: { value: "Actual reply for case 27" },
      });
      fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
      await screen.findByText("回覆已送出 · CASE_REPLY_RECEIVED");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(
        "/control-plane-proxy/fleet-partner/cases/case-real-27/reply",
      );
      expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body)).toMatchObject({
        content: "Actual reply for case 27",
        attachmentIds: [],
      });
      expect(h.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the current page when a reply fails instead of refreshing", async () => {
    const h = harness([caseRecord("case-reply-failed")]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: "Reply service unavailable" } },
            { status: 503 },
          ),
        ),
    );
    h.wrap(
      await h.detailPage({
        params: Promise.resolve({ caseId: "case-reply-failed" }),
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Reply content" }), {
      target: { value: "Keep this reply after the failure" },
    });
    fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
    await screen.findByText("Reply service unavailable");
    expect(h.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Reply content" }),
    ).toHaveProperty("value", "Keep this reply after the failure");
  });

  it.each([
    ["platform", "open", false],
    ["unattributed", "open", true],
    ["unattributed", "open", false],
    ["fleet", "closed", false],
    ["fleet", "closed", true],
    ["fleet", "resolved", false],
    ["fleet", "reopened", false],
  ])(
    "keeps detail read-only for %s/%s/availability=%s",
    async (responsibility, status, enabled) => {
      const h = harness([
        caseRecord(
          "case-read-only",
          String(status),
          String(responsibility),
          enabled === true,
        ),
      ]);
      h.wrap(
        await h.detailPage({
          params: Promise.resolve({ caseId: "case-read-only" }),
        }),
      );
      expect(
        screen.queryByRole("link", { name: "Respond", exact: true }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: /Respond/ })).toHaveProperty(
        "disabled",
        true,
      );
      expect(
        screen.queryByRole("textbox", { name: "Reply content" }),
      ).toBeNull();
    },
  );

  it("shows an unattributed case with its own honest label and read-only reason in the table, never as navigable or platform-owned", async () => {
    const records = [
      caseRecord("case-unattributed", "open", "unattributed", true),
      caseRecord("case-platform-owned", "open", "platform", false),
      caseRecord("case-known-fleet", "open", "fleet", true),
    ];
    const { data, CasesTable, wrap } = harness(records);
    const { rows } = await data.loadCases();
    expect(rows.map((row) => row.responsibility)).toEqual([
      "unattributed",
      "platform",
      "fleet",
    ]);
    wrap(<CasesTable rows={rows} />);
    const rowOf = (id: string) =>
      within(
        screen.getByRole("link", { name: id, exact: true }).closest("tr")!,
      );
    const unattributed = rowOf("case-unattributed");
    expect(unattributed.getByText("Unattributed")).toBeTruthy();
    expect(unattributed.queryByText("Platform")).toBeNull();
    expect(
      unattributed.queryByRole("link", { name: "Respond", exact: true }),
    ).toBeNull();
    expect(
      unattributed.getByRole("button", { name: /Respond/ }),
    ).toHaveProperty("disabled", true);
    expect(
      unattributed.getByText(/case not yet attributed to a fleet/),
    ).toBeTruthy();
    expect(unattributed.queryByText(/platform-owned case/)).toBeNull();
    const platform = rowOf("case-platform-owned");
    expect(platform.getByText("Platform")).toBeTruthy();
    expect(platform.getByText(/platform-owned case/)).toBeTruthy();
    expect(
      rowOf("case-known-fleet")
        .getByRole("link", { name: "Respond", exact: true })
        .getAttribute("href"),
    ).toBe("/cases/case-known-fleet#case-reply-content");
  });

  it("labels an unattributed case detail honestly and keeps its composer read-only even if availability says enabled", async () => {
    const h = harness([
      caseRecord("case-detail-unattributed", "open", "unattributed", true),
    ]);
    h.wrap(
      await h.detailPage({
        params: Promise.resolve({ caseId: "case-detail-unattributed" }),
      }),
    );
    expect(screen.getAllByText(/Unattributed/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/CASE_PLATFORM_OWNED/)).toBeNull();
    expect(
      screen.getAllByText(/case not yet attributed to a fleet/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: "Reply content" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Respond", exact: true }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /送出回覆/ })).toBeNull();
  });

  it("a failed read for a real ID cannot present or submit the unrelated fallback fixture case", async () => {
    const h = harness([caseRecord("case-real-failed")], true);
    h.wrap(
      await h.detailPage({
        params: Promise.resolve({ caseId: "case-real-failed" }),
      }),
    );
    expect(h.get).toHaveBeenCalledWith(
      "/api/fleet-partner/cases/case-real-failed",
    );
    expect(screen.getByText("Unable to load this case")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to cases" }).getAttribute("href"),
    ).toBe("/cases");
    expect(screen.queryByText("cmp_0908")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /送出回覆/ })).toBeNull();
  });

  it.each([
    ["fleet", "open", true],
    ["platform", "closed", false],
  ])(
    "downloads the loaded %s/%s case, timeline and attachment metadata as JSON",
    async (responsibility, status, enabled) => {
      const record = caseRecord(
        "case-export-27",
        String(status),
        String(responsibility),
        enabled === true,
      );
      const timeline = [
        {
          entryId: "entry-27",
          caseId: record.id,
          at: "2026-10-13T01:00:00Z",
          tone: "accent",
          t: "Case received",
          actor: "Unit operator",
          actorRealm: "ops",
          body: "Actual loaded history",
        },
      ];
      const attachments = [
        {
          attachmentId: "attachment-27",
          caseId: record.id,
          fleetPartnerId: "fleet-unit",
          name: "case-evidence.txt",
          size: "12 B",
          fileSize: 12,
          contentType: "text/plain",
          state: "done",
          uploadedAt: "2026-10-13T01:00:00Z",
          uploadedBy: "Unit operator",
          objectKey: "case-export-27/case-evidence.txt",
        },
      ];
      const h = harness([record], false, { timeline, attachments });
      const fetch = vi.fn();
      const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>(
        () => "blob:case-export-27",
      );
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("fetch", fetch);
      vi.stubGlobal(
        "URL",
        class extends URL {
          static createObjectURL = createObjectURL;
          static revokeObjectURL = revokeObjectURL;
        },
      );
      const clicked: { href: string; download: string; connected: boolean }[] =
        [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          clicked.push({
            href: this.href,
            download: this.download,
            connected: this.isConnected,
          });
        },
      );
      h.wrap(
        await h.detailPage({ params: Promise.resolve({ caseId: record.id }) }),
      );
      vi.useFakeTimers();
      fireEvent.click(
        screen.getByRole("button", { name: "Export case (JSON)" }),
      );
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clicked).toEqual([
        {
          href: "blob:case-export-27",
          download: "case-export-27-case.json",
          connected: true,
        },
      ]);
      expect(document.querySelector("a[download]")).toBeNull();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:case-export-27");
      vi.useRealTimers();
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      expect(blob.type).toBe("application/json;charset=utf-8");
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      expect(JSON.parse(content)).toEqual({
        exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        caseDetail: record,
        timeline,
        attachments,
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("shows a download error when the browser cannot create the case file", async () => {
    const h = harness([caseRecord("case-export-failed")]);
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => {
          throw new Error("download unavailable");
        });
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    h.wrap(
      await h.detailPage({
        params: Promise.resolve({ caseId: "case-export-failed" }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Export case (JSON)" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "The case file could not be downloaded. Please try again.",
    );
    expect(click).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
