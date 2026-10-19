import { test, type BrowserContext } from "@playwright/test";
import { createJourneyProgress } from "../pax-review-shared-order/progress";
import { onTripCancellationRejectionJourney } from "./on-trip-cancellation-journey";
import { roleBrowser } from "./role-browser";
import { driverOrigin } from "./review-runtime";

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
  try {
    const pax = await step("Passenger browser context", () =>
      roleBrowser(browser, "pax", contexts, progress),
    );
    const ops = await step("Ops browser context", () =>
      roleBrowser(browser, "ops", contexts, progress),
    );
    const driver = await step("Driver browser context", () =>
      roleBrowser(browser, "driver", contexts, progress),
    );
    await onTripCancellationRejectionJourney(
      pax,
      ops,
      driver,
      driverOrigin(),
      step,
      info,
    );
  } finally {
    for (const context of contexts) await context.close();
  }
});
