// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@drts/contracts";
import * as uiTokens from "@drts/ui-tokens";
import { AGENCY_LOCALE_COOKIE } from "@/lib/locale-config";
import type { Locale } from "@/lib/translations";

const APP_ROOT = path.resolve(__dirname, "../..");

function resolveSourceFile(basePath: string): string {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve module at ${basePath}`);
}

function createClientLoader(mocks: Record<string, unknown>) {
  const cache = new Map<string, Record<string, unknown>>();

  function loadModule(specifier: string, fromDir = APP_ROOT): unknown {
    if (specifier in mocks) {
      return mocks[specifier];
    }
    if (specifier === "react") {
      return React;
    }
    if (
      specifier === "react/jsx-runtime" ||
      specifier === "react/jsx-dev-runtime"
    ) {
      return jsxRuntime;
    }

    let targetPath: string;
    if (specifier.startsWith("@/")) {
      targetPath = resolveSourceFile(path.resolve(APP_ROOT, specifier.slice(2)));
    } else if (specifier === "@drts/ui-web") {
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, "../../packages/ui-web/src/index.tsx"),
      );
    } else if (specifier.startsWith(".")) {
      targetPath = resolveSourceFile(path.resolve(fromDir, specifier));
    } else {
      throw new Error(`Unmocked external module in client loader: ${specifier}`);
    }

    const existing = cache.get(targetPath);
    if (existing) {
      return existing;
    }

    const exportsObj: Record<string, unknown> = {};
    const moduleObj = { exports: exportsObj };
    cache.set(targetPath, exportsObj);

    const source = fs.readFileSync(targetPath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: targetPath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    const localRequire = (childSpecifier: string) =>
      loadModule(childSpecifier, path.dirname(targetPath));
    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      outputText,
    );
    fn(
      moduleObj.exports,
      localRequire,
      moduleObj,
      targetPath,
      path.dirname(targetPath),
    );
    cache.set(targetPath, moduleObj.exports);
    return moduleObj.exports;
  }

  return { loadModule };
}

describe("Agency portal client language switch and logout/CSRF preservation", () => {
  const refreshMock = vi.fn();
  const loader = createClientLoader({
    "@drts/contracts": contracts,
    "@drts/ui-tokens": uiTokens,
    "next/link": {
      default: ({
        href,
        children,
        ...rest
      }: {
        href: string;
        children?: React.ReactNode;
      }) => React.createElement("a", { href, ...rest }, children),
    },
    "next/navigation": {
      useRouter: () => ({
        refresh: refreshMock,
      }),
    },
  });

  const { LanguageProvider } = loader.loadModule("@/lib/i18n") as {
    LanguageProvider: React.ComponentType<{
      defaultLocale?: Locale;
      children?: React.ReactNode;
    }>;
  };
  const { PortalShell } = loader.loadModule("@/components/portal-shell") as {
    PortalShell: React.ComponentType<{
      agencyName?: string | null;
      locale?: Locale;
      children?: React.ReactNode;
    }>;
  };
  const { QualificationFilter } = loader.loadModule(
    "@/components/qualification-filter",
  ) as {
    QualificationFilter: React.ComponentType<{
      status: string | undefined;
      windowDays: string | undefined;
      locale?: Locale;
    }>;
  };
  const { Pager } = loader.loadModule("@/components/pager") as {
    Pager: React.ComponentType<{
      basePath: string;
      query: Record<string, string | undefined>;
      page: number;
      pageSize: number;
      total: number;
      locale?: Locale;
    }>;
  };
  const { ErrorNotice } = loader.loadModule("@/components/error-notice") as {
    ErrorNotice: React.ComponentType<{
      status: number;
      error: { code: string | null; message: string | null } | null;
      locale?: Locale;
    }>;
  };

  beforeEach(() => {
    refreshMock.mockReset();
    window.localStorage.clear();
    document.cookie = `${AGENCY_LOCALE_COOKIE}=; Max-Age=0; path=/`;
    document.cookie = "drts_agency_csrf=csrf-token-agency-99; path=/";
    document.documentElement.lang = "zh-Hant";
    window.history.replaceState(
      {},
      "",
      "/qualifications/drivers?status=expired&windowDays=30&page=2",
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("toggles zh <-> en via accessible button, persists drts-locale-v2 cookie/localStorage, refreshes same URL/query, and updates displayed UI copy", () => {
    const shellChildren = [
      React.createElement(QualificationFilter, {
        key: "filter",
        status: "expired",
        windowDays: "30",
      }),
      React.createElement(Pager, {
        key: "pager",
        basePath: "/qualifications/drivers",
        query: { status: "expired", windowDays: "30" },
        page: 2,
        pageSize: 20,
        total: 45,
      }),
      React.createElement(ErrorNotice, {
        key: "err",
        status: 503,
        error: null,
      }),
    ];

    render(
      React.createElement(LanguageProvider, {
        defaultLocale: "zh",
        children: React.createElement(PortalShell, {
          agencyName: "Taipei City DOT",
          children: shellChildren,
        }),
      }),
    );

    // Initial zh state
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(screen.getByText("DRTS 主管機關唯讀查詢")).toBeTruthy();
    expect(screen.getByText("唯讀")).toBeTruthy();
    expect(screen.getByText("個資已遮罩")).toBeTruthy();
    expect(screen.getByText("共 45 筆 · 第 2 / 3 頁")).toBeTruthy();
    expect(
      screen.getByText("存取紀錄服務暫時無法使用，基於稽核要求不提供資料。"),
    ).toBeTruthy();

    const switchToEnBtn = screen.getByRole("button", {
      name: "切換語言至 English",
    });
    expect(switchToEnBtn.textContent).toContain("English");

    // Click language switch -> en
    fireEvent.click(switchToEnBtn);

    expect(window.localStorage.getItem(AGENCY_LOCALE_COOKIE)).toBe("en");
    expect(document.cookie).toContain(`${AGENCY_LOCALE_COOKIE}=en`);
    expect(document.documentElement.lang).toBe("en");
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // URL and filter query remain unchanged
    expect(window.location.pathname).toBe("/qualifications/drivers");
    expect(window.location.search).toBe(
      "?status=expired&windowDays=30&page=2",
    );

    // Displayed copy updates to English
    expect(
      screen.getByText("DRTS Regulatory Agency Read-Only Portal"),
    ).toBeTruthy();
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.getByText("PII Masked")).toBeTruthy();
    expect(screen.getByText("Total 45 records · Page 2 of 3")).toBeTruthy();
    expect(
      screen.getByText(
        "Access audit logging is temporarily unavailable; data is withheld per audit policy.",
      ),
    ).toBeTruthy();

    // Accessible name updated to switch back to Traditional Chinese
    const switchToZhBtn = screen.getByRole("button", {
      name: "Switch language to Traditional Chinese",
    });
    expect(switchToZhBtn.textContent).toContain("繁體中文");

    // Click language switch -> zh
    fireEvent.click(switchToZhBtn);
    expect(window.localStorage.getItem(AGENCY_LOCALE_COOKIE)).toBe("zh");
    expect(document.cookie).toContain(`${AGENCY_LOCALE_COOKIE}=zh`);
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(refreshMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("DRTS 主管機關唯讀查詢")).toBeTruthy();
  });

  it("preserves same-origin logout POST and x-csrf-token header after switching locale", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    global.fetch = fetchMock;

    render(
      React.createElement(LanguageProvider, {
        defaultLocale: "en",
        children: React.createElement(PortalShell, {
          agencyName: "Taipei City DOT",
          children: React.createElement("div", null, "content"),
        }),
      }),
    );

    const logoutBtn = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(logoutBtn);

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      headers: { "x-csrf-token": "csrf-token-agency-99" },
      credentials: "same-origin",
    });
  });
});
