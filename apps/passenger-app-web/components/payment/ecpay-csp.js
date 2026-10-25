export const ECPAY_JQUERY_URL = "https://code.jquery.com/jquery-3.5.1.min.js";

export const ECPAY_WEB_SDK_URLS = Object.freeze({
  Stage:
    "https://ecpg-stage.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
  Prod: "https://ecpg.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
});

export const ECPAY_ACTION_ORIGINS = Object.freeze([
  "https://ecpg-stage.ecpay.com.tw",
  "https://ecpg.ecpay.com.tw",
  "https://payment-stage.ecpay.com.tw",
  "https://payment.ecpay.com.tw",
]);

export const ECPAY_SCRIPT_ORIGINS = Object.freeze([
  "https://code.jquery.com",
  "https://ecpg-stage.ecpay.com.tw",
  "https://ecpg.ecpay.com.tw",
]);

export const ECPAY_CONNECT_ORIGINS = Object.freeze([
  "https://ecpg-stage.ecpay.com.tw",
  "https://ecpg.ecpay.com.tw",
]);

export const ECPAY_HOSTED_FIELDS_CSP =
  "default-src 'self'; " +
  `connect-src 'self' ${ECPAY_CONNECT_ORIGINS.join(" ")}; ` +
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${ECPAY_SCRIPT_ORIGINS.join(" ")}; ` +
  `style-src 'self' 'unsafe-inline' ${ECPAY_CONNECT_ORIGINS.join(" ")}; ` +
  `img-src 'self' data: ${ECPAY_CONNECT_ORIGINS.join(" ")}; ` +
  `frame-src 'self' ${ECPAY_ACTION_ORIGINS.join(" ")}; ` +
  `form-action 'self' ${ECPAY_ACTION_ORIGINS.join(" ")};`;
