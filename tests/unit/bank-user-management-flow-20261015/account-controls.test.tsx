// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import * as React from "react";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import * as constants from "../../../packages/tenant-auth/src/constants";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
const appRoot = resolve("apps/bank-console-web");
const bank = { code: "acme", tenantId: "demo-brand-only" };
const load = createUiModuleLoader(appRoot, {
  react: React,
  "next/link": {
    __esModule: true,
    default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      React.createElement("a", props),
  },
  "@drts/tenant-auth/constants": constants,
  "@/lib/demo-tenants": {
    BANK_DEMO_TENANTS: { acme: bank },
    getBankTenantName: () => "Brand",
    getBankTenantShortName: () => "Brand",
  },
  "@/lib/session": {
    getBankConsoleSession: () => ({
      actorName: "Display persona",
      actorEmail: "display@example.org",
      roleLabel: "Display role",
    }),
  },
});
function sourcePath() {
  if (!process.env.BANK_ENTRY_REF)
    return resolve(appRoot, "components/bank-demo-controls.tsx");
  mkdirSync(".local/bank-user-management-flow-20261015", { recursive: true });
  const path = resolve(
    ".local/bank-user-management-flow-20261015/old-bank-demo-controls.tsx",
  );
  writeFileSync(
    path,
    execFileSync("git", [
      "show",
      `${process.env.BANK_ENTRY_REF}:apps/bank-console-web/components/bank-demo-controls.tsx`,
    ]),
  );
  return path;
}
const { BankDemoControls } = load<{
  BankDemoControls: React.ComponentType<{
    bank: typeof bank;
    locale: "en";
    pathname: string;
    searchParams: URLSearchParams;
    signedOut: boolean;
  }>;
}>(sourcePath());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = `${constants.TENANT_CSRF_COOKIE_NAME}=; max-age=0; path=/`;
});
describe("Existing Bank account controls consume the managed logout rail", () => {
  it.each([
    ["Sign out", 403],
    ["Sign out", 503],
    ["Switch account", 403],
    ["Switch account", 503],
  ] as const)(
    "%s invokes CSRF-protected logout and surfaces HTTP %s denial",
    async (name, status) => {
      document.cookie = `${constants.TENANT_CSRF_COOKIE_NAME}=managed-csrf; path=/`;
      const fetcher = vi.fn(async () =>
        Response.json({ error: "revocation unavailable" }, { status }),
      );
      vi.stubGlobal("fetch", fetcher);
      render(
        React.createElement(BankDemoControls, {
          bank,
          locale: "en",
          pathname: "/users",
          searchParams: new URLSearchParams(),
          signedOut: false,
        }),
      );
      const menu = screen.getByText("Display persona").closest("details")!;
      menu.open = true;
      const control = screen.getByText(name);
      fireEvent.click(control);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      expect(fetcher.mock.calls[0]).toEqual([
        "/api/auth/logout",
        expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          headers: { [constants.TENANT_CSRF_HEADER_NAME]: "managed-csrf" },
        }),
      ]);
      expect(await screen.findByRole("alert")).toBeTruthy();
    },
  );
  it.each(["Sign out", "Switch account"])(
    "%s awaits canonical logout before navigating and never calls it on hover",
    async (name) => {
      document.cookie = `${constants.TENANT_CSRF_COOKIE_NAME}=managed-csrf; path=/`;
      let complete!: (response: Response) => void;
      const fetcher = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      render(
        React.createElement(BankDemoControls, {
          bank,
          locale: "en",
          pathname: "/users",
          searchParams: new URLSearchParams(),
          signedOut: false,
        }),
      );
      screen.getByText("Display persona").closest("details")!.open = true;
      const navigate = vi.fn();
      const realWindow = window;
      vi.stubGlobal(
        "window",
        new Proxy(realWindow, {
          get(target, property) {
            return property === "location"
              ? { assign: navigate }
              : Reflect.get(target, property, target);
          },
        }),
      );
      const button = screen.getByRole("button", { name });
      fireEvent.mouseOver(button);
      expect(fetcher).not.toHaveBeenCalled();
      fireEvent.click(button);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      );
      expect(navigate).not.toHaveBeenCalled();
      expect((button as HTMLButtonElement).disabled).toBe(true);
      complete(Response.json({ success: true }));
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      if (name === "Switch account") {
        const url = new URL(navigate.mock.calls[0]![0], "https://bank.example");
        expect(url.pathname).toBe("/api/auth/tenant/login");
        expect(url.searchParams.has("tenant_id")).toBe(false);
        expect(url.searchParams.get("return_url")).toBe(
          "/users?bank=acme&locale=en",
        );
      } else {
        expect(navigate).toHaveBeenCalledWith(
          "/users?bank=acme&locale=en&signedOut=1",
        );
      }
    },
  );
  it.each(["Sign out", "Switch account"])(
    "%s preserves the display-only route without inventing a tenant session",
    async (name) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      render(
        React.createElement(BankDemoControls, {
          bank,
          locale: "en",
          pathname: "/users",
          searchParams: new URLSearchParams(),
          signedOut: false,
        }),
      );
      screen.getByText("Display persona").closest("details")!.open = true;
      const navigate = vi.fn();
      const realWindow = window;
      vi.stubGlobal(
        "window",
        new Proxy(realWindow, {
          get(target, property) {
            return property === "location"
              ? { assign: navigate }
              : Reflect.get(target, property, target);
          },
        }),
      );
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      expect(fetcher).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(
        `${name === "Switch account" ? "/login" : "/users"}?bank=acme&locale=en&signedOut=1`,
      );
    },
  );
});
