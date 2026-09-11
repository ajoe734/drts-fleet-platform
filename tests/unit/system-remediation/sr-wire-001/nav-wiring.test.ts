import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createUiModuleLoader as loader } from "./ui-module-loader";

type NavItem = {
  key?: string;
  href?: string;
  label?: string;
  divider?: string;
};
type Element = { type: unknown; props: Record<string, unknown> };
const fleetRoot = resolve("apps/fleet-partner-portal-web");
const realRequire = createRequire(resolve(fleetRoot, "package.json"));
const react = realRequire("react") as {
  createElement: (...args: unknown[]) => Element;
};
const { renderToStaticMarkup } = realRequire("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};

const nav = loader(fleetRoot)<{
  buildFleetPortalNav: (locale: string) => NavItem[];
  buildHostPortalNav: (locale: string) => NavItem[];
  isHostPortalPath: (path: string) => boolean;
}>(resolve(fleetRoot, "lib/fleet-portal-nav.ts"));
const opsNav = loader(resolve("apps/ops-console-web"))<{
  buildOpsShellNav: (locale: string, roles: string[]) => NavItem[];
}>(resolve("apps/ops-console-web/lib/ops-shell-nav.ts"));

function fleetHarness(
  pathname: string,
  requestHeaders = new Headers(),
  locale = "zh",
) {
  const badgeRead = vi.fn(async () => ({ drivers: 37 }));
  const canvas = (props: Record<string, unknown>) =>
    react.createElement(
      "section",
      null,
      react.createElement("strong", null, props.brandLabel),
      ...(props.nav as NavItem[])
        .filter((item) => item.href)
        .map((item) =>
          react.createElement(
            "a",
            { key: item.key, href: item.href },
            item.label,
          ),
        ),
      props.sidebarFooter,
      props.children,
    );
  const load = loader(fleetRoot, {
    "next/navigation": { usePathname: () => pathname },
    "next/headers": { headers: async () => requestHeaders },
    "@drts/ui-web": {
      CanvasShell: canvas,
      normalizeServerRuntimeEnv: () => "test",
    },
    "@/lib/fleet-portal-theme": { buildFleetTheme: () => ({}) },
    "@/lib/i18n": {
      useTranslation: () => ({ locale }),
      LanguageProvider: (props: Record<string, unknown>) => props.children,
    },
    "@/lib/server-locale": { getServerLocale: async () => locale },
    "@/lib/fleet-portal-data.server": { loadNavBadges: badgeRead },
    "@/lib/runtime-config": { RuntimeConfigScript: () => null },
    "@/components/fleet-portal-health-footer": {
      FleetPortalHealthFooter: () =>
        react.createElement("footer", null, "Fleet health"),
    },
  });
  return { load, badgeRead };
}

function settingsHarness(provisioned = true) {
  const appRoot = resolve("apps/driver-app");
  const push = vi.fn();
  let stateIndex = 0;
  const mocks: Record<string, unknown> = {
    react: {
      ...realRequire("react"),
      useEffect: () => {},
      useState: (initial: unknown) => [
        stateIndex++ === 0 ? false : initial,
        () => {},
      ],
    },
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      Switch: "Switch",
      ActivityIndicator: "ActivityIndicator",
      Alert: { alert: () => {} },
      StyleSheet: { create: (styles: unknown) => styles },
    },
    "expo-router": { useRouter: () => ({ push }), Redirect: "Redirect" },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "@/lib/api-client": {
      isDriverIdentityProvisioned: () => provisioned,
      getDriverId: () => "unit-driver",
      getProvisionedSession: () => ({
        deviceId: "unit-device",
        bindingId: "unit-binding",
      }),
    },
    "@/lib/driver-identity-routing": { resetDriverAppToOnboarding: () => {} },
    "@/components/platform-binding": { PlatformBinding: "PlatformBinding" },
    "@/components/ui/tokens": {
      Tokens: {
        colors: {},
        fonts: {},
        radius: {},
        shadows: {},
        spacing: {},
        type: {},
      },
    },
  };
  for (const name of [
    "ActionButton",
    "AppScreen",
    "BottomActionBar",
    "ErrorBanner",
    "AuthorityBanner",
    "FormField",
    "PageHeader",
    "StatusChip",
  ]) {
    mocks[`@/components/ui/${name}`] = { [name]: name };
  }
  const component = loader(
    appRoot,
    mocks,
  )<{ default: () => unknown }>(resolve(appRoot, "app/settings.tsx"));
  const elements: Element[] = [];
  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object" || !("props" in node)) return;
    const element = node as Element;
    if (typeof element.type === "function") {
      visit(element.type(element.props));
      return;
    }
    elements.push(element);
    visit(element.props.children);
  }
  visit(component.default());
  return { elements, push };
}

describe("SR-WIRE-001: active navigation and actor boundaries", () => {
  it.each(["zh", "en"])(
    "exposes translated leave review and distinct Host nav (%s)",
    (locale) => {
      const leave = opsNav
        .buildOpsShellNav(locale, [])
        .find((item) => item.key === "leave");
      expect(leave).toMatchObject({
        href: "/leave",
        label: locale === "zh" ? "請假審核" : "Leave Requests",
      });
      expect(nav.buildHostPortalNav(locale)).toEqual([
        {
          key: "host-vehicles",
          href: "/host/vehicles",
          icon: "vehicles",
          label: locale === "zh" ? "自有車輛" : "My Vehicles",
        },
      ]);
      expect(
        nav
          .buildFleetPortalNav(locale)
          .some((item) => item.key?.startsWith("host")),
      ).toBe(false);
    },
  );

  it.each(["/host", "/host/vehicles", "/host/vehicles/unit/trips"])(
    "renders Host-only navigation on %s",
    (pathname) => {
      const { load } = fleetHarness(pathname);
      const { FleetPortalShell } = load<{
        FleetPortalShell: (props: Record<string, unknown>) => unknown;
      }>(resolve(fleetRoot, "components/fleet-portal-shell.tsx"));
      const html = renderToStaticMarkup(
        react.createElement(FleetPortalShell, {
          fleetNav: nav.buildFleetPortalNav("zh"),
          fleetBrandLabel: "Fleet",
          fleetBrandSubLabel: "Fleet admin",
          fleetBrandMark: "FLP",
          searchPlaceholder: "Search",
          children: "Host content",
        }),
      );
      expect(html).toContain('href="/host/vehicles"');
      expect(html).toContain('data-portal-scope="host"');
      expect(html).not.toContain('href="/drivers"');
      expect(html).not.toContain('href="/supply"');
      expect(html).not.toContain("Fleet health");
    },
  );

  it.each(["/hostname", "/hostile", "/dashboard"])(
    "does not classify %s as a Host route",
    (path) => {
      expect(nav.isHostPortalPath(path)).toBe(false);
    },
  );

  it.each([
    ["x-drts-fleet-pathname", "/host/vehicles"],
    ["x-host-partner-id", "unit-owner"],
  ])(
    "root layout avoids fleet-admin badge requests for %s",
    async (header, value) => {
      vi.stubEnv("DRTS_HOST_PARTNER_ID", "");
      try {
        const { load, badgeRead } = fleetHarness(
          "/host/vehicles",
          new Headers({ [header!]: value! }),
        );
        const layout = load<{
          default: (props: { children: string }) => Promise<unknown>;
        }>(resolve(fleetRoot, "app/layout.tsx"));
        const html = renderToStaticMarkup(
          await layout.default({ children: "Host page" }),
        );
        expect(badgeRead).not.toHaveBeenCalled();
        expect(html).not.toContain('href="/drivers"');
        expect(html).toContain('href="/host/vehicles"');
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("retains fleet-admin navigation and badge retrieval for fleet requests", async () => {
    vi.stubEnv("DRTS_HOST_PARTNER_ID", "");
    try {
      const { load, badgeRead } = fleetHarness(
        "/dashboard",
        new Headers({ "x-drts-fleet-pathname": "/dashboard" }),
      );
      const layout = load<{
        default: (props: { children: string }) => Promise<unknown>;
      }>(resolve(fleetRoot, "app/layout.tsx"));
      const html = renderToStaticMarkup(
        await layout.default({ children: "Fleet page" }),
      );
      expect(badgeRead).toHaveBeenCalledOnce();
      expect(html).toContain('href="/drivers"');
      expect(html).toContain("Fleet health");
      expect(html).not.toContain('href="/host/vehicles"');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("overwrites a forged route header with the real Host request path", () => {
    const next = vi.fn((options: unknown) => ({
      headers: new Headers(),
      options,
    }));
    const { middleware } = loader(fleetRoot, {
      "next/server": { NextResponse: { next } },
    })<{
      middleware: (request: unknown) => unknown;
    }>(resolve(fleetRoot, "middleware.ts"));
    middleware({
      nextUrl: { pathname: "/host/vehicles" },
      method: "GET",
      cookies: { get: () => undefined },
      headers: new Headers({ "x-drts-fleet-pathname": "/dashboard" }),
    });
    const argument = next.mock.calls[0]?.[0] as unknown as {
      request: { headers: Headers };
    };
    expect(argument.request.headers.get("x-drts-fleet-pathname")).toBe(
      "/host/vehicles",
    );
  });

  it("real settings buttons invoke the leave and academy routes", () => {
    const { elements, push } = settingsHarness();
    for (const [testID, path] of [
      ["driver-settings-leave", "/leave"],
      ["driver-settings-academy", "/academy"],
    ]) {
      const button = elements.find(
        (element) => element.props.testID === testID,
      );
      expect(button?.type).toBe("Pressable");
      expect(button?.props.accessibilityRole).toBe("button");
      (button?.props.onPress as () => void)();
      expect(push).toHaveBeenLastCalledWith(path);
    }
  });

  it("keeps workforce actions behind existing driver provisioning", () => {
    const { elements, push } = settingsHarness(false);
    expect(
      elements.find((element) => element.type === "Redirect"),
    ).toMatchObject({
      type: "Redirect",
      props: { href: "/onboarding" },
    });
    expect(
      elements.some(
        (element) => element.props.testID === "driver-settings-leave",
      ),
    ).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves existing navigation and hidden leaf tab registration", () => {
    const source = readFileSync(
      resolve("apps/driver-app/app/_layout.tsx"),
      "utf8",
    );
    for (const name of [
      "index",
      "jobs",
      "trip",
      "platform-presence",
      "settings",
      "onboarding",
      "earnings",
      "shift",
      "leave",
      "academy",
      "sos",
      "incident",
      "safety-operator",
    ]) {
      expect(source).toContain(`name="${name}"`);
    }
  });
});
