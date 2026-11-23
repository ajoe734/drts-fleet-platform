import { test } from "@playwright/test";
import {
  runNormalPartnerJourney,
  runNormalPartnerTravelGroupJourney,
} from "./pax-review-normal-partner-journey";

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

test("all declared travel legs, batches and vehicles complete through ordinary Partner Ops Driver journeys before the same scoped group completes", async ({
  browser,
}, info) => {
  await runNormalPartnerTravelGroupJourney(browser, info);
});
