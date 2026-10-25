export const ECPAY_JQUERY_URL = "https://code.jquery.com/jquery-3.5.1.min.js";

export const ECPAY_WEB_SDK_URLS = {
  Stage:
    "https://ecpg-stage.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
  Prod: "https://ecpg.ecpay.com.tw/Scripts/sdk-1.0.0.js?t=20210121100116",
};

export const ECPAY_ACTION_ORIGINS = [
  "https://ecpg-stage.ecpay.com.tw",
  "https://ecpg.ecpay.com.tw",
  "https://payment-stage.ecpay.com.tw",
  "https://payment.ecpay.com.tw",
];

export const ECPAY_SCRIPT_ORIGINS = [
  "https://code.jquery.com",
  "https://ecpg-stage.ecpay.com.tw",
  "https://ecpg.ecpay.com.tw",
];

export const ECPAY_CONNECT_ORIGINS = [
  "https://ecpg-stage.ecpay.com.tw",
  "https://ecpg.ecpay.com.tw",
];

export const ECPAY_HOSTED_FIELDS_CSP =
  "default-src 'self'; " +
  "connect-src 'self' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://code.jquery.com https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
  "style-src 'self' 'unsafe-inline' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
  "img-src 'self' data: https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
  "frame-src 'self' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw; " +
  "form-action 'self' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw;";
