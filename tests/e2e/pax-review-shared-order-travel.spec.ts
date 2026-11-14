import { test } from "@playwright/test";
import { runNormalPartnerJourney } from "./pax-review-normal-partner-journey";

/** Original travel case and every shared step remain in the same job. */
test("normal travel Partner booking is ordinarily assigned, genuinely Driver-completed and re-read with the same-order tenant invoice", async ({
  browser,
}, info) => {
  await runNormalPartnerJourney(browser, info, "travel_agency_transfer");
});

test("normal insurance Partner booking is ordinarily assigned, genuinely Driver-completed and re-read with the same-order tenant invoice", async ({
  browser,
}, info) => {
  await runNormalPartnerJourney(browser, info, "insurance_replacement_vehicle");
});
