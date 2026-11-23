import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { NextRequest } from "next/server";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLEET_PUBLIC_ENTRY_PAGE_PATHS,
  FLEET_PUBLIC_PATHS,
  isFleetPublicEntryPagePath,
  isFleetPublicPath,
} from "../../apps/fleet-partner-portal-web/lib/fleet-portal-entry-paths";
import { middleware } from "../../apps/fleet-partner-portal-web/middleware";

const fleetRoot = resolve(process.cwd(), "apps/fleet-partner-portal-web");
const packagesRoot = resolve(process.cwd(), "packages");
const realRequire = createRequire(resolve(fleetRoot, "package.json"));
const react = realRequire("react") as {
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => VNode;
};
const { renderToStaticMarkup } = realRequire("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};

type VNode = {
  type: unknown;
  props: Record<string, unknown>;
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;

const ORIGIN = "https://fleet.example.test";
const SYNTHETIC_INVITE_TOKEN = "synthetic-fleet-invite-token-20261123";
const SYNTHETIC_RESET_TOKEN = "synthetic-fleet-reset-token-20261123";

function resolveSourceFile(basePath: string): string | undefined {
  return [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
  ].find((candidate) => {
    if (!existsSync(candidate)) return false;
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function createFleetModuleLoader(mocks: Record<string, unknown> = {}) {
  const cache = new Map<string, unknown>();

  function load<T>(targetPath: string): T {
    const file = resolveSourceFile(targetPath);
    if (!file) {
      throw new Error(`Missing test module: ${targetPath}`);
    }
    if (cache.has(file)) {
      return cache.get(file) as T;
    }
    const mod = { exports: {} as unknown };
    cache.set(file, mod.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;

    const requireLocal = (id: string): unknown => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === "server-only" || id.endsWith(".css")) return {};
      if (id.startsWith("@/")) return load(resolve(fleetRoot, id.slice(2)));
      if (id === "@drts/ui-web/client") {
        return load(resolve(packagesRoot, "ui-web/src/client.tsx"));
      }
      if (id === "@drts/ui-web") {
        return load(resolve(packagesRoot, "ui-web/src/index.tsx"));
      }
      if (id === "@drts/ui-tokens") {
        return load(resolve(packagesRoot, "ui-tokens/src/index.ts"));
      }
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      return realRequire(id);
    };

    new Function("require", "module", "exports", output)(
      requireLocal,
      mod,
      mod.exports,
    );
    return mod.exports as T;
  }

  return load;
}

function collectElements(node: unknown, visited: VNode[] = []): VNode[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectElements(item, visited);
    }
    return visited;
  }
  if (!node || typeof node !== "object" || !("props" in node)) {
    return visited;
  }
  const element = node as VNode;
  visited.push(element);
  collectElements(element.props?.children, visited);
  return visited;
}

function createFleetHarness(options?: {
  pathname?: string;
  requestHeaders?: Headers;
  locale?: "zh" | "en";
  onLoadNavBadges?: () => Promise<{
    drivers: number;
    documents: number;
    cases: number;
  }>;
}) {
  const pathname = options?.pathname ?? "/login";
  const requestHeaders =
    options?.requestHeaders ??
    new Headers({ "x-drts-fleet-pathname": pathname });
  const locale = options?.locale ?? "zh";
  const loadNavBadges = vi.fn(
    options?.onLoadNavBadges ??
      (async () => ({
        drivers: 18,
        documents: 4,
        cases: 2,
      })),
  );

  const load = createFleetModuleLoader({
    "next/navigation": { usePathname: () => pathname },
    "next/headers": {
      headers: async () => requestHeaders,
      cookies: async () => ({ get: () => undefined }),
    },
    "@/lib/server-locale": { getServerLocale: async () => locale },
    "@/lib/fleet-portal-data.server": { loadNavBadges },
    "@/lib/runtime-config": { RuntimeConfigScript: () => null },
    "@/components/fleet-portal-health-footer": {
      FleetPortalHealthFooter: () =>
        react.createElement(
          "footer",
          { "data-testid": "fleet-health-footer" },
          "Fleet health",
        ),
    },
  });

  const RootLayout = load<{
    default: (props: { children: unknown }) => Promise<VNode>;
  }>(resolve(fleetRoot, "app/layout.tsx")).default;
  const FleetInvitePage = load<{
    default: (props: {
      searchParams?: Promise<SearchParamsRecord>;
    }) => Promise<VNode>;
  }>(resolve(fleetRoot, "app/invite/page.tsx")).default;
  const ForgotPasswordPage = load<{
    default: () => Promise<VNode>;
  }>(resolve(fleetRoot, "app/forgot-password/page.tsx")).default;
  const ResetPasswordPage = load<{
    default: (props: {
      searchParams: Promise<SearchParamsRecord>;
    }) => Promise<VNode>;
  }>(resolve(fleetRoot, "app/reset-password/page.tsx")).default;
  const FleetLoginPage = load<{
    default: (props: {
      searchParams?: Promise<{
        redirect_uri?: string;
        error?: string;
        session?: string;
      }>;
    }) => Promise<VNode>;
  }>(resolve(fleetRoot, "app/login/page.tsx")).default;
  const uiWebClient = load<{
    PortalInvitationPasswordForm: unknown;
    PortalForgotPasswordForm: unknown;
    PortalResetPasswordForm: unknown;
    PortalPasswordLoginForm: unknown;
  }>(resolve(packagesRoot, "ui-web/src/client.tsx"));

  return {
    loadNavBadges,
    RootLayout,
    FleetInvitePage,
    ForgotPasswordPage,
    ResetPasswordPage,
    FleetLoginPage,
    uiWebClient,
  };
}

function forwardedRequestHeadersFromMiddleware(request: NextRequest): Headers {
  const response = middleware(request);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("location")).toBeNull();
  const forwarded = new Headers(request.headers);
  const overrideKeys =
    response.headers
      .get("x-middleware-override-headers")
      ?.split(",")
      .map((key) => key.trim())
      .filter(Boolean) ?? [];
  for (const key of overrideKeys) {
    const value = response.headers.get(`x-middleware-request-${key}`);
    if (value !== null) {
      forwarded.set(key, value);
    }
  }
  return forwarded;
}

describe("FLEET-INVITE-PUBLIC-RENDER-20261123: Fleet public account-entry paths and layout boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "true");
    vi.stubEnv("DRTS_HOST_PARTNER_ID", "");
    vi.stubEnv("DRTS_ENV", "staging");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("classifies only /login, /invite, /forgot-password, /reset-password and /api/auth/* as public paths", () => {
    expect(FLEET_PUBLIC_ENTRY_PAGE_PATHS).toEqual([
      "/login",
      "/invite",
      "/forgot-password",
      "/reset-password",
    ]);
    expect(FLEET_PUBLIC_PATHS).toEqual([
      "/login",
      "/invite",
      "/forgot-password",
      "/reset-password",
      "/api/auth",
    ]);

    for (const pagePath of FLEET_PUBLIC_ENTRY_PAGE_PATHS) {
      expect(isFleetPublicEntryPagePath(pagePath)).toBe(true);
      expect(isFleetPublicPath(pagePath)).toBe(true);
    }

    expect(isFleetPublicEntryPagePath("/api/auth")).toBe(false);
    expect(isFleetPublicEntryPagePath("/api/auth/login")).toBe(false);
    expect(isFleetPublicPath("/api/auth")).toBe(true);
    expect(isFleetPublicPath("/api/auth/login")).toBe(true);
    expect(isFleetPublicPath("/api/auth/invitation/accept-with-password")).toBe(
      true,
    );
    expect(isFleetPublicPath("/api/auth/password-reset/request")).toBe(true);
    expect(isFleetPublicPath("/api/auth/password-reset/confirm")).toBe(true);

    for (const nonPublicPath of [
      "",
      "/",
      "/dashboard",
      "/drivers",
      "/host",
      "/host/vehicles",
      "/account/security",
      "/login-extra",
      "/login/nested",
      "/invite-preview",
      "/invite/nested",
      "/forgot-password-extra",
      "/forgot-password/nested",
      "/reset-password-extra",
      "/reset-password/nested",
      "/api/authorize",
      "/control-plane-proxy/fleet-partner/drivers",
    ]) {
      expect(isFleetPublicEntryPagePath(nonPublicPath)).toBe(false);
      expect(isFleetPublicPath(nonPublicPath)).toBe(false);
    }
  });

  it("allows unauthenticated /invite, /forgot-password, /reset-password, /login and /api/auth/* through middleware while redirecting protected and lookalike routes", () => {
    for (const publicTarget of [
      `/invite?token=${SYNTHETIC_INVITE_TOKEN}&redirect_uri=%2Fdashboard`,
      "/forgot-password",
      `/reset-password?token=${SYNTHETIC_RESET_TOKEN}`,
      "/login?redirect_uri=%2Fdrivers",
      `/api/auth/login?token=${SYNTHETIC_INVITE_TOKEN}`,
      "/api/auth/invitation/accept-with-password",
      "/api/auth/password-reset/request",
      "/api/auth/password-reset/confirm",
    ]) {
      const request = new NextRequest(`${ORIGIN}${publicTarget}`, {
        headers: { "x-drts-fleet-pathname": "/forged-inbound-path" },
      });
      const forwarded = forwardedRequestHeadersFromMiddleware(request);
      expect(forwarded.get("x-drts-fleet-pathname")).toBe(
        request.nextUrl.pathname,
      );
    }

    for (const protectedTarget of [
      "/dashboard",
      "/drivers?tab=available",
      "/host/vehicles",
      "/account/security",
      "/invite-other?token=synthetic",
      "/invite/nested",
      "/login-other",
      "/forgot-password-other",
      "/reset-password-other",
      "/api/authorize",
    ]) {
      const request = new NextRequest(`${ORIGIN}${protectedTarget}`);
      const response = middleware(request);
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.origin).toBe(ORIGIN);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect_uri")).toBe(protectedTarget);
    }

    const proxyResponse = middleware(
      new NextRequest(`${ORIGIN}/control-plane-proxy/fleet-partner/drivers`),
    );
    expect(proxyResponse.status).toBe(401);
  });

  it("renders unauthenticated /invite with a synthetic token through middleware + RootLayout without calling loadNavBadges, forwarding the synthetic token to both Google bind and PortalInvitationPasswordForm", async () => {
    const request = new NextRequest(
      `${ORIGIN}/invite?token=${SYNTHETIC_INVITE_TOKEN}&redirect_uri=%2Fdrivers`,
    );
    const forwardedHeaders = forwardedRequestHeadersFromMiddleware(request);
    const { RootLayout, FleetInvitePage, loadNavBadges, uiWebClient } =
      createFleetHarness({
        pathname: request.nextUrl.pathname,
        requestHeaders: forwardedHeaders,
        locale: "en",
        onLoadNavBadges: async () => {
          throw new Error(
            "loadNavBadges must not run on unauthenticated /invite",
          );
        },
      });

    const inviteElement = await FleetInvitePage({
      searchParams: Promise.resolve({
        token: SYNTHETIC_INVITE_TOKEN,
        redirect_uri: "/drivers",
      }),
    });
    const layoutElement = await RootLayout({ children: inviteElement });

    expect(loadNavBadges).not.toHaveBeenCalled();

    const elements = collectElements(layoutElement);
    const invitationFormNode = elements.find(
      (el) => el.type === uiWebClient.PortalInvitationPasswordForm,
    );
    expect(invitationFormNode).toBeDefined();
    expect(invitationFormNode?.props).toMatchObject({
      endpoint: "/api/auth/invitation/accept-with-password",
      loginEndpoint: "/api/auth/password-login",
      token: SYNTHETIC_INVITE_TOKEN,
      successHref: "/drivers",
    });

    const html = renderToStaticMarkup(layoutElement);
    expect(html).not.toContain('data-testid="fleet-portal-shell"');
    expect(html).not.toContain('href="/drivers"');
    expect(html).toContain(
      `href="/api/auth/login?token=${SYNTHETIC_INVITE_TOKEN}&amp;redirect_uri=%2Fdrivers"`,
    );
    expect(html).toContain("Accept invitation with Google");
    expect(html).toContain("Save password");

    // Missing token renders invalid link alert without form or nav badge read
    const missingTokenInvite = await FleetInvitePage({
      searchParams: Promise.resolve({}),
    });
    const missingTokenHtml = renderToStaticMarkup(
      await RootLayout({ children: missingTokenInvite }),
    );
    expect(loadNavBadges).not.toHaveBeenCalled();
    expect(missingTokenHtml).toContain('role="alert"');
    expect(missingTokenHtml).not.toContain("Save password");
  });

  it("renders unauthenticated /forgot-password, /reset-password (with synthetic token) and /login inside standalone RootLayout without calling loadNavBadges", async () => {
    // 1. /forgot-password
    {
      const request = new NextRequest(`${ORIGIN}/forgot-password`);
      const forwardedHeaders = forwardedRequestHeadersFromMiddleware(request);
      const { RootLayout, ForgotPasswordPage, loadNavBadges, uiWebClient } =
        createFleetHarness({
          pathname: request.nextUrl.pathname,
          requestHeaders: forwardedHeaders,
          locale: "en",
          onLoadNavBadges: async () => {
            throw new Error(
              "loadNavBadges must not run on unauthenticated /forgot-password",
            );
          },
        });

      const pageElement = await ForgotPasswordPage();
      const layoutElement = await RootLayout({ children: pageElement });
      expect(loadNavBadges).not.toHaveBeenCalled();

      const elements = collectElements(layoutElement);
      const forgotFormNode = elements.find(
        (el) => el.type === uiWebClient.PortalForgotPasswordForm,
      );
      expect(forgotFormNode).toBeDefined();
      expect(forgotFormNode?.props).toMatchObject({
        endpoint: "/api/auth/password-reset/request",
      });

      const html = renderToStaticMarkup(layoutElement);
      expect(html).not.toContain('data-testid="fleet-portal-shell"');
      expect(html).toContain("Send reset link");
      expect(html).toContain('href="/login"');
    }

    // 2. /reset-password?token=...
    {
      const request = new NextRequest(
        `${ORIGIN}/reset-password?token=${SYNTHETIC_RESET_TOKEN}`,
      );
      const forwardedHeaders = forwardedRequestHeadersFromMiddleware(request);
      const { RootLayout, ResetPasswordPage, loadNavBadges, uiWebClient } =
        createFleetHarness({
          pathname: request.nextUrl.pathname,
          requestHeaders: forwardedHeaders,
          locale: "en",
          onLoadNavBadges: async () => {
            throw new Error(
              "loadNavBadges must not run on unauthenticated /reset-password",
            );
          },
        });

      const pageElement = await ResetPasswordPage({
        searchParams: Promise.resolve({ token: SYNTHETIC_RESET_TOKEN }),
      });
      const layoutElement = await RootLayout({ children: pageElement });
      expect(loadNavBadges).not.toHaveBeenCalled();

      const elements = collectElements(layoutElement);
      const resetFormNode = elements.find(
        (el) => el.type === uiWebClient.PortalResetPasswordForm,
      );
      expect(resetFormNode).toBeDefined();
      expect(resetFormNode?.props).toMatchObject({
        endpoint: "/api/auth/password-reset/confirm",
        token: SYNTHETIC_RESET_TOKEN,
        successHref: "/login",
      });

      const html = renderToStaticMarkup(layoutElement);
      expect(html).not.toContain('data-testid="fleet-portal-shell"');
      expect(html).toContain("Save password");
    }

    // 3. /login
    {
      const request = new NextRequest(
        `${ORIGIN}/login?redirect_uri=%2Fdashboard`,
      );
      const forwardedHeaders = forwardedRequestHeadersFromMiddleware(request);
      const { RootLayout, FleetLoginPage, loadNavBadges, uiWebClient } =
        createFleetHarness({
          pathname: request.nextUrl.pathname,
          requestHeaders: forwardedHeaders,
          locale: "zh",
          onLoadNavBadges: async () => {
            throw new Error(
              "loadNavBadges must not run on unauthenticated /login",
            );
          },
        });

      const pageElement = await FleetLoginPage({
        searchParams: Promise.resolve({ redirect_uri: "/dashboard" }),
      });
      const layoutElement = await RootLayout({ children: pageElement });
      expect(loadNavBadges).not.toHaveBeenCalled();

      const elements = collectElements(layoutElement);
      const loginFormNode = elements.find(
        (el) => el.type === uiWebClient.PortalPasswordLoginForm,
      );
      expect(loginFormNode).toBeDefined();
      expect(loginFormNode?.props).toMatchObject({
        endpoint: "/api/auth/password-login",
        forgotPasswordHref: "/forgot-password",
        successHref: "/dashboard",
      });

      const html = renderToStaticMarkup(layoutElement);
      expect(html).not.toContain('data-testid="fleet-portal-shell"');
      expect(html).toContain('href="/forgot-password"');
      expect(html).toContain('action="/api/auth/login"');
    }
  });

  it("preserves signed-in Fleet navigation badge loading and Host portal isolation on non-public routes", async () => {
    // 1. Signed-in Fleet route (/dashboard)
    const fleetRequest = new NextRequest(`${ORIGIN}/dashboard`, {
      headers: { cookie: "drts_session=synthetic-signed-in-session" },
    });
    const fleetHeaders = forwardedRequestHeadersFromMiddleware(fleetRequest);
    const fleetHarness = createFleetHarness({
      pathname: "/dashboard",
      requestHeaders: fleetHeaders,
      locale: "zh",
    });
    const fleetHtml = renderToStaticMarkup(
      await fleetHarness.RootLayout({ children: "Fleet dashboard content" }),
    );
    expect(fleetHarness.loadNavBadges).toHaveBeenCalledOnce();
    expect(fleetHtml).toContain('data-testid="fleet-portal-shell"');
    expect(fleetHtml).toContain('data-portal-scope="fleet"');
    expect(fleetHtml).toContain('href="/drivers"');
    expect(fleetHtml).toContain('data-testid="fleet-health-footer"');
    expect(fleetHtml).not.toContain('href="/host/vehicles"');

    // 2. Signed-in Host route (/host/vehicles)
    const hostRequest = new NextRequest(`${ORIGIN}/host/vehicles`, {
      headers: { cookie: "drts_session=synthetic-signed-in-session" },
    });
    const hostHeaders = forwardedRequestHeadersFromMiddleware(hostRequest);
    const hostHarness = createFleetHarness({
      pathname: "/host/vehicles",
      requestHeaders: hostHeaders,
      locale: "zh",
    });
    const hostHtml = renderToStaticMarkup(
      await hostHarness.RootLayout({ children: "Host vehicles content" }),
    );
    expect(hostHarness.loadNavBadges).not.toHaveBeenCalled();
    expect(hostHtml).toContain('data-testid="fleet-portal-shell"');
    expect(hostHtml).toContain('data-portal-scope="host"');
    expect(hostHtml).toContain('href="/host/vehicles"');
    expect(hostHtml).not.toContain('href="/drivers"');
    expect(hostHtml).not.toContain('data-testid="fleet-health-footer"');
  });
});
