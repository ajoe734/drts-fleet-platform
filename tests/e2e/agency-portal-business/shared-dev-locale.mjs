// Normal shared portal UI only; no mocked data, seeded accounts or DOM edits.
import { pathToFileURL } from "node:url";
import {
  api,
  assertRecord,
  body,
  check,
  cloudHeaders,
  detailCell,
  openContext,
  openRole,
  probe,
  readDetail,
  taipeiTime,
  visit,
} from "./shared-dev-trip-record.mjs";

const COPY = {
  en: {
    lang: "en",
    login: "Regulatory Agency Read-Only Portal",
    invite: "Accept Agency Account Invitation",
    invalidInvite:
      "Invalid invitation link. Please contact the platform administrator.",
    detail: "Trip Record Detail",
    collected: "Collected Fare",
    toll: "Toll",
    reserved: "Reserved Time",
    missing: "Not provided",
    invalid:
      "The filter is not valid. Use YYYY-MM for months and YYYY-MM-DD for dates.",
    window:
      "The report period is too long. Choose at most six calendar months.",
  },
  zh: {
    lang: "zh-Hant",
    login: "主管機關唯讀查詢",
    invite: "接受機關帳號邀請",
    invalidInvite: "邀請連結無效。請向平台管理者確認。",
    detail: "行程紀錄詳情",
    collected: "實收車資",
    toll: "通行費",
    reserved: "預約時間",
    missing: "未提供",
    invalid: "查詢條件格式不正確：月份請用 YYYY-MM，日期請用 YYYY-MM-DD。",
    window: "報表期間過長，最多選擇 6 個曆月。",
  },
};

async function language(page, locale, heading) {
  const { expect } = await import("@playwright/test");
  const before = new URL(page.url());
  if ((await page.locator("html").getAttribute("lang")) !== COPY[locale].lang) {
    const label =
      locale === "en"
        ? "切換語言至 English"
        : "Switch language to Traditional Chinese";
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", COPY[locale].lang);
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
  check(
    new URL(page.url()).pathname === before.pathname &&
      new URL(page.url()).search === before.search,
    "locale-preserves-route-and-query",
  );
}

async function viewportAndFocus(page, width) {
  await page.setViewportSize({ width, height: 900 });
  // Exercise native keyboard focus on the actual language button at both sizes.
  const switcher = page.getByRole("button", {
    name: /切換語言至|Switch language to/,
  });
  await switcher.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focus = await switcher.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      focused: document.activeElement === element,
      visible:
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        (style.boxShadow && style.boxShadow !== "none"),
      inViewport: bounds.left >= 0 && bounds.right <= innerWidth + 1,
    };
  });
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  );
  check(
    focus.focused && focus.visible && focus.inViewport,
    "visible-keyboard-focus-in-viewport",
  );
  check(noHorizontalOverflow, "page-horizontal-overflow");
  return { width, focusVisible: true, noHorizontalOverflow: true };
}

async function publicEntries(browser, cfg, record) {
  const context = await openContext(browser, cfg);
  try {
    const page = await context.newPage();
    for (const [path, title] of [
      ["/login", "login"],
      ["/invite", "invite"],
    ]) {
      await visit(page, path, cfg);
      for (const locale of ["en", "zh"]) {
        await record(`anonymous:${path}:${locale}`, async () => {
          const { expect } = await import("@playwright/test");
          await language(page, locale, COPY[locale][title]);
          if (path === "/invite")
            await expect(page.getByRole("alert")).toHaveText(
              COPY[locale].invalidInvite,
            );
          const viewports = [];
          for (const width of [1280, 390])
            viewports.push(await viewportAndFocus(page, width));
          const response = await page.reload({ waitUntil: "domcontentloaded" });
          check(
            response.status() === 200 &&
              response.headers()["x-drts-candidate-sha"] === cfg.runtimeSha,
            "public-reload-sha",
          );
          await expect(
            page.getByRole("heading", {
              name: COPY[locale][title],
              exact: true,
            }),
          ).toBeVisible();
          return {
            locale,
            lang: COPY[locale].lang,
            text: COPY[locale][title],
            viewports,
            reloadPersisted: true,
          };
        });
      }
    }
  } finally {
    await context.close();
  }
}

async function nullZeroAndTime(page, cfg, row, locale) {
  const { expect } = await import("@playwright/test");
  // Fail explicitly when the controlled fixture lacks the required source
  // sample. Undefined, another null field or a mocked zero is not a substitute.
  check(
    row.collected_fare_minor === null && row.toll_minor === 0,
    "fixture-needs-null-collected-and-zero-toll",
  );
  await expect(detailCell(page, COPY[locale].collected)).toContainText(
    COPY[locale].missing,
  );
  await expect(detailCell(page, COPY[locale].toll)).toContainText(
    `0 ${row.currency}`.trim(),
  );
  await expect(detailCell(page, COPY[locale].toll)).not.toContainText(
    COPY[locale].missing,
  );
  const formatted = taipeiTime(row.reserved_at, locale);
  await expect(detailCell(page, COPY[locale].reserved)).toHaveText(formatted);
  const viewports = [];
  for (const width of [1280, 390])
    viewports.push(await viewportAndFocus(page, width));
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  check(
    response.status() === 200 &&
      response.headers()["x-drts-candidate-sha"] === cfg.runtimeSha,
    "detail-locale-refresh-sha",
  );
  await expect(
    page.getByRole("heading", { name: COPY[locale].detail, exact: true }),
  ).toBeVisible();
  await expect(detailCell(page, COPY[locale].collected)).toContainText(
    COPY[locale].missing,
  );
  await expect(detailCell(page, COPY[locale].toll)).toContainText(
    `0 ${row.currency}`.trim(),
  );
  return {
    locale,
    rawCollectedIsNull: true,
    rawTollIsZero: true,
    nullText: COPY[locale].missing,
    zeroText: `0 ${row.currency}`.trim(),
    taipeiTime: formatted,
    browserTimeZone: "UTC",
    viewports,
    reloadPersisted: true,
  };
}

async function rejection(page, cfg, kind, locale) {
  const { expect } = await import("@playwright/test");
  const query = new URLSearchParams(
    kind === "invalid"
      ? { periodMonthFrom: "2026-13", periodMonthTo: "2026-11" }
      : { periodMonthFrom: "2025-01", periodMonthTo: "2026-11" },
  );
  // A native type=month input cannot enter an invalid month. Open the real
  // query URL for that negative; submit the overlong range through the form.
  if (kind === "invalid")
    await visit(page, `/reports/operations?${query}`, cfg);
  else {
    await visit(page, "/reports/operations", cfg);
    await page
      .locator('input[name="periodMonthFrom"]')
      .fill(query.get("periodMonthFrom"));
    await page
      .locator('input[name="periodMonthTo"]')
      .fill(query.get("periodMonthTo"));
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get("periodMonthFrom") ===
            query.get("periodMonthFrom") &&
          url.searchParams.get("periodMonthTo") === query.get("periodMonthTo"),
      ),
      page.locator('button[type="submit"]').click(),
    ]);
  }
  const response = await page.request.get(
    `${cfg.origin}/api/agency/reports/operations-summary?${query}`,
    { headers: cloudHeaders() },
  );
  const envelope = await body(response, 400);
  const code =
    kind === "invalid"
      ? "AGENCY_QUERY_INVALID"
      : "AGENCY_REPORT_WINDOW_TOO_LARGE";
  check(envelope.error?.code === code, "report-rejection-code");
  const alerts = page.getByRole("alert");
  await expect(alerts).toHaveCount(2);
  for (const alert of await alerts.all())
    await expect(alert).toHaveText(COPY[locale][kind]);
  return {
    locale,
    apiStatus: 400,
    errorCode: code,
    visibleText: COPY[locale][kind],
  };
}

export async function main() {
  await probe("locale", async (browser, cfg, record) => {
    await publicEntries(browser, cfg, record);
    for (const role of ["viewer", "exporter"]) {
      let opened;
      await record(`${role}:locale-normal-ui-login`, async () => {
        opened = await openRole(browser, role, cfg);
        return { role, sessionBound: true };
      });
      if (!opened) continue;
      try {
        const { page } = opened;
        let row;
        await record(`${role}:locale-detail-via-list`, async () => {
          row = await readDetail(page, cfg);
          assertRecord(row, cfg.fixture);
          return { sameRecord: true };
        });
        for (const locale of ["zh", "en"]) {
          await record(`${role}:detail:${locale}`, async () => {
            check(row, "detail-prerequisite");
            await visit(
              page,
              `/trip-records/${encodeURIComponent(cfg.fixture.recordId)}`,
              cfg,
            );
            await language(page, locale, COPY[locale].detail);
            return nullZeroAndTime(page, cfg, row, locale);
          });
          for (const kind of ["invalid", "window"])
            await record(`${role}:${kind}:${locale}`, () =>
              rejection(page, cfg, kind, locale),
            );
        }
        // Confirm language switching also preserves the exact list filter.
        await record(`${role}:locale-list-filter-preserved`, async () => {
          await visit(
            page,
            `/trip-records?recordId=${encodeURIComponent(cfg.fixture.recordId)}`,
            cfg,
          );
          await language(page, "zh", "行程紀錄");
          await language(page, "en", "Trip Records");
          const result = await api(
            page,
            `trip-records?recordId=${encodeURIComponent(cfg.fixture.recordId)}`,
          );
          check(
            result.total === 1 && result.items.length === 1,
            "locale-list-still-exact-record",
          );
          return { queryPreserved: true };
        });
      } finally {
        await opened.context.close();
      }
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch {
    console.error(
      "Agency shared locale failed; inspect allowlisted locale checkpoints.",
    );
    process.exitCode = 1;
  }
}
