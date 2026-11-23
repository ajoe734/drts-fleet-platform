import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from "@nestjs/common";

import { OpenRoute } from "../../common/auth";

const DRIVER_APP_PACKAGE = "com.cctechsupport.drts.driver";
const IOS_TEAM_AND_BUNDLE = /^[A-Z0-9]{10}\.com\.cctechsupport\.drts\.driver$/;
const ANDROID_FINGERPRINT = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

// The browser only receives a generic fallback. The activation proof stays in
// the fragment and is redeemed exclusively by the app's device-registration POST.
const DRIVER_ACTIVATION_FALLBACK = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRTS 司機裝置註冊</title>
</head>
<body>
<main>
<h1>在 DRTS 司機 App 完成驗證</h1>
<p>請在已安裝 DRTS 司機 App 的手機上開啟收到的連結。你也可以在 App 的裝置註冊頁輸入建檔手機和六位數代碼。</p>
</main>
</body>
</html>`;

@OpenRoute()
@Controller()
export class DriverActivationLinksController {
  @Get(".well-known/apple-app-site-association")
  @Header("Cache-Control", "public, max-age=300")
  appleAssociation() {
    const appId = process.env.DRIVER_ONBOARDING_IOS_APP_ID?.trim();
    if (!appId || !IOS_TEAM_AND_BUNDLE.test(appId)) {
      throw new ServiceUnavailableException(
        "Driver app link association is unavailable.",
      );
    }
    return {
      applinks: {
        details: [
          { appIDs: [appId], components: [{ "/": "/driver-activate" }] },
        ],
      },
    };
  }

  @Get(".well-known/assetlinks.json")
  @Header("Cache-Control", "public, max-age=300")
  androidAssociation() {
    const fingerprints =
      process.env.DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS?.split(",").map(
        (fingerprint) => fingerprint.trim().toUpperCase(),
      ) ?? [];
    if (
      !fingerprints.length ||
      !fingerprints.every((fingerprint) =>
        ANDROID_FINGERPRINT.test(fingerprint),
      )
    ) {
      throw new ServiceUnavailableException(
        "Driver app link association is unavailable.",
      );
    }
    return [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: DRIVER_APP_PACKAGE,
          sha256_cert_fingerprints: [...new Set(fingerprints)],
        },
      },
    ];
  }

  @Get("driver-activate")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  @Header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  )
  activationFallback() {
    return DRIVER_ACTIVATION_FALLBACK;
  }
}
