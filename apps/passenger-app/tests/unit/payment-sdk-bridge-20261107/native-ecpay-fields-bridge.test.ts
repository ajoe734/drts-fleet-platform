import { createContext, runInContext, type Context } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type {
  PassengerPaymentBindingSession,
  PassengerPaymentFieldsAvailability,
} from "@drts/passenger-client";
import {
  createNativeEcpayFieldsBridge,
  createNativeEcpayHostedFieldsHtml,
  type NativeEcpayFieldsBridge,
} from "../../../lib/payment/native-ecpay-fields-bridge";

type ServerType = PassengerPaymentBindingSession["serverType"];
interface SdkTokenResult {
  BindCardPayToken?: string;
  MerchantTradeNo?: string;
  RtnCode?: string | number;
  RtnMsg?: string;
}
type SdkStatusCallback = (message?: string) => void;
type SdkTokenCallback = (
  result?: SdkTokenResult,
  errorMessage?: string,
) => void;
interface ExternalScript {
  src: string;
  async: boolean;
  onload?: () => void;
  onerror?: () => void;
}
interface BridgeMessage {
  channel: string;
  type: string;
  requestId?: string;
  providerToken?: string;
}
async function flush() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}
function take<T>(callbacks: T[], name: string): T {
  const callback = callbacks.shift();
  if (callback === undefined) throw new Error("missing external " + name);
  return callback;
}
function sdk(language: string | undefined) {
  const initializeCallbacks: SdkStatusCallback[] = [];
  const addCallbacks: SdkStatusCallback[] = [];
  const tokenCallbacks: SdkTokenCallback[] = [];
  return {
    initializeCallbacks,
    addCallbacks,
    tokenCallbacks,
    port: {
      ...(language === undefined ? {} : { Language: { zhTW: language } }),
      initialize: vi.fn(
        (
          _server: ServerType,
          _loading: number,
          callback: SdkStatusCallback,
        ) => {
          initializeCallbacks.push(callback);
        },
      ),
      addBindingCard: vi.fn(
        (
          _merchantToken: string,
          _language: string,
          callback: SdkStatusCallback,
        ) => {
          addCallbacks.push(callback);
        },
      ),
      getBindCardPayToken: vi.fn((callback: SdkTokenCallback) => {
        tokenCallbacks.push(callback);
      }),
    },
  };
}
function fixture(
  serverType: ServerType,
  language: string | null = "sdk-zh-TW",
) {
  const session: PassengerPaymentBindingSession = {
    provider: "ecpay",
    merchantToken: "merchant_" + serverType + "_opaque-session",
    tokenExpireDate: "2026/11/07 08:30:00",
    serverType,
  };
  const external = sdk(language ?? undefined);
  const scripts: ExternalScript[] = [];
  const messages: BridgeMessage[] = [];
  const availability: PassengerPaymentFieldsAvailability[] = [];
  const injected: string[] = [];
  const onError = vi.fn();
  const window = {
    ECPay: external.port,
    ReactNativeWebView: {
      postMessage(data: string) {
        messages.push(JSON.parse(data) as BridgeMessage);
        bridge.handleMessage(data);
      },
    },
  };
  const document = {
    createElement: vi.fn((tag: string): ExternalScript => {
      expect(tag).toBe("script");
      return { src: "", async: false };
    }),
    head: {
      appendChild: vi.fn((script: ExternalScript) => {
        scripts.push(script);
      }),
    },
  };
  const context: Context = createContext({ window, document });
  const bridge: NativeEcpayFieldsBridge = createNativeEcpayFieldsBridge({
    sendJavaScript(script) {
      injected.push(script);
      runInContext(script, context, { timeout: 1000 });
    },
    onReady(fields) {
      availability.push(fields);
    },
    onError,
  });
  const html = createNativeEcpayHostedFieldsHtml(session);
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  expect(inlineScripts).toHaveLength(1);
  const executable = inlineScripts[0]?.[1];
  if (!executable) throw new Error("missing actual hosted-fields JavaScript");
  runInContext(executable, context, { timeout: 1000 });
  return {
    session,
    external,
    scripts,
    messages,
    availability,
    injected,
    onError,
    bridge,
    document,
    run(script: string) {
      return runInContext(script, context, { timeout: 1000 });
    },
    load(index: number, fail = false) {
      const script = scripts[index];
      if (!script) throw new Error("missing external script " + index);
      const callback = fail ? script.onerror : script.onload;
      if (!callback) throw new Error("missing external script callback");
      callback();
    },
    initialize(message?: string) {
      take(external.initializeCallbacks, "initialize callback")(message);
    },
    addCard(message?: string) {
      take(external.addCallbacks, "addBindingCard callback")(message);
    },
    token(result?: SdkTokenResult, errorMessage?: string) {
      take(external.tokenCallbacks, "getBindCardPayToken callback")(
        result,
        errorMessage,
      );
    },
  };
}
type Fixture = ReturnType<typeof fixture>;
async function reachInitialize(f: Fixture) {
  expect(f.scripts.map((script) => script.src)).toEqual([
    "https://code.jquery.com/jquery-3.5.1.min.js",
  ]);
  expect(f.external.port.initialize).not.toHaveBeenCalled();
  f.load(0);
  await flush();
  expect(f.scripts.map((script) => script.src)).toEqual([
    "https://code.jquery.com/jquery-3.5.1.min.js",
    f.session.serverType === "Stage"
      ? "https://ecpg-stage.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116"
      : "https://ecpg.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
  ]);
  expect(f.external.port.initialize).not.toHaveBeenCalled();
  f.load(1);
  await flush();
  expect(f.external.port.initialize).toHaveBeenCalledExactlyOnceWith(
    f.session.serverType,
    1,
    expect.any(Function),
  );
  expect(f.external.port.addBindingCard).not.toHaveBeenCalled();
  expect(f.availability).toEqual([]);
}
async function ready(f: Fixture, expectedLanguage = "sdk-zh-TW") {
  await reachInitialize(f);
  f.initialize();
  await flush();
  expect(f.external.port.addBindingCard).toHaveBeenCalledExactlyOnceWith(
    f.session.merchantToken,
    expectedLanguage,
    expect.any(Function),
  );
  expect(f.messages).toEqual([]);
  expect(f.availability).toEqual([]);
  f.addCard();
  await flush();
  expect(f.availability).toEqual([{ status: "ready", port: f.bridge.port }]);
  expect(f.messages.map((message) => message.type)).toEqual(["ready"]);
  expect(f.external.port.getBindCardPayToken).not.toHaveBeenCalled();
  expect(f.onError).not.toHaveBeenCalled();
}
async function completeActualFlow(serverType: ServerType, language?: string) {
  const f = fixture(serverType, language ?? null);
  await expect(f.bridge.port.collectCredential()).rejects.toThrow(
    "ecpay_fields_unavailable",
  );
  expect(f.injected).toEqual([]);
  await ready(f, language ?? "zh-TW");
  const collection = f.bridge.port.collectCredential();
  expect(f.injected).toHaveLength(1);
  expect(f.external.port.getBindCardPayToken).toHaveBeenCalledExactlyOnceWith(
    expect.any(Function),
  );
  expect(f.messages.some((message) => message.type === "credential")).toBe(
    false,
  );
  const providerToken = "opaque_" + serverType + ".bind-token:0123456789";
  f.token({
    RtnCode: "1",
    BindCardPayToken: " " + providerToken + " ",
    MerchantTradeNo: "external-not-part-of-native-command",
  });
  await expect(collection).resolves.toEqual({ providerToken });
  const credential = f.messages.find(
    (message) => message.type === "credential",
  );
  expect(credential).toEqual({
    type: "credential",
    requestId: "1",
    providerToken,
    channel: "drts-native-ecpay-fields",
  });
  expect(f.availability.at(-1)).toEqual({
    status: "ready",
    port: f.bridge.port,
  });
  expect(f.onError).not.toHaveBeenCalled();
  f.bridge.dispose();
}

describe("actual native ECPay HTML JavaScript and native bridge with external SDK/DOM boundaries injected", () => {
  it("executes Stage script loading, SDK initialization and card collection before returning only the opaque credential", async () => {
    await completeActualFlow("Stage", "sdk-zh-TW");
  });

  it("executes Prod initialization with the SDK language fallback and the same real credential round trip", async () => {
    await completeActualFlow("Prod");
  });

  it("keeps failed script loading or SDK initialization/card mounting unavailable without accepting a late ready message", async () => {
    for (const boundary of [
      "jquery",
      "sdk",
      "initialize",
      "add-card",
    ] as const) {
      const f = fixture("Stage");
      if (boundary === "jquery") f.load(0, true);
      else if (boundary === "sdk") {
        f.load(0);
        await flush();
        f.load(1, true);
      } else {
        await reachInitialize(f);
        f.initialize(
          boundary === "initialize" ? "external SDK failure" : undefined,
        );
        await flush();
        if (boundary === "add-card") f.addCard("external card UI failure");
      }
      await flush();
      expect(f.messages.map((message) => message.type)).toEqual(["error"]);
      expect(f.availability).toEqual([{ status: "unavailable" }]);
      expect(f.onError).toHaveBeenCalledTimes(1);
      f.bridge.handleMessage(
        JSON.stringify({ type: "ready", channel: "drts-native-ecpay-fields" }),
      );
      expect(f.availability).toEqual([{ status: "unavailable" }]);
      await expect(f.bridge.port.collectCredential()).rejects.toThrow(
        "ecpay_fields_unavailable",
      );
      expect(f.external.port.getBindCardPayToken).not.toHaveBeenCalled();
      f.bridge.dispose();
    }
  });

  it("rejects SDK cancellation, collection errors and a missing token without returning a binding credential", async () => {
    for (const outcome of [
      "cancelled",
      "sdk-error",
      "missing-token",
      "throw",
    ] as const) {
      const f = fixture("Stage");
      await ready(f);
      if (outcome === "throw")
        f.external.port.getBindCardPayToken.mockImplementationOnce(() => {
          throw new Error("external SDK exception");
        });
      const collection = f.bridge.port.collectCredential();
      const rejected = expect(collection).rejects.toThrow(
        "ecpay_fields_unavailable",
      );
      if (outcome === "cancelled") f.token({ RtnCode: 0, RtnMsg: "cancelled" });
      else if (outcome === "sdk-error")
        f.token(undefined, "external token failure");
      else if (outcome === "missing-token") f.token({ RtnCode: 1 });
      await rejected;
      expect(f.messages.some((message) => message.type === "credential")).toBe(
        false,
      );
      expect(f.availability.at(-1)).toEqual({ status: "unavailable" });
      expect(f.onError).toHaveBeenCalledTimes(1);
      await expect(f.bridge.port.collectCredential()).rejects.toThrow(
        "ecpay_fields_unavailable",
      );
      expect(f.external.port.getBindCardPayToken).toHaveBeenCalledTimes(1);
      f.bridge.dispose();
    }
  });

  it("disposes native pending collection and ignores late SDK messages while HTML disposal also suppresses detached initialization", async () => {
    const f = fixture("Stage");
    await ready(f);
    const collection = f.bridge.port.collectCredential();
    const rejected = expect(collection).rejects.toThrow(
      "ecpay_fields_disposed",
    );
    f.bridge.port.dispose();
    await rejected;
    const afterDispose = f.availability.slice();
    // The detached page can still post; the disposed actual native consumer must ignore it.
    f.token({
      RtnCode: 1,
      BindCardPayToken: "late_detached_provider-token_0123456789",
    });
    f.bridge.handleMessage(
      JSON.stringify({ type: "ready", channel: "drts-native-ecpay-fields" }),
    );
    expect(f.messages.some((message) => message.type === "credential")).toBe(
      true,
    );
    expect(f.availability).toEqual(afterDispose);
    expect(f.availability.at(-1)).toEqual({ status: "unavailable" });
    expect(f.onError).not.toHaveBeenCalled();
    await expect(f.bridge.port.collectCredential()).rejects.toThrow(
      "ecpay_fields_disposed",
    );

    const beforeReady = fixture("Stage");
    await reachInitialize(beforeReady);
    beforeReady.run("window.__drtsEcpayFields.dispose();");
    beforeReady.initialize();
    await flush();
    expect(beforeReady.external.port.addBindingCard).not.toHaveBeenCalled();
    expect(beforeReady.messages).toEqual([]);
    expect(beforeReady.availability).toEqual([]);
    beforeReady.bridge.dispose();

    const duringCollection = fixture("Stage");
    await ready(duringCollection);
    const detached = duringCollection.bridge.port.collectCredential();
    const detachedRejected = expect(detached).rejects.toThrow(
      "ecpay_fields_disposed",
    );
    duringCollection.run("window.__drtsEcpayFields.dispose();");
    duringCollection.bridge.dispose();
    await detachedRejected;
    duringCollection.token({
      RtnCode: 1,
      BindCardPayToken: "html_disposed_provider-token_0123456789",
    });
    expect(duringCollection.messages.map((message) => message.type)).toEqual([
      "ready",
    ]);
    expect(duringCollection.availability.at(-1)).toEqual({
      status: "unavailable",
    });
  });

  it("ignores a previous request credential/error and blocks concurrent collection until the current SDK callback resolves", async () => {
    const f = fixture("Stage");
    await ready(f);
    const first = f.bridge.port.collectCredential();
    f.token({
      RtnCode: 1,
      BindCardPayToken: "first_provider-token_0123456789",
    });
    await expect(first).resolves.toEqual({
      providerToken: "first_provider-token_0123456789",
    });
    const oldMessage = f.messages.find(
      (message) => message.type === "credential",
    );
    if (!oldMessage)
      throw new Error("missing first actual SDK credential message");
    const current = f.bridge.port.collectCredential();
    let settled = false;
    void current.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    f.bridge.handleMessage(JSON.stringify(oldMessage));
    f.bridge.handleMessage(JSON.stringify({ ...oldMessage, type: "error" }));
    await flush();
    expect(settled).toBe(false);
    expect(f.onError).not.toHaveBeenCalled();
    await expect(f.bridge.port.collectCredential()).rejects.toThrow(
      "ecpay_fields_busy",
    );
    expect(f.injected).toHaveLength(2);
    expect(f.external.port.getBindCardPayToken).toHaveBeenCalledTimes(2);
    f.token({
      RtnCode: 1,
      BindCardPayToken: "second_provider-token_0123456789",
    });
    await expect(current).resolves.toEqual({
      providerToken: "second_provider-token_0123456789",
    });
    expect(settled).toBe(true);
    expect(f.availability).toEqual([{ status: "ready", port: f.bridge.port }]);
    expect(f.onError).not.toHaveBeenCalled();
    f.bridge.dispose();
  });
});
