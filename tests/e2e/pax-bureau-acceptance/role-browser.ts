import type { Browser, BrowserContext } from "@playwright/test";
import type { createJourneyProgress } from "../pax-review-shared-order/progress";
import { roleHeaders, type ReviewRole } from "./review-runtime";

export async function roleBrowser(
  browser: Browser,
  role: ReviewRole,
  contexts: BrowserContext[],
  progress: ReturnType<typeof createJourneyProgress>,
  timezoneId = "Asia/Taipei",
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId,
    extraHTTPHeaders: roleHeaders(role),
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("response", (response) =>
    progress.response(
      role,
      response.request().method(),
      response.url(),
      response.status(),
    ),
  );
  return page;
}
