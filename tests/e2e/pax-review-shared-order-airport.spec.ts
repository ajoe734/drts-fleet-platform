import { test } from "@playwright/test";
import { runNormalPartnerJourney } from "./pax-review-normal-partner-journey";

test("normal airport pickup Partner booking is ordinarily assigned, genuinely Driver-completed and re-read with the same-order tenant invoice", async ({
  browser,
}, info) => {
  await runNormalPartnerJourney(browser, info, "airport_pickup");
});

test("normal airport dropoff Partner booking is ordinarily assigned, genuinely Driver-completed and re-read with the same-order tenant invoice", async ({
  browser,
}, info) => {
  await runNormalPartnerJourney(browser, info, "airport_dropoff");
});
