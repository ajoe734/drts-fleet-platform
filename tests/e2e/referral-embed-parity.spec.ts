import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const screenshotDir = path.join(
  process.cwd(),
  "test-results/referral-embed-parity",
);
mkdirSync(screenshotDir, { recursive: true });

const externalBaseURL =
  process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
  process.env.REFERRAL_EMBED_BASE_URL;
const usesLocalFixture = !externalBaseURL;
const entrySlug =
  process.env.DRTS_REFERRAL_EMBED_ENTRY_SLUG?.trim() ??
  (usesLocalFixture ? "yuhe-residence" : undefined);
const entryHost = usesLocalFixture ? "127.0.0.1:3199" : "app.yuhe-living.com.tw";

type RouteSpec = {
  screenshot: string;
  label: string;
  path: string;
  markers: RegExp[];
};

function embedPath(state: string, screen?: string) {
  const params = new URLSearchParams({ state, entryHost });
  if (screen) {
    params.set("screen", screen);
  }
  return `/embed/${encodeURIComponent(entrySlug ?? "yuhe-residence")}?${params.toString()}`;
}

const routeSpecs: RouteSpec[] = [
  {
    screenshot: "01-handoff.png",
    label: "handoff",
    path: embedPath("handoff"),
    markers: [/已交接|開始叫車/, /身分由社區 App 帶入/],
  },
  {
    screenshot: "02-reauth.png",
    label: "reauth",
    path: embedPath("reauth"),
    markers: [/登入狀態已逾時/, /交付權杖逾時/],
  },
  {
    screenshot: "03-unsupported.png",
    label: "unsupported",
    path: embedPath("unsupported"),
    markers: [/無法在此環境開啟/, /來源宿主未授權/],
  },
  {
    screenshot: "04-consent.png",
    label: "consent",
    path: embedPath("consent"),
    markers: [/授權使用叫車服務/, /同意並開始/],
  },
  {
    screenshot: "05-fallback.png",
    label: "fallback",
    path: embedPath("fallback"),
    markers: [/內嵌服務暫時無法使用/, /前往獨立叫車網站/],
  },
  {
    screenshot: "06-book.png",
    label: "book",
    path: embedPath("handoff", "book"),
    markers: [/預估車資/, /確認叫車/],
  },
  {
    screenshot: "07-no-supply.png",
    label: "no-supply",
    path: embedPath("handoff", "nosupply"),
    markers: [/附近暫無可派車輛/, /稍後重試/],
  },
  {
    screenshot: "08-ineligible.png",
    label: "ineligible",
    path: embedPath("handoff", "ineligible"),
    markers: [/目前不符叫車資格/, /洽社區管理中心/],
  },
  {
    screenshot: "09-denied.png",
    label: "denied",
    path: embedPath("handoff", "denied"),
    markers: [/叫車未能建立/, /聯絡社區客服/],
  },
  {
    screenshot: "10-degraded.png",
    label: "degraded",
    path: embedPath("handoff", "degraded"),
    markers: [/服務暫時不穩定/, /查看狀態/],
  },
  {
    screenshot: "11-trip.png",
    label: "trip",
    path: embedPath("handoff", "trip"),
    markers: [/重開 App 仍可找回/, /取消行程/],
  },
  {
    screenshot: "12-trips.png",
    label: "trips",
    path: embedPath("handoff", "trips"),
    markers: [/行程歷史/, /PT-9E11A3/],
  },
  {
    screenshot: "13-receipt.png",
    label: "receipt",
    path: embedPath("handoff", "receipt"),
    markers: [/收據（PII 遮罩）/, /費用明細/],
  },
  {
    screenshot: "14-completed.png",
    label: "completed",
    path: embedPath("handoff", "completed"),
    markers: [/行程已完成/, /查看收據/],
  },
  {
    screenshot: "15-cancelled.png",
    label: "cancelled",
    path: embedPath("handoff", "cancelled"),
    markers: [/行程已取消/, /再次叫車/],
  },
];

test.describe("referral embed 15-screen parity", () => {
  test.skip(!entrySlug, "No referral entry slug is configured.");
  test.use({ viewport: { width: 392, height: 812 } });

  test("captures the 15 canvas-derived runtime screens", async ({ page }) => {
    for (const route of routeSpecs) {
      await test.step(route.label, async () => {
        const response = await page.goto(route.path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.ok()).toBeTruthy();
        for (const marker of route.markers) {
          await expect(page.locator("body")).toContainText(marker);
        }
        await page.screenshot({
          path: path.join(screenshotDir, route.screenshot),
          fullPage: true,
        });
      });
    }
  });
});
