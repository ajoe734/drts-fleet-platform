/**
 * Minimal runner-local harness page for the ECPay WEB JS SDK.
 *
 * Runs only inside the GitHub-hosted runner job (never on the development VM).
 * It serves one static page on 127.0.0.1 that loads the same jQuery and Stage
 * SDK URLs the merged passenger component uses (ecpay-csp.js) and calls the
 * same SDK sequence as `EcpayHostedFields` / `createEcpayHostedFieldsPort`:
 * `initialize(serverType, 1)` → `addBindingCard(token, Language.zhTW)` →
 * `getBindCardPayToken`. Card data is typed only inside ECPay's iframe; this
 * page and the Node process never receive it. The merchant token is passed in
 * by `page.evaluate`, never through a URL.
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
<style>body{font-family:sans-serif;margin:16px;max-width:640px}#status{color:#555}</style>
</head>
<body>
<h1>DRTS ECPay Stage binding harness</h1>
<p>PAX-PSP-SANDBOX-EVIDENCE-20261101 · hosted runner only · card data stays in the ECPay iframe.</p>
<p id="status">loading</p>
<div id="ECPayPayment"></div>
<script>
(function () {
  function setStatus(text) { document.getElementById("status").textContent = text; }
  window.__drtsHarness = {
    sdkLoaded: function () { return !!(window.ECPay && typeof window.ECPay.initialize === "function"); },
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
    }
  };
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
): Promise<HarnessServer> {
  const html = harnessHtml(serverType);
  const server: Server = createServer((req, res) => {
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
