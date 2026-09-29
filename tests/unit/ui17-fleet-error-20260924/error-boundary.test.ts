// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { middleware } from "../../../apps/fleet-partner-portal-web/middleware";
import { POST } from "../../../apps/fleet-partner-portal-web/app/api/auth/[...auth]/route";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { statSync, readFileSync } from "node:fs";
import ts from "typescript";

const appRoot = resolve("apps/fleet-partner-portal-web");

function createCustomUiModuleLoader(appRoot: string, mocks: any = {}) {
  const cache = new Map();
  function load(path: string) {
    const file = [
      path,
      `${path}.ts`,
      `${path}.tsx`,
      `${path}/index.ts`,
      `${path}/index.tsx`,
    ].find((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
    if (!file) throw new Error(`Missing test module: ${path}`);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (id: string) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith(".css")) return {};
      if (id.startsWith("@/")) return load(resolve(appRoot, id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      if (id.startsWith("@drts/")) {
        return load(
          resolve(appRoot, "../../packages", id.split("/")[1]!, "src"),
        );
      }
      return createRequire(file)(id);
    };
    new Function("require", "module", "exports", output)(
      requireLocal,
      module,
      module.exports,
    );
    return module.exports;
  }
  return load;
}

const load = createCustomUiModuleLoader(appRoot, {});
const FleetPortalError = load(resolve(appRoot, "app/error.tsx")).default;
const { LanguageProvider } = load(resolve(appRoot, "lib/i18n.tsx"));

// Mock matchMedia for jsdom if UI components use it
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("UI17-FLEET-ERROR-20260924 component rendering and interactions", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as any).location;
    window.location = { href: "" } as any;
    global.fetch = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    window.location = originalLocation as any;
    vi.restoreAllMocks();
  });

  it("renders generic error gracefully and allows retry (zh default / no provider)", async () => {
    const error = new Error("Some generic error");
    const reset = vi.fn();
    render(React.createElement(FleetPortalError, { error, reset }));

    expect(screen.getByText("頁面發生錯誤")).toBeDefined();
    expect(screen.getByText("這個頁面暫時無法顯示")).toBeDefined();
    expect(screen.queryByText("Some generic error")).toBeNull();

    const retryBtn = screen.getByRole("button", { name: /重試/ });
    fireEvent.click(retryBtn);
    expect(reset).toHaveBeenCalled();

    const dashboardBtn = screen.getByText(/回營運總覽/);
    fireEvent.click(dashboardBtn);
    expect(window.location.href).toBe("/dashboard");
  });

  it("renders scope error in English when provided", async () => {
    const error = new Error("Missing fleet scope configuration");
    render(
      React.createElement(
        LanguageProvider,
        { defaultLocale: "en" },
        React.createElement(FleetPortalError, { error, reset: () => {} }),
      ),
    );

    expect(screen.getByText("Missing fleet scope")).toBeDefined();
    expect(screen.getByText("Fleet identity unrecognised")).toBeDefined();

    const logoutBtn = screen.getByText(/Sign out/);
    expect(logoutBtn).toBeDefined();
  });

  it("shows digest and suppresses raw message", () => {
    const error = new Error("Super secret database error");
    (error as any).digest = "DIGEST-12345";
    render(React.createElement(FleetPortalError, { error, reset: () => {} }));

    expect(screen.queryByText("Super secret database error")).toBeNull();
    expect(screen.getByText(/trace DIGEST-12345/)).toBeDefined();
  });

  it("handles duplicate clicks and 403 network rejection without redirecting, enables retry", async () => {
    const error = new Error("Missing fleet scope configuration");
    document.cookie = "drts_csrf=csrf-wrong"; // Invalid CSRF

    let resolveFetch: any;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as any).mockImplementation(() => fetchPromise);

    render(React.createElement(FleetPortalError, { error, reset: () => {} }));
    const logoutBtn = screen.getByText(/登出/);

    fireEvent.click(logoutBtn);

    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      true,
    );

    fireEvent.click(logoutBtn);

    resolveFetch({ ok: false, status: 403 });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(window.location.href).toBe("");
    expect(screen.getByText("頁面發生錯誤 - 重試")).toBeDefined();
    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      false,
    );

    (global.fetch as any).mockImplementation(() =>
      Promise.reject(new Error("Network Error")),
    );
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    expect(window.location.href).toBe("");
    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      false,
    );
  });

  it("recovers via middleware properly sending HttpOnly session and CSRF", async () => {
    const error = new Error("Missing fleet scope configuration");
    render(React.createElement(FleetPortalError, { error, reset: () => {} }));

    document.cookie = "drts_csrf=csrf-123";

    (global.fetch as any).mockImplementation(async (url: any, opts: any) => {
      const nextReq = new NextRequest("http://localhost" + url, {
        method: opts.method,
        headers: new Headers({
          cookie: "drts_session=sesh; " + document.cookie,
          "x-csrf-token": opts.headers["x-csrf-token"],
        }),
      });
      const midRes = await middleware(nextReq);
      if (midRes.status === 403) return { ok: false, status: 403 };
      const routeRes = await POST(nextReq, {
        params: Promise.resolve({ auth: ["logout"] }),
      });
      return { ok: routeRes.status === 200, status: routeRes.status };
    });

    const logoutBtn = screen.getByText(/登出/);
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({
          headers: {
            "x-csrf-token": "csrf-123",
          },
        }),
      );
      expect(window.location.href).toBe("/");
    });
  });

  it("retains mount through 403, network error, and successful retry clearing all cookies", async () => {
    const error = new Error("Missing fleet scope configuration");
    render(React.createElement(FleetPortalError, { error, reset: () => {} }));

    document.cookie = "drts_csrf=csrf-123; drts_session=sesh";

    let fetchCount = 0;
    let lastRouteRes: any;

    (global.fetch as any).mockImplementation(async (url: any, opts: any) => {
      fetchCount++;
      if (fetchCount === 1) return { ok: false, status: 403 };
      if (fetchCount === 2) return Promise.reject(new Error("Network Error"));

      const nextReq = new NextRequest("http://localhost" + url, {
        method: opts.method,
        headers: new Headers({
          cookie: "drts_session=sesh; " + document.cookie,
          "x-csrf-token": opts.headers["x-csrf-token"],
        }),
      });
      const midRes = await middleware(nextReq);
      if (midRes.status === 403) return { ok: false, status: 403 };
      const routeRes = await POST(nextReq, {
        params: Promise.resolve({ auth: ["logout"] }),
      });
      lastRouteRes = routeRes;
      return { ok: routeRes.status === 200, status: routeRes.status };
    });

    const logoutBtn = screen.getByText(/登出/);

    // 1st click: 403
    fireEvent.click(logoutBtn);
    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      true,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(window.location.href).toBe("");
    expect(screen.getByText("頁面發生錯誤 - 重試")).toBeDefined();
    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      false,
    );

    // 2nd click: Network Error
    fireEvent.click(logoutBtn);
    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      true,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(window.location.href).toBe("");
    expect(screen.getByText("頁面發生錯誤 - 重試")).toBeDefined();
    expect((logoutBtn.closest("button") as HTMLButtonElement)?.disabled).toBe(
      false,
    );

    // 3rd click: Success
    fireEvent.click(logoutBtn);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(window.location.href).toBe("/");
    });

    expect(lastRouteRes).toBeDefined();
    const setCookie = lastRouteRes.headers.get("set-cookie") || "";
    expect(setCookie).toContain("drts_session=;");
    expect(setCookie).toContain("drts_csrf=;");
    expect(setCookie).toContain("drts_oidc_state=;");
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("State/locale matrix", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as any).location;
    window.location = { href: "" } as any;
    global.fetch = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    window.location = originalLocation as any;
    vi.restoreAllMocks();
  });

  const matrix = [
    { type: "generic", locale: "no-provider", errorMsg: "Some generic error" },
    { type: "generic", locale: "zh", errorMsg: "Some generic error" },
    { type: "generic", locale: "en", errorMsg: "Some generic error" },
    {
      type: "scope",
      locale: "no-provider",
      errorMsg: "Missing fleet scope configuration",
    },
    {
      type: "scope",
      locale: "zh",
      errorMsg: "Missing fleet scope configuration",
    },
    {
      type: "scope",
      locale: "en",
      errorMsg: "Missing fleet scope configuration",
    },
  ];

  matrix.forEach(({ type, locale, errorMsg }) => {
    it(`renders ${type} error with locale ${locale} properly masking raw error and showing digest`, () => {
      const error = new Error(errorMsg);
      (error as any).digest = `DIGEST-${type}-${locale}`;

      let ui;
      if (locale === "no-provider") {
        ui = React.createElement(FleetPortalError, { error, reset: () => {} });
      } else {
        ui = React.createElement(
          LanguageProvider,
          { defaultLocale: locale },
          React.createElement(FleetPortalError, { error, reset: () => {} }),
        );
      }
      render(ui);

      expect(screen.queryByText(errorMsg)).toBeNull();
      expect(
        screen.getByText(new RegExp(`DIGEST-${type}-${locale}`)),
      ).toBeDefined();

      if (type === "generic") {
        if (locale === "en") {
          expect(screen.getByText("Page error")).toBeDefined();
          expect(
            screen.getByText("This page is temporarily unavailable"),
          ).toBeDefined();
          expect(
            screen.getByRole("button", { name: /Try again/ }),
          ).toBeDefined();
        } else {
          expect(screen.getByText("頁面發生錯誤")).toBeDefined();
          expect(screen.getByText("這個頁面暫時無法顯示")).toBeDefined();
          expect(screen.getByRole("button", { name: /重試/ })).toBeDefined();
        }
      } else {
        if (locale === "en") {
          expect(screen.getByText("Missing fleet scope")).toBeDefined();
          expect(screen.getByText("Fleet identity unrecognised")).toBeDefined();
          expect(screen.getByText(/Sign out/)).toBeDefined();
        } else {
          expect(screen.getByText("缺少車隊身分")).toBeDefined();
          expect(screen.getByText("無法辨識您所屬的車隊")).toBeDefined();
          expect(screen.getByText(/登出/)).toBeDefined();
        }
      }
    });
  });
});

describe("UI17-FLEET-ERROR-20260924 auth logic", () => {
  it("logout route and middleware handle CSRF and session success", async () => {
    const successReq = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: new Headers({
        cookie: "drts_session=sesh; drts_csrf=csrf-123",
        "x-csrf-token": "csrf-123",
      }),
    });
    const midResSuccess = await middleware(successReq);
    expect(midResSuccess.headers.get("x-drts-candidate-sha")).toBeDefined();
    const routeRes = await POST(successReq, {
      params: Promise.resolve({ auth: ["logout"] }),
    });
    expect(routeRes.status).toBe(200);
    const setCookie = routeRes.headers.get("set-cookie") || "";
    expect(setCookie).toContain("drts_session=;");
    expect(setCookie).toContain("drts_csrf=;");
    expect(setCookie).toContain("drts_oidc_state=;");
  });

  it("logout route and middleware handle 403 on invalid CSRF", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: new Headers({
        cookie: "drts_session=sesh; drts_csrf=csrf-123",
        "x-csrf-token": "wrong",
      }),
    });
    const midRes = await middleware(req);
    expect(midRes.status).toBe(403);
    const body = await midRes.json();
    expect(body.error).toBe("CSRF_TOKEN_INVALID");
  });
});
