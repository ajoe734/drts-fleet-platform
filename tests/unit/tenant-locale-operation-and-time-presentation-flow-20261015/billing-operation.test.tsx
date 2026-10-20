// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { TenantBillingProfile } from "@drts/contracts";
import { ApiClient } from "../../../packages/api-client/src/index";
import * as canvas from "../../../packages/ui-web/src/index";
import type * as BillingPageModule from "../../../apps/tenant-console-web/app/billing/page";
import type * as FormModule from "../../../apps/tenant-console-web/app/billing/billing-profile-form";
import type * as LanguageModule from "../../../apps/tenant-console-web/lib/i18n";
import { TENANT_LOCALE_COOKIE } from "../../../apps/tenant-console-web/lib/locale-config";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve(process.env.C121_APP_ROOT ?? "apps/tenant-console-web");
const initial: TenantBillingProfile = {
  tenantId: "tenant-c121",
  invoiceTitle: "Canonical Transit",
  taxId: "12345678",
  email: "canonical@example.test",
  address: "Sample Road",
  contactName: "Sample Contact",
  updatedAt: "2026-12-31T16:05:00Z",
};
const descriptor = {
  action: "edit_billing_profile",
  enabled: true,
  riskLevel: "medium" as const,
};
const refresh = vi.fn();
const router = { refresh };
const revalidate = vi.fn();
const request = vi.fn();
let canonical: TenantBillingProfile | null;
let failRead = false;
function serverLocale(): "zh" | "en" {
  return document.cookie.includes(`${TENANT_LOCALE_COOKIE}=zh`) ? "zh" : "en";
}
const client = new ApiClient({
  baseUrl: "https://api.example.test",
  defaultHeaders: {
    Authorization: "Bearer socket-free-session",
    "X-Tenant-Id": initial.tenantId,
  },
});
const api = { getTenantClient: async () => client };
const localeModule = { getServerLocale: async () => serverLocale() };
const load = createUiModuleLoader(appRoot, {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@drts/ui-web": canvas,
  "next/navigation": { useRouter: () => router },
  "next/cache": { revalidatePath: revalidate },
  "../../lib/api-client": api,
  "@/lib/api-client": api,
  "../../lib/server-locale": localeModule,
  "@/lib/server-locale": localeModule,
});
const BillingPage = load<typeof BillingPageModule>(
  resolve(appRoot, "app/billing/page.tsx"),
).default;
const { BillingProfileForm } = load<typeof FormModule>(
  resolve(appRoot, "app/billing/billing-profile-form.tsx"),
);
const { LanguageProvider, useTranslation } = load<typeof LanguageModule>(
  resolve(appRoot, "lib/i18n.tsx"),
);
function LocaleControl() {
  const { locale, setLocale } = useTranslation();
  return (
    <button onClick={() => setLocale(locale === "en" ? "zh" : "en")}>
      Switch language
    </button>
  );
}
async function tree() {
  return (
    <LanguageProvider defaultLocale={serverLocale()}>
      <LocaleControl />
      {await BillingPage({})}
    </LanguageProvider>
  );
}
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { data }
        : { error: { code: "UNAVAILABLE", message: "Try again" } },
    ),
    { status },
  );
}
function title() {
  return document.querySelector<HTMLInputElement>(
    'input[name="invoiceTitle"]',
  )!;
}
function edit(value = "Unsaved draft") {
  fireEvent.change(title(), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.cookie = `${TENANT_LOCALE_COOKIE}=;max-age=0;path=/`;
  canonical = { ...initial };
  failRead = false;
  request.mockReset();
  request.mockImplementation(async (url: string, init: RequestInit) => {
    if (init.method === "POST") {
      canonical = {
        ...initial,
        ...JSON.parse(String(init.body)),
        updatedAt: "2027-01-01T01:00:00Z",
      };
      return response(canonical);
    }
    if (url.endsWith("/api/tenant/billing/profile"))
      return response(canonical, failRead ? 503 : 200);
    if (url.includes("quota")) return response(null);
    return response([]);
  });
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C121 mounted locale refresh and billing operation", () => {
  it("preserves real edits through LanguageProvider refresh and equivalent server profile objects; Reset stays explicit", async () => {
    const view = render(await tree());
    const input = title();
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
    expect(refresh).toHaveBeenCalledOnce();
    view.rerender(await tree());
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(document.cookie).toContain(`${TENANT_LOCALE_COOKIE}=zh`);
    expect(localStorage.getItem(TENANT_LOCALE_COOKIE)).toBe("zh");
    expect(screen.getByLabelText("發票抬頭 *")).toBe(input);
    expect(title().value).toBe("Unsaved draft");
    view.rerender(await tree());
    expect(title().value).toBe("Unsaved draft");
    expect(request.mock.calls.some(([, init]) => init.method === "POST")).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "還原變更" }));
    expect(title().value).toBe(initial.invoiceTitle);
    edit("Second draft");
    fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
    view.rerender(await tree());
    expect(document.documentElement.lang).toBe("en");
    expect(title().value).toBe("Second draft");
  });

  it("keeps failed-save input and uses the real action/API ACK as the new Reset baseline", async () => {
    const view = render(await tree());
    edit(" Saved draft ");
    request.mockResolvedValueOnce(response(null, 503));
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    await screen.findByRole("alert");
    expect(title().value).toBe(" Saved draft ");
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
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Reset changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(title().value).toBe("Saved draft");
    expect(refresh).toHaveBeenCalledOnce();
    expect(revalidate.mock.calls).toEqual([["/billing"], ["/settings"]]);
    const writes = request.mock.calls.filter(
      ([, init]) => init.method === "POST",
    );
    expect(writes).toHaveLength(2);
    expect(JSON.parse(String(writes[1]![1].body))).toEqual({
      invoiceTitle: "Saved draft",
      taxId: initial.taxId,
      email: initial.email,
      address: initial.address,
      contactName: initial.contactName,
    });
    view.rerender(await tree());
    edit("Next draft");
    view.rerender(await tree());
    expect(title().value).toBe("Next draft");
    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(title().value).toBe("Saved draft");
  });

  it.each(["tenant", "version", "content", "unprovisioned", "read-failure"])(
    "drops the draft on genuine %s boundary changes",
    async (boundary) => {
      const view = render(await tree());
      edit();
      if (boundary === "tenant")
        canonical = {
          ...initial,
          tenantId: "other-tenant",
          invoiceTitle: "Other tenant",
        };
      if (boundary === "version")
        canonical = { ...initial, updatedAt: "2027-01-01T02:00:00Z" };
      if (boundary === "content")
        canonical = { ...initial, invoiceTitle: "Remote edit" };
      if (boundary === "unprovisioned") canonical = null;
      if (boundary === "read-failure") failRead = true;
      view.rerender(await tree());
      if (boundary === "read-failure")
        expect(document.querySelector('input[name="invoiceTitle"]')).toBeNull();
      else expect(title().value).toBe(canonical?.invoiceTitle ?? "");
      failRead = false;
      canonical = { ...initial };
      view.rerender(await tree());
      expect(title().value).toBe(initial.invoiceTitle);
    },
  );

  it("clears drafts when action capability changes, even if the canonical profile is unchanged", () => {
    const view = render(
      <BillingProfileForm
        profile={initial}
        descriptor={descriptor}
        locale="en"
      />,
    );
    edit();
    view.rerender(
      <BillingProfileForm
        profile={initial}
        descriptor={{
          ...descriptor,
          enabled: false,
          disabledReasonCode: "permission_denied",
        }}
        locale="zh"
      />,
    );
    expect(title().value).toBe(initial.invoiceTitle);
    expect((title().closest("fieldset") as HTMLFieldSetElement).disabled).toBe(
      true,
    );
    view.rerender(
      <BillingProfileForm
        profile={{ ...initial }}
        descriptor={descriptor}
        locale="en"
      />,
    );
    expect(title().value).toBe(initial.invoiceTitle);
  });

  it("does not apply an old in-flight ACK after the resource changes", async () => {
    const view = render(await tree());
    edit();
    let finish!: (value: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    canonical = {
      ...initial,
      tenantId: "other-tenant",
      invoiceTitle: "Other tenant",
    };
    view.rerender(await tree());
    await act(async () => {
      finish(response({ ...initial, invoiceTitle: "Old ACK" }));
    });
    expect(title().value).toBe("Other tenant");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retains an in-flight Save across an equivalent locale refresh and accepts its ACK", async () => {
    const view = render(await tree());
    edit("Pending save");
    let finish!: (value: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
    view.rerender(await tree());
    expect(title().value).toBe("Pending save");
    expect((title().closest("fieldset") as HTMLFieldSetElement).disabled).toBe(
      true,
    );
    canonical = {
      ...initial,
      invoiceTitle: "Pending save",
      updatedAt: "2027-01-01T01:00:00Z",
    };
    await act(async () => {
      finish(response(canonical));
    });
    expect(title().value).toBe("Pending save");
    expect(refresh).toHaveBeenCalledTimes(2);
    view.rerender(await tree());
    expect(title().value).toBe("Pending save");
  });

  it("ignores a late ACK after the editor unmounts for session navigation", async () => {
    const view = render(await tree());
    edit();
    let finish!: (value: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save billing profile" }),
    );
    view.unmount();
    render(await tree());
    await act(async () => {
      finish(response({ ...initial, invoiceTitle: "Old session ACK" }));
    });
    expect(title().value).toBe(initial.invoiceTitle);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps drafts only in mounted memory across session navigation/remount", async () => {
    const view = render(await tree());
    edit();
    view.unmount();
    render(await tree());
    expect(title().value).toBe(initial.invoiceTitle);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain("Unsaved");
  });
});
