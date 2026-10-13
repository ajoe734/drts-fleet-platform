// @vitest-environment jsdom
import * as React from "react";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src/index";
import type { TenantBillingProfile } from "@drts/contracts";
import BillingPage from "../../../apps/tenant-console-web/app/billing/page";
import { BillingProfileForm } from "../../../apps/tenant-console-web/app/billing/billing-profile-form";
import { saveBillingProfile } from "../../../apps/tenant-console-web/app/billing/actions";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  request: vi.fn(),
  revalidate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("../../../apps/tenant-console-web/lib/api-client", () => ({
  getTenantClient: mocks.client,
}));
vi.mock("../../../apps/tenant-console-web/lib/server-locale", () => ({
  getServerLocale: async () => "en",
}));

const profile: TenantBillingProfile = {
  tenantId: "tenant-billing-unit",
  invoiceTitle: "Example Transit",
  taxId: "12345678",
  address: "Demo Street 1",
  contactName: "Example Contact",
  email: "billing@example.test",
  updatedAt: "2026-10-13T00:00:00Z",
};
const savedProfile: TenantBillingProfile = {
  ...profile,
  invoiceTitle: "Updated Transit",
  email: "updated@example.test",
  updatedAt: "2026-10-13T01:00:00Z",
};
const descriptor = {
  action: "edit_billing_profile",
  enabled: true,
  riskLevel: "medium" as const,
};

function response(value: unknown) {
  return new Response(
    JSON.stringify({ data: value, meta: { requestId: "billing-test" } }),
    { status: 200 },
  );
}
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}
function readResponse(url: string) {
  if (url.endsWith("/api/tenant/billing/profile")) return response(profile);
  if (url.includes("quota")) return response(null);
  return response([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue(
    new ApiClient({
      baseUrl: "https://api.example.test",
      defaultHeaders: {
        Authorization: "Bearer unit-session",
        "X-Tenant-Id": profile.tenantId,
      },
    }),
  );
  mocks.request.mockImplementation(async (url: string, init: RequestInit) =>
    init.method === "POST" ? response(savedProfile) : readResponse(url),
  );
  vi.stubGlobal("fetch", mocks.request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tenant billing profile action through the actual API client", () => {
  it("submits all profile fields and revalidates both consumers", async () => {
    const result = await saveBillingProfile(
      form({
        invoiceTitle: " Updated Transit ",
        email: " updated@example.test ",
        taxId: "87654321",
        address: "Demo Avenue 2",
        contactName: "Updated Contact",
      }),
    );
    expect(result).toEqual({
      ok: true,
      profile: savedProfile,
      message: "Billing profile saved.",
    });
    const [url, init] = mocks.request.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/tenant/billing/profile");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer unit-session",
      "X-Tenant-Id": profile.tenantId,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      invoiceTitle: "Updated Transit",
      email: "updated@example.test",
      taxId: "87654321",
      address: "Demo Avenue 2",
      contactName: "Updated Contact",
    });
    expect(mocks.revalidate.mock.calls).toEqual([["/billing"], ["/settings"]]);
  });

  it("sends explicit empty optional fields so users can remove old values", async () => {
    await saveBillingProfile(
      form({
        invoiceTitle: "Updated Transit",
        email: "updated@example.test",
        taxId: "",
        address: "",
        contactName: "",
      }),
    );
    expect(JSON.parse(String(mocks.request.mock.calls[0]![1].body))).toEqual({
      invoiceTitle: "Updated Transit",
      email: "updated@example.test",
      taxId: "",
      address: "",
      contactName: "",
    });
  });

  it("keeps required input and existing API authorization errors actionable", async () => {
    expect(
      (
        await saveBillingProfile(
          form({ invoiceTitle: " ", email: "updated@example.test" }),
        )
      ).ok,
    ).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "Billing write permission required",
          },
        }),
        { status: 403 },
      ),
    );
    const result = await saveBillingProfile(
      form({ invoiceTitle: "Updated Transit", email: "updated@example.test" }),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("Billing write permission required"),
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("tenant billing profile form", () => {
  it.each([undefined, "not_provisioned"])(
    "offers refresh instead of an empty replacement form after a failed profile read (emptyReason=%s)",
    async (emptyReason) => {
      let profileUnavailable = true;
      mocks.request.mockImplementation(
        async (url: string, init: RequestInit) => {
          if (init.method === "POST") return response(savedProfile);
          if (
            url.endsWith("/api/tenant/billing/profile") &&
            profileUnavailable
          ) {
            return new Response(
              JSON.stringify({
                error: {
                  code: "UNAVAILABLE",
                  message: "Temporarily unavailable",
                },
              }),
              { status: 503 },
            );
          }
          return readResponse(url);
        },
      );

      const view = render(
        await BillingPage({ searchParams: Promise.resolve({ emptyReason }) }),
      );
      expect(
        screen.getByText("Unable to load tenant billing profile."),
      ).toBeTruthy();
      expect(
        screen.queryByRole("form", { name: "Edit billing profile" }),
      ).toBeNull();
      expect(screen.queryByLabelText("Invoice title *")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Save billing profile" }),
      ).toBeNull();
      expect(
        screen
          .getAllByRole("button", { name: "Edit billing profile" })
          .every((button) => (button as HTMLButtonElement).disabled),
      ).toBe(true);
      expect(
        screen.getByRole("link", { name: "Refresh" }).getAttribute("href"),
      ).toBe("/billing");
      expect(
        mocks.request.mock.calls.filter(([, init]) => init.method === "POST"),
      ).toHaveLength(0);

      // The existing Refresh link reloads this server page. Re-run its actual
      // reads after recovery and keep the real form/action/API client chain.
      profileUnavailable = false;
      view.rerender(await BillingPage({}));
      expect((screen.getByLabelText("Tax id") as HTMLInputElement).value).toBe(
        profile.taxId,
      );
      expect(
        (screen.getByLabelText("Billing contact") as HTMLInputElement).value,
      ).toBe(profile.contactName);
      expect(
        (screen.getByLabelText("Billing address") as HTMLInputElement).value,
      ).toBe(profile.address);
      fireEvent.change(screen.getByLabelText("Invoice title *"), {
        target: { value: "Updated Transit" },
      });
      fireEvent.change(screen.getByLabelText("Billing email *"), {
        target: { value: "updated@example.test" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Save billing profile" }),
      );
      await screen.findByText("Billing profile saved.");
      const writes = mocks.request.mock.calls.filter(
        ([, init]) => init.method === "POST",
      );
      expect(writes).toHaveLength(1);
      expect(JSON.parse(String(writes[0]![1].body))).toEqual({
        invoiceTitle: "Updated Transit",
        email: "updated@example.test",
        taxId: profile.taxId,
        address: profile.address,
        contactName: profile.contactName,
      });
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );

  it("loads the actual billing page, retains edits through API failure, and refreshes after retry", async () => {
    render(await BillingPage({}));
    expect(
      screen
        .getByRole("link", { name: "Edit billing profile" })
        .getAttribute("href"),
    ).toBe("#billing-profile-editor");
    expect(
      (screen.getByLabelText("Invoice title *") as HTMLInputElement).value,
    ).toBe(profile.invoiceTitle);
    expect((screen.getByLabelText("Tax id") as HTMLInputElement).value).toBe(
      profile.taxId,
    );
    expect(
      (screen.getByLabelText("Billing contact") as HTMLInputElement).value,
    ).toBe(profile.contactName);
    expect(
      (screen.getByLabelText("Billing email *") as HTMLInputElement).value,
    ).toBe(profile.email);
    expect(
      (screen.getByLabelText("Billing address") as HTMLInputElement).value,
    ).toBe(profile.address);
    fireEvent.change(screen.getByLabelText("Invoice title *"), {
      target: { value: "Updated Transit" },
    });
    fireEvent.change(screen.getByLabelText("Billing email *"), {
      target: { value: "updated@example.test" },
    });
    let finish!: (value: Response) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    await waitFor(() => expect(typeof finish).toBe("function"));
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Reset changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    finish(
      new Response(
        JSON.stringify({
          error: { code: "UNAVAILABLE", message: "Temporarily unavailable" },
        }),
        { status: 503 },
      ),
    );
    await screen.findByRole("alert");
    expect(
      (screen.getByLabelText("Invoice title *") as HTMLInputElement).value,
    ).toBe("Updated Transit");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Save billing profile",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    await screen.findByRole("status");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.revalidate.mock.calls).toEqual([["/billing"], ["/settings"]]);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Reset changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Invoice title *"), {
      target: { value: "Unsubmitted change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(
      (screen.getByLabelText("Invoice title *") as HTMLInputElement).value,
    ).toBe(savedProfile.invoiceTitle);
  });

  it("lets an explicitly unprovisioned profile from the actual page be entered while respecting a disabled action", async () => {
    mocks.request.mockImplementation(async (url: string, init: RequestInit) =>
      init.method === "POST"
        ? response(savedProfile)
        : url.endsWith("/api/tenant/billing/profile")
          ? response(null)
          : readResponse(url),
    );
    const view = render(await BillingPage({}));
    expect(
      (screen.getByLabelText("Invoice title *") as HTMLInputElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Invoice title *"), {
      target: { value: "Updated Transit" },
    });
    fireEvent.change(screen.getByLabelText("Billing email *"), {
      target: { value: "updated@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    await screen.findByRole("status");
    const writes = mocks.request.mock.calls.filter(
      ([, init]) => init.method === "POST",
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]![1].body))).toEqual({
      invoiceTitle: "Updated Transit",
      email: "updated@example.test",
      taxId: "",
      address: "",
      contactName: "",
    });
    view.unmount();
    mocks.request.mockClear();
    render(
      createElement(BillingProfileForm, {
        profile,
        descriptor: {
          ...descriptor,
          enabled: false,
          disabledReasonCode: "read_only_mode",
        },
        locale: "en",
      }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save billing profile",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.submit(
      screen.getByRole("form", { name: "Edit billing profile" }),
    );
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getByText(/read_only_mode/)).toBeTruthy();
  });
});

describe("tenant settings billing navigation", () => {
  it("opens the real billing editor from the legacy billing snapshot and routes published actions there", async () => {
    const appRoot = resolve("apps/tenant-console-web");
    const load = createUiModuleLoader(appRoot, {
      react: React,
      "react/jsx-runtime": jsxRuntime,
      "@drts/ui-web": canvas,
      "@/lib/navigation": { TENANT_CONSOLE_ENV: "dev" },
      "@/lib/server-locale": { getServerLocale: async () => "en" },
      "@/lib/api-client": {
        getTenantClient: async () => ({
          get: async (path: string) =>
            path.endsWith("/billing/profile")
              ? { item: profile, availableActions: [descriptor] }
              : null,
        }),
      },
      "next/navigation": { useRouter: () => ({ refresh: mocks.refresh }) },
    });
    const SettingsPage = load<{
      default: () => Promise<React.ReactElement>;
    }>(resolve(appRoot, "app/settings/page.tsx")).default;
    render(await SettingsPage());
    expect(
      screen
        .getByRole("link", { name: "Open billing profile" })
        .getAttribute("href"),
    ).toBe("/billing");
    const actions = screen.getAllByRole("link", {
      name: /edit billing profile/i,
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(
      actions.every((link) => link.getAttribute("href") === "/billing"),
    ).toBe(true);
  });
});
