/**
 * Minimal runner-local harness page for the ECPay WEB JS SDK and the product
 * payment-method controller endpoints.
 *
 * Runs only inside the GitHub-hosted runner job (never on the development VM).
 * It serves one static page on 127.0.0.1 that loads the same jQuery and Stage
 * SDK URLs the merged passenger component uses (ecpay-csp.js), calls the same
 * SDK sequence as `EcpayHostedFields` / `createEcpayHostedFieldsPort`
 * (`initialize(serverType, 1)` → `addBindingCard(token, Language.zhTW)` →
 * `getBindCardPayToken`), and exposes the passenger UI buttons (`綁定卡片` and
 * `前往付款商安全驗證`) wired to `/api/passenger-app/payment-methods` when
 * `startHarness(serverType, { apiOrigin })` proxies `/api/*` to the mounted
 * NestJS `PaymentMethodController`. Card data is typed only inside ECPay's
 * iframe; this page and the Node process never receive it.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  ECPAY_JQUERY_URL,
  ECPAY_WEB_SDK_URLS,
} from "../../../apps/passenger-app-web/components/payment/ecpay-csp";

export interface HarnessServer {
  origin: string;
  close(): Promise<void>;
}

export interface HarnessPayTokenResult {
  rtnCode: number | null;
  rtnMsg: string | null;
  payToken: string | null;
  merchantTradeNo: string | null;
  errorMessage: string | null;
}

export interface HarnessSessionMountResult {
  httpStatus: number;
  mountResult: string | null;
  provider: string | null;
  serverType: string | null;
  sandbox: boolean | null;
  merchantToken: string | null;
  tokenExpireDate: string | null;
  rawSnakeCaseMerchantTokenPresent: boolean;
  rawCamelCaseMerchantTokenPresent: boolean;
  approvedActionOrigins: string[];
}

export interface HarnessBindFlowResult {
  payTokenResult: HarnessPayTokenResult;
  accepted: boolean;
  bindHttpStatus: number | null;
  bindResponse: {
    status?: string;
    next_action_url?: string;
    nextActionUrl?: string;
    operation_key?: string;
    operationKey?: string;
    method?: Record<string, unknown>;
    error?: { code?: string; message?: string };
  } | null;
}

export function harnessHtml(serverType: "Stage" | "Prod"): string {
  const sdkUrl = ECPAY_WEB_SDK_URLS[serverType];
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DRTS ECPay Stage sandbox harness</title>
<script src="${ECPAY_JQUERY_URL}"></script>
<script src="${sdkUrl}"></script>
<style>body{font-family:sans-serif;margin:16px;max-width:640px}#status{color:#555}.actions{margin-top:12px;display:flex;gap:12px;align-items:center}</style>
</head>
<body>
<h1>DRTS ECPay Stage binding harness</h1>
<p>PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 · hosted runner only · card data stays in the ECPay iframe.</p>
<p id="status">loading</p>
<div id="ECPayPayment"></div>
<div class="actions">
  <button id="drts-bind-card-btn" type="button">綁定卡片</button>
  <a id="drts-3ds-verify-link" href="#" style="display:none">前往付款商安全驗證</a>
</div>
<script>
(function () {
  function setStatus(text) { document.getElementById("status").textContent = text; }
  var activeAccessToken = null;
  var lastBindFlowValue = null;
  var pendingBindPromise = null;

  var acceptedPayTokenRule = function (result) {
    if (!result || result.errorMessage) return null;
    var rtnCode = result.rtnCode === null || result.rtnCode === undefined ? 1 : result.rtnCode;
    var token = (result.payToken || "").trim();
    if (
      rtnCode !== 1 ||
      token.length < 16 ||
      token.length > 2048 ||
      !/^[A-Za-z0-9_.:-]+$/.test(token) ||
      /^[0-9 -]+$/.test(token)
    ) {
      return null;
    }
    return token;
  };

  window.__drtsHarness = {
    sdkLoaded: function () { return !!(window.ECPay && typeof window.ECPay.initialize === "function"); },
    setAccessToken: function (token) { activeAccessToken = token; },
    mount: function (token, serverType) {
      return new Promise(function (resolve, reject) {
        var sdk = window.ECPay;
        if (!sdk || typeof sdk.initialize !== "function" || typeof sdk.addBindingCard !== "function") {
          reject(new Error("ecpay_sdk_unavailable"));
          return;
        }
        sdk.initialize(serverType, 1, function (errMsg) {
          if (errMsg) { reject(new Error("initialize:" + String(errMsg))); return; }
          var lang = (sdk.Language && sdk.Language.zhTW) || "zh-TW";
          sdk.addBindingCard(token, lang, function (errMsg2) {
            if (errMsg2) { reject(new Error("addBindingCard:" + String(errMsg2))); return; }
            setStatus("ready");
            resolve("ready");
          });
        });
      });
    },
    requestSessionAndMount: async function (accessToken) {
      activeAccessToken = accessToken;
      var resp = await fetch("/api/passenger-app/payment-methods?binding_session=1", {
        method: "GET",
        headers: {
          "authorization": "Bearer " + accessToken,
          "accept": "application/json"
        }
      });
      var body = await resp.json();
      var data = (body && body.data) || {};
      var session = data.binding_session || data.bindingSession || data;
      var merchantToken = session.merchant_token || session.merchantToken || null;
      var resolvedServerType = session.server_type || session.serverType || "${serverType}";
      var mountResult = null;
      if (resp.status === 200 && merchantToken) {
        mountResult = await window.__drtsHarness.mount(merchantToken, resolvedServerType);
      }
      return {
        httpStatus: resp.status,
        mountResult: mountResult,
        provider: session.provider || null,
        serverType: resolvedServerType,
        sandbox: typeof session.sandbox === "boolean" ? session.sandbox : null,
        merchantToken: merchantToken,
        tokenExpireDate: session.token_expire_date || session.tokenExpireDate || null,
        rawSnakeCaseMerchantTokenPresent: typeof session.merchant_token === "string" && session.merchant_token.length > 0,
        rawCamelCaseMerchantTokenPresent: typeof session.merchantToken === "string" && session.merchantToken.length > 0,
        approvedActionOrigins: Array.isArray(session.approved_action_origins)
          ? session.approved_action_origins
          : (Array.isArray(session.approvedActionOrigins) ? session.approvedActionOrigins : [])
      };
    },
    getPayToken: function () {
      return new Promise(function (resolve) {
        try {
          window.ECPay.getBindCardPayToken(function (result, errorMessage) {
            var r = result || {};
            var hasCode = r.RtnCode !== undefined && r.RtnCode !== null && String(r.RtnCode).trim() !== "";
            resolve({
              rtnCode: hasCode ? Number(r.RtnCode) : null,
              rtnMsg: typeof r.RtnMsg === "string" ? r.RtnMsg : null,
              payToken: typeof r.BindCardPayToken === "string" ? r.BindCardPayToken : null,
              merchantTradeNo: typeof r.MerchantTradeNo === "string" ? r.MerchantTradeNo : null,
              errorMessage: errorMessage ? String(errorMessage) : null
            });
          });
        } catch (err) {
          resolve({ rtnCode: null, rtnMsg: null, payToken: null, merchantTradeNo: null,
            errorMessage: "sdk_exception:" + (err && err.message ? err.message : String(err)) });
        }
      });
    },
    runBindFlow: async function () {
      setStatus("binding");
      var payTokenResult = await window.__drtsHarness.getPayToken();
      var accepted = acceptedPayTokenRule(payTokenResult);
      if (!accepted || !activeAccessToken) {
        lastBindFlowValue = {
          payTokenResult: payTokenResult,
          accepted: accepted !== null,
          bindHttpStatus: null,
          bindResponse: null
        };
        setStatus("bind-token-failed");
        return lastBindFlowValue;
      }
      var resp = await fetch("/api/passenger-app/payment-methods", {
        method: "POST",
        headers: {
          "authorization": "Bearer " + activeAccessToken,
          "content-type": "application/json",
          "accept": "application/json"
        },
        body: JSON.stringify({ provider_token: accepted })
      });
      var body = await resp.json();
      var bindData = (body && body.data) || (body && body.error ? { error: body.error } : null);
      var actionUrl = bindData && (bindData.next_action_url || bindData.nextActionUrl);
      if (bindData && bindData.status === "action_required" && actionUrl) {
        var link = document.getElementById("drts-3ds-verify-link");
        link.setAttribute("href", actionUrl);
        link.style.display = "inline-block";
        setStatus("action-required");
      } else if (bindData && bindData.status === "completed") {
        setStatus("bind-completed");
      } else {
        setStatus("bind-failed");
      }
      lastBindFlowValue = {
        payTokenResult: payTokenResult,
        accepted: true,
        bindHttpStatus: resp.status,
        bindResponse: bindData
      };
      return lastBindFlowValue;
    },
    awaitLastBindFlow: async function () {
      if (pendingBindPromise) {
        return await pendingBindPromise;
      }
      return lastBindFlowValue;
    }
  };

  document.getElementById("drts-bind-card-btn").addEventListener("click", function () {
    pendingBindPromise = window.__drtsHarness.runBindFlow();
  });

  setStatus(window.__drtsHarness.sdkLoaded() ? "sdk-loaded" : "sdk-missing");
})();
</script>
</body>
</html>
`;
}

/**
 * Same acceptance rule as the merged `createEcpayHostedFieldsPort` (missing
 * RtnCode counts as 1; 16..2048 chars; opaque charset; never digits-only).
 */
export function acceptedPayToken(result: HarnessPayTokenResult): string | null {
  if (result.errorMessage) return null;
  const rtnCode = result.rtnCode ?? 1;
  const token = result.payToken?.trim() ?? "";
  if (
    rtnCode !== 1 ||
    token.length < 16 ||
    token.length > 2048 ||
    !/^[A-Za-z0-9_.:-]+$/.test(token) ||
    /^[0-9 -]+$/.test(token)
  ) {
    return null;
  }
  return token;
}

export async function startHarness(
  serverType: "Stage" | "Prod",
  options?: { apiOrigin?: string },
): Promise<HarnessServer> {
  const html = harnessHtml(serverType);
  const apiOrigin = options?.apiOrigin;
  const server: Server = createServer(async (req, res) => {
    if (
      req.method === "GET" &&
      (req.url === "/" || req.url?.startsWith("/?"))
    ) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }
    if (apiOrigin && req.url?.startsWith("/api/")) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : null;
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (!value || key.toLowerCase() === "host") continue;
          headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        const upstream = await fetch(`${apiOrigin}${req.url}`, {
          method: req.method ?? "GET",
          headers,
          body:
            bodyBuffer && req.method !== "GET" && req.method !== "HEAD"
              ? new Uint8Array(bodyBuffer)
              : null,
        });
        const upstreamBytes = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, {
          "Content-Type":
            upstream.headers.get("content-type") ??
            "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(upstreamBytes);
        return;
      } catch (err) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "harness_proxy_failed",
            message: err instanceof Error ? err.message : String(err),
          }),
        );
        return;
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
