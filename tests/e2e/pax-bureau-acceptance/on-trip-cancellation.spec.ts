import { test, type BrowserContext, type Page } from "@playwright/test";
import { createJourneyProgress } from "../pax-review-shared-order/progress";
import { PAX, sharedDev } from "../pax-review-shared-order/additional-journey";
import { onTripCancellationRejectionJourney } from "./on-trip-cancellation-journey";

// Mirrors pax-review-shared-order-demo.spec.ts's own DRIVER constant: the
// standalone Driver Web static server this config's webServer[5] starts.
const DRIVER = sharedDev ? `${PAX}/review-driver` : "http://127.0.0.1:3101";

/**
 * UC05's post-arrival/on_trip cancellation-rejection branch (review.md:
 * "補同版原UI/BFF上車後/proof_pending取消拒絕與原單狀態/任務/付款不變").
 * This is the first case in this file needing all three roles (Passenger,
 * Ops, Driver) rather than the Passenger-only OTP/consent cases above it, so
 * it drives its own set of browser contexts instead of the single `page`
 * fixture, mirroring the existing pax-review-shared-order-demo pattern.
 */
test("the real UI disables cancellation once on_trip and the server independently rejects a direct cancel request", async ({
  browser,
}, info) => {
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const contexts: BrowserContext[] = [];
  const newRole = async (): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Taipei",
    });
    contexts.push(context);
    return context.newPage();
  };
  const pax = await step("Passenger browser context", () => newRole());
  const ops = await step("Ops browser context", () => newRole());
  const driver = await step("Driver browser context", () => newRole());
  try {
    await onTripCancellationRejectionJourney(pax, ops, driver, DRIVER, step, info);
  } finally {
    for (const context of contexts) await context.close();
  }
});
