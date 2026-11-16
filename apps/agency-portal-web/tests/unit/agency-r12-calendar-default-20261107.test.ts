import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@drts/contracts";
import * as uiTokens from "@drts/ui-tokens";
import * as agencyAuth from "@drts/agency-auth";
import * as agencyApi from "@drts/agency-auth/agency-api";
import {
  AGENCY_PROFILE_COOKIE_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "@drts/agency-auth/constants";
import * as nextHeaders from "next/headers";
import * as nextNavigation from "next/navigation";
import { AGENCY_LOCALE_COOKIE } from "@/lib/locale-config";

// External SIM: Next request cookies/navigation, Date and HTTP only. The existing
// Page, session.server, agencyApiGet and tenantAuthFetch are actual source modules.
const external = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      const value = external.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect(destination: string): never {
    throw new Error(`Unexpected Next redirect: ${destination}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Next preserves JSX for its production compiler. Reuse the existing render
// suite's actual-source loader locally so Vite never imports untransformed TSX.
// Package entries below are actual ESM namespaces, not replacement services:
// session.server -> agencyApiGet -> tenantAuthFetch -> external HTTP stays real.
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

function createAppLoader(modules: Record<string, unknown>) {
  const cache = new Map<string, Record<string, unknown>>();

  function loadModule(specifier: string, fromDir = APP_ROOT): unknown {
    if (specifier in modules) {
      return modules[specifier];
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
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, specifier.slice(2)),
      );
    } else if (specifier === "@drts/ui-web") {
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, "../../packages/ui-web/src/index.tsx"),
      );
    } else if (specifier.startsWith(".")) {
      targetPath = resolveSourceFile(path.resolve(fromDir, specifier));
    } else {
      throw new Error(`Unmocked external module in test loader: ${specifier}`);
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

const loader = createAppLoader({
  "@drts/contracts": contracts,
  "@drts/ui-tokens": uiTokens,
  "@drts/agency-auth": agencyAuth,
  "@drts/agency-auth/agency-api": agencyApi,
  "@drts/agency-auth/constants": {
    AGENCY_PROFILE_COOKIE_NAME,
    AGENCY_SESSION_COOKIE_NAME,
  },
  "next/headers": nextHeaders,
  "next/navigation": nextNavigation,
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
});
const { default: DailyDispatchPage } = loader.loadModule(
  "@/app/reports/daily-dispatch/page",
) as {
  default: (props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) => Promise<React.ReactElement>;
};

const BASE = "https://agency-r12-calendar.example.invalid";
const TOKEN = "sim-agency-r12-session";
const PATH = "/api/agency/reports/daily-dispatch-records";
interface HttpCall {
  url: URL;
  method: string;
  authorization: string | null;
}
const calls: HttpCall[] = [];
const unexpected: string[] = [];

async function page(query: Record<string, string | string[] | undefined> = {}) {
  const offset = calls.length;
  const element = await DailyDispatchPage({
    searchParams: Promise.resolve(query),
  });
  const html = renderToStaticMarkup(element);
  const emitted = calls.slice(offset);
  expect(
    emitted,
    "actual page must call the agency HTTP query once",
  ).toHaveLength(1);
  const call = emitted[0]!;
  expect(call.url.origin).toBe(BASE);
  expect(call.url.pathname).toBe(PATH);
  expect(call.method).toBe("GET");
  expect(call.authorization).toBe(`Bearer ${TOKEN}`);
  expect(unexpected).toEqual([]);
  return { query: call.url.searchParams, html };
}
function displayedDate(html: string, name: string, value: string) {
  expect(html).toMatch(
    new RegExp(`<input(?=[^>]*name="${name}")(?=[^>]*value="${value}")[^>]*>`),
  );
}

beforeEach(() => {
  calls.length = 0;
  unexpected.length = 0;
  external.cookies.clear();
  external.cookies.set(AGENCY_SESSION_COOKIE_NAME, TOKEN);
  external.cookies.set(AGENCY_LOCALE_COOKIE, "zh");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T15:59:00.000Z"));
  // Some existing Next TSX modules use the classic JSX transform in unit mode.
  // Supply the actual React namespace, without replacing Page/UI implementations.
  vi.stubGlobal("React", React);
  vi.stubEnv("DRTS_API_URL", BASE);
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      if (url.origin !== BASE || url.pathname !== PATH || method !== "GET") {
        unexpected.push(`${method} ${url}`);
        throw new Error(`Unexpected SIM HTTP: ${method} ${url}`);
      }
      return new Response(
        JSON.stringify({
          data: {
            items: [],
            page: 1,
            page_size: 20,
            total: 0,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("R12 actual agency page uses the Taipei service calendar in HTTP filters", () => {
  it("changes the default service date exactly at UTC16:00 while the UTC calendar date stays unchanged", async () => {
    for (const [instant, serviceDate] of [
      ["2026-11-07T15:59:00.000Z", "2026-11-07"],
      ["2026-11-07T16:00:00.000Z", "2026-11-08"],
    ] as const) {
      vi.setSystemTime(new Date(instant));
      const result = await page();
      expect(
        result.query.get("serviceDateFrom"),
        "Taipei service day must reach the actual agency HTTP query",
      ).toBe(serviceDate);
      expect(result.query.get("serviceDateTo")).toBe(serviceDate);
      expect([...result.query.keys()].sort()).toEqual([
        "serviceDateFrom",
        "serviceDateTo",
      ]);
      displayedDate(result.html, "serviceDateFrom", serviceDate);
      displayedDate(result.html, "serviceDateTo", serviceDate);
    }
    expect(calls).toHaveLength(2);
  });

  it("preserves explicit date ranges and existing filters across the same Taipei midnight", async () => {
    for (const instant of [
      "2026-11-07T15:59:00.000Z",
      "2026-11-07T16:00:00.000Z",
    ]) {
      vi.setSystemTime(new Date(instant));
      const result = await page({
        serviceDateFrom: [" 2026-10-30 ", "1999-01-01"],
        serviceDateTo: " 2026-11-02 ",
        serviceProductCode: " MULTI_TAXI ",
        finalStatus: " completed ",
      });
      expect(Object.fromEntries(result.query)).toEqual({
        serviceDateFrom: "2026-10-30",
        serviceDateTo: "2026-11-02",
        serviceProductCode: "MULTI_TAXI",
        finalStatus: "completed",
      });
      displayedDate(result.html, "serviceDateFrom", "2026-10-30");
      displayedDate(result.html, "serviceDateTo", "2026-11-02");
    }
    expect(calls).toHaveLength(2);
  });
});
