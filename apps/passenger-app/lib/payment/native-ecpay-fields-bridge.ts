import type { BindPaymentMethodCommand } from "@drts/contracts";
import type {
  PassengerPaymentBindingSession,
  PassengerPaymentFieldsAvailability,
  PassengerPaymentFieldsPort,
} from "@drts/passenger-client";

// Same script versions and SDK protocol as the existing Web hosted fields.
export const NATIVE_ECPAY_JQUERY_URL =
  "https://code.jquery.com/jquery-3.5.1.min.js";
export const NATIVE_ECPAY_WEB_SDK_URLS = {
  Stage:
    "https://ecpg-stage.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
  Prod: "https://ecpg.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
} as const;
export const NATIVE_ECPAY_FIELDS_CHANNEL = "drts-native-ecpay-fields";

function opaqueCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 2048 &&
    /^[A-Za-z0-9_.:-]+$/.test(value) &&
    !/^[0-9 -]+$/.test(value)
  );
}

export interface NativeEcpayFieldsBridge {
  readonly port: PassengerPaymentFieldsPort;
  handleMessage(data: string): void;
  fail(): void;
  dispose(): void;
}

/** Owns the native side of one mounted SDK instance, not an HTTP transport. */
export function createNativeEcpayFieldsBridge(options: {
  sendJavaScript(script: string): void;
  onReady(fields: PassengerPaymentFieldsAvailability): void;
  onError(): void;
}): NativeEcpayFieldsBridge {
  let disposed = false;
  let failed = false;
  let ready = false;
  let sequence = 0;
  let pending: {
    requestId: string;
    resolve(command: BindPaymentMethodCommand): void;
    reject(reason: Error): void;
  } | null = null;

  function rejectPending(message: string) {
    const current = pending;
    pending = null;
    current?.reject(new Error(message));
  }
  function fail() {
    if (disposed || failed) return;
    failed = true;
    ready = false;
    rejectPending("ecpay_fields_unavailable");
    options.onReady({ status: "unavailable" });
    options.onError();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    rejectPending("ecpay_fields_disposed");
    options.onReady({ status: "unavailable" });
  }
  const port: PassengerPaymentFieldsPort = {
    kind: "hosted",
    async collectCredential() {
      if (disposed) throw new Error("ecpay_fields_disposed");
      if (failed || !ready) throw new Error("ecpay_fields_unavailable");
      if (pending) throw new Error("ecpay_fields_busy");
      const requestId = String(++sequence);
      return new Promise<BindPaymentMethodCommand>((resolve, reject) => {
        pending = { requestId, resolve, reject };
        try {
          options.sendJavaScript(
            `window.__drtsEcpayFields.collect(${JSON.stringify(requestId)});true;`,
          );
        } catch {
          fail();
        }
      });
    },
    dispose,
  };
  return {
    port,
    fail,
    dispose,
    handleMessage(data) {
      if (disposed || failed) return;
      let message: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(data);
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        message = value as Record<string, unknown>;
      } catch {
        return;
      }
      if (message.channel !== NATIVE_ECPAY_FIELDS_CHANNEL) return;
      if (message.type === "ready") {
        if (!ready) {
          ready = true;
          options.onReady({ status: "ready", port });
        }
        return;
      }
      if (message.type === "error") {
        if (
          message.requestId !== undefined &&
          message.requestId !== pending?.requestId
        )
          return;
        fail();
        return;
      }
      if (
        message.type !== "credential" ||
        !pending ||
        message.requestId !== pending.requestId
      )
        return;
      const providerToken =
        typeof message.providerToken === "string"
          ? message.providerToken.trim()
          : "";
      if (!opaqueCredential(providerToken)) {
        fail();
        return;
      }
      const current = pending;
      pending = null;
      current.resolve({ providerToken });
    },
  };
}

function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The provider owns the card UI; native receives only its one-use credential. */
export function createNativeEcpayHostedFieldsHtml(
  session: PassengerPaymentBindingSession,
): string {
  const configuration = inlineJson({
    merchantToken: session.merchantToken,
    serverType: session.serverType,
    jqueryUrl: NATIVE_ECPAY_JQUERY_URL,
    sdkUrl: NATIVE_ECPAY_WEB_SDK_URLS[session.serverType],
    channel: NATIVE_ECPAY_FIELDS_CHANNEL,
  });
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0;background:#fff}#ECPayPayment{width:100%;min-height:320px}</style>
</head>
<body>
<div id="ECPayPayment"></div>
<script>
(function () {
  var configuration = ${configuration};
  var ready = false;
  var disposed = false;
  function send(message) {
    if (disposed) return;
    message.channel = configuration.channel;
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function error(requestId) {
    ready = false;
    send(requestId === undefined
      ? { type: "error" }
      : { type: "error", requestId: requestId });
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  window.__drtsEcpayFields = {
    collect: function (requestId) {
      if (disposed) return;
      if (!ready) { error(requestId); return; }
      try {
        window.ECPay.getBindCardPayToken(function (result, errorMessage) {
          if (disposed) return;
          if (errorMessage) { error(requestId); return; }
          var explicitCode = result && result.RtnCode !== undefined &&
            result.RtnCode !== null && String(result.RtnCode).trim() !== "";
          var code = explicitCode ? Number(result.RtnCode) : 1;
          var token = result && typeof result.BindCardPayToken === "string"
            ? result.BindCardPayToken.trim() : "";
          if (code !== 1 || token.length < 16 || token.length > 2048 ||
              !/^[A-Za-z0-9_.:-]+$/.test(token) || /^[0-9 -]+$/.test(token)) {
            error(requestId); return;
          }
          send({ type: "credential", requestId: requestId, providerToken: token });
        });
      } catch (_) { error(requestId); }
    },
    dispose: function () { disposed = true; ready = false; }
  };
  loadScript(configuration.jqueryUrl)
    .then(function () { if (!disposed) return loadScript(configuration.sdkUrl); })
    .then(function () {
      if (disposed) return;
      var sdk = window.ECPay;
      if (!sdk || typeof sdk.initialize !== "function" ||
          typeof sdk.addBindingCard !== "function" ||
          typeof sdk.getBindCardPayToken !== "function") {
        throw new Error("ecpay_sdk_unavailable");
      }
      return new Promise(function (resolve, reject) {
        sdk.initialize(configuration.serverType, 1, function (message) {
          if (message) { reject(new Error("ecpay_initialize_failed")); return; }
          resolve();
        });
      }).then(function () {
        if (disposed) return;
        return new Promise(function (resolve, reject) {
          var language = sdk.Language && sdk.Language.zhTW || "zh-TW";
          sdk.addBindingCard(configuration.merchantToken, language, function (message) {
            if (message) { reject(new Error("ecpay_add_binding_card_failed")); return; }
            resolve();
          });
        });
      });
    })
    .then(function () {
      if (disposed) return;
      ready = true;
      send({ type: "ready" });
    })
    .catch(function () { error(); });
})();
</script>
</body>
</html>`;
}
