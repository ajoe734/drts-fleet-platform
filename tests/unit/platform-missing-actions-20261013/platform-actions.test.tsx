// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "../../../packages/api-client/src/index";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const auditRows = [
  {
    auditId: "audit-visible",
    moduleName: "billing",
    actionName: 'issue,"invoice"\r\n再開立',
    resourceType: "tenant_invoice",
    resourceId: "invoice-1",
    actorId: null,
    actorType: "platform_admin",
    requestId: "request-visible",
    createdAt: "2026-10-13T08:00:00Z",
  },
  {
    auditId: "audit-other-module",
    moduleName: "callcenter",
    actionName: "linked.call",
    resourceType: "tenant_invoice",
    resourceId: "invoice-1",
    actorId: "agent-1",
    actorType: "ops_user",
    requestId: "request-other-module",
    createdAt: "2026-10-13T08:00:00Z",
  },
  {
    auditId: "audit-other-invoice",
    moduleName: "billing",
    actionName: "issue.invoice",
    resourceType: "tenant_invoice",
    resourceId: "invoice-2",
    actorId: "agent-2",
    actorType: "platform_admin",
    requestId: "request-other-invoice",
    createdAt: "2026-10-13T08:00:00Z",
  },
];
const supplyRows = [
  {
    submissionId: "submission-vehicle",
    submissionType: "vehicle_onboarding",
    status: "submitted",
    fleetPartnerName: "Test Fleet",
    fleetPartnerId: "fleet-1",
    subject: "Vehicle application",
    revisionNo: 1,
    submittedAt: "2026-10-13T08:00:00Z",
    businessArea: "taipei",
    supportedServiceProductCodes: ["airport"],
    missingItemsCount: 0,
  },
  {
    submissionId: "submission-driver",
    submissionType: "driver_onboarding",
    status: "submitted",
    fleetPartnerName: "Test Fleet",
    fleetPartnerId: "fleet-1",
    subject: "Driver application",
    revisionNo: 1,
    submittedAt: "2026-10-13T08:00:00Z",
    businessArea: "taipei",
    supportedServiceProductCodes: ["airport"],
    missingItemsCount: 0,
  },
];

function harness(
  options: {
    query?: string;
    empty?: boolean;
    fail?: boolean;
    locale?: "en" | "zh";
  } = {},
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    let data: unknown;
    if (path === "/api/audit") {
      if (options.fail)
        return new Response("temporarily unavailable", { status: 503 });
      data = { items: options.empty ? [] : auditRows };
    } else if (path === "/api/audit/evidence-policies") data = { policies: [] };
    else if (
      path === "/api/audit/legal-holds" ||
      path === "/api/audit/deletion-exceptions"
    )
      data = { items: [] };
    else if (path === "/api/admin/supply-review/submissions")
      data = { items: supplyRows };
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const searchParams = new URLSearchParams(options.query);
  const appRoot = resolve("apps/platform-admin-web");
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@drts/api-client": apiClient,
    "./runtime-config": {
      getRuntimeApiBaseUrl: () => "http://platform-api.unit.test",
    },
    "next/navigation": {
      useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
      useSearchParams: () => searchParams,
    },
    "next/link": ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a {...props}>{children}</a>
    ),
  });
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      defaultLocale: "en" | "zh";
      children: React.ReactNode;
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));
  const Audit = load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/audit/page.tsx"),
  ).default;
  const Supply = load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/supply-review/page.tsx"),
  ).default;
  const show = (Page: React.ComponentType) =>
    render(
      <LanguageProvider defaultLocale={options.locale ?? "en"}>
        <Page />
      </LanguageProvider>,
    );
  return { Audit, Supply, show, fetchMock };
}

function browserDownloads() {
  const blobs: Blob[] = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return "blob:unit-audit-download";
  });
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  const downloads: Array<{ href: string; name: string }> = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function () {
      downloads.push({ href: this.href, name: this.download });
    },
  );
  return { blobs, downloads, createObjectURL, revokeObjectURL };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolveText, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolveText(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("platform missing actions", () => {
  it("downloads the currently visible resource and module selection with CSV quoting and clears the browser handle", async () => {
    const browser = browserDownloads();
    const { Audit, show, fetchMock } = harness({
      query: "resourceType=tenant_invoice&resourceId=invoice-1",
    });
    show(Audit);
    const exportButton = screen.getByRole("button", {
      name: "Export CSV",
    }) as HTMLButtonElement;
    const billingFilter = await screen.findByRole("button", {
      name: /Billing.*1/i,
    });
    fireEvent.click(billingFilter);
    fireEvent.click(exportButton);
    expect(browser.downloads).toEqual([
      {
        href: "blob:unit-audit-download",
        name: expect.stringMatching(/^audit-\d{4}-\d{2}-\d{2}\.csv$/),
      },
    ]);
    expect(browser.blobs[0].type).toBe("text/csv;charset=utf-8");
    const csv = await readBlob(browser.blobs[0]);
    expect(csv).toContain('"audit-visible"');
    expect(csv).toContain('"issue,""invoice""\r\n再開立"');
    expect(csv).toContain('"platform_admin","","billing"');
    expect(csv).not.toContain("audit-other-module");
    expect(csv).not.toContain("audit-other-invoice");
    expect(screen.getByRole("status").textContent).toContain("1 record");
    await waitFor(() =>
      expect(browser.revokeObjectURL).toHaveBeenCalledWith(
        "blob:unit-audit-download",
      ),
    );
    expect(document.querySelector("a[download]")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole("button", { name: "Retention policies" }));
    expect(exportButton.disabled).toBe(true);
  });

  it.each([
    { empty: true },
    { query: "resourceType=tenant_invoice" },
    { fail: true },
  ])(
    "does not download unavailable or non-visible data: %j",
    async (options) => {
      const browser = browserDownloads();
      const { Audit, show } = harness(options);
      show(Audit);
      await waitFor(() =>
        expect(screen.queryByText("Loading audit log…")).toBeNull(),
      );
      const button = screen.getByRole("button", {
        name: "Export CSV",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(browser.downloads).toEqual([]);
    },
  );

  it("shows a download failure and lets the same loaded records be retried", async () => {
    const browser = browserDownloads();
    browser.createObjectURL.mockImplementationOnce(() => {
      throw new Error("download unavailable");
    });
    const { Audit, show } = harness({ locale: "zh" });
    show(Audit);
    const button = screen.getByRole("button", {
      name: "匯出 CSV",
    }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(screen.getByRole("alert").textContent).toContain("CSV 下載失敗");
    fireEvent.click(button);
    expect(browser.downloads).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("3");
    await waitFor(() =>
      expect(browser.revokeObjectURL).toHaveBeenCalledTimes(1),
    );
  });

  it("collapses and restores all seven filters without clearing their values or filtered rows", async () => {
    const { Supply, show, fetchMock } = harness();
    show(Supply);
    await screen.findByText("Vehicle application");
    expect(screen.getByText("Driver application")).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    const type = screen
      .getByRole("option", { name: "Vehicle" })
      .closest("select")!;
    fireEvent.change(type, { target: { value: "vehicle" } });
    expect(screen.queryByText("Driver application")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Hide Filters|More Filters/ }),
    );
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getByText("Vehicle application")).toBeTruthy();
    expect(screen.queryByText("Driver application")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More Filters" }));
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    expect(
      (screen.getByRole("combobox", { name: "Type: All" }) as HTMLSelectElement)
        .value,
    ).toBe("vehicle");
    fireEvent.change(type, { target: { value: "all" } });
    expect(screen.getByText("Driver application")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
