const { chromium } = require("@playwright/test");
const http = require("http");
const fs = require("fs");
const path = require("path");

const canvasDir = path.resolve("docs/05-ui/drts-design-canvas");
const targetDirs = [
  path.resolve("docs/05-ui/drts-design-canvas/screenshots"),
  path.resolve("support/sidecars/P5-S3-DESIGN-QA-001/screenshots")
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const targets = [
  { file: "Platform Admin.html", slot: "mtx-auth-registry", name: "MTX_authorization_registry.png" },
  { file: "Platform Admin.html", slot: "mtx-auth-detail", name: "MTX_authorization_detail_approved.png" },
  { file: "Platform Admin.html", slot: "mtx-auth-vehicles", name: "MTX_authorization_vehicle_membership.png" },
  { file: "Ops Console.html", slot: "mtx-queue-overview", name: "MTX_queue_virtual_matching.png" },
  { file: "Ops Console.html", slot: "mtx-queue-legal-denial", name: "MTX_queue_physical_rank_denied.png" },
  { file: "Platform Admin.html", slot: "p5-rating-queue", name: "P5_rating_moderation.png" },
  { file: "Platform Admin.html", slot: "p5-fare-anomaly", name: "P5_fare_anomaly.png" },
  { file: "Platform Admin.html", slot: "p5-payment-exception", name: "P5_payment_exception.png" },
  { file: "Platform Admin.html", slot: "p5-records-query", name: "P5_operational_record_export.png" },
  { file: "Platform Admin.html", slot: "p5-disclosure", name: "P5_dispatch_disclosure.png" },
  { file: "Driver App.html", slot: "cockpit-sos", name: "S3_sos_fullscreen.png" }
];

const server = http.createServer((req, res) => {
  let filePath = path.join(canvasDir, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    let ext = path.extname(filePath);
    let contentType = "text/html";
    if (ext === ".js" || ext === ".jsx") contentType = "application/javascript";
    if (ext === ".css") contentType = "text/css";
    if (ext === ".json") contentType = "application/json";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(9879, async () => {
  console.log("Static server running on http://localhost:9879");
  const browser = await chromium.launch();
  
  for (const t of targets) {
    console.log(`Generating ${t.name} from ${t.file} [data-dc-slot="${t.slot}"]...`);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`http://localhost:9879/${encodeURIComponent(t.file)}`);
    await page.waitForTimeout(3500);

    await page.addStyleTag({
      content: `
        * {
          font-family: "Inter", "Noto Sans TC", "Noto Sans CJK TC", "Droid Sans Fallback", system-ui, sans-serif !important;
        }
        code, pre, .mono, [style*="monospace"], [style*="JetBrains Mono"] {
          font-family: "JetBrains Mono", "Noto Mono", "Droid Sans Fallback", ui-monospace, monospace !important;
        }
      `
    });

    const selector = `[data-dc-slot="${t.slot}"]`;
    const el = await page.$(selector);
    if (!el) {
      console.error(`ERROR: Element ${selector} not found on ${t.file}!`);
      await page.close();
      continue;
    }

    const tempPath = path.resolve(t.name);
    await el.screenshot({ path: tempPath });

    for (const d of targetDirs) {
      const dest = path.join(d, t.name);
      fs.copyFileSync(tempPath, dest);
      console.log(`  -> Saved to ${dest}`);
    }
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    await page.close();
  }

  await browser.close();
  server.close();
  console.log("All 11 screenshots successfully generated!");
});
