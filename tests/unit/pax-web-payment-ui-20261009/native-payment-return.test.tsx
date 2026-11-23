// @vitest-environment jsdom
import React from "react";
import {
  render as renderComponent,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Script } from "node:vm";
import * as ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PassengerPaymentMethod } from "@drts/contracts";
import * as passengerClient from "../../../packages/passenger-client/src/index";
import {
  PassengerPaymentClient,
  type PassengerPaymentFieldsAvailability,
} from "../../../packages/passenger-client/src/index";
import * as uiTokens from "../../../packages/ui-tokens/src/index";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import * as paymentMethodsPageModule from "../../../apps/passenger-app-web/app/account/payment-methods/page";
import PaymentMethodsPage from "../../../apps/passenger-app-web/app/account/payment-methods/page";
import {
  NATIVE_PASSENGER_PAYMENT_RETURN_URI as WEB_NATIVE_PAYMENT_RETURN_URI,
  PaymentMethodsScreen,
} from "../../../apps/passenger-app-web/components/payment/payment-methods-screen";
import {
  NATIVE_PASSENGER_PAYMENT_RETURN_URI,
  redirectSystemPath,
} from "../../../apps/passenger-app/app/+native-intent";
import type { createNativePassengerPaymentBrowser as CreateNativePassengerPaymentBrowserFn } from "../../../apps/passenger-app/lib/platform/native-passenger-platform-ports";
import type { NativePaymentMethodsScreen as NativePaymentMethodsScreenComponent } from "../../../apps/passenger-app/components/payment/native-payment-methods-screen";
import {
  apiWireResponse,
  me,
} from "../pax-web-shell-20261009/api-wire-fixtures";

// SIM boundaries only: real BFF OrderResultURL handler, real Web PaymentMethodsPage,
// real createNativePassengerPaymentBrowser, real redirectSystemPath, and real
// NativePaymentMethodsScreen + PassengerPaymentClient execute together.
vi.mock(
  "@drts/passenger-client",
  async () => import("../../../packages/passenger-client/src/index"),
);
vi.mock(
  "@drts/ui-web",
  async () => import("../../../packages/ui-web/src/index"),
);

type CjsModule = { exports: Record<string, unknown> };
type CjsWrapper = (
  module: CjsModule,
  exports: Record<string, unknown>,
  require: (specifier: string) => unknown,
  filename: string,
  dirname: string,
) => void;

function loadNativeTsModule<T extends Record<string, unknown>>(
  relativePath: string,
): T {
  const filename = resolve(relativePath);
  const source = readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  const mod: CjsModule = { exports: {} };
  const bindings: Record<string, unknown> = {
    react: React,
    "react-native": {
      View: ({
        testID,
        children,
      }: {
        testID?: string;
        children?: React.ReactNode;
      }) =>
        React.createElement(
          "div",
          testID ? { "data-testid": testID } : undefined,
          children,
        ),
      ScrollView: ({
        testID,
        children,
      }: {
        testID?: string;
        children?: React.ReactNode;
      }) =>
        React.createElement(
          "div",
          testID ? { "data-testid": testID } : undefined,
          children,
        ),
      Text: ({
        testID,
        accessibilityRole,
        children,
      }: {
        testID?: string;
        accessibilityRole?: string;
        children?: React.ReactNode;
      }) =>
        React.createElement(
          "span",
          {
            ...(testID ? { "data-testid": testID } : {}),
            ...(accessibilityRole ? { role: accessibilityRole } : {}),
          },
          children,
        ),
      Pressable: ({
        testID,
        accessibilityLabel,
        disabled,
        onPress,
        children,
      }: {
        testID?: string;
        accessibilityLabel?: string;
        disabled?: boolean;
        onPress?: () => void | Promise<void>;
        children?: React.ReactNode;
      }) =>
        React.createElement(
          "button",
          {
            type: "button",
            ...(testID ? { "data-testid": testID } : {}),
            ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
            disabled: Boolean(disabled),
            onClick: () => {
              void onPress?.();
            },
          },
          children,
        ),
      ActivityIndicator: () =>
        React.createElement("span", { "data-testid": "activity-indicator" }),
      StyleSheet: { create: <S,>(styles: S) => styles },
      AppState: {
        currentState: "active",
        addEventListener: () => ({ remove: () => {} }),
      },
    },
    "expo-secure-store": {
      getItemAsync: async () => null,
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    },
    "expo-web-browser": {
      openAuthSessionAsync: async () => ({ type: "cancel" }),
    },
    "expo-linking": {
      openURL: async () => {},
    },
    "expo-modules-core": {
      uuid: { v4: () => "sim-native-payment-return-uuid" },
    },
    "@drts/passenger-client": passengerClient,
    "@drts/ui-tokens": uiTokens,
  };
  const wrapper = new Script(
    `(function(module,exports,require,__filename,__dirname){\n${transpiled.outputText}\n})`,
    { filename },
  ).runInThisContext() as CjsWrapper;
  wrapper(
    mod,
    mod.exports,
    (specifier: string) => {
      if (specifier in bindings) return bindings[specifier];
      throw new Error(`Unexpected native require: ${specifier}`);
    },
    filename,
    resolve(filename, ".."),
  );
  return mod.exports as T;
}

const {
  createNativePassengerPaymentBrowser,
  NATIVE_PASSENGER_PAYMENT_RETURN_URI: PORT_NATIVE_PAYMENT_RETURN_URI,
} = loadNativeTsModule<{
  createNativePassengerPaymentBrowser: typeof CreateNativePassengerPaymentBrowserFn;
  NATIVE_PASSENGER_PAYMENT_RETURN_URI: string;
}>("apps/passenger-app/lib/platform/native-passenger-platform-ports.ts");

const { NativePaymentMethodsScreen } = loadNativeTsModule<{
  NativePaymentMethodsScreen: typeof NativePaymentMethodsScreenComponent;
}>("apps/passenger-app/components/payment/native-payment-methods-screen.tsx");

const navigation = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");

function renderWeb(element: React.ReactElement) {
  return renderComponent(
    <AppRouterContext.Provider value={navigation}>
      {element}
    </AppRouterContext.Provider>,
  );
}

const WEB_ORIGIN = "https://ride.smarttransport.tw";
const API_ORIGIN = "https://api.example.test";
const OAUTH_CALLBACK_URI = "drtspassenger://auth/callback";
const STAGE_3DS_URL = "https://cc-stage.ecpay.com.tw/ThreeD/Verify";
const NATIVE_ACCESS_TOKEN = "sim-native-owner-access-token";
const OWNER_ACCOUNT_ID = "sim-native-owner-passenger-id";

const OWNER_CARD: PassengerPaymentMethod = {
  paymentMethodId: "pm_ecpay_verified_001",
  cardType: "VISA",
  last4: "4242",
  expiryMonth: "12",
  expiryYear: "2031",
  isDefault: true,
};

function wireMethod(m: PassengerPaymentMethod) {
  return {
    payment_method_id: m.paymentMethodId,
    card_type: m.cardType,
    last4: m.last4,
    expiry_month: m.expiryMonth,
    expiry_year: m.expiryYear,
    is_default: m.isDefault,
  };
}

async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_API_URL", API_ORIGIN);
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", OAUTH_CALLBACK_URI);
  navigation.push.mockReset();
  window.history.replaceState({}, "", "/account/payment-methods");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PAX-NATIVE-3DS-RETURN-TO-PAYMENT-METHODS-20261123: verified ECPay OrderResultURL -> Web return page -> Expo payment browser return -> owner payment-methods readback", () => {
  it("aligns fixed payment return URI drtspassenger://payment-methods/return across web return page, native payment browser adapter, and +native-intent while keeping OAuth callback distinct and preserving Next page export/prop contracts", () => {
    expect(Object.keys(paymentMethodsPageModule)).toEqual(["default"]);
    expect(PaymentMethodsPage.length).toBe(0);
    expect(NATIVE_PASSENGER_PAYMENT_RETURN_URI).toBe(
      "drtspassenger://payment-methods/return",
    );
    expect(PORT_NATIVE_PAYMENT_RETURN_URI).toBe(
      NATIVE_PASSENGER_PAYMENT_RETURN_URI,
    );
    expect(WEB_NATIVE_PAYMENT_RETURN_URI).toBe(
      NATIVE_PASSENGER_PAYMENT_RETURN_URI,
    );
    expect(NATIVE_PASSENGER_PAYMENT_RETURN_URI).not.toBe(OAUTH_CALLBACK_URI);

    for (const status of ["completed", "failed", "unknown"] as const) {
      const paymentReturnUrl = `${NATIVE_PASSENGER_PAYMENT_RETURN_URI}?ecpay_3ds=${status}`;
      expect(
        redirectSystemPath({ path: paymentReturnUrl, initial: false }),
      ).toBe("");
      expect(
        redirectSystemPath({ path: paymentReturnUrl, initial: true }),
      ).toBe(paymentReturnUrl);
    }
    expect(
      redirectSystemPath({
        path: `${OAUTH_CALLBACK_URI}?code=oauth-code&state=oauth-state`,
        initial: false,
      }),
    ).toBe("");
    expect(
      redirectSystemPath({
        path: "drtspassenger://other/path",
        initial: false,
      }),
    ).toBe("drtspassenger://other/path");
  });

  it.each([
    {
      upstreamStatus: "completed" as const,
      expectedQuery: "completed" as const,
      serverMaterialized: true,
    },
    {
      upstreamStatus: "completed" as const,
      expectedQuery: "completed" as const,
      serverMaterialized: false,
    },
    {
      upstreamStatus: "failed" as const,
      expectedQuery: "failed" as const,
      serverMaterialized: false,
    },
    {
      upstreamStatus: "pending" as const,
      expectedQuery: "unknown" as const,
      serverMaterialized: false,
    },
  ])(
    "cross-verifies mobile browser without Web cookie for OrderResultURL upstream=$upstreamStatus (query=$expectedQuery, serverMaterialized=$serverMaterialized)",
    async ({ upstreamStatus, expectedQuery, serverMaterialized }) => {
      const serverState = {
        methods: [] as PassengerPaymentMethod[],
      };
      const nativeCalls: Array<{
        method: string;
        url: string;
        authorization: string | null;
      }> = [];

      // 1. Real BFF POST /api/passenger-app/payment-methods/ecpay/order-result (HTML browser post from ECPay 3DS)
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (
            url ===
            `${API_ORIGIN}/api/passenger-app/payment-methods/ecpay/order-result`
          ) {
            expect(init?.method).toBe("POST");
            if (serverMaterialized) {
              serverState.methods = [OWNER_CARD];
            }
            return apiWireResponse({
              status: upstreamStatus,
              ...(serverMaterialized ? { method: wireMethod(OWNER_CARD) } : {}),
            });
          }
          // The BFF forwards GET /me. The account API rejects an anonymous session.
          if (url === `${API_ORIGIN}/api/passenger-app/me`) {
            expect(new Headers(init?.headers).get("authorization")).toBeNull();
            return Response.json(
              {
                error: {
                  code: "unauthorized",
                  message: "An active passenger session is required.",
                },
              },
              { status: 401 },
            );
          }
          if (url.startsWith("/api/passenger-app/")) {
            const verb = (init?.method ?? "GET") as "GET" | "POST";
            return bff[verb](
              new NextRequest(new URL(url, WEB_ORIGIN), {
                ...init,
                method: verb,
                headers: {
                  ...(init?.headers as Record<string, string>),
                  origin: WEB_ORIGIN,
                  // Explicitly no cookie header in mobile auth browser
                },
              }),
              {
                params: Promise.resolve({
                  path: url
                    .replace("/api/passenger-app/", "")
                    .split("/")
                    .map(decodeURIComponent),
                }),
              },
            );
          }
          throw new Error(`Unexpected web fetch: ${url}`);
        }),
      );

      const orderResultReq = new NextRequest(
        `${WEB_ORIGIN}/api/passenger-app/payment-methods/ecpay/order-result`,
        {
          method: "POST",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "content-type": "application/x-www-form-urlencoded",
            origin: "https://cc-stage.ecpay.com.tw",
            host: "ride.smarttransport.tw",
          },
          body: new URLSearchParams({
            ResultData: JSON.stringify({
              MerchantID: "SYNTHETIC_MID",
              Data: "SYNTHETIC_3DS_RESULT_CIPHER",
            }),
          }),
        },
      );
      const orderResultRes = await bff.POST(orderResultReq, {
        params: Promise.resolve({
          path: ["payment-methods", "ecpay", "order-result"],
        }),
      });
      expect(orderResultRes.status).toBe(303);
      const redirectLocation = orderResultRes.headers.get("location")!;
      expect(redirectLocation).toBe(
        `${WEB_ORIGIN}/account/payment-methods?ecpay_3ds=${expectedQuery}`,
      );

      // 2. Mobile system browser follows 303 redirect to /account/payment-methods?ecpay_3ds=... without Web login cookie
      const redirectedUrl = new URL(redirectLocation);
      window.history.replaceState(
        {},
        "",
        `${redirectedUrl.pathname}${redirectedUrl.search}`,
      );
      const webView = renderWeb(<PaymentMethodsPage />);

      const returnLink = await screen.findByRole("link", {
        name: "返回 App 付款方式",
      });
      const mobileNotice = {
        completed: /此瀏覽器無網頁登入狀態.+重新查詢同帳號的綁卡結果/,
        failed: /綁定失敗或發卡行拒絕.+回到 App 確認或重試/,
        unknown: /卡片綁定尚待確認.+回到 App 重新查詢付款方式/,
      };
      await screen.findByText(mobileNotice[expectedQuery]);
      const returnHref = returnLink.getAttribute("href")!;
      expect(returnHref).toBe(
        `${NATIVE_PASSENGER_PAYMENT_RETURN_URI}?ecpay_3ds=${expectedQuery}`,
      );
      // Mobile browser without Web cookie must NOT auto-redirect away to /login
      expect(navigation.push).not.toHaveBeenCalledWith("/login");
      // Return page must never fabricate a card or claim binding succeeded without server readback
      expect(screen.queryByText("VISA •••• 4242")).toBeNull();
      webView.unmount();

      // 3. Cross-verify with NativePaymentMethodsScreen + createNativePassengerPaymentBrowser
      let resolveAuthSession!: (value: {
        type: "success";
        url: string;
      }) => void;
      const browserCalls: Array<{ url: string; returnUri: string }> = [];
      const paymentBrowser = createNativePassengerPaymentBrowser({
        openAuthSessionAsync: vi.fn(
          (url: string, returnUri?: string | null) => {
            browserCalls.push({ url, returnUri: String(returnUri) });
            return new Promise((resolve) => {
              resolveAuthSession = resolve as typeof resolveAuthSession;
            });
          },
        ),
      });

      const nativeClient = new PassengerPaymentClient({
        baseUrl: API_ORIGIN,
        fetchFn: async (url, options = {}) => {
          const method = options.method ?? "GET";
          nativeCalls.push({
            method,
            url,
            authorization: `Bearer ${NATIVE_ACCESS_TOKEN}`,
          });
          if (
            method === "GET" &&
            url === `${API_ORIGIN}/api/passenger-app/payment-methods`
          ) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                data: {
                  methods:
                    nativeCalls.filter((c) => c.method === "GET").length === 1
                      ? []
                      : serverState.methods.map(wireMethod),
                },
              }),
            };
          }
          if (
            method === "POST" &&
            url === `${API_ORIGIN}/api/passenger-app/payment-methods`
          ) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                data: {
                  status: "action_required",
                  next_action_url: STAGE_3DS_URL,
                },
              }),
            };
          }
          throw new Error(`Unexpected native payment call: ${method} ${url}`);
        },
      });

      const fields: PassengerPaymentFieldsAvailability = {
        status: "ready",
        port: {
          kind: "hosted",
          collectCredential: vi.fn(async () => ({
            providerToken: "sim-native-ecpay-pay-token",
          })),
          dispose: vi.fn(),
        },
      };

      const nativeView = renderComponent(
        <NativePaymentMethodsScreen
          client={nativeClient}
          fields={fields}
          hostedFieldsView={React.createElement(
            "span",
            { "data-testid": "hosted-fields" },
            "ECPay",
          )}
          browser={paymentBrowser}
          onSupport={() => {}}
        />,
      );
      await flushMicrotasks();

      fireEvent.click(screen.getByTestId("payment-add"));
      await flushMicrotasks();
      fireEvent.click(screen.getByTestId("payment-bind"));
      await flushMicrotasks();

      expect(screen.queryByTestId("payment-pending")).not.toBeNull();
      expect(screen.queryByTestId("payment-verify")).not.toBeNull();
      expect(screen.queryByTestId("payment-success")).toBeNull();

      // Start 3DS verification in Expo payment browser
      fireEvent.click(screen.getByTestId("payment-verify"));
      await flushMicrotasks();

      expect(browserCalls).toEqual([
        {
          url: STAGE_3DS_URL,
          returnUri: NATIVE_PASSENGER_PAYMENT_RETURN_URI,
        },
      ]);
      // Confirm the Web page's rendered return link matches the exact scheme & path awaited by the native browser
      expect(new URL(returnHref).protocol).toBe(
        new URL(browserCalls[0]!.returnUri).protocol,
      );
      expect(returnHref.split(/[?#]/, 1)[0]).toBe(browserCalls[0]!.returnUri);
      expect(redirectSystemPath({ path: returnHref, initial: false })).toBe("");

      // User taps "返回 App 付款方式" in the mobile browser
      resolveAuthSession({ type: "success", url: returnHref });
      await flushMicrotasks();

      // Native screen must always perform an authenticated GET readback for the same owner
      const getReads = nativeCalls.filter((c) => c.method === "GET");
      expect(getReads).toHaveLength(2);
      expect(getReads[1]?.authorization).toBe(`Bearer ${NATIVE_ACCESS_TOKEN}`);

      if (serverMaterialized) {
        expect(
          screen.queryByTestId(`payment-method-${OWNER_CARD.paymentMethodId}`),
        ).not.toBeNull();
        expect(
          screen.getByTestId(`payment-label-${OWNER_CARD.paymentMethodId}`)
            .textContent,
        ).toBe("VISA •••• 4242");
        expect(screen.queryByTestId("payment-success")).not.toBeNull();
        expect(screen.queryByTestId("payment-pending")).toBeNull();
      } else {
        // Even when query says ecpay_3ds=completed, missing server readback method must NOT display success
        expect(screen.queryByTestId("payment-success")).toBeNull();
        expect(screen.queryByTestId("payment-pending")).not.toBeNull();
        expect(screen.getByTestId("payment-error").textContent).toContain(
          "仍待確認",
        );

        // Subsequent manual refresh resolves once server materializes the owner's card
        serverState.methods = [OWNER_CARD];
        fireEvent.click(screen.getByTestId("payment-refresh"));
        await flushMicrotasks();
        expect(
          screen.queryByTestId(`payment-method-${OWNER_CARD.paymentMethodId}`),
        ).not.toBeNull();
        expect(screen.queryByTestId("payment-success")).not.toBeNull();
        expect(screen.queryByTestId("payment-pending")).toBeNull();
      }
      // Never sends a second bind POST
      expect(nativeCalls.filter((c) => c.method === "POST")).toHaveLength(1);
      nativeView.unmount();
    },
  );

  it("preserves normal Web passenger readback on /account/payment-methods?ecpay_3ds=completed|failed|unknown when Web session cookie is active", async () => {
    let webServerMethods: PassengerPaymentMethod[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/passenger-app/")) {
          const verb = (init?.method ?? "GET") as "GET" | "POST";
          return bff[verb](
            new NextRequest(new URL(url, WEB_ORIGIN), {
              ...init,
              method: verb,
              headers: {
                ...(init?.headers as Record<string, string>),
                cookie: "pax_session=web_authenticated_session",
                origin: WEB_ORIGIN,
              },
            }),
            {
              params: Promise.resolve({
                path: url
                  .replace("/api/passenger-app/", "")
                  .split("/")
                  .map(decodeURIComponent),
              }),
            },
          );
        }
        const path = new URL(url).pathname;
        if (path.endsWith("/me")) {
          return apiWireResponse({
            ...me,
            account: { ...me.account, drtsPassengerId: OWNER_ACCOUNT_ID },
          });
        }
        if (path.endsWith("/payment-methods")) {
          return apiWireResponse({
            methods: webServerMethods.map(wireMethod),
          });
        }
        throw new Error(`Unexpected upstream call: ${url}`);
      }),
    );

    // 1. Web user returns with ?ecpay_3ds=completed but server has no card -> shows empty list, never fake success
    window.history.replaceState(
      {},
      "",
      "/account/payment-methods?ecpay_3ds=completed",
    );
    const view1 = renderWeb(<PaymentMethodsPage />);
    await screen.findByText("尚未設定付款卡片");
    await screen.findByText(/由下方信用卡清單確認此帳號的實際綁卡結果/);
    expect(screen.queryByText("VISA •••• 4242")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "返回 App 付款方式" })
        .getAttribute("href"),
    ).toBe("drtspassenger://payment-methods/return?ecpay_3ds=completed");
    view1.unmount();

    // 2. Web user returns with ?ecpay_3ds=completed and server returns bound card -> displays actual owned card
    webServerMethods = [OWNER_CARD];
    const view2 = renderWeb(<PaymentMethodsPage />);
    await screen.findByText("VISA •••• 4242");
    expect(screen.getByText("預設付款卡片")).toBeTruthy();
    view2.unmount();

    // 3. Web user returns with ?ecpay_3ds=failed -> shows binding failure notice and actual server list
    window.history.replaceState(
      {},
      "",
      "/account/payment-methods?ecpay_3ds=failed",
    );
    const view3 = renderWeb(<PaymentMethodsPage />);
    await screen.findByText("綁定失敗或發卡行拒絕，請改用其他卡片。");
    await screen.findByText("VISA •••• 4242");
    view3.unmount();

    // 4. Web user returns with ?ecpay_3ds=unknown -> shows pending notice and actual server list
    window.history.replaceState(
      {},
      "",
      "/account/payment-methods?ecpay_3ds=unknown",
    );
    const view4 = renderWeb(<PaymentMethodsPage />);
    await screen.findByText("卡片綁定尚待確認，未收到完成結果；請勿重複綁定。");
    await screen.findByText("VISA •••• 4242");
    view4.unmount();

    // 5. Regular PaymentMethodsScreen component supports direct ecpay3dsReturn status injection without Next page props
    window.history.replaceState({}, "", "/account/payment-methods");
    const view5 = renderWeb(<PaymentMethodsScreen ecpay3dsReturn="failed" />);
    await screen.findByText("綁定失敗或發卡行拒絕，請改用其他卡片。");
    expect(
      screen
        .getByRole("link", { name: "返回 App 付款方式" })
        .getAttribute("href"),
    ).toBe("drtspassenger://payment-methods/return?ecpay_3ds=failed");
    view5.unmount();
  });
});
